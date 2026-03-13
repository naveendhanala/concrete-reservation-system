// src/routes/reservation.routes.js
const express = require('express');
const { body, param, query } = require('express-validator');
const ctrl = require('../controllers/reservation.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET all reservations (filtered by role automatically)
router.get('/', ctrl.list);

// GET single reservation
router.get('/:id', ctrl.getById);

// POST create reservation (PM only)
router.post('/',
  requireRole('PM'),
  [
    body('slotId').isUUID(),
    body('quantity_m3').isFloat({ min: 0.1 }),
    body('grade').isIn(['M15', 'M20', 'M25', 'M30', 'M30_SRC', 'M45']),
    body('structure').notEmpty(),
    body('chainage').notEmpty(),
    body('nature_of_work').notEmpty(),
    body('pouring_type').isIn(['BoomPlacer', 'ConcretePump', 'Chute']),
    body('site_engineer_id').isUUID(),
    body('contractor_id').isUUID(),
  ],
  ctrl.create
);

// PATCH acknowledge (P&M Head)
router.patch('/:id/acknowledge',
  requireRole('PMHead'),
  ctrl.acknowledge
);

// PATCH propose alternative slot (P&M Head)
router.patch('/:id/propose-alternative',
  requireRole('PMHead'),
  [body('alternativeSlotId').isUUID()],
  ctrl.proposeAlternative
);

// PATCH complete reservation (P&M Head)
router.patch('/:id/complete',
  requireRole('PMHead'),
  [body('actual_quantity_m3').isFloat({ min: 0.1 })],
  ctrl.complete
);

// PATCH modify reservation (PM — before cutoff)
router.patch('/:id',
  requireRole('PM'),
  ctrl.modify
);

// DELETE cancel reservation
router.delete('/:id',
  [body('reason').notEmpty()],
  ctrl.cancel
);

// GET slot allocations for a reservation
router.get('/:id/slots', ctrl.getSlotAllocations);

module.exports = router;
