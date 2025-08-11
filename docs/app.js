(function () {
  const authCard = document.getElementById('auth');
  const startBtn = document.getElementById('startBtn');
  const usernameInput = document.getElementById('username');
  const chat = document.getElementById('chat');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const messages = document.getElementById('messages');
  const conn = document.getElementById('conn');
  const online = document.getElementById('online');

  // Configure your backend URL here. For local dev it falls back to localhost.
  const SERVER_URL = (typeof window !== 'undefined' && window.SERVER_URL)
    || (location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://REPLACE_WITH_YOUR_BACKEND_URL');

  let socket = null;
  let myUsername = null;

  function appendMessage({ who, text, ts, type }) {
    const li = document.createElement('li');
    li.className = 'msg' + (type ? ` ${type}` : '');
    const whoSpan = document.createElement('span');
    whoSpan.className = 'who';
    whoSpan.textContent = who ? `${who}:` : '';
    const textSpan = document.createElement('span');
    textSpan.className = 'text';
    textSpan.textContent = text;
    li.appendChild(whoSpan);
    li.appendChild(textSpan);
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
  }

  function startChat() {
    const name = (usernameInput.value || '').trim();
    if (!name) return usernameInput.focus();
    myUsername = name;
    authCard.classList.add('hidden');
    chat.classList.remove('hidden');

    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      withCredentials: false,
    });

    socket.on('connect', () => {
      conn.textContent = 'Connected';
      socket.emit('chat:start', { username: myUsername });
    });

    socket.on('disconnect', () => {
      conn.textContent = 'Disconnected';
    });

    socket.on('online:count', (count) => {
      online.textContent = `${count} online`;
    });

    socket.on('chat:system', (payload) => {
      appendMessage({ who: '', text: payload.text, ts: payload.ts, type: 'system' });
    });

    socket.on('chat:warning', (payload) => {
      appendMessage({ who: 'Warning', text: payload.text, ts: Date.now(), type: 'warn' });
    });

    socket.on('chat:message', (payload) => {
      appendMessage({ who: payload.username, text: payload.text, ts: payload.ts });
    });
  }

  startBtn.addEventListener('click', startChat);
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startChat();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = (input.value || '').trim();
    if (!text) return;
    if (!socket || !socket.connected) {
      appendMessage({ who: 'System', text: 'Not connected.', type: 'system' });
      return;
    }
    socket.emit('chat:message', { text });
    input.value = '';
  });
})();

