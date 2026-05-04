// backend/src/routes/delivery-logs.routes.js
const express = require('express');
const { requireRole } = require('../middleware/auth');
const { listDeliveryLogs } = require('../controllers/delivery-logs.controller');

const router = express.Router();

router.get('/', requireRole('PMHead', 'PMManager'), listDeliveryLogs);

module.exports = router;
