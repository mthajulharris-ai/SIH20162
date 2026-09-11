/**
 * Backend API Client Service
 * Connects frontend to the FastAPI backend endpoints.
 * PS 26162: AI-Based Detection & Classification of Industrial Fires & Persistent Thermal Sources.
 */

const API_BASE = '/api';
const API_V1 = '/api/v1';

/**
 * Generic fetch wrapper with error handling
 */
async function request(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const message = errorData.message || errorData.detail || `HTTP Error ${res.status}`;
      throw new Error(message);
    }

    return await res.json();
  } catch (err) {
    console.error(`API Error on ${url}:`, err);
    throw err;
  }
}

// 1. Health & Status
export async function getHealth() {
  return request(`${API_BASE}/health`);
}

export async function getModelStatus() {
  return request(`${API_V1}/inference/model-status`);
}

// 2. Analytics
export async function getAnalyticsSummary() {
  return request(`${API_V1}/analytics/summary`);
}

// 3. Detections
export async function getDetections(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      query.append(key, val);
    }
  });
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return request(`${API_V1}/detections${queryString}`);
}

export async function getDetectionById(id) {
  return request(`${API_V1}/detections/${id}`);
}

export async function createDetection(payload) {
  return request(`${API_V1}/detections`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// 4. ML Inference Pipeline
export async function predictAndStoreObservation(observationPayload) {
  return request(`${API_V1}/inference/predict-and-store`, {
    method: 'POST',
    body: JSON.stringify(observationPayload),
  });
}

export async function uploadAndAnalyzeSatelliteFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_V1}/inference/upload-and-analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.message || errorData.detail || `Upload failed with HTTP ${res.status}`;
    throw new Error(message);
  }

  return await res.json();
}

// 5. Alerts
export async function getAlerts(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      query.append(key, val);
    }
  });
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return request(`${API_V1}/alerts${queryString}`);
}

export async function getRecentAlerts(limit = 10) {
  return request(`${API_V1}/alerts/recent?limit=${limit}`);
}

export async function updateAlertStatus(alertId, verificationStatus, verificationNotes = null) {
  return request(`${API_V1}/alerts/${alertId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      verification_status: verificationStatus,
      verification_notes: verificationNotes,
    }),
  });
}

// 6. NASA FIRMS Satellite Telemetry
export async function getSatelliteStatus() {
  return request(`${API_V1}/satellite/status`);
}

export async function getFirmsHealth() {
  return request(`${API_V1}/satellite/firms/health`);
}

export async function syncSatelliteFirms(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      query.append(key, val);
    }
  });
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return request(`${API_V1}/satellite/firms${queryString}`);
}

