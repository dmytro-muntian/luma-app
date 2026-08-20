const cameraSelect = document.getElementById('cameraSelect');

async function populateCameraList() {

    await navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => stream.getTracks().forEach(track => track.stop()))
        .catch(err => console.log('Access to camera is denied', err));

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    cameraSelect.innerHTML = '';

    videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Камера ${index + 1}`;
        cameraSelect.appendChild(option);
    });

}

let currentStream = null;
let animationFrameId = null;

async function startCamera(deviceId) {

    try {

        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        if (animationFrameId) {
            clearTimeout(animationFrameId);
        }

        const constraints = {
            video: deviceId
                ? { deviceId: { exact: deviceId } }
                : true
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        currentStream = stream;
        video.srcObject = stream;
        
        cameraSelect.addEventListener('change', () => {
            if (currentStream) {
                startCamera(cameraSelect.value);
            }
        });

        await new Promise(resolve => {
            video.onloadedmetadata = () => resolve();
        });

        video.play();

        async function frameLoop() {
            await faceMesh.send({ image: video });
            animationFrameId = setTimeout(frameLoop, 33);
        }

        frameLoop();

    } catch (error) {
        console.log('Camera connection unsuccesfull', error);
    }

}

let isCameraActive = false;

async function toggleCamera() {
    if (isCameraActive) {
        stopCamera();
    } else {
        await startCamera(cameraSelect.value);
        isCameraActive = true;
        sessionStartTime = Date.now();
        updateCameraButtonUI();
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    if (animationFrameId) {
        clearTimeout(animationFrameId);
        animationFrameId = null;
    }

    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    isCameraActive = false;

    eyesClosedStartTime = null;
    drowsinessNotified = false;
    baselinePitchRatio = null;
    calibrationSamples = [];
    calibrationStartTime = null;

    updateCameraButtonUI();
    updateStatusIndicator('calibrating');

    sessionStartTime = null;
}

function updateCameraButtonUI() {
    const btn = document.querySelector('.camera-activation-button');
    if (isCameraActive) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }
}

populateCameraList();

const canvas = document.getElementById('faceCanvas');
const ctx = canvas.getContext('2d');
const meshToggle = document.getElementById('meshToggle');
const statusIndicator = document.getElementById('statusIndicator');

function updateStatusIndicator(state) {
    statusIndicator.className = 'status-indicator ' + state;

    switch (state) {
        case 'calibrating':
            statusIndicator.textContent = 'Calibrating';
            break;
        case 'tilted':
            statusIndicator.textContent = 'Pitch';
            break;
        case 'active':
            statusIndicator.textContent = 'Tracking';
            break;
    }
}

let drowsinessNotified = false;

const notificationsList = document.getElementById('notificationsList');
const STORAGE_KEY = 'luma_notifications';
const MAX_NOTIFICATIONS = 50;

function loadNotifications() {

    const stored = localStorage.getItem(STORAGE_KEY);
    const notifications = stored ? JSON.parse(stored) : [];

    notifications.forEach(n => renderNotification(n.title, n.body, n.time, n.ts, n.excluded));

}

const alertSound = new Audio('assets/aviation-alarm.mp3');
alertSound.volume = 1.0;

function playAlertSound() {
    alertSound.currentTime = 0;
    alertSound.play().catch(err => console.log('Playback failed:', err));
}

function saveNotification(title, body, time, ts, excluded) {

    const stored = localStorage.getItem(STORAGE_KEY);
    const notifications = stored ? JSON.parse(stored) : [];

    notifications.unshift({ title, body, time, ts, excluded });

    if (notifications.length > MAX_NOTIFICATIONS) {
        notifications.length = MAX_NOTIFICATIONS;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));

}

function renderNotification(title, body, time, ts, excluded) {

    const item = document.createElement('div');
    item.className = 'notification-item' + (excluded ? ' excluded' : '');

    item.innerHTML = `
        <div class="notification-time">${time}</div>
        <div class="notification-title">${title}</div>
        <div class="notification-body">${body}</div>
        <button class="not-sleep-btn" onclick="markAsNotSleep(${ts}, this)" ${excluded ? 'disabled' : ''}>
            ${excluded ? 'Marked as not sleep' : 'Not sleep'}
        </button>
    `;

    notificationsList.appendChild(item);

}

function addNotificationToUI(title, body, ts) {

    const time = new Date(ts).toLocaleTimeString('en-EN', { hour: '2-digit', minute: '2-digit' });

    const item = document.createElement('div');
    item.className = 'notification-item';

    item.innerHTML = `
        <div class="notification-time">${time}</div>
        <div class="notification-title">${title}</div>
        <div class="notification-body">${body}</div>
        <button class="not-sleep-btn" onclick="markAsNotSleep(${ts}, this)">Not sleep</button>
    `;

    notificationsList.prepend(item);

    saveNotification(title, body, time, ts, false);

}

loadNotifications();

document.getElementById('clearNotifications').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    notificationsList.innerHTML = '';
});

async function checkDrowsiness(leftEAR, rightEAR) {

    const avgEAR = (leftEAR + rightEAR) / 2;

    if (avgEAR < EAR_THRESHOLD) {

        if (eyesClosedStartTime == null) {

            eyesClosedStartTime = Date.now();

        } else if ((Date.now() - eyesClosedStartTime) > DROWSINESS_DURATION) {

            console.log('Sending notification...');
            console.log('YOU ARE FALLING ASLEEP!');

            if (!drowsinessNotified) {
                drowsinessNotified = true;

                const eventTs = Date.now();
                const advice = await window.electronAPI.getDrowsinessAdvice();

                window.electronAPI.sendNotification('YOU ARE FALLING ASLEEP!', advice);
                addNotificationToUI('YOU ARE FALLING ASLEEP!', advice, eventTs);
                playAlertSound();
                saveDrowsinessEvent(eventTs);
            }

        }

    } else {

        eyesClosedStartTime = null;
        drowsinessNotified = false;

    }

}

const FOREHEAD_IDX = 10;
const NOSE_TIP_IDX = 1;
const CHIN_IDX = 152;

const LEFT_IRIS_CENTER = 468;
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;

function calculateGazeVertical(landmarks) {
    const irisY = landmarks[LEFT_IRIS_CENTER].y;
    const eyeTopY = landmarks[LEFT_EYE_TOP].y;
    const eyeBottomY = landmarks[LEFT_EYE_BOTTOM].y;

    const gazePosition = (irisY - eyeTopY) / (eyeBottomY - eyeTopY);
    return gazePosition;
}

let baselinePitchRatio = null;
let calibrationSamples = [];
let calibrationStartTime = null;
const CALIBRATION_DURATION = 3000;
const PITCH_TOLERANCE = 0.40;

function calculatePitchRatio(landmarks) {
    const foreheadY = landmarks[FOREHEAD_IDX].y;
    const noseY = landmarks[NOSE_TIP_IDX].y;
    const chinY = landmarks[CHIN_IDX].y;

    const upperDist = noseY - foreheadY;
    const lowerDist = chinY - noseY;

    return upperDist / lowerDist;
}

function isHeadTiltedDown(currentRatio) {
    if (baselinePitchRatio === null) return false;
    const deviation = (currentRatio - baselinePitchRatio) / baselinePitchRatio;
    console.log('Pitch deviation:', (deviation * 100).toFixed(1) + '%');
    return Math.abs(deviation) > PITCH_TOLERANCE;
}

function drawLandmarks(landmarks) {

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!meshToggle.checked) {
        return;
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const videoRatio = videoWidth / videoHeight;
    const canvasRatio = canvas.width / canvas.height;

    let renderWidth, renderHeight, offsetX, offsetY;

    if (canvasRatio > videoRatio) {
        renderWidth = canvas.width;
        renderHeight = canvas.width / videoRatio;
        offsetX = 0;
        offsetY = (canvas.height - renderHeight) / 2;
    } else {
        renderHeight = canvas.height;
        renderWidth = canvas.height * videoRatio;
        offsetX = (canvas.width - renderWidth) / 2;
        offsetY = 0;
    }

    for (let i = 0; i < landmarks.length; i++) {

        const point = landmarks[i];
        const x = point.x * renderWidth + offsetX;
        const y = point.y * renderHeight + offsetY;

        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#4fd1c5';
        ctx.fill();

    }

}

function calculateEAR(landmarks, eyeIndices) {

const upperPoint = landmarks[eyeIndices.upper];
const lowerPoint = landmarks[eyeIndices.lower];
const outerPoint = landmarks[eyeIndices.outer];
const innerPoint = landmarks[eyeIndices.inner];

const vertical = Math.abs(lowerPoint.y - upperPoint.y);
const horizontal = Math.abs(innerPoint.x - outerPoint.x);
const ear = vertical / horizontal;

return ear;

}

const video = document.getElementById('webcamera');

let lastLogTime = 0;
let eyesClosedStartTime = null;
const EAR_THRESHOLD = 0.25;
const DROWSINESS_DURATION = 2000;

const faceMesh = new FaceMesh ({

    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`

});

