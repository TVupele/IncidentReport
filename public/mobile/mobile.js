// mobile.js – Enhanced Incident Reporting for MATASA

// ===== STATE MANAGEMENT =====
const state = {
    currentStep: 1,
    incidentType: '',
    severity: '',
    latitude: null,
    longitude: null,
    accuracy: null,
    state: '',
    description: '',
    photos: [],           // File objects for submission
    photoPreviews: [],    // base64 strings for preview (optional)
    callbackConsent: false,
    phoneNumber: '',
    isSubmitting: false
};

// Offline queue – each entry contains report data + photos as base64
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');

// DOM element shortcuts
const offlineBanner = document.getElementById('offlineBanner');
const submitBtn = document.getElementById('submitBtn');
const submitError = document.getElementById('submitError');
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    updateOfflineBanner();
    updateProgressBar();
    restoreSelectedUI();
});

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Incident type buttons
    document.querySelectorAll('.option-btn[data-type]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.currentTarget.dataset.type;
            setSelectedType(type);
            state.incidentType = type;
            goToStep(2);
        });
    });

    // Severity buttons
    document.querySelectorAll('.severity-btn[data-severity]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const severity = e.currentTarget.dataset.severity;
            setSelectedSeverity(severity);
            state.severity = severity;
            goToStep(3);
        });
    });

    // Back buttons
    document.getElementById('backToType').addEventListener('click', () => goToStep(1));
    document.getElementById('backToSeverity').addEventListener('click', () => goToStep(2));
    document.getElementById('backToLocation').addEventListener('click', () => goToStep(3));
    document.getElementById('backToDescription').addEventListener('click', () => goToStep(4));

    // Next buttons
    document.getElementById('locationNextBtn').addEventListener('click', () => {
        if ((state.latitude && state.longitude) || state.state) {
            goToStep(4);
        } else {
            const status = document.getElementById('locationStatus');
            status.textContent = 'Don Allah sami wuri ko zaɓi jiha.';
            status.className = 'location-status error';
        }
    });

    document.getElementById('descriptionNextBtn').addEventListener('click', () => {
        goToStep(5);
    });

    // Location
    document.getElementById('getLocation').addEventListener('click', getLocation);
    document.getElementById('stateSelect').addEventListener('change', (e) => {
        state.state = e.target.value;
    });

    // Photo upload
    photoInput.addEventListener('change', handlePhotoUpload);

    // Callback consent
    document.getElementById('callbackConsent').addEventListener('change', (e) => {
        state.callbackConsent = e.target.checked;
        document.getElementById('phoneGroup').classList.toggle('hidden', !e.target.checked);
        if (!e.target.checked) {
            state.phoneNumber = '';
            document.getElementById('phoneNumber').value = '';
        }
    });

    document.getElementById('phoneNumber').addEventListener('input', (e) => {
        state.phoneNumber = e.target.value;
    });

    document.getElementById('description').addEventListener('input', (e) => {
        state.description = e.target.value;
    });

    // Submit
    submitBtn.addEventListener('click', submitReport);

    // Online / Offline
    window.addEventListener('online', () => {
        updateOfflineBanner();
        syncOfflineQueue();
    });
    window.addEventListener('offline', updateOfflineBanner);
}

// ===== UI HELPERS =====
function setSelectedType(type) {
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.type === type);
    });
}

function setSelectedSeverity(severity) {
    document.querySelectorAll('.severity-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.severity === severity);
    });
}

function restoreSelectedUI() {
    if (state.incidentType) setSelectedType(state.incidentType);
    if (state.severity) setSelectedSeverity(state.severity);
}

