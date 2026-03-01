const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  logoutAllHandler,
  meHandler
} = require('../controllers/authController');

const router = express.Router();

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password too long'),
  phone: z.string()
    .regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number format')
    .optional()
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Invalid refresh token')
});

const logoutSchema = z.object({
  refreshToken: z.string().min(10, 'Invalid refresh token')
});

// Public routes (no authentication required) — auth rate limiter
router.post('/register', authLimiter, validate(registerSchema), registerHandler);
router.post('/login', authLimiter, validate(loginSchema), loginHandler);
router.post('/refresh', validate(refreshSchema), refreshHandler);
router.post('/logout', validate(logoutSchema), logoutHandler);

// Protected routes (authentication required)
router.post('/logout-all', authenticate, logoutAllHandler);
router.get('/me', authenticate, meHandler);

module.exports = { authRouter: router };
