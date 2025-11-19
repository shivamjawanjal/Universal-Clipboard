# Universal Clipboard

A Progressive Web App that syncs clipboard content between devices in real-time using Firebase. Features end-to-end encryption, QR code sharing, and offline capability.

## Features

- 🔄 **Real-time Sync**: Instant clipboard sharing between devices
- 🔒 **End-to-End Encryption**: Optional password protection using Web Crypto API
- 📱 **PWA**: Installable on mobile and desktop
- 🔗 **QR Codes**: Easy room sharing
- 💾 **History**: Local clipboard history
- 🌙 **Dark/Light Theme**: Toggleable themes
- 📴 **Offline Support**: Works without internet connection

## Setup

### 1. Firebase Configuration

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Realtime Database**
3. Copy your Firebase config and replace the values in `app.js`:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};