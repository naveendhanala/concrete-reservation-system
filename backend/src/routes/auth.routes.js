// src/routes/auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const { login, refreshToken, logout, getMe } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.post('/login',
  [body('email').isEmail(), body('password').notEmpty()],
  login
);
router.post('/refresh', refreshToken);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

module.exports = router;
