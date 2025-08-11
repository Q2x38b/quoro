const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const Filter = require('bad-words');

const app = express();
app.use(cors());
app.get('/', (_req, res) => {
  res.send('Socket.IO chat server is running');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// In-memory presence and rate-limit tracking
const socketIdToUsername = new Map();
const messageHistoryBySocket = new Map(); // socket.id -> { timestamps: number[], lastAt: number }
const filter = new Filter();

function broadcastOnlineCount() {
  io.emit('online:count', socketIdToUsername.size);
}

function sanitizeUsername(name) {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  // Basic strip of non-printable characters
  return cleaned.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 20);
}

function rateLimitOk(socket) {
  const now = Date.now();
  const entry = messageHistoryBySocket.get(socket.id) || { timestamps: [], lastAt: 0 };
  // 1) simple cooldown: at least 500ms between messages
  if (now - entry.lastAt < 500) {
    return { ok: false, reason: 'Slow down.' };
  }
  // 2) sliding window: max 5 messages per 10s
  entry.timestamps = entry.timestamps.filter((t) => now - t < 10_000);
  if (entry.timestamps.length >= 5) {
    return { ok: false, reason: 'You are sending messages too quickly.' };
  }
  // record
  entry.timestamps.push(now);
  entry.lastAt = now;
  messageHistoryBySocket.set(socket.id, entry);
  return { ok: true };
}

io.on('connection', (socket) => {
  socket.on('chat:start', (payload) => {
    const usernameRaw = (payload && payload.username) || '';
    let username = sanitizeUsername(usernameRaw);
    if (!username) {
      username = `user-${socket.id.slice(0, 4)}`;
    }
    socket.data.username = username;
    socketIdToUsername.set(socket.id, username);
    broadcastOnlineCount();
    io.emit('chat:system', { text: `${username} joined`, ts: Date.now() });
  });

  socket.on('chat:message', (payload) => {
    const username = socket.data.username || 'anonymous';
    const textRaw = (payload && payload.text) || '';
    const textTrimmed = textRaw.trim();

    if (!textTrimmed) return;
    if (textTrimmed.length > 300) {
      socket.emit('chat:warning', { text: 'Message too long (max 300 chars).' });
      return;
    }

    const limit = rateLimitOk(socket);
    if (!limit.ok) {
      socket.emit('chat:warning', { text: limit.reason });
      return;
    }

    // Profanity filter
    let cleaned = filter.clean(textTrimmed);

    io.emit('chat:message', {
      username,
      text: cleaned,
      ts: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    const username = socketIdToUsername.get(socket.id);
    if (username) {
      io.emit('chat:system', { text: `${username} left`, ts: Date.now() });
    }
    socketIdToUsername.delete(socket.id);
    messageHistoryBySocket.delete(socket.id);
    broadcastOnlineCount();
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

