// src/routes/dashboard.routes.js
const express = require('express');
const ctrl = require('../controllers/dashboard.controller');
const router = express.Router();

router.get('/pm', ctrl.pmDashboard);
router.get('/pmhead', ctrl.pmHeadDashboard);
router.get('/vp', ctrl.vpDashboard);
router.get('/clusterhead', ctrl.clusterHeadDashboard);

module.exports = router;