faceMesh.setOptions({

    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5

});

faceMesh.onResults((results) => {

    if (results.multiFaceLandmarks.length > 0) {

        const landmarks = results.multiFaceLandmarks[0];

        drawLandmarks(landmarks);

        const pitchRatio = calculatePitchRatio(landmarks);

        if (calibrationStartTime === null) {
            calibrationStartTime = Date.now();
        }

        if (baselinePitchRatio === null) {
            calibrationSamples.push(pitchRatio);

            updateStatusIndicator('calibrating');

            if (Date.now() - calibrationStartTime > CALIBRATION_DURATION) {
                baselinePitchRatio = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
                console.log('Calibration is succesfull, baseline:', baselinePitchRatio);
            }

            return;
        }

        const leftEAR = calculateEAR(landmarks, { upper: 159, lower: 145, outer: 33, inner: 133 });
        const rightEAR = calculateEAR(landmarks, { upper: 386, lower: 374, outer: 263, inner: 362 });

        const now = Date.now();
        if (now - lastLogTime > 500) {
            console.log('Left EAR:', leftEAR, 'Right EAR:', rightEAR, 'Pitch tilt:', isHeadTiltedDown(pitchRatio));
            lastLogTime = now;
        }

        const gazeVertical = calculateGazeVertical(landmarks);
        console.log('Gaze vertical:', gazeVertical.toFixed(2));

        if (isHeadTiltedDown(pitchRatio)) {
        eyesClosedStartTime = null;
        drowsinessNotified = false;
        updateStatusIndicator('tilted');
        return;
}

        updateStatusIndicator('active');

        checkDrowsiness(leftEAR, rightEAR);

    }

});

