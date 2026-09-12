/**
 * Wrapper fetch buat REST API KyyPureStatus.
 * Semua path relatif -> aman di-proxy Vite (dev) maupun same-origin (produksi).
 * (c) KyyDevv
 */

const TOKEN_KEY = 'kyypure.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* mode private browsing */
  }
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR', payload = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { 'X-Kyy-Token': token, ...extra } : { ...extra };
}

async function request(path, { method = 'GET', body = null, headers = {}, raw = false } = {}) {
  const opts = { method, headers: authHeaders(headers) };

  if (body instanceof FormData) {
    opts.body = body; // browser yang set multipart boundary
  } else if (body !== null && body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, opts);
  } catch (err) {
    throw new ApiError(`Nggak bisa nyambung ke server (${err.message}). Servernya idup nggak?`, {
      code: 'NETWORK',
    });
  }

  if (raw) return res;

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { ok: false, error: text.slice(0, 240) };
  }

  if (!res.ok || (data && data.ok === false)) {
    throw new ApiError(data?.error || `Request gagal (HTTP ${res.status})`, {
      status: res.status,
      code: data?.code || 'HTTP_ERROR',
      payload: data,
    });
  }
  return data;
}

/* ============================================================ endpoints == */
export const api = {
  info: () => request('/api/info'),
  health: () => request('/api/health'),
  history: () => request('/api/history'),
  clearHistory: () => request('/api/history', { method: 'DELETE' }),
  deleteHistory: (id) => request(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  jobs: () => request('/api/jobs'),
  storage: () => request('/api/storage'),
  forceCleanup: () => request('/api/storage/cleanup', { method: 'POST' }),

  /**
   * Upload video dengan progress bar beneran (XHR, bukan fetch, karena fetch
   * nggak bisa laporan progress upload).
   */
  upload(file, { onProgress, signal } = {}) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('video', file, file.name);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      const token = getToken();
      if (token) xhr.setRequestHeader('X-Kyy-Token', token);
      xhr.responseType = 'json';

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
          });
        }
      };

      xhr.onload = () => {
        const data = xhr.response;
        if (xhr.status >= 200 && xhr.status < 300 && data?.ok) return resolve(data);
        reject(
          new ApiError(data?.error || `Upload gagal (HTTP ${xhr.status})`, {
            status: xhr.status,
            code: data?.code || 'UPLOAD_FAILED',
            payload: data,
          }),
        );
      };

      xhr.onerror = () => reject(new ApiError('Koneksi putus pas upload. Cek internet lu bro.', { code: 'NETWORK' }));
      xhr.onabort = () => reject(new ApiError('Upload dibatalkan.', { code: 'ABORTED' }));
      xhr.ontimeout = () => reject(new ApiError('Upload timeout. Videonya kegedean atau koneksi lemot.', { code: 'TIMEOUT' }));

      if (signal) {
        if (signal.aborted) xhr.abort();
        else signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }

      xhr.send(form);
    });
  },

  deleteUpload: (id) => request(`/api/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /* ---- WhatsApp ---- */
  waStatus: () => request('/api/wa/status'),
  waConnect: (payload) => request('/api/wa/connect', { method: 'POST', body: payload }),
  waPair: (payload) => request('/api/wa/pair', { method: 'POST', body: payload }),
  waDisconnect: (wipe = false) => request('/api/wa/disconnect', { method: 'POST', body: { wipe } }),
  waLogout: () => request('/api/wa/logout', { method: 'POST', body: {} }),
  waCheck: (phone) => request('/api/wa/check', { method: 'POST', body: { phone } }),

  /* ---- Pipeline (jalur REST, alternatif socket) ---- */
  process: (payload) => request('/api/process', { method: 'POST', body: payload }),
  cancel: (jobId) => request('/api/cancel', { method: 'POST', body: { jobId } }),
  resend: (payload) => request('/api/resend', { method: 'POST', body: payload }),
};

export default api;
