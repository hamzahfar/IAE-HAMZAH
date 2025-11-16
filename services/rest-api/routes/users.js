const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { validateUser, validateUserUpdate } = require('../middleware/validation');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const privateKey = fs.readFileSync(path.join(__dirname, '../private-key.pem'), 'utf8');
const publicKey = fs.readFileSync(path.join(__dirname, '../public-key.pem'), 'utf8');

const router = express.Router();

// In-memory database
let users = [
  {
    id: '1',
    username: 'johndoe',
    email: 'john@example.com',
    password: 'password123', 
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  // === TAMBAHKAN ADMIN BARU DI SINI ===
  {
    id: 'admin-id-01',
    username: 'admin',
    email: 'admin@gmail.com',
    password: '123456',
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  // ===================================
];


router.get('/public-key', (req, res) => {
  res.type('application/x-pem-file').send(publicKey);
});

// === ENDPOINT LOGIN (UPDATED) ===
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = users.find(u => 
    (u.username === username || u.email === username) && 
    u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  
  const { password: _, ...userWithoutPassword } = user;

  // Buat JWT Token
  const token = jwt.sign(
    { ...userWithoutPassword }, // Payload
    privateKey,                 // Kunci privat
    { expiresIn: '1h', algorithm: 'RS256' } // Opsi
  );

  // Kirim token DAN user object (tanpa password)
  res.json({
    message: 'Login successful',
    token: token,
    user: userWithoutPassword 
  });
});

// === ENDPOINT REGISTER (UPDATED) ===
router.post('/', validateUser, (req, res) => {
  const { username, email, password, age, role = 'user' } = req.body;
  
  const existingUser = users.find(u => u.email === email || u.username === username);
  if (existingUser) {
    return res.status(409).json({
      error: 'User already exists',
      message: 'Email or Username already taken'
    });
  }
  
  const newUser = {
    id: uuidv4(),
    username,
    email,
    password, // Note: Always hash passwords in production!
    age: age || 0,
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  users.push(newUser);
  
  res.status(201).json({
    message: 'User created successfully',
    user: { ...newUser, password: undefined } // Don't send password back
  });
});

// GET /api/users - Get all users
router.get('/', (req, res) => {
  // Kita kembalikan user tanpa password
  const safeUsers = users.map(u => {
    const { password, ...user } = u;
    return user;
  });
  res.json(safeUsers);
});

// GET /api/users/:id - Get user by ID
router.get('/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  
  if (!user) {
    return res.status(404).json({
      error: 'User not found',
      message: `User with ID ${req.params.id} does not exist`
    });
  }
  
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// PUT /api/users/:id - Update user
router.put('/:id', validateUserUpdate, (req, res) => {
  const userIndex = users.findIndex(u => u.id === req.params.id);
  
  if (userIndex === -1) {
    return res.status(404).json({
      error: 'User not found',
      message: `User with ID ${req.params.id} does not exist`
    });
  }
  
  const { name, email, age, role, password } = req.body;
  
  const updatedUser = {
    ...users[userIndex],
    ...(name && { name }),
    ...(email && { email }),
    ...(age && { age }),
    ...(role && { role }),
    ...(password && { password }), 
    updatedAt: new Date().toISOString()
  };
  
  users[userIndex] = updatedUser;
  
  const { password: _, ...userWithoutPassword } = updatedUser;
  res.json({
    message: 'User updated successfully',
    user: userWithoutPassword
  });
});

router.delete('/:id', (req, res) => {
  const userIndex = users.findIndex(u => u.id === req.params.id);
  
  if (userIndex === -1) {
    return res.status(404).json({
      error: 'User not found',
      message: `User with ID ${req.params.id} does not exist`
    });
  }
  
  const deletedUser = users.splice(userIndex, 1)[0];
  const { password, ...userWithoutPassword } = deletedUser;

  res.json({
    message: 'User deleted successfully',
    user: userWithoutPassword
  });
});

module.exports = router;