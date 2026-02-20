// API Base URL
    const API_BASE = '/api/v1';
    
    // State
    let dashboardData = {};
    let refreshInterval;
    
    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      loadDashboard();
      refreshInterval = setInterval(loadDashboard, 30000); // Refresh every 30s
      
      // Setup form submission
      document.getElementById('alert-form').addEventListener('submit', submitAlert);
      
      // Check API status on load
      checkApiStatus();
    });
    
    // Navigation
    function showPage(page) {
      // Hide all pages
      document.querySelectorAll('[id^="page-"]').forEach(p => p.style.display = 'none');
      // Show selected page
      document.getElementById(`page-${page}`).style.display = 'block';
      
      // Update nav
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      event.target.closest('.nav-item').classList.add('active');
      
      // Load page data
      if (page === 'live') loadLiveIncidents();
      if (page === 'heatmap') loadHeatmapData();
      if (page === 'alerts') loadAlerts();
      if (page === 'rules') loadRules();
      if (page === 'responders') loadResponders();
      if (page === 'settings') checkApiStatus();
    }
    
    // API helper
    async function apiGet(endpoint) {
      try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        return await response.json();
      } catch (error) {
        console.error('API Error:', error);
        return { success: false, error: error.message };
      }
    }
    
    async function apiPost(endpoint, data) {
      try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        return await response.json();
      } catch (error) {
        console.error('API Error:', error);
        return { success: false, error: error.message };
      }
    }
    
    // Toast notification
    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;
      container.appendChild(toast);
      
      setTimeout(() => toast.remove(), 5000);
    }
    
    // Load dashboard
    async function loadDashboard() {
      try {
        const response = await apiGet('/admin/stats/dashboard?period=24h');
        
        if (response.success) {
          dashboardData = response;
          updateDashboardUI();
        } else {
          showToast('Failed to load dashboard data', 'error');
        }
      } catch (error) {
        console.error('Dashboard load error:', error);
      }
    }
    
    function updateDashboardUI() {
      const d = dashboardData;
      
      // Update stats
      document.getElementById('stat-total').textContent = d.incidents?.total || 0;
      
      const active = (d.incidents?.byStatus?.received || 0) + 
                    (d.incidents?.byStatus?.escalated || 0) +
                    (d.incidents?.byStatus?.assigned || 0);
      document.getElementById('stat-active').textContent = active;
      
      document.getElementById('stat-escalated').textContent = d.escalations?.total || 0;
      document.getElementById('stat-response').textContent = (d.response?.averageResponseTime || 0) + ' min';
      
      // Update SLA
      const sla = d.escalations?.slaCompliance || {};
      const slaEl = document.getElementById('stat-sla');
      if (sla.rate !== undefined) {
        slaEl.textContent = `${sla.rate}% SLA compliance`;
        slaEl.className = sla.rate >= 80 ? 'change positive' : 'change negative';
      }
      
      // Update incident list
      updateIncidentList();
      
      // Update heatmap
      loadHeatmapData();
    }
    
    async function updateIncidentList() {
      const response = await apiGet('/admin/incidents/live?limit=10');
      
      const list = document.getElementById('incident-list');
      
      if (!response.success || !response.incidents || response.incidents.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="icon">📭</div>
            <p>No active incidents</p>
          </div>
        `;
        return;
      }
      
      list.innerHTML = response.incidents.map(incident => `
        <div class="incident-item" onclick="viewIncident('${incident.incidentId}')" style="cursor: pointer;">
          <div class="incident-icon ${incident.severity || 'medium'}">
            ${getIncidentIcon(incident.incidentType)}
          </div>
          <div class="incident-info">
            <div class="type">${formatIncidentType(incident.incidentType)}</div>
            <div class="meta">
              ${incident.locationVillage || incident.locationLga || 'Unknown'} • 
              ${formatTimeAgo(incident.createdAt)}
            </div>
          </div>
          <span class="incident-status ${incident.status}">${incident.status}</span>
        </div>
      `).join('');
    }
    
    // Live incidents
    async function loadLiveIncidents() {
      const response = await apiGet('/admin/incidents/live?limit=50');
      
      const tbody = document.getElementById('live-incidents-table');
      
      if (!response.success || !response.incidents || response.incidents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No active incidents</td></tr>';
        return;
      }
      
      tbody.innerHTML = response.incidents.map(incident => `
        <tr>
          <td><code>${incident.incidentId?.substring(0, 12)}...</code></td>
          <td>${formatIncidentType(incident.incidentType)}</td>
          <td><span class="incident-status ${incident.severity}" style="background: ${getSeverityColor(incident.severity)}20; color: ${getSeverityColor(incident.severity)}">${incident.severity}</span></td>
          <td>${incident.locationVillage || incident.locationLga || '-'}</td>
          <td><span class="incident-status ${incident.status}">${incident.status}</span></td>
          <td>${incident.confidenceScore || 50}%</td>
          <td>${formatTimeAgo(incident.createdAt)}</td>
          <td>
            <button class="btn btn-secondary" onclick="viewIncident('${incident.incidentId}')">View</button>
          </td>
        </tr>
      `).join('');
    }
    
    // Heatmap
    async function loadHeatmapData() {
      const period = document.getElementById('heatmap-period')?.value || '7d';
      const response = await apiGet(`/admin/incidents/heatmap?period=${period}`);
      
      const container = document.getElementById('page-heatmap').style.display !== 'none' 
        ? document.getElementById('full-heatmap')
        : document.getElementById('dashboard-heatmap');
      
      if (!response.success || !response.data || response.data.length === 0) {
        container.innerHTML = '<div class="empty-state" style="color: white;"><p>No incident data for heatmap</p></div>';
        return;
      }
      
      // Render heatmap points
      container.innerHTML = '';
      response.data.forEach(point => {
        const el = document.createElement('div');
        el.className = 'heatmap-point';
        el.style.left = (Math.random() * 80 + 10) + '%';
        el.style.top = (Math.random() * 80 + 10) + '%';
        el.style.animationDelay = Math.random() * 2 + 's';
        el.title = `${point.count} incidents at ${point.lat?.toFixed(4)}, ${point.lng?.toFixed(4)}`;
        container.appendChild(el);
      });
    }
    
    // Alerts
    async function loadAlerts() {
      const response = await apiGet('/admin/alerts?status=active');
      
      const list = document.getElementById('all-alerts-list');
      
      if (!response.success || !response.alerts || response.alerts.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No alerts</p></div>';
        return;
      }
      
      list.innerHTML = response.alerts.map(alert => `
        <div class="alert-item">
          <div class="alert-badge ${alert.severity}"></div>
          <div>
            <strong>${alert.titleHausa || 'Alert'}</strong>
            <p style="font-size: 0.75rem; color: #6b7280;">
              ${formatTimeAgo(alert.createdAt)} • Sent to ${alert.statsSentCount || 0}
            </p>
          </div>
        </div>
      `).join('');
    }
    
    async function submitAlert(e) {
      e.preventDefault();
      const form = e.target;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);
      
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      
      const response = await apiPost('/admin/alerts', data);
      
      btn.disabled = false;
      btn.textContent = 'Send Alert';
      
      if (response.success) {
        showToast('Alert sent successfully!', 'success');
        form.reset();
        loadAlerts();
      } else {
        showToast('Failed to send alert: ' + (response.message || 'Unknown error'), 'error');
      }
    }
    
    // Escalation rules
    async function loadRules() {
      const response = await apiGet('/admin/rules');
      
      const tbody = document.getElementById('rules-table');
      
      if (!response.success || !response.rules || response.rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No rules configured</td></tr>';
        return;
      }
      
      tbody.innerHTML = response.rules.map(rule => `
        <tr>
          <td>${rule.name}</td>
          <td>${rule.conditionsIncidentTypes?.join(', ') || 'All'}</td>
          <td>${rule.escalationAssigneeName || '-'}</td>
          <td>${rule.escalationSlaMinutes || 30}min</td>
          <td><span style="color: ${rule.active ? '#16a34a' : '#dc2626'}">${rule.active ? 'Active' : 'Inactive'}</span></td>
          <td>
            <button class="btn btn-secondary" onclick="editRule('${rule.ruleId}')">Edit</button>
          </td>
        </tr>
      `).join('');
    }
    
    // Responders (placeholder)
    async function loadResponders() {
      const tbody = document.getElementById('responders-table');
      tbody.innerHTML = `
        <tr>
          <td>Security Desk</td>
          <td>Event Security</td>
          <td>+2348000000001</td>
          <td>Security Team</td>
          <td><span style="color: #16a34a">Active</span></td>
          <td>
            <button class="btn btn-secondary">Edit</button>
          </td>
        </tr>
        <tr>
          <td>Community Focal</td>
          <td>Community</td>
          <td>+2348000000002</td>
          <td>Community Focal</td>
          <td><span style="color: #16a34a">Active</span></td>
          <td>
            <button class="btn btn-secondary">Edit</button>
          </td>
        </tr>
        <tr>
          <td>Police Liaison</td>
          <td>Police</td>
          <td>+2348000000003</td>
          <td>Agency Liaison</td>
          <td><span style="color: #16a34a">Active</span></td>
          <td>
            <button class="btn btn-secondary">Edit</button>
          </td>
        </tr>
      `;
    }
    
    // API status check
    async function checkApiStatus() {
      const statusEl = document.getElementById('api-status');
      const response = await fetch('/health');
      
      if (response.ok) {
        const data = await response.json();
        statusEl.innerHTML = `<span style="color: #16a34a">● Connected (${data.database || 'no db'})</span>`;
      } else {
        statusEl.innerHTML = '<span style="color: #dc2626">● Disconnected</span>';
      }
    }
    
    // Helpers
    function getIncidentIcon(type) {
      const icons = {
        'fire': '🔥',
        'theft': '💰',
        'violence': '👊',
        'gunshot': '🔫',
        'fight': '🥊',
        'kidnap': '👤',
        'suspicious_activity': '👁️',
        'medical_emergency': '🚑',
        'incident_in_progress': '⚠️',
      };
      return icons[type] || '📋';
    }
    
    function formatIncidentType(type) {
      return type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
    }
    
    function formatTimeAgo(date) {
      if (!date) return '';
      const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
      if (seconds < 60) return 'Just now';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      return Math.floor(seconds / 86400) + 'd ago';
    }
    
    function getSeverityColor(severity) {
      const colors = {
        'critical': '#dc2626',
        'high': '#f59e0b',
        'medium': '#eab308',
        'low': '#22c55e',
      };
      return colors[severity] || '#6b7280';
    }
    
    function viewIncident(id) {
      console.log('View incident:', id);
      showToast('Incident view: ' + id);
    }