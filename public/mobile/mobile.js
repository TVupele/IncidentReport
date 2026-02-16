// Mobile Page JavaScript
let reportData = {
    incidentType: null,
    severity: null,
    location: null,
    description: null,
    callbackConsent: false
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Setup incident type buttons
    document.querySelectorAll('.btn-incident-type').forEach(btn => {
        btn.addEventListener('click', () => {
            selectIncidentType(btn.getAttribute('data-type'));
        });
    });
    
    // Setup severity buttons
    document.querySelectorAll('.btn-severity').forEach(btn => {
        btn.addEventListener('click', () => {
            selectSeverity(btn.getAttribute('data-severity'));
        });
    });
    
    // Setup back buttons
    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', () => {
            goToStep(parseInt(btn.getAttribute('data-step')));
        });
    });
    
    // Setup next step button
    document.querySelector('.btn-next-step')?.addEventListener('click', () => {
        goToStep(4);
    });
    
    // Setup location button
    document.querySelector('.btn-get-location')?.addEventListener('click', getLocation);
    
    // Setup submit button
    document.querySelector('.btn-submit')?.addEventListener('click', submitReport);
    
    // Setup reset button
    document.querySelector('.btn-reset-form')?.addEventListener('click', resetForm);
    
    // Setup navigation
    document.querySelector('.btn-nav-report')?.addEventListener('click', () => showSection('report'));
    document.querySelector('.btn-nav-alerts')?.addEventListener('click', () => showSection('alerts'));
    
    // Load alerts
    // Use the more complete index.html for full functionality - this file is deprecated
    // The main app uses inline script in index.html which has all features
    // Keeping this for reference only
});

// Navigation
function showSection(section) {
    if (section === 'report') {
        document.getElementById('report-form').style.display = 'block';
        document.getElementById('alerts-list').parentElement.style.display = 'block';
    } else if (section === 'alerts') {
        document.getElementById('report-form').style.display = 'none';
        document.getElementById('alerts-list').parentElement.style.display = 'none';
    }
}

// Incident type selection
function selectIncidentType(type) {
    reportData.incidentType = type;
    goToStep(2);
}

// Severity selection
function selectSeverity(severity) {
    reportData.severity = severity;
    goToStep(3);
}

// Step navigation
function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
    
    // Show target step
    document.getElementById(`step-${step}`).classList.add('active');
    document.getElementById(`dot-${step}`).classList.add('active');
}

// Get GPS location
function getLocation() {
    const status = document.getElementById('location-status');
    status.textContent = '🔄 Neman wata...';
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                reportData.location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                status.innerHTML = `✅ An same ni:<br>Lat: ${position.coords.latitude.toFixed(4)}<br>Lng: ${position.coords.longitude.toFixed(4)}`;
            },
            (error) => {
                status.textContent = '❌ Ba a same wata ba. Zabi handaki.';
                document.getElementById('manual-location').style.display = 'block';
            },
            { timeout: 10000 }
        );
    } else {
        status.textContent = '❌ Wata ba aiki ba. Zabi handaki.';
        document.getElementById('manual-location').style.display = 'block';
    }
}

// Submit report
async function submitReport() {
    // Collect form data
    reportData.description = document.getElementById('description').value;
    reportData.callbackConsent = document.getElementById('callback-consent').checked;
    
    // Collect manual location if GPS not available
    if (!reportData.location) {
        reportData.location = {
            state: document.getElementById('state-select').value,
            lga: document.getElementById('lga-input').value,
            village: document.getElementById('village-input').value
        };
    }
    
    try {
        const response = await fetch('/api/v1/incidents', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...reportData,
                channel: 'mobile'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('incident-id').textContent = `ID: ${data.incidentId}`;
            document.getElementById('report-form').style.display = 'none';
            document.getElementById('success-message').style.display = 'block';
        } else {
            alert('Kuskure: ' + data.message);
        }
    } catch (error) {
        console.error('Submission error:', error);
        // Queue for offline
        queueOfflineReport(reportData);
        alert('Ba a iya aika ba. An ajiye don lokacin da aka samu. ID: OFFLINE-' + Date.now());
        document.getElementById('incident-id').textContent = `ID: OFFLINE-${Date.now()}`;
        document.getElementById('report-form').style.display = 'none';
        document.getElementById('success-message').style.display = 'block';
    }
}

// Reset form
function resetForm() {
    reportData = {
        incidentType: null,
        severity: null,
        location: null,
        description: null,
        callbackConsent: false
    };
    document.getElementById('description').value = '';
    document.getElementById('location-status').textContent = '';
    document.getElementById('manual-location').style.display = 'none';
    document.getElementById('report-form').style.display = 'block';
    document.getElementById('success-message').style.display = 'none';
    goToStep(1);
}

// Offline support
function queueOfflineReport(data) {
    const queue = JSON.parse(localStorage.getItem('offline_reports') || '[]');
    queue.push({
        ...data,
        timestamp: Date.now()
    });
    localStorage.setItem('offline_reports', JSON.stringify(queue));
}

// Load alerts
async function loadAlerts() {
    try {
        const response = await fetch('/api/v1/alerts/active');
        const data = await response.json();
        
        if (data.success && data.alerts && data.alerts.length > 0) {
            const alerts = data.alerts.slice(0, 5);
            document.getElementById('alerts-list').innerHTML = alerts.map(a => `
                <div style="padding: 10px; border-bottom: 1px solid #eee;">
                    <strong>${a.title || a.type}</strong>
                    <p style="font-size: 0.85rem; color: #636e72; margin-top: 5px;">
                        ${a.content?.hausa || a.content?.english || ''}
                    </p>
                </div>
            `).join('');
        } else {
            document.getElementById('alerts-list').innerHTML = '<p style="color: #636e72;">Babba alerta a yanzu.</p>';
        }
    } catch (error) {
        console.error('Failed to load alerts:', error);
        document.getElementById('alerts-list').innerHTML = '<p style="color: #636e72;">Ba a iya loading alerts ba.</p>';
    }
}
