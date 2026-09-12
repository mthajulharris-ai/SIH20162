/**
 * Backend API Client Service
 * Connects frontend to the FastAPI backend endpoints.
 * PS 26162: AI-Based Detection & Classification of Industrial Fires & Persistent Thermal Sources.
 */

const API_BASE = '/api';
const API_V1 = '/api/v1';
const DIRECT_BACKEND_URL = 'http://127.0.0.1:8000';

/**
 * Resilient fetch wrapper with automatic direct-backend fallback
 */
async function fetchWithFallback(endpoint, fetchOptions = {}) {
  try {
    const res = await fetch(endpoint, fetchOptions);
    return res;
  } catch (err) {
    if (endpoint.startsWith('/')) {
      try {
        console.warn(`[ SATRA ] Proxy request to ${endpoint} failed. Falling back directly to ${DIRECT_BACKEND_URL}${endpoint}...`);
        const directRes = await fetch(`${DIRECT_BACKEND_URL}${endpoint}`, fetchOptions);
        return directRes;
      } catch (directErr) {
        console.error(`[SATRA ERROR] Direct connection to backend also failed:`, directErr);
        throw new Error('AI service unavailable. Please check that the SATRA backend server is running and accessible at http://127.0.0.1:8000.');
      }
    }
    throw err;
  }
}

/**
 * Generic fetch wrapper with error handling
 */
async function request(url, options = {}) {
  try {
    const res = await fetchWithFallback(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const message = errorData.message || errorData.detail || errorData.error || `HTTP Error ${res.status}`;
      throw new Error(message);
    }

    return await res.json();
  } catch (err) {
    if (err.name === 'TypeError' && err.message?.includes('fetch')) {
      throw new Error('AI service unavailable. Please check that the SATRA backend server is running.');
    }
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
export async function predictAndStoreObservation(observationPayload, timeoutMs = 60000) {
  console.log('[ SATRA ] Starting AI inference (single observation)');
  console.log('[ SATRA ] Sending observation payload');

  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const endpointUrl = `${API_V1}/inference/predict-and-store`;
  console.log(`[ SATRA ] API request started: POST ${endpointUrl}`);

  try {
    const res = await fetchWithFallback(endpointUrl, {
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
      console.error(`[SATRA ERROR] HTTP ${res.status}: ${msg}`);
      throw new Error(msg);
    }

    const data = await res.json();
    console.log('[ SATRA ] Analysis completed successfully');
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (timedOut || err.name === 'AbortError') {
      const timeoutMsg = 'AI analysis timed out. The AI inference request took longer than expected to complete. Please try again.';
      console.error(`[SATRA ERROR] ${timeoutMsg}`);
      throw new Error(timeoutMsg);
    }
    if (err.name === 'TypeError' && err.message?.includes('fetch')) {
      const unavailableMsg = 'AI service unavailable. Please check that the SATRA backend server is running at http://127.0.0.1:8000.';
      console.error(`[SATRA ERROR] ${unavailableMsg}`);
      throw new Error(unavailableMsg);
    }
    console.error(`[SATRA ERROR] ${err.message || err}`);
    throw err;
  }
}

export async function validateSatelliteDataset(file) {
  const formData = new FormData();
  formData.append('file', file);

  const endpointUrl = `${API_V1}/inference/validate-dataset`;
  const res = await fetchWithFallback(endpointUrl, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message =
      errorData.detail ||
      errorData.message ||
      errorData.error ||
      `Validation failed with HTTP ${res.status}`;
    throw new Error(message);
  }

  return await res.json();
}

export async function startSatelliteAnalysisJob(fileOrFiles, timeoutMs = 30000) {
  console.log('[ SATRA ] Starting asynchronous AI batch analysis job');

  const formData = new FormData();
  let fileCount = 0;

  if (Array.isArray(fileOrFiles)) {
    fileCount = fileOrFiles.length;
    if (fileCount === 1) {
      formData.append('file', fileOrFiles[0]);
    } else if (fileCount > 1) {
      fileOrFiles.forEach((f) => {
        formData.append('files', f);
      });
    }
  } else if (fileOrFiles) {
    fileCount = 1;
    formData.append('file', fileOrFiles);
  }

  if (fileCount === 0) {
    throw new Error('Please select or upload at least one satellite observation file.');
  }

  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const endpointUrl = `${API_V1}/inference/start-job`;
  try {
    const res = await fetchWithFallback(endpointUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.detail || errData.message || `Job initialization failed with HTTP ${res.status}`;
      throw new Error(msg);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (timedOut || err.name === 'AbortError') {
      throw new Error('Timeout initiating analysis job. Please check backend connection.');
    }
    throw err;
  }
}

export async function getSatelliteAnalysisJobStatus(jobId, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const endpointUrl = `${API_V1}/inference/job-status/${jobId}`;
  try {
    const res = await fetchWithFallback(endpointUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.detail || errData.message || `Job polling failed with HTTP ${res.status}`;
      throw new Error(msg);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function uploadAndAnalyzeSatelliteFile(fileOrFiles, timeoutMs = 60000) {
  console.log('[ SATRA ] Starting AI inference');

  const formData = new FormData();
  let fileCount = 0;

  if (Array.isArray(fileOrFiles)) {
    fileCount = fileOrFiles.length;
    if (fileCount === 1) {
      formData.append('file', fileOrFiles[0]);
    } else if (fileCount > 1) {
      fileOrFiles.forEach((f) => {
        formData.append('files', f);
      });
    }
  } else if (fileOrFiles) {
    fileCount = 1;
    formData.append('file', fileOrFiles);
  }

  if (fileCount === 0) {
    throw new Error('Please select or upload at least one satellite observation file.');
  }

  console.log(`[ SATRA ] Sending observations (${fileCount} file(s))`);

  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const endpointUrl = `${API_V1}/inference/upload-and-analyze`;
  console.log(`[ SATRA ] API request started: POST ${endpointUrl}`);

  try {
    const res = await fetchWithFallback(endpointUrl, {
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
    console.log('[ SATRA ] Analysis completed successfully');
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (timedOut || err.name === 'AbortError') {
      const timeoutMsg = 'AI analysis timed out. The AI inference request took longer than expected to complete. Please try again.';
      console.error(`[SATRA ERROR] ${timeoutMsg}`);
      throw new Error(timeoutMsg);
    }
    if (err.name === 'TypeError' && err.message?.includes('fetch')) {
      const unavailableMsg = 'AI service unavailable. Please check that the SATRA backend server is running at http://127.0.0.1:8000.';
      console.error(`[SATRA ERROR] ${unavailableMsg}`);
      throw new Error(unavailableMsg);
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

