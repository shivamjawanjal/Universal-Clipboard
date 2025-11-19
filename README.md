# Universal Clipboard (Multi-file)

This project is a small multi-file web app (vanilla JS + Tailwind + Firebase) that syncs clipboard content between devices.

## Files
- index.html: UI
- app.js: main logic (Firebase, encryption, history, QR, PWA)
- pwa-sw.js: service worker for offline and install
- manifest.json: PWA manifest
- styles.css: small styling tweaks
- firebase-rules.txt: basic realtime-db rules (development only)

## Setup
1. Create a Firebase project at https://console.firebase.google.com
2. Enable Realtime Database (start in test mode while developing)
3. Replace firebaseConfig in app.js with your project values
4. (Optional) update rules in Realtime Database -> Rules
5. Serve over HTTPS (Netlify/Vercel recommended)

## Deploy
- To Netlify: drag & drop the folder or link a Git repo
- To Vercel: `vercel` or import the repo

## Usage
- Open site on two devices
- Create or join same Room ID
- (Optional) set password on both devices to enable encryption
- Click Enable Auto-Copy on the receiving device once to allow clipboard writes

## Security notes
- This example uses client-side encryption using Web Crypto when you set a password. The key is derived from your password and not stored elsewhere.
- For production, secure Firebase rules and consider requiring Auth.