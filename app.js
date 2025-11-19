const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER",
  appId: "APPID"
};
// ------------------------------------

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
} catch (error) {
  console.error('Firebase initialization error:', error);
}
const db = firebase.database();

// UI refs
const roomEl = document.getElementById('room');
const joinBtn = document.getElementById('joinBtn');
const newBtn = document.getElementById('newBtn');
const qrcodeEl = document.getElementById('qrcode');
const qrBox = document.getElementById('qrBox');
const enableAutoBtn = document.getElementById('enableAuto');
const sendBtn = document.getElementById('sendBtn');
const sendText = document.getElementById('sendText');
const incomingEl = document.getElementById('incoming');
const historyEl = document.getElementById('history');
const copyIncoming = document.getElementById('copyIncoming');
const readPush = document.getElementById('readPush');
const passwordEl = document.getElementById('password');
const copyLocal = document.getElementById('copyLocal');
const clearHistoryBtn = document.getElementById('clearHistory');
const installBtn = document.getElementById('installBtn');
const themeBtn = document.getElementById('themeBtn');

let currentRoom = '';
let autoCopy = false;
let keyMaterial = null; // CryptoKey for AES
let lastTs = 0;
let history = [];
let dbListener = null;
let deferredPrompt = null;

// PWA install prompt capture
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});

// Theme toggle
let dark = true;
themeBtn.addEventListener('click', () => {
  dark = !dark;
  document.documentElement.classList.toggle('light', !dark);
  document.body.classList.toggle('light', !dark);
});

// --- Utility: derive key from password ---
async function getKeyFromPassword(password, roomId) {
  if (!password) return null;
  
  const saltStr = `universal-clipboard-${roomId}`;
  const enc = new TextEncoder();
  const pwKey = await window.crypto.subtle.importKey(
    'raw', 
    enc.encode(password), 
    { name: 'PBKDF2' }, 
    false, 
    ['deriveKey']
  );
  
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(saltStr),
      iterations: 200000,
      hash: 'SHA-256'
    }, 
    pwKey, 
    { name: 'AES-GCM', length: 256 }, 
    false, 
    ['encrypt', 'decrypt']
  );
  return key;
}

async function encryptText(plain, key) {
  if (!key) return plain;
  
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, 
    key, 
    enc.encode(plain)
  );
  
  const buf = new Uint8Array(ct);
  const combined = new Uint8Array(iv.byteLength + buf.byteLength);
  combined.set(iv, 0);
  combined.set(buf, iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(b64, key) {
  if (!key) return b64;
  
  try {
    const str = atob(b64);
    const arr = Uint8Array.from(str, c => c.charCodeAt(0));
    const iv = arr.slice(0, 12);
    const ct = arr.slice(12);
    const plainBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, 
      key, 
      ct
    );
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    console.warn('Decryption failed', e);
    return '[Decryption failed - check password]';
  }
}

// --- QR code helpers ---
function showQR(room) {
  qrBox.classList.remove('hidden');
  qrcodeEl.innerHTML = '';
  const url = new URL(window.location.href);
  url.searchParams.set('room', room);
  new QRCode(qrcodeEl, { 
    text: url.toString(), 
    width: 140, 
    height: 140,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

// --- Listen to a room ---
function listenRoom(room, key) {
  if (dbListener) {
    dbListener.off();
  }
  
  const refRoom = firebase.database().ref('rooms/' + room + '/clipboard');
  dbListener = refRoom;

  refRoom.on('value', async (snap) => {
    try {
      const data = snap.val();
      if (!data) return;
      if (data.ts <= lastTs) return; // ignore old messages
      lastTs = data.ts;

      let text = data.text;
      if (data.encrypted && key) {
        text = await decryptText(text, key);
      }

      incomingEl.textContent = text;
      addToHistory({ text, ts: data.ts });
      
      if (autoCopy && text) {
        try {
          await navigator.clipboard.writeText(text);
          console.log('Auto-copied to clipboard');
        } catch (e) {
          console.warn('Auto-copy failed', e);
        }
      }
    } catch (error) {
      console.error('Error processing incoming data:', error);
      incomingEl.textContent = '[Error processing message]';
    }
  });
}

// --- History Management ---
function renderHistory() {
  historyEl.innerHTML = '';
  history.slice().reverse().forEach(item => {
    const li = document.createElement('li');
    li.className = 'p-2 bg-slate-700 rounded flex justify-between items-start gap-2 cursor-pointer hover:bg-slate-600 transition';
    li.innerHTML = `
      <div class="break-words flex-1">${escapeHtml(item.text.slice(0, 100))}${item.text.length > 100 ? '...' : ''}</div>
      <div class="text-xs text-slate-400 ml-2 whitespace-nowrap">${new Date(item.ts).toLocaleTimeString()}</div>
    `;
    li.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(item.text);
        showToast('Copied from history');
      } catch (e) {
        showToast('Copy failed - check permissions');
      }
    });
    historyEl.appendChild(li);
  });
}

