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
            await hands.send({ image: video });
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

    // reset gesture-control state too, otherwise a stale swipe could carry over into the next session
    resetGestureState();

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
        case 'looking-down':
            statusIndicator.textContent = 'Looking down';
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

// gazeVertical is roughly 0 (iris near the top lid, looking up) to 1
// (iris near the bottom lid, looking down). Values above this threshold
// mean the eyes are pointed down at something in your lap/hands, not
// closing - tune by watching the "Gaze vertical:" console log while you
// deliberately look down at your phone vs. blink normally.
// снижаем оба порога — им не нужно ловить экстремальные случаи по отдельности,
// работать они будут вместе
const PITCH_TOLERANCE_SOFT = 0.20;   // было 0.40 для единственной проверки
const GAZE_DOWN_THRESHOLD_SOFT = 0.55; // было 0.65 для единственной проверки

function isLookingAway(pitchRatio, gazeVertical) {
    if (baselinePitchRatio === null) return false;

    const pitchDeviation = Math.abs((pitchRatio - baselinePitchRatio) / baselinePitchRatio);

    // ни наклон, ни взгляд по отдельности могут не дотянуть до "сильного" порога,
    // но если они складываются - вероятность того, что человек реально смотрит
    // в телефон, а не засыпает, гораздо выше
    const pitchScore = pitchDeviation / PITCH_TOLERANCE_SOFT;   // >= 1 значит "явный наклон"
    const gazeScore = gazeVertical / GAZE_DOWN_THRESHOLD_SOFT;  // >= 1 значит "явный взгляд вниз"

    console.log('pitchScore:', pitchScore.toFixed(2), 'gazeScore:', gazeScore.toFixed(2));

    // срабатывает, если хотя бы один явно превышен, ИЛИ оба умеренно повышены одновременно
    return pitchScore > 1 || gazeScore > 1 || (pitchScore > 0.5 && gazeScore > 0.5);
}

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

// ---------------------------------------------------------------------
// Hand-gesture media control
//
// Two switchable modes, tracked via a separate MediaPipe Hands model
// running on the same video frames as FaceMesh:
//
//  - 'swipe':   palm crosses a chunk of the frame width within a short
//               window -> right = next, left = previous
//  - 'fingers': 1 extended finger = next, 2 extended fingers = previous
//               (thumb excluded - its extension is mostly horizontal,
//               not vertical, so the same up/down check doesn't work for it)
// ---------------------------------------------------------------------

let gestureMode = 'swipe'; // 'swipe' | 'fingers'

const gestureModeToggle = document.getElementById('gestureModeToggle');
const gestureModeLabel = document.getElementById('gestureModeLabel');

function resetGestureState() {
    handPositionHistory = [];
    lastSwipeTriggerTime = 0;

    currentGesture = null;
    gestureStartTime = null;
    gestureTriggered = false;
    lastGestureTriggerTime = 0;
}

if (gestureModeToggle) {
    gestureModeToggle.addEventListener('change', () => {
    gestureMode = gestureModeToggle.checked ? 'palm' : 'swipe';
    gestureModeLabel.textContent = gestureModeToggle.checked ? 'Palm' : 'Swipe';
    resetGestureState();
    });
}

// --- swipe mode ---

const SWIPE_WINDOW_MS = 600;       // swipe must complete within this time
const SWIPE_MIN_DISTANCE = 0.28;   // fraction of frame width the palm must travel
const SWIPE_COOLDOWN_MS = 1000;    // ignore further swipes right after a trigger
const PALM_LANDMARK_IDXS = [0, 5, 9, 13, 17]; // wrist + base of each finger

let handPositionHistory = []; // { x, t }
let lastSwipeTriggerTime = 0;

function getPalmCenterX(landmarks) {
    const sum = PALM_LANDMARK_IDXS.reduce((acc, i) => acc + landmarks[i].x, 0);
    return sum / PALM_LANDMARK_IDXS.length;
}

function detectSwipe(landmarks) {

    const now = Date.now();
    const x = getPalmCenterX(landmarks);

    handPositionHistory.push({ x, t: now });
    handPositionHistory = handPositionHistory.filter(p => now - p.t <= SWIPE_WINDOW_MS);

    if (now - lastSwipeTriggerTime < SWIPE_COOLDOWN_MS) {
        return;
    }

    if (handPositionHistory.length < 2) {
        return;
    }

    const oldest = handPositionHistory[0];
    const delta = x - oldest.x;

    if (Math.abs(delta) >= SWIPE_MIN_DISTANCE) {
        lastSwipeTriggerTime = now;
        handPositionHistory = [];

        // video coordinate space is mirrored relative to what you see on
        // screen, so the mapping below is flipped to match
        if (delta > 0) {
            triggerMediaControl('previous');
        } else {
            triggerMediaControl('next');
        }
    }

}

// --- palm mode ---
//
// An open palm (all 5 fingers extended, thumb included) counts as a
// gesture; which hand shows it (left/right, as seen on screen) decides
// the direction. This is far less likely to be triggered accidentally by
// everyday poses (resting a hand on your face, holding a mug, etc.) than
// counting extended fingers.