console.log('faceMesh created:', faceMesh);

const STATS_KEY = 'luma_drowsiness_events_v2';

let sessionStartTime = null;

function saveDrowsinessEvent(ts) {
    const stored = localStorage.getItem(STATS_KEY);
    const events = stored ? JSON.parse(stored) : [];

    const sessionElapsedMinutes = sessionStartTime
        ? Math.round((ts - sessionStartTime) / 60000)
        : 0;

    events.push({
        ts: ts,
        sessionMinutes: sessionElapsedMinutes,
        excluded: false
    });

    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const filtered = events.filter(e => e.ts > ninetyDaysAgo);

    localStorage.setItem(STATS_KEY, JSON.stringify(filtered));
}

function getDrowsinessEvents() {
    const stored = localStorage.getItem(STATS_KEY);
    return stored ? JSON.parse(stored) : [];
}

function markAsNotSleep(ts, buttonEl) {

    const storedNotifs = localStorage.getItem(STORAGE_KEY);
    const notifications = storedNotifs ? JSON.parse(storedNotifs) : [];
    const notif = notifications.find(n => n.ts === ts);
    if (notif) {
        notif.excluded = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    }

    const storedEvents = localStorage.getItem(STATS_KEY);
    const events = storedEvents ? JSON.parse(storedEvents) : [];
    const event = events.find(e => e.ts === ts);
    if (event) {
        event.excluded = true;
        localStorage.setItem(STATS_KEY, JSON.stringify(events));
    }

    const item = buttonEl.closest('.notification-item');
    item.classList.add('excluded');
    buttonEl.textContent = 'Marked as not sleep';
    buttonEl.disabled = true;

}

function computeHourlyDistribution(events) {
    const hourly = new Array(24).fill(0);
    events.forEach(e => {
        const hour = new Date(e.ts).getHours();
        hourly[hour]++;
    });
    return hourly;
}

function computeWeeklyTrend(events) {
    if (events.length === 0) return [];

    const now = Date.now();
    const weeks = [];

    for (let i = 7; i >= 0; i--) {
        const weekEnd = now - (i * 7 * 24 * 60 * 60 * 1000);
        const weekStart = weekEnd - (7 * 24 * 60 * 60 * 1000);
        const count = events.filter(e => e.ts >= weekStart && e.ts < weekEnd).length;

        const label = i === 0 ? 'Эта нед.' : `-${i} нед.`;
        weeks.push({ label, count });
    }

    return weeks;
}

