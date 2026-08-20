# Luma

Luma is a desktop app that watches for signs of drowsiness while you work at your computer and nudges you to take a break — with a live webcam feed, face-mesh tracking, and AI-generated tips powered by Gemini.

## Features

- **Real-time drowsiness detection** using [MediaPipe FaceMesh](https://google.github.io/mediapipe/solutions/face_mesh) and Eye Aspect Ratio (EAR) calculation
- **Head-tilt calibration** to avoid false positives while looking down at the keyboard
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

## Tech stack

- [Electron](https://www.electronjs.org/)
- [MediaPipe FaceMesh](https://google.github.io/mediapipe/solutions/face_mesh)
- [Google Gemini API](https://ai.google.dev/) (`@google/genai`)
- Vanilla JS / HTML / CSS (no frontend framework)

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- A [Gemini API key](https://aistudio.google.com/)

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
├── main.js          # Electron main process, IPC handlers, Gemini API calls
├── preload.js        # Context bridge between renderer and main
├── index.html         # App layout
├── app.js            # Camera handling, face tracking, drowsiness logic, stats
├── style.css          # UI styling
├── assets/            # Icons and sound files
└── .env               # Local API key (not committed)
```

## License

Personal / educational project. No license specified.
