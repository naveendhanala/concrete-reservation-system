// src/server.js
require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');
const { pool } = require('./config/db');
const { startJobs } = require('./jobs');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // Test DB connection
    await pool.query('SELECT 1');
    logger.info('Database connected successfully');

    // Start background jobs
    startJobs();
    logger.info('Background jobs started');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
