import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lexhue_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success === false) {
      return Promise.reject(new Error(response.data.error?.message || '请求失败'));
    }
    return response.data;
  },
  (error) => {
    const msg = error.response?.data?.error?.message || error.message || '网络错误';
    if (error.response?.status === 401) {
      localStorage.removeItem('lexhue_token');
      localStorage.removeItem('lexhue_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(new Error(msg));
  }
);

export default api;
