# Luma

Luma is a desktop app that watches for signs of drowsiness while you work at your computer and nudges you to take a break — with a live webcam feed, face-mesh tracking, hand-gesture media controls, and AI-generated tips powered by Gemini.

## Features

- **Real-time drowsiness detection** using [MediaPipe FaceMesh](https://google.github.io/mediapipe/solutions/face_mesh) and Eye Aspect Ratio (EAR) calculation
- **Head-tilt calibration** to avoid false positives while looking down at the keyboard
- **Gaze-down detection** to avoid false positives when glancing at your phone or lap — tracks iris position within the eyelids, combined with head-tilt deviation, so a lowered EAR from looking down isn't mistaken for eyes closing
- **AI-generated advice** on each alert, powered by Google's Gemini API
- **Desktop notifications** with sound alerts
- **Notification history** with the ability to mark false positives ("Not sleep")
- **Statistics dashboard**
  - Events by time of day
  - Weekly trend
  - Correlation with session duration
  - Automatic insight summary
  - False positives excluded from all stats
- **Camera selection** for multi-camera setups, with the ability to toggle the camera on/off
- **Face mesh overlay** toggle
- **Hand-gesture media control**, switchable between two modes:
  - **Swipe** — a palm crossing the frame left/right skips to the previous/next track
  - **Palm** — hold up an open palm; which hand (left/right, as seen on screen) decides the direction — right hand skips forward, left hand goes back. A hand resting near the face (e.g. propping up your chin) is automatically ignored, so it isn't mistaken for a gesture
- **Now-playing badge** showing the currently playing track (title/artist), read from the Windows system media session (SMTC) — updates automatically as tracks change

## Tech stack

- [Electron](https://www.electronjs.org/)
- [MediaPipe FaceMesh](https://google.github.io/mediapipe/solutions/face_mesh) and [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands) for gesture recognition (including left/right hand classification for palm gestures)
- [Google Gemini API](https://ai.google.dev/) (`@google/genai`)
- [robotjs](https://github.com/octalmage/robotjs) for simulating media key presses
- [@coooookies/windows-smtc-monitor](https://github.com/LeagueTavern/node-windows-smtc-monitor) for reading now-playing track info from Windows (runs in a `worker_threads` worker to avoid blocking the main process)
- Vanilla JS / HTML / CSS (no frontend framework)

> **Platform note:** media key simulation and the now-playing badge rely on Windows-specific APIs (SMTC), and are only supported on Windows 10 1809+ / Windows 11.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- A [Gemini API key](https://aistudio.google.com/)
- Windows 10 (1809+) or Windows 11, for the media-control and now-playing features

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/dmytro-muntian/luma-app.git
   cd luma-app
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the project root:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
4. Start the app:
   ```bash
   npm start
   ```

## Building

Build a Windows installer with [electron-builder](https://www.electron.build/):

```bash
npm run build:win
```

The packaged app will be available in the `dist/` folder.

> **Note:** `.env` is excluded from version control and from the packaged build files list by default. If you plan to distribute the app to others, avoid bundling your API key directly — consider proxying Gemini calls through a small backend instead.

## Project structure

```
luma-app/
├── main.js            # Electron main process, IPC handlers, Gemini API calls, SMTC worker orchestration
├── preload.js         # Context bridge between renderer and main
├── smtc-worker.js     # Worker thread polling Windows SMTC for now-playing track info
├── index.html         # App layout
├── app.js             # Camera handling, face/hand tracking, drowsiness logic, gesture control, stats
├── style.css          # UI styling
├── assets/            # Icons and sound files
└── .env               # Local API key (not committed)
```

## License

Personal / educational project. No license specified.