function computeSessionDurationBuckets(events) {
    const buckets = [
        { label: '<1h', min: 0, max: 60, count: 0 },
        { label: '1-2h', min: 60, max: 120, count: 0 },
        { label: '2-3h', min: 120, max: 180, count: 0 },
        { label: '3-4h', min: 180, max: 240, count: 0 },
        { label: '4-5h', min: 240, max: 300, count: 0 },
        { label: '5-6h', min: 300, max: 360, count: 0 },
        { label: '6-7h', min: 360, max: 420, count: 0 },
        { label: '7-8h', min: 420, max: 480, count: 0 },
        { label: '8h+', min: 480, max: Infinity, count: 0 }
    ];

    events.forEach(e => {
        const bucket = buckets.find(b => e.sessionMinutes >= b.min && e.sessionMinutes < b.max);
        if (bucket) bucket.count++;
    });

    return buckets;
}

function renderBarChart(containerId, data, labelKey, countKey) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const maxCount = Math.max(...data.map(d => d[countKey]), 1);

    data.forEach(item => {
        const wrapper = document.createElement('div');
        wrapper.className = 'stats-bar-wrapper';

        const bar = document.createElement('div');
        bar.className = 'stats-bar';
        bar.style.height = `${(item[countKey] / maxCount) * 100}%`;

        const countLabel = document.createElement('div');
        countLabel.className = 'stats-bar-count';
        countLabel.textContent = item[countKey] > 0 ? item[countKey] : '';

        const dayLabel = document.createElement('div');
        dayLabel.className = 'stats-bar-label';
        dayLabel.textContent = item[labelKey];

        wrapper.appendChild(countLabel);
        wrapper.appendChild(bar);
        wrapper.appendChild(dayLabel);
        container.appendChild(wrapper);
    });
}

function renderStats() {
    const events = getDrowsinessEvents().filter(e => !e.excluded);

    document.getElementById('statTotal').textContent = events.length;

    const startOfToday = new Date().setHours(0, 0, 0, 0);
    document.getElementById('statToday').textContent =
        events.filter(e => e.ts >= startOfToday).length;

    const hourly = computeHourlyDistribution(events);
    const hourlyGrouped = [];
    for (let i = 0; i < 24; i += 2) {
        hourlyGrouped.push({
            label: `${i}-${i + 2}`,
            count: hourly[i] + hourly[i + 1]
        });
    }
    renderBarChart('hourlyChart', hourlyGrouped, 'label', 'count');

    const weekly = computeWeeklyTrend(events);
    renderBarChart('trendChart', weekly, 'label', 'count');

    const durationBuckets = computeSessionDurationBuckets(events);
    renderBarChart('durationChart', durationBuckets, 'label', 'count');

    renderInsightSummary(events, hourly, durationBuckets);
}

function renderInsightSummary(events, hourly, durationBuckets) {
    const summaryEl = document.getElementById('insightSummary');

    if (events.length < 3) {
        summaryEl.textContent = 'There isn`t enough data to draw conclusions - statistics will be available after a few sleep cycles.';
        return;
    }

    const peakHour = hourly.indexOf(Math.max(...hourly));
    const peakBucket = durationBuckets.reduce((a, b) => b.count > a.count ? b : a);

    summaryEl.textContent =
        `You mostly fall asleep at ${peakHour}:00, and this usually happens after ${peakBucket.label} continuous computer use.`;
}

const tabNotifications = document.getElementById('tabNotifications');
const tabStats = document.getElementById('tabStats');
const statsPanel = document.getElementById('statsPanel');

tabNotifications.addEventListener('click', () => {
    tabNotifications.classList.add('active');
    tabStats.classList.remove('active');
    notificationsList.style.display = 'flex';
    statsPanel.style.display = 'none';
});

tabStats.addEventListener('click', () => {
    tabStats.classList.add('active');
    tabNotifications.classList.remove('active');
    statsPanel.style.display = 'flex';
    notificationsList.style.display = 'none';
    renderStats();
});

function pruneOldEvents() {
    const stored = localStorage.getItem(STATS_KEY);
    if (!stored) return;

    const events = JSON.parse(stored);
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const filtered = events.filter(e => e.ts > ninetyDaysAgo);

    localStorage.setItem(STATS_KEY, JSON.stringify(filtered));
}

pruneOldEvents();

document.getElementById('clearStats').addEventListener('click', () => {
    if (confirm('Delete all statistics? This cannot be undone.')) {
        localStorage.removeItem(STATS_KEY);
        renderStats();
    }
});



