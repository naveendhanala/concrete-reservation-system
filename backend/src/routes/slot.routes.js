// src/routes/slot.routes.js
const express = require('express');
const ctrl = require('../controllers/slot.controller');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/bookable-dates', ctrl.getBookableDates); // Returns today + tomorrow with shifts
router.get('/available', ctrl.getAvailable);         // PM uses this to see slots
router.get('/calendar', ctrl.getCalendar);           // P&M / dashboard uses this
router.post('/generate', requireRole('Admin', 'PMHead'), ctrl.generateSlots); // Admin generates future slots

module.exports = router;