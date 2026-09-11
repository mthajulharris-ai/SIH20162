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
export async function predictAndStoreObservation(observationPayload, timeoutMs = 45000) {
  console.log('[ SATRA ] Starting AI inference (single observation)');
  console.log('[ SATRA ] Sending observations');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log('[ SATRA ] API request started');
    const res = await fetch(`${API_V1}/inference/predict-and-store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(observationPayload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    console.log(`[ SATRA ] API response received (status ${res.status})`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.message || errData.error || errData.detail || `Inference failed with HTTP ${res.status}`;
      console.error(`[SATRA ERROR] ${msg}`);
      throw new Error(msg);
    }
    const data = await res.json();
    console.log('[ SATRA ] Analysis completed');
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const timeoutMsg = 'AI analysis timed out. Please check the AI service/backend connection and try again.';
      console.error(`[SATRA ERROR] ${timeoutMsg}`);
      throw new Error(timeoutMsg);
    }
    console.error(`[SATRA ERROR] ${err.message || err}`);
    throw err;
  }
}

export async function uploadAndAnalyzeSatelliteFile(fileOrFiles, timeoutMs = 45000) {
  console.log('[ SATRA ] Starting AI inference');

  const formData = new FormData();
  let fileCount = 0;
  if (Array.isArray(fileOrFiles)) {
    fileCount = fileOrFiles.length;
    if (fileOrFiles.length > 0) {
      formData.append('file', fileOrFiles[0]);
    }
    fileOrFiles.forEach((f) => {
      formData.append('files', f);
    });
  } else if (fileOrFiles) {
    fileCount = 1;
    formData.append('file', fileOrFiles);
  }

  console.log(`[ SATRA ] Sending observations (${fileCount} file(s))`);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const endpointUrl = `${API_V1}/inference/upload-and-analyze`;
  console.log(`[ SATRA ] API request started: POST ${endpointUrl}`);

  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timer);
    console.log(`[ SATRA ] API response received (status ${res.status})`);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const message =
        errorData.message || errorData.error || errorData.detail || `Upload failed with HTTP ${res.status}`;
      console.error(`[SATRA ERROR] HTTP ${res.status}: ${message}`);
      throw new Error(message);
    }

    const data = await res.json();
    console.log('[ SATRA ] Analysis completed');
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const timeoutMsg =
        'AI analysis timed out. Please check the AI service/backend connection and try again.';
      console.error(`[SATRA ERROR] ${timeoutMsg}`);
      throw new Error(timeoutMsg);
    }
    console.error(`[SATRA ERROR] ${err.message || err}`);
    throw err;
  }
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

