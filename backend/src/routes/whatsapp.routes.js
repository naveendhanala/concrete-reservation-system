// src/routes/whatsapp.routes.js
const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');

// Meta webhook verification (GET) — called once when setting up the webhook
router.get('/', whatsappController.verifyWebhook);

// Incoming WhatsApp messages (POST) — called on every new message
router.post('/', whatsappController.handleMessage);

module.exports = router;
