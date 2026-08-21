const { app, BrowserWindow, Notification, ipcMain, session } = require('electron');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const robot = require('robotjs');
const { SMTCMonitor } = require('@coooookies/windows-smtc-monitor');
const { Worker } = require('worker_threads');
require('dotenv').config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false
        }
    });

    mainWindow.loadFile('index.html');
}

let smtcWorker;

function startSmtcWorker() {
    smtcWorker = new Worker(path.join(__dirname, 'smtc-worker.js'));

    smtcWorker.on('message', (data) => {
        mainWindow?.webContents.send('now-playing-changed', data);
    });

    smtcWorker.on('error', (err) => {
        console.error('SMTC worker error:', err);
    });
}

ipcMain.on('show-notification', (event, { title, body }) => {
    console.log('IPC was received in main:', title, body);
    if (!Notification.isSupported()) {
        console.log('Notification.isSupported() = false');
        return;
    }
    new Notification({ title, body }).show();
});

ipcMain.on('media-control', (event, direction) => {
    console.log('Media control IPC received:', direction);
 
    try {
        if (direction === 'next') {
            robot.keyTap('audio_next');
        } else if (direction === 'previous') {
            robot.keyTap('audio_prev');
        } else {
            console.log('Unknown media direction:', direction);
        }
    } catch (error) {
        // на некоторых системах/сборках robotjs может не поддерживать
        // конкретно media-клавиши - тогда стоит перейти на nut-js или
        // платформенный fallback (osascript на mac, playerctl на linux)
        console.error('robotjs media key failed:', error.message || error);
    }
});

ipcMain.handle('get-drowsiness-advice', async () => {
    try {
        const tips = [
            'Beweg dich (kurz aufstehen, strecken, ein paar Kniebeugen)',
            'Erfrische dich mit Wasser oder kalter Luft',
            'Atme bewusst tief durch',
            'Trinke etwas Kaltes oder Koffeinhaltiges',
            'Wechsle kurz die Umgebung (Fenster öffnen, Licht an)'
        ];
        const randomAngle = tips[Math.floor(Math.random() * tips.length)];
        console.log('Selected category:', randomAngle);

        const result = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: `Ein Nutzer schläft während der Arbeit am Computer ein. Gib EINEN kurzen, konkreten und abwechslungsreichen praktischen Tipp in der Kategorie "${randomAngle}". Antworte nur mit dem Tipp selbst, ohne Einleitung, in maximal 1-2 Sätzen.`,
            config: {
                temperature: 1.2
            }
        });

        console.log('Answer from Gemini:', result.text);

        return result.text.trim();
    } catch (error) {
        console.error('Error to reach Gemini:', error.message || error);
        return 'Machen Sie eine Pause: Waschen Sie sich mit kaltem Wasser das Gesicht oder gehen Sie ein paar Schritte spazieren.';
    }
});
app.whenReady().then(() => {
    app.setAppUserModelId(app.getName());

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(permission === 'media');
    });
    createWindow();

    startSmtcWorker();
});

app.on('window-all-closed', () => {
    smtcWorker?.terminate();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});