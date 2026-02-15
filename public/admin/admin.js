// Admin Dashboard JavaScript
const API_BASE = '/api/v1';
let authToken = null;

// Auth function
async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    
    if (!username || !password) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'Please enter both username and password';
        return;
    }
    
    errorDiv.style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('admin_auth', authToken);
            document.getElementById('login-modal').classList.remove('active');
            refreshDashboard();
        } else {
            throw new Error(data.error || 'Invalid credentials');
        }
    } catch (err) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = err.message || 'Invalid username or password';
    }
}

// API helper
async function apiCall(endpoint, options = {}) {
    const headers = {
        'Authorization': `Basic ${authToken}`,
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    
    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
}

// Navigation
function showSection(sectionId) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
    
    if (sectionId === 'dashboard') refreshDashboard();
    if (sectionId === 'incidents') refreshIncidents();
    if (sectionId === 'alerts') refreshAlerts();
    if (sectionId === 'analytics') loadAnalytics();
}

// Dashboard
async function refreshDashboard() {
    try {
        const data = await apiCall('/admin/dashboard');
        const d = data.dashboard;
        
        document.getElementById('total-incidents').textContent = d.summary.totalIncidents || 0;
        document.getElementById('today-incidents').textContent = `Today: ${d.summary.todayIncidents || 0}`;
        document.getElementById('pending-incidents').textContent = d.summary.pendingIncidents || 0;
        document.getElementById('escalated-incidents').textContent = d.summary.escalatedIncidents || 0;
        document.getElementById('active-alerts').textContent = d.summary.activeAlerts || 0;
        
        renderRecentIncidents(d.recentIncidents);
    } catch (err) {
        console.error('Failed to load dashboard:', err);
        setZeros();
    }
}

function setZeros() {
    document.getElementById('total-incidents').textContent = '0';
    document.getElementById('today-incidents').textContent = 'Today: 0';
    document.getElementById('pending-incidents').textContent = '0';
    document.getElementById('escalated-incidents').textContent = '0';
    document.getElementById('active-alerts').textContent = '0';
    document.getElementById('recent-incidents-list').innerHTML = '<p>Database not connected</p>';
}

function renderRecentIncidents(incidents) {
    const container = document.getElementById('recent-incidents-list');
    
    if (!incidents || incidents.length === 0) {
        container.innerHTML = '<p>No recent incidents</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                ${incidents.map(i => `
                    <tr>
                        <td>${i.incidentId}</td>
                        <td>${formatType(i.incidentType)}</td>
                        <td><span class="badge badge-${i.severity}">${i.severity}</span></td>
                        <td><span class="badge badge-${i.status}">${i.status}</span></td>
                        <td>${i.location?.village || i.location?.lga || '-'}</td>
                        <td>${formatTime(i.createdAt)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Incidents
async function refreshIncidents() {
    try {
        const status = document.getElementById('filter-status')?.value || '';
        const severity = document.getElementById('filter-severity')?.value || '';
        const type = document.getElementById('filter-type')?.value || '';
        
        let query = '/admin/incidents?';
        if (status) query += `&status=${status}`;
        if (severity) query += `&severity=${severity}`;
        if (type) query += `&incidentType=${type}`;
        
        const data = await apiCall(query);
        renderAllIncidents(data.incidents);
    } catch (err) {
        console.error('Failed to load incidents:', err);
        document.getElementById('all-incidents-list').innerHTML = '<p>Database not connected</p>';
    }
}

function renderAllIncidents(incidents) {
    const container = document.getElementById('all-incidents-list');
    
    if (!incidents || incidents.length === 0) {
        container.innerHTML = '<p>No incidents found</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Reported</th>
                </tr>
            </thead>
            <tbody>
                ${incidents.map(i => `
                    <tr>
                        <td>${i.incidentId}</td>
                        <td>${formatType(i.incidentType)}</td>
                        <td><span class="badge badge-${i.severity}">${i.severity}</span></td>
                        <td><span class="badge badge-${i.status}">${i.status}</span></td>
                        <td>${i.location?.village || i.location?.lga || '-'}</td>
                        <td>${formatTime(i.createdAt)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Alerts
async function refreshAlerts() {
    try {
        const data = await apiCall('/admin/alerts');
        renderAlerts(data.alerts);
    } catch (err) {
        console.error('Failed to load alerts:', err);
        document.getElementById('alerts-list').innerHTML = '<p>Database not connected</p>';
    }
}

function renderAlerts(alerts) {
    const container = document.getElementById('alerts-list');
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<p>No alerts</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Created</th>
                </tr>
            </thead>
            <tbody>
                ${alerts.map(a => `
                    <tr>
                        <td>${a.alertId}</td>
                        <td>${a.type}</td>
                        <td><span class="badge badge-${a.severity}">${a.severity}</span></td>
                        <td><span class="badge badge-${a.status}">${a.status}</span></td>
                        <td>${formatTime(a.createdAt)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function showCreateAlert() {
    alert('Alert creation would open a form here');
}

// Analytics
async function loadAnalytics() {
    try {
        const period = document.getElementById('analytics-period')?.value || '7d';
        const data = await apiCall(`/admin/analytics?period=${period}`);
        
        const stats = data.analytics;
        document.getElementById('analytics-total').textContent = 
            stats.dailyStats.reduce((sum, d) => sum + d.incidents, 0);
        
        const channels = stats.channelBreakdown.map(c => `
            <div style="margin: 10px 0;">
                <span style="text-transform: uppercase;">${c._id}</span>: ${c.count}
            </div>
        `).join('');
        document.getElementById('channel-breakdown').innerHTML = channels;
        
    } catch (err) {
        console.error('Failed to load analytics:', err);
        document.getElementById('channel-breakdown').innerHTML = '<p>Database not connected</p>';
    }
}

function showEscalationRules() {
    alert('Escalation rules management would open here');
}

function closeIncidentDetail() {
    document.getElementById('incident-detail').classList.remove('active');
}

// Utilities
function formatType(type) {
    return type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '-';
}

function formatTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleString();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Setup login event listeners
    document.getElementById('login-username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    document.getElementById('login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    document.querySelector('.login-btn').addEventListener('click', login);
    
    // Setup navigation
    document.querySelectorAll('.sidebar nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(link.getAttribute('data-section'));
        });
    });
    
    // Setup refresh buttons
    document.getElementById('refresh-dashboard').addEventListener('click', refreshDashboard);
    document.getElementById('refresh-incidents').addEventListener('click', refreshIncidents);
    document.getElementById('create-alert').addEventListener('click', showCreateAlert);
    document.getElementById('close-detail').addEventListener('click', closeIncidentDetail);
    
    // Setup filters
    document.getElementById('filter-status').addEventListener('change', refreshIncidents);
    document.getElementById('filter-severity').addEventListener('change', refreshIncidents);
    document.getElementById('filter-type').addEventListener('change', refreshIncidents);
    document.getElementById('analytics-period').addEventListener('change', loadAnalytics);
    
    // Setup settings
    document.getElementById('manage-rules').addEventListener('click', showEscalationRules);
    
    // Check if already logged in
    const savedAuth = localStorage.getItem('admin_auth');
    if (savedAuth) {
        authToken = savedAuth;
        document.getElementById('login-modal').classList.remove('active');
        refreshDashboard();
    }
});