// ===== NAVIGATION =====
function goToStep(step) {
    // Hide all step cards
    document.querySelectorAll('.card').forEach(card => {
        card.classList.add('hidden');
    });

    // Show target step
    const stepIds = ['type', 'severity', 'location', 'description', 'consent', 'success'];
    const target = document.getElementById(`step-${stepIds[step - 1]}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('fade-in');
        setTimeout(() => target.classList.remove('fade-in'), 300);
    }

    state.currentStep = step;
    updateProgressBar();
    restoreSelectedUI();
}

function updateProgressBar() {
    const dots = document.querySelectorAll('.progress-dot');
    dots.forEach((dot, idx) => {
        const step = idx + 1;
        dot.classList.remove('active', 'completed');
        if (step === state.currentStep) dot.classList.add('active');
        else if (step < state.currentStep) dot.classList.add('completed');
    });
}

// ===== LOCATION =====
function getLocation() {
    const btn = document.getElementById('getLocation');
    const status = document.getElementById('locationStatus');

    if (!navigator.geolocation) {
        status.textContent = 'Geolocation ba aiki ba';
        status.className = 'location-status error';
        return;
    }

    btn.classList.add('getting-location');
    btn.innerHTML = '<span class="spinner"></span> Neman wuri...';
    status.textContent = '';
    status.className = 'location-status';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            state.latitude = position.coords.latitude;
            state.longitude = position.coords.longitude;
            state.accuracy = position.coords.accuracy;

            btn.classList.remove('getting-location');
            btn.classList.add('success');
            btn.innerHTML = '<span class="icon">✅</span><span>An same wuri</span>';
            status.textContent = `Lat: ${state.latitude.toFixed(4)}, Lng: ${state.longitude.toFixed(4)}`;
            status.className = 'location-status success';
        },
        (error) => {
            btn.classList.remove('getting-location');
            btn.innerHTML = '<span class="icon">📍</span><span>Sami Wuri ta Atomatik</span>';
            status.textContent = 'Ba a same wuri ba. Zaɓi handaki.';
            status.className = 'location-status error';
        },
        { timeout: 10000, enableHighAccuracy: true }
    );
}

// ===== PHOTO UPLOAD =====
function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);
    const maxPhotos = 3;

    if (state.photos.length + files.length > maxPhotos) {
        alert(`Za ka iya ɗaukar hotuna ${maxPhotos} kawai.`);
        e.target.value = '';
        return;
    }

    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;

        // Store File object
        state.photos.push(file);

        // Create preview
        const reader = new FileReader();
        reader.onload = (ev) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-wrapper';

            const img = document.createElement('img');
            img.src = ev.target.result;

            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-photo';
            removeBtn.innerHTML = '✖';
            removeBtn.onclick = () => removePhoto(file, wrapper);

            wrapper.appendChild(img);
            wrapper.appendChild(removeBtn);
            photoPreview.appendChild(wrapper);

            // Store base64 for offline fallback
            state.photoPreviews.push(ev.target.result);
        };
        reader.readAsDataURL(file);
    });

    e.target.value = '';
}

function removePhoto(file, wrapper) {
    const idx = state.photos.indexOf(file);
    if (idx !== -1) {
        state.photos.splice(idx, 1);
        state.photoPreviews.splice(idx, 1);
    }
    wrapper.remove();
}

// ===== VALIDATION =====
function validateStep5() {
    if (!state.incidentType) return 'Don Allah zaɓi nau\'in rahoto.';
    if (!state.severity) return 'Don Allah zaɓi matakin hatsari.';
    if (!state.latitude && !state.longitude && !state.state) {
        return 'Don Allah sami wuri ko zaɓi jiha.';
    }
    if (state.callbackConsent) {
        const phone = state.phoneNumber.trim();
        if (!phone) return 'Don Allah shigar da lambar tarho idan kana son a kira ka.';
        const phoneRegex = /^(\+234|0)[0-9]{10}$/;
        if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
            return 'Lambar tarho ba daidai ba. Misali: +2348012345678 ko 08012345678';
        }
    }
    return null;
}

// ===== SUBMIT =====
async function submitReport() {
    if (state.isSubmitting) return;

    const errorMsg = validateStep5();
    if (errorMsg) {
        submitError.textContent = errorMsg;
        submitError.classList.remove('hidden');
        return;
    }
    submitError.classList.add('hidden');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Ana aika...';
    state.isSubmitting = true;

    // Build FormData
    const formData = new FormData();
    formData.append('channel', 'mobile');
    formData.append('incidentType', state.incidentType);
    formData.append('severity', state.severity);
    formData.append('latitude', state.latitude || '');
    formData.append('longitude', state.longitude || '');
    formData.append('accuracy', state.accuracy || '');
    formData.append('state', state.state || '');
    formData.append('description', state.description || '');
    formData.append('callbackConsent', state.callbackConsent);
    formData.append('phoneNumber', state.phoneNumber || '');
    state.photos.forEach((photo, i) => formData.append(`photo_${i}`, photo));

    try {
        const response = await fetch('/api/v1/incidents', { method: 'POST', body: formData });
        const data = await response.json();
        if (data.success) {
            document.getElementById('incidentId').textContent = data.incidentId || 'INC-' + Date.now();
            goToStep(6);
        } else {
            throw new Error(data.message || 'Submission failed');
        }
    } catch (error) {
        console.error('Submit error:', error);
        // Queue offline with base64 photos
        queueReport({
            channel: 'mobile',
            incidentType: state.incidentType,
            severity: state.severity,
            latitude: state.latitude,
            longitude: state.longitude,
            accuracy: state.accuracy,
            state: state.state,
            description: state.description,
            callbackConsent: state.callbackConsent,
            phoneNumber: state.phoneNumber,
            photos: state.photoPreviews // base64 array
        });
        document.getElementById('incidentId').textContent = 'OFFLINE-' + Date.now();
        goToStep(6);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Aika Rahoto';
        state.isSubmitting = false;
    }
}

// ===== OFFLINE QUEUE =====
function queueReport(report) {
    offlineQueue.push({ ...report, timestamp: Date.now() });
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
}

async function syncOfflineQueue() {
    if (offlineQueue.length === 0) return;

    const queue = [...offlineQueue];
    offlineQueue = [];
    localStorage.setItem('offlineQueue', '[]');

    for (const report of queue) {
        try {
            const formData = new FormData();
            Object.keys(report).forEach(key => {
                if (key !== 'photos') formData.append(key, report[key]);
            });
            if (report.photos && Array.isArray(report.photos)) {
                report.photos.forEach((base64, i) => {
                    const blob = dataURLtoBlob(base64);
                    formData.append(`photo_${i}`, blob, `photo_${i}.jpg`);
                });
            }
            const res = await fetch('/api/v1/incidents', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Sync failed');
        } catch (err) {
            offlineQueue.push(report); // re-queue
            localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
        }
    }
}

function dataURLtoBlob(dataURL) {
    const [header, base64] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    return new Blob([array], { type: mime });
}

function updateOfflineBanner() {
    if (offlineBanner) offlineBanner.classList.toggle('hidden', navigator.onLine);
}

// ===== RESET =====
function resetForm() {
    // Reset state
    state.currentStep = 1;
    state.incidentType = '';
    state.severity = '';
    state.latitude = null;
    state.longitude = null;
    state.accuracy = null;
    state.state = '';
    state.description = '';
    state.photos = [];
    state.photoPreviews = [];
    state.callbackConsent = false;
    state.phoneNumber = '';

    // Reset UI
    document.getElementById('description').value = '';
    document.getElementById('phoneNumber').value = '';
    document.getElementById('callbackConsent').checked = false;
    document.getElementById('phoneGroup').classList.add('hidden');
    photoPreview.innerHTML = '';
    document.getElementById('stateSelect').value = '';
    submitError.classList.add('hidden');

    // Reset location button
    const locBtn = document.getElementById('getLocation');
    locBtn.classList.remove('success', 'getting-location');
    locBtn.innerHTML = '<span class="icon">📍</span><span>Sami Wuri ta Atomatik</span>';
    document.getElementById('locationStatus').textContent = '';

    // Remove selections
    document.querySelectorAll('.option-btn, .severity-btn').forEach(btn => btn.classList.remove('selected'));

    goToStep(1);
}

// ===== OPTIONAL: SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed:', err));
}