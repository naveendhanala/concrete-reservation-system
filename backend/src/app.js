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
const pushRoutes = require('./routes/push.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const deliveryLogsRoutes = require('./routes/delivery-logs.routes');

const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

const app = express();

// Trust the first proxy (required for Vercel/AWS — they set X-Forwarded-For,
// which express-rate-limit v7 rejects unless trust proxy is enabled)
app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting
const isDev = process.env.NODE_ENV !== 'production';
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: () => isDev,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  skip: () => isDev,
}));

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check — registered at both paths: /health (local) and /api/health (Vercel)
app.get(['/health', '/api/health'], (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Maintenance mode — blocks all routes below, health check above stays accessible
if (process.env.MAINTENANCE_MODE === 'true') {
  app.use((req, res) => {
    res.status(503).json({
      error: 'System is under maintenance. We will be back shortly.',
      maintenance: true,
    });
  });
  module.exports = app;
  return;
}

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/webhook/whatsapp', whatsappRoutes);


// Vercel Cron Job: generate slots daily (runs at 18:00 UTC = 23:30 IST)
app.get('/api/cron/generate-slots', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { generateSlotsForDate } = require('./config/shifts');
    const { query } = require('./config/db');
    let count = 0;
    const days = [];

    // One batched multi-row INSERT per day (20 rows) instead of 280 individual
    // awaited inserts — cuts round-trips 20x so this stays well under the
    // function timeout. Each day commits independently: a failure on one day
    // doesn't roll back days that already succeeded, and doesn't stop the rest
    // of the run.
    for (let d = 1; d <= 14; d++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      const yyyy = date.getFullYear();
      const mm   = String(date.getMonth() + 1).padStart(2, '0');
      const dd   = String(date.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const slots = generateSlotsForDate(dateStr);

      const placeholders = [];
      const params = [];
      slots.forEach((slot, i) => {
        const base = i * 5;
        placeholders.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
        params.push(slot.slot_date, slot.start_time, slot.end_time, slot.capacity_m3, slot.batching_plant);
      });

      try {
        const { rowCount } = await query(
          `INSERT INTO slots (slot_date, start_time, end_time, capacity_m3, batching_plant)
           VALUES ${placeholders.join(',')}
           ON CONFLICT (slot_date, start_time, batching_plant) DO NOTHING`,
          params
        );
        count += rowCount;
        days.push({ date: dateStr, ok: true, created: rowCount });
      } catch (err) {
        days.push({ date: dateStr, ok: false, error: err.message });
      }
    }

    const failedDays = days.filter((d) => !d.ok);
    res.status(failedDays.length ? 207 : 200).json({ ok: failedDays.length === 0, created: count, days });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
app.use('/api/push', authenticate, pushRoutes);
app.use('/api/delivery-logs', authenticate, deliveryLogsRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use(errorHandler);

module.exports = app;
