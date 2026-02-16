# OpenSoak Frontend 🛁

A high-performance, responsive SPA built with React, Vite, and Tailwind CSS.

## 🛠 Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Dev Server
```bash
npm run dev
```
The dashboard will attempt to connect to the backend at `window.location.host/api`.

## 📱 Android & TV Support

This project uses **Capacitor** to target Android TV (NVIDIA Shield).

### 1. Build Web Assets
```bash
npm run build
```

### 2. Sync with Android
```bash
npx cap sync android
```

### 3. Open in Android Studio
```bash
npx cap open android
```

## 🏗 Key Components
- **Liquid Glass UI:** Custom glassmorphism implementation in `index.css`.
- **D-pad Navigation:** Optimized focus states for TV remote control.
- **Host Discovery:** Automatic and manual backend discovery logic in `App.jsx`.