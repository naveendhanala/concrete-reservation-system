// src/controllers/whatsapp.controller.js
const logger = require('../config/logger');
const whatsappService = require('../services/whatsapp.service');

const HELP_MESSAGE = `Please use this format:

Package: [package name]
RFI: [RFI ID]
Plant: [Camp-1 M3 / Camp-2 M3 / Camp-3 M1 / Camp-1 CP-30]
Date: [DD Month or "today" or "tomorrow"]
Slot: [Slot-1 / Slot-2 / Slot-3 / Slot-4 / Slot-5]
Qty: [m³]
Grade: [M15 / M20 / M25 / M30 / M30_SRC / M45]
Structure: [e.g. Pier Cap P12]
Chainage: [e.g. CH 12+450]
Work: [description]
Pouring: [BoomPlacer / ConcretePump / Chute]
Engineer: [name]
Contractor: [name]

Slot timings:
Slot-1: 07:00–10:00
Slot-2: 11:00–15:00
Slot-3: 16:00–19:00
Slot-4: 20:00–00:00
Slot-5: 00:00–05:00`;

// ── GET: Meta webhook verification ───────────────────────────────────────────
exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified successfully');
    return res.status(200).send(challenge);
  }
  logger.warn('WhatsApp webhook verification failed');
  res.status(403).json({ error: 'Verification failed' });
};

// ── POST: Handle incoming WhatsApp messages ───────────────────────────────────
exports.handleMessage = async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    // Ignore non-text messages (images, voice notes, etc.)
    if (!message || message.type !== 'text') return;

    const from = message.from;
    const text = message.text.body.trim();

    logger.info(`WhatsApp message from ${from}: ${text}`);

    // ── Step 1: Parse with Claude ─────────────────────────────────────────
    let fields;
    try {
      fields = await whatsappService.parseMessage(text);
    } catch (err) {
      logger.error('Claude parse error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      await whatsappService.sendMessage(
        from,
        `❌ Could not understand your message.\n\n${HELP_MESSAGE}`
      );
      return;
    }

    // ── Step 2: Find package ──────────────────────────────────────────────
    const pkg = await whatsappService.findPackage(fields.package_name);
    if (!pkg) {
      await whatsappService.sendMessage(
        from,
        `❌ Package not found: "${fields.package_name}"\n\nPlease check the package name and try again.`
      );
      return;
    }

    // ── Step 3: Find PM for the package ──────────────────────────────────
    const pmUser = await whatsappService.findPackagePM(fields.package_name);
    if (!pmUser) {
      await whatsappService.sendMessage(
        from,
        `❌ No Project Manager assigned to package "${pkg.package_name}". Please contact admin.`
      );
      return;
    }

    // ── Step 4: Create reservation ────────────────────────────────────────
    let reservation;
    try {
      reservation = await whatsappService.createReservation(fields, pmUser, pkg.package_id);
    } catch (err) {
      logger.error('WhatsApp reservation creation error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      await whatsappService.sendMessage(from, `❌ Reservation failed: ${err?.message || String(err)}`);
      return;
    }

    // ── Step 5: Send confirmation ─────────────────────────────────────────
    const isSameDay = reservation.priority_flag === 'SameDay';
    const lines = [
      `✅ Reservation Created!`,
      ``,
      `📋 Ref: ${reservation.reservation_number}`,
      `👤 PM: ${pmUser.name}`,
      `📦 Package: ${pkg.package_name}`,
      `🏭 Plant: ${fields.batching_plant}`,
      `📅 Date: ${fields.date} | ${fields.slot_name}`,
      `🧱 ${fields.quantity_m3} m³ of ${fields.grade}`,
      `🏗️ ${fields.structure} @ ${fields.chainage}`,
      `🔧 ${fields.pouring_type}`,
    ];
    if (fields.rfi_id) lines.push(`📝 RFI: ${fields.rfi_id}`);
    lines.push(``);
    lines.push(isSameDay ? `⚠️ Same-day request — VP approval required.` : `Status: Submitted ✓`);

    await whatsappService.sendMessage(from, lines.join('\n'));
  } catch (err) {
    logger.error('WhatsApp webhook unhandled error:', err);
  } finally {
    // Always respond 200 to Meta — must be sent before function ends
    if (!res.headersSent) res.sendStatus(200);
  }
};
