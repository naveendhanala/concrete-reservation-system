// src/routes/approval.routes.js
const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/approval.controller');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', ctrl.list);
router.patch('/:id/action',
  requireRole('VP', 'ClusterHead', 'PMHead'),
  [body('action').isIn(['Approved', 'Rejected']), body('remarks').optional()],
  ctrl.action
);

module.exports = router;
