// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const packageRoutes = require('./routes/package.routes');
const slotRoutes = require('./routes/slot.routes');
const reservationRoutes = require('./routes/reservation.routes');
const approvalRoutes = require('./routes/approval.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const reportRoutes = require('./routes/report.routes');
const configRoutes = require('./routes/config.routes');
const notificationRoutes = require('./routes/notification.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');

const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

const app = express();

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting
const isDev = process.env.NODE_ENV !== 'production';
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: isDev ? 1000 : 20,
  skip: () => isDev, 
  //max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 10000 : 200, 
  skip: () => isDev,
  //max: 200,
}));

// Parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/webhook/whatsapp', whatsappRoutes);

// Protected routes
app.use('/api/users', authenticate, userRoutes);
app.use('/api/packages', authenticate, packageRoutes);
app.use('/api/slots', authenticate, slotRoutes);
app.use('/api/reservations', authenticate, reservationRoutes);
app.use('/api/approvals', authenticate, approvalRoutes);
app.use('/api/dashboards', authenticate, dashboardRoutes);
app.use('/api/reports', authenticate, reportRoutes);
app.use('/api/config', authenticate, configRoutes);
app.use('/api/notifications', authenticate, notificationRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use(errorHandler);

module.exports = app;
