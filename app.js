// app.js - Universal Clipboard main logic
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

firebase.initializeApp(firebaseConfig);
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

// theme toggle (simple)
let dark = true;
themeBtn.addEventListener('click', ()=>{
  dark = !dark;
  document.documentElement.classList.toggle('light', !dark);
});

// --- Utility: derive key from password ---
async function getKeyFromPassword(password, saltStr = 'universal-clipboard-salt') {
  const enc = new TextEncoder();
  const pwKey = await window.crypto.subtle.importKey('raw', enc.encode(password), {name: 'PBKDF2'}, false, ['deriveKey']);
  const key = await window.crypto.subtle.deriveKey({
    name: 'PBKDF2',
    salt: enc.encode(saltStr),
    iterations: 200000,
    hash: 'SHA-256'
  }, pwKey, {name: 'AES-GCM', length: 256}, false, ['encrypt','decrypt']);
  return key;
}

async function encryptText(plain, key) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await window.crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc.encode(plain));
  // return base64 iv + ct
  const buf = new Uint8Array(ct);
  const combined = new Uint8Array(iv.byteLength + buf.byteLength);
  combined.set(iv, 0);
  combined.set(buf, iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(b64, key) {
  try {
    const str = atob(b64);
    const arr = Uint8Array.from(str, c=>c.charCodeAt(0));
    const iv = arr.slice(0,12);
    const ct = arr.slice(12);
    const plainBuf = await window.crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    console.warn('decrypt failed', e);
    return null;
  }
}

// --- QR code helpers ---
function showQR(room) {
  qrBox.classList.remove('hidden');
  qrcodeEl.innerHTML = '';
  const url = new URL(window.location.href);
  url.searchParams.set('room', room);
  new QRCode(qrcodeEl, { text: url.toString(), width: 140, height: 140 });
}

// --- Listen to a room ---
function listenRoom(room, key) {
  if (dbListener) dbListener.off && dbListener.off();
  const refRoom = firebase.database().ref('rooms/' + room + '/clipboard');
  dbListener = refRoom;

  refRoom.on('value', async (snap) => {
    const data = snap.val();
    if (!data) return;
    if (data.ts <= lastTs) return; // ignore old
    lastTs = data.ts;

    let text = data.text;
    if (data.encrypted && key) {
      const dec = await decryptText(text, key);
      if (dec !== null) text = dec; else text = '[decryption failed]';
    }

    incomingEl.textContent = text;
    addToHistory({text, ts: data.ts});
    if (autoCopy) {
      try { await navigator.clipboard.writeText(text); } catch (e) { console.warn('write failed', e); }
    }
  });
}

// --- History ---
function renderHistory() {
  historyEl.innerHTML = '';
  history.slice().reverse().forEach(item => {
    const li = document.createElement('li');
    li.className = 'p-2 bg-slate-700 rounded flex justify-between items-start gap-2';
    li.innerHTML = `<div class=\"break-words\">${escapeHtml(item.text)}</div><div class=\"text-xs text-slate-400 ml-2\">${new Date(item.ts).toLocaleString()}</div>`;
    li.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(item.text); alert('Copied from history'); }catch(e){ alert('copy failed') } });
    historyEl.appendChild(li);
  });
}

function addToHistory(entry) {
  history.push(entry);
  if (history.length > 200) history.shift();
  renderHistory();
}

function escapeHtml(str){ return (str+'').replace(/[&<>"']/g, (m)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// --- UI Actions ---
joinBtn.addEventListener('click', async ()=>{
  const r = (roomEl.value || 'default').trim();
  const pw = passwordEl.value;
  if (!r) return alert('Enter room');
  currentRoom = r;
  showQR(r);
  if (pw) keyMaterial = await getKeyFromPassword(pw, r); else keyMaterial = null;
  listenRoom(currentRoom, keyMaterial);
  loadHistoryFromRoom(r);
  alert('Joined ' + r);
});

newBtn.addEventListener('click', ()=>{
  const id = Math.random().toString(36).slice(2,10);
  roomEl.value = id;
  joinBtn.click();
});

enableAutoBtn.addEventListener('click', ()=>{
  autoCopy = true;
  alert('Auto-copy enabled (will try to write incoming text into clipboard).');
});

sendBtn.addEventListener('click', async ()=>{
  if (!currentRoom) return alert('Join a room first');
  const text = sendText.value;
  if (!text) return alert('Type text');
  let payload = { ts: Date.now() };
  if (keyMaterial) {
    payload.text = await encryptText(text, keyMaterial);
    payload.encrypted = true;
  } else {
    payload.text = text;
    payload.encrypted = false;
  }
  firebase.database().ref('rooms/' + currentRoom + '/clipboard').set(payload);
  // also push into history list
  firebase.database().ref('rooms/' + currentRoom + '/history').push(payload);
});

// read clipboard and push
readPush.addEventListener('click', async ()=>{
  try{
    const t = await navigator.clipboard.readText();
    sendText.value = t;
    sendBtn.click();
  }catch(e){ alert('Clipboard read failed - user gesture required'); }
});

copyIncoming.addEventListener('click', async ()=>{
  const t = incomingEl.textContent || '';
  try{ await navigator.clipboard.writeText(t); alert('Copied'); }catch(e){ alert('copy failed'); }
});

copyLocal.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(sendText.value); alert('Copied locally'); }catch(e){ alert('copy failed'); }});

clearHistoryBtn.addEventListener('click', ()=>{ history = []; renderHistory(); });

// push to history when incoming changes -> also store in localHistory
async function loadHistoryFromRoom(room) {
  const href = firebase.database().ref('rooms/' + room + '/history').limitToLast(200);
  const snap = await href.once('value');
  const val = snap.val() || {};
  history = Object.values(val).map(v=>({text:v.encrypted? '[encrypted]': v.text, ts: v.ts}));
  renderHistory();
}

// detect copy events on page
document.addEventListener('copy', async (e)=>{
  try{
    const sel = document.getSelection().toString();
    if (sel && currentRoom) {
      let payload = { ts: Date.now() };
      if (keyMaterial) { payload.text = await encryptText(sel, keyMaterial); payload.encrypted = true; } else { payload.text = sel; payload.encrypted = false; }
      firebase.database().ref('rooms/' + currentRoom + '/clipboard').set(payload);
      firebase.database().ref('rooms/' + currentRoom + '/history').push(payload);
    }
  }catch(e){ console.warn(e); }
});

// accept ?room=xxx in URL
(function(){ const p = new URLSearchParams(location.search); const r = p.get('room'); if (r){ roomEl.value = r; }})();

// register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/pwa-sw.js').then(()=>console.log('sw registered'));
}