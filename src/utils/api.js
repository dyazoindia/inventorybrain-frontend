import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 30000
});

// Attach JWT to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('ib_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ib_token');
      localStorage.removeItem('ib_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth ─────────────────────────────────────────────────────
export const authApi = {
  login:          (data) => api.post('/auth/login', data),
  me:             ()     => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data)
};

// ── Inventory ─────────────────────────────────────────────────
export const inventoryApi = {
  getLatest:      (params) => api.get('/inventory/latest', { params }),
  getSnapshots:   ()       => api.get('/inventory/snapshots'),
  getStats:       ()       => api.get('/inventory/dashboard-stats'),
  getSnapshot:    (id)     => api.get(`/inventory/snapshot/${id}`)
};

// ── Upload ────────────────────────────────────────────────────
export const uploadApi = {
  uploadExcel: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/upload/excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadPackingList: (poId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/upload/packing-list/${poId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};

// ── Purchase Orders ───────────────────────────────────────────
export const poApi = {
  list:     (params) => api.get('/purchase-orders', { params }),
  create:   (data)   => api.post('/purchase-orders', data),
  confirm:  (id, data) => api.patch(`/purchase-orders/${id}/confirm`, data),
  approve:  (id, data) => api.patch(`/purchase-orders/${id}/approve`, data),
  reject:   (id, data) => api.patch(`/purchase-orders/${id}/reject`, data),
  deliver:  (id, data) => api.patch(`/purchase-orders/${id}/deliver`, data),
  stats:    ()         => api.get('/purchase-orders/stats')
};

// ── Compare ───────────────────────────────────────────────────
export const compareApi = {
  latest: () => api.get('/compare/latest'),
  byIds:  (id1, id2) => api.get(`/compare/${id1}/${id2}`)
};

// ── Users ─────────────────────────────────────────────────────
export const usersApi = {
  list:   () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.patch(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`)
};

// ── Dashboard ─────────────────────────────────────────────────
export const dashboardApi = {
  summary: () => api.get('/dashboard/summary')
};