function addToHistory(entry) {
  // Avoid duplicates
  if (history.length > 0 && history[history.length - 1].text === entry.text) {
    return;
  }
  history.push(entry);
  if (history.length > 200) history.shift();
  renderHistory();
  saveHistoryToStorage();
}

function escapeHtml(str) {
  return (str + '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function saveHistoryToStorage() {
  try {
    localStorage.setItem(`clipboard-history-${currentRoom}`, JSON.stringify(history));
  } catch (e) {
    console.warn('Could not save history to localStorage');
  }
}

function loadHistoryFromStorage(room) {
  try {
    const stored = localStorage.getItem(`clipboard-history-${room}`);
    if (stored) {
      history = JSON.parse(stored);
      renderHistory();
    }
  } catch (e) {
    console.warn('Could not load history from localStorage');
  }
}

// --- Toast notifications ---
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-2 rounded shadow-lg z-50';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 2000);
}

// --- UI Actions ---
joinBtn.addEventListener('click', async () => {
  const r = (roomEl.value || 'default').trim();
  const pw = passwordEl.value;
  
  if (!r) {
    showToast('Enter room ID');
    return;
  }
  
  if (!/^[a-zA-Z0-9-_]+$/.test(r)) {
    showToast('Room ID can only contain letters, numbers, hyphens, and underscores');
    return;
  }
  
  currentRoom = r;
  showQR(r);
  
  try {
    keyMaterial = await getKeyFromPassword(pw, r);
  } catch (error) {
    console.error('Key derivation failed:', error);
    showToast('Error setting up encryption');
    return;
  }
  
  listenRoom(currentRoom, keyMaterial);
  loadHistoryFromStorage(currentRoom);
  showToast(`Joined room: ${r}`);
});

newBtn.addEventListener('click', () => {
  const id = Math.random().toString(36).slice(2, 10);
  roomEl.value = id;
  joinBtn.click();
});

enableAutoBtn.addEventListener('click', () => {
  autoCopy = true;
  enableAutoBtn.textContent = 'Auto-Copy Enabled';
  enableAutoBtn.classList.remove('bg-purple-600');
  enableAutoBtn.classList.add('bg-green-600');
  showToast('Auto-copy enabled');
});

sendBtn.addEventListener('click', async () => {
  if (!currentRoom) {
    showToast('Join a room first');
    return;
  }
  
  const text = sendText.value.trim();
  if (!text) {
    showToast('Type text to send');
    return;
  }
  
  try {
    const payload = { ts: Date.now() };
    if (keyMaterial) {
      payload.text = await encryptText(text, keyMaterial);
      payload.encrypted = true;
    } else {
      payload.text = text;
      payload.encrypted = false;
    }
    
    await firebase.database().ref('rooms/' + currentRoom + '/clipboard').set(payload);
    showToast('Text sent successfully');
    
    // Add to local history
    addToHistory({ text, ts: payload.ts });
    
  } catch (error) {
    console.error('Send failed:', error);
    showToast('Send failed');
  }
});

// Read clipboard and push
readPush.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      sendText.value = text;
      sendBtn.click();
    } else {
      showToast('Clipboard is empty');
    }
  } catch (e) {
    showToast('Clipboard read failed - click to allow permission');
  }
});

copyIncoming.addEventListener('click', async () => {
  const text = incomingEl.textContent || '';
  if (!text) {
    showToast('No text to copy');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  } catch (e) {
    showToast('Copy failed - check permissions');
  }
});

copyLocal.addEventListener('click', async () => {
  const text = sendText.value;
  if (!text) {
    showToast('No text to copy');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied locally');
  } catch (e) {
    showToast('Copy failed');
  }
});

clearHistoryBtn.addEventListener('click', () => {
  history = [];
  renderHistory();
  saveHistoryToStorage();
  showToast('History cleared');
});

// Auto-join room from URL parameters
(function() {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) {
    roomEl.value = room;
    // Auto-join after a short delay
    setTimeout(() => joinBtn.click(), 500);
  }
})();

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pwa-sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Connection status indicator
const connectionRef = firebase.database().ref('.info/connected');
connectionRef.on('value', (snap) => {
  if (snap.val() === true) {
    console.log('Connected to Firebase');
  } else {
    console.log('Disconnected from Firebase');
  }
});

console.log('Universal Clipboard initialized');