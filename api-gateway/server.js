// File: api-gateway/server.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken'); // Import JWT
const axios = require('axios'); // Import Axios
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Variabel untuk menyimpan public key
let PUBLIC_KEY = null;
const REST_API_URL = process.env.REST_API_URL || 'http://localhost:3001';
const GRAPHQL_API_URL = process.env.GRAPHQL_API_URL || 'http://localhost:4000';

// Fungsi untuk mengambil Public Key dari User Service (rest-api)
const fetchPublicKey = async () => {
  try {
    const response = await axios.get(`${REST_API_URL}/api/users/public-key`);
    PUBLIC_KEY = response.data;
    console.log('Public Key fetched successfully from User Service.');
  } catch (error) {
    console.error('Failed to fetch public key:', error.message);
    console.error('API Gateway cannot verify tokens. Retrying in 5 seconds...');
    setTimeout(fetchPublicKey, 5000); // Coba lagi
  }
};

// --- Security & CORS Middleware (Tetap sama) ---
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3002',
    'http://localhost:3000',
    'http://frontend-app:3002'
  ],
  credentials: true
}));
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', ... });
});
// --- End of Security & CORS Middleware ---


// === MIDDLEWARE VERIFIKASI TOKEN ===
const verifyToken = (req, res, next) => {
  // Daftar rute publik yang tidak perlu token
  const publicPaths = [
    '/api/users/login',
    '/api/users/public-key',
  ];

  // Rute register (POST /api/users) juga publik
  if (req.path === '/api/users' && req.method === 'POST') {
    return next();
  }

  if (publicPaths.includes(req.path)) {
    return next(); // Lewati, tidak perlu token
  }

  // Jika tidak ada public key, blok semua request terproteksi
  if (!PUBLIC_KEY) {
    return res.status(503).json({ error: 'Service unavailable', message: 'Auth service is not ready.' });
  }

  // Ambil token dari header
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'No token provided.' });
  }

  // Verifikasi token
  jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden', message: 'Token is invalid or expired.' });
    }

    // Opsional: Teruskan info user ke service di bawahnya
    req.user = user;

    // Teruskan ke proxy
    next();
  });
};

// Terapkan middleware verifikasi SEBELUM proxy
app.use('/api', verifyToken);
app.use('/graphql', verifyToken);

// --- Proxy Configuration (Tetap sama) ---
const restApiProxy = createProxyMiddleware({
  target: REST_API_URL,
  changeOrigin: true,
  pathRewrite: { '^/api': '/api' },
  onProxyReq: (proxyReq, req, res) => {
    // (Opsional) Teruskan user yang sudah di-decode ke service
    if (req.user) {
      proxyReq.setHeader('X-User', JSON.stringify(req.user));
    }
  }
});

const graphqlApiProxy = createProxyMiddleware({
  target: GRAPHQL_API_URL,
  changeOrigin: true,
  ws: true,
  onProxyReq: (proxyReq, req, res) => {
    // (Opsional) Teruskan user yang sudah di-decode ke service
    if (req.user) {
      proxyReq.setHeader('X-User', JSON.stringify(req.user));
    }
  }
});

// Terapkan proxy
app.use('/api', restApiProxy);
app.use('/graphql', graphqlApiProxy);

// --- Catch-all dan Error Handling (Tetap sama) ---
app.get('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});
app.use((err, req, res, next) => {
  console.error('Gateway Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start Server ---
const server = app.listen(PORT, async () => {
  // Ambil public key saat server menyala
  await fetchPublicKey(); 

  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`🔄 Proxying /api/* to: ${REST_API_URL}`);
  console.log(`🔄 Proxying /graphql to: ${GRAPHQL_API_URL}`);
});
