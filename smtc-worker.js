const { parentPort } = require('worker_threads');
const { SMTCMonitor } = require('@coooookies/windows-smtc-monitor');

const monitor = new SMTCMonitor();

function sendCurrentState() {
    try {
        const session = SMTCMonitor.getCurrentMediaSession();

        if (!session) {
            parentPort.postMessage(null);
            return;
        }

        const { title, artist } = session.media;
        const isPlaying = session.playback.playbackStatus === 4;

        parentPort.postMessage({ title, artist, isPlaying });
    } catch (error) {
        console.error('SMTC worker read failed:', error.message || error);
    }
}

monitor.on('session-media-changed', sendCurrentState);
monitor.on('session-playback-changed', sendCurrentState);
monitor.on('current-session-changed', sendCurrentState);

// сразу отправляем текущее состояние при старте, не дожидаясь первого события
sendCurrentState();