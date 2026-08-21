const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendNotification: (title, body) => {
        ipcRenderer.send('show-notification', { title, body });
    },
    getDrowsinessAdvice: () => ipcRenderer.invoke('get-drowsiness-advice'),
    mediaControl: (direction) => {
        ipcRenderer.send('media-control', direction);
    },
    onNowPlayingChanged: (callback) => {
        ipcRenderer.on('now-playing-changed', (event, data) => callback(data));
    }
});