const THUMB_TIP = 4, THUMB_MCP = 2, INDEX_MCP = 5;

const HANDEDNESS_CONFIDENCE_MIN = 0.8;

// MediaPipe's Left/Right classification assumes a mirrored (selfie-style)
// input image. If the raw stream we send to the model is NOT mirrored
// (only the on-screen <video> is mirrored via CSS for the user to see),
// the labels come back swapped relative to what's visually on screen -
// flip this if testing shows "right hand on screen" triggers "previous"
// instead of "next" (see console log below to check).
const HANDEDNESS_MIRRORED = true;

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function isThumbExtended(landmarks) {
    const tipDist = distance(landmarks[THUMB_TIP], landmarks[INDEX_MCP]);
    const mcpDist = distance(landmarks[THUMB_MCP], landmarks[INDEX_MCP]);
    return tipDist > mcpDist * 1.3;
}

function isPalmOpen(landmarks) {
    return (
        isThumbExtended(landmarks) &&
        isFingerExtended(landmarks, INDEX_TIP, INDEX_PIP) &&
        isFingerExtended(landmarks, MIDDLE_TIP, MIDDLE_PIP) &&
        isFingerExtended(landmarks, RING_TIP, RING_PIP) &&
        isFingerExtended(landmarks, PINKY_TIP, PINKY_PIP)
    );
}

function detectPalmGesture(handsData) {

    const openHands = handsData.filter(h =>
        h.score >= HANDEDNESS_CONFIDENCE_MIN &&
        isPalmOpen(h.landmarks) &&
        !isHandNearFace(h.landmarks)
    );

    let gesture = null;

    // ровно одна открытая ладонь - однозначная команда. Ноль или обе
    // сразу - неоднозначно, игнорируем (например, потягивание двумя руками)
    if (openHands.length === 1) {
        let side = openHands[0].label; // 'Left' | 'Right' от MediaPipe

        if (HANDEDNESS_MIRRORED) {
            side = side === 'Left' ? 'Right' : 'Left';
        }

        console.log('Palm detected - raw label:', openHands[0].label, '-> resolved side:', side);

        gesture = side === 'Right' ? 'right' : 'left';
    }

    const now = Date.now();

    if (gesture !== currentGesture) {
        currentGesture = gesture;
        gestureStartTime = now;
        gestureTriggered = false;
        return;
    }

    if (gesture === null) return;
    if (gestureTriggered) return;
    if (now - lastGestureTriggerTime < GESTURE_COOLDOWN_MS) return;

    if (now - gestureStartTime >= GESTURE_HOLD_MS) {
        gestureTriggered = true;
        lastGestureTriggerTime = now;

        // право на экране = следующий трек, лево = предыдущий
        if (gesture === 'right') {
            triggerMediaControl('next');
        } else {
            triggerMediaControl('previous');
        }
    }

}

function triggerMediaControl(direction) {

    console.log('Media control triggered:', direction);

    if (window.electronAPI && typeof window.electronAPI.mediaControl === 'function') {
        window.electronAPI.mediaControl(direction);
    } else {
        console.log('window.electronAPI.mediaControl is not defined - see preload/main setup needed for real media control');
    }

    flashGestureFeedback(direction);

}

// small visual confirmation so the user gets feedback that a gesture was recognized
function flashGestureFeedback(direction) {
    if (!statusIndicator) return;
    const previousText = statusIndicator.textContent;
    const previousClass = statusIndicator.className;

    statusIndicator.textContent = direction === 'next' ? '⏭ Next' : '⏮ Prev';

    setTimeout(() => {
        statusIndicator.textContent = previousText;
        statusIndicator.className = previousClass;
    }, 700);
}

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
});

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {

        if (gestureMode === 'swipe') {
            const activeHands = results.multiHandLandmarks.filter(lm => !isHandNearFace(lm));
            if (activeHands.length > 0) {
                detectSwipe(activeHands[0]);
            }
        } else {
            const handsData = results.multiHandLandmarks.map((landmarks, i) => ({
                landmarks,
                label: results.multiHandedness[i]?.label,
                score: results.multiHandedness[i]?.score ?? 0
            }));
            detectPalmGesture(handsData);
        }

    } else if (gestureMode === 'palm') {
        currentGesture = null;
        gestureStartTime = null;
        gestureTriggered = false;
    }
});

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

        if (isLookingAway(pitchRatio, gazeVertical)) {
            eyesClosedStartTime = null;
            drowsinessNotified = false;
            updateStatusIndicator(gazeVertical > GAZE_DOWN_THRESHOLD_SOFT ? 'looking-down' : 'tilted');
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

const nowPlayingBadge = document.getElementById('nowPlayingBadge');
const nowPlayingText = document.getElementById('nowPlayingText');

if (window.electronAPI && typeof window.electronAPI.onNowPlayingChanged === 'function') {
    window.electronAPI.onNowPlayingChanged((data) => {
        if (!data || !data.title) {
            nowPlayingBadge.style.display = 'none';
            return;
        }

        const label = data.artist ? `${data.artist} — ${data.title}` : data.title;
        nowPlayingText.textContent = label;
        nowPlayingBadge.style.display = 'flex';
    });
}