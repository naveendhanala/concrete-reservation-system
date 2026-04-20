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
    body('quantity_m3').isFloat({ min: 0.1, max: 50 }),
    body('grade').isIn(['M10_PCC', 'M15', 'M20', 'M25', 'M30', 'M30_SRC', 'M35', 'M40', 'M45', 'M50_PSC']),
    body('structure').notEmpty(),
    body('chainage').notEmpty(),
    body('nature_of_work').notEmpty(),
    body('type_of_work').isIn(['Bridges', 'SWD', 'Precast Manholes', 'Precast SWD', 'Camp Works']),
    body('pouring_type').isIn(['BoomPlacer', 'ConcretePump', 'Chute', 'Manual']),
    body('engineer_user_id').optional({ nullable: true }).isUUID(),
    body('contractor_id').isUUID(),
  ],
  ctrl.create
);

// PATCH start reservation (PM only — after Acknowledged)
router.patch('/:id/start', requireRole('PM'), ctrl.start);

// PATCH acknowledge (P&M Head or P&M Manager for their plant's packages)
router.patch('/:id/acknowledge',
  requireRole('PMHead', 'PMManager'),
  ctrl.acknowledge
);

// PATCH propose alternative slot (P&M Head or P&M Manager)
router.patch('/:id/propose-alternative',
  requireRole('PMHead', 'PMManager'),
  [body('alternativeSlotId').isUUID()],
  ctrl.proposeAlternative
);

// POST add delivery trip (P&M Head or P&M Manager)
router.post('/:id/deliveries',
  requireRole('PMHead', 'PMManager'),
  [body('quantity_m3').isFloat({ min: 0.1 })],
  ctrl.addDelivery
);

// PATCH edit delivery trip (P&M Head or P&M Manager)
router.patch('/:id/deliveries/:deliveryId',
  requireRole('PMHead', 'PMManager'),
  [body('quantity_m3').isFloat({ min: 0.1 })],
  ctrl.editDelivery
);

// PATCH complete reservation (PM — requester only, after deliveries logged)
router.patch('/:id/complete', requireRole('PM'), ctrl.complete);

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
