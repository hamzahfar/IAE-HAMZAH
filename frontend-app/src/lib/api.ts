import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// === TAMBAHKAN INTERCEPTOR ===
apiClient.interceptors.request.use(
  (config) => {
    // Cek jika request BUKAN untuk login atau register
    if (config.url?.endsWith('/login') || (config.url?.endsWith('/users') && config.method === 'post')) {
      return config;
    }

    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
// ============================

// User API calls
export const userApi = {
  login: (credentials: { username: string; password: string }) =>
    apiClient.post('/api/users/login', credentials), 
  
  register: (userData: { username: string; email: string; password: string }) => 
    apiClient.post('/api/users', userData),

  // Fungsi ini sekarang akan otomatis mengirim token
  getUsers: () => apiClient.get('/api/users'),
  deleteUser: (id: string) => apiClient.delete(`/api/users/${id}`),
};