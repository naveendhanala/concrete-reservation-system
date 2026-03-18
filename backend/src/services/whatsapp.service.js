// src/services/whatsapp.service.js
const Anthropic = require('@anthropic-ai/sdk');
const { query, withTransaction } = require('../config/db');
const capacityService = require('./capacity.service');
const { SHIFT_TIMES } = require('../config/shifts');
const logger = require('../config/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Send WhatsApp message via Meta Cloud API ──────────────────────────────────
async function sendMessage(to, text) {
  const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    logger.error('WhatsApp send error:', err);
    throw new Error(`WhatsApp API: ${err}`);
  }
}

// ── Parse message with Claude AI ─────────────────────────────────────────────
async function parseMessage(text) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    tools: [
      {
        name: 'extract_reservation',
        description: 'Extract all concrete reservation fields from a WhatsApp message',
        input_schema: {
          type: 'object',
          properties: {
            package_name: { type: 'string', description: 'Project package name' },
            rfi_id: { type: 'string', description: 'RFI ID (optional)' },
            batching_plant: {
              type: 'string',
              enum: ['Camp-1 M3', 'Camp-2 M3', 'Camp-3 M1', 'Camp-1 CP-30'],
              description: 'Batching plant name',
            },
            date: {
              type: 'string',
              description: `ISO date YYYY-MM-DD. Today is ${today}, tomorrow is ${tomorrow}. Resolve relative dates like "today" or "tomorrow" accordingly.`,
            },
            slot_name: {
              type: 'string',
              enum: ['Slot-1', 'Slot-2', 'Slot-3', 'Slot-4', 'Slot-5'],
              description: 'Slot-1: 07:00-10:00, Slot-2: 11:00-15:00, Slot-3: 16:00-19:00, Slot-4: 20:00-00:00, Slot-5: 00:00-05:00',
            },
            quantity_m3: { type: 'number', description: 'Concrete quantity in cubic meters' },
            grade: {
              type: 'string',
              enum: ['M15', 'M20', 'M25', 'M30', 'M30_SRC', 'M45'],
            },
            structure: { type: 'string', description: 'Structure name e.g. Pier Cap P12' },
            chainage: { type: 'string', description: 'Chainage e.g. CH 12+450' },
            nature_of_work: { type: 'string', description: 'Description of the work' },
            pouring_type: {
              type: 'string',
              enum: ['BoomPlacer', 'ConcretePump', 'Chute'],
            },
            site_engineer_name: { type: 'string', description: 'Site engineer full name (optional)' },
            contractor_name: { type: 'string', description: 'Contractor company name (optional)' },
          },
          required: [
            'package_name', 'batching_plant', 'date', 'slot_name',
            'quantity_m3', 'grade', 'structure', 'chainage',
            'nature_of_work', 'pouring_type',
          ],
        },
      },
    ],
    tool_choice: { type: 'auto' },
    messages: [
      {
        role: 'user',
        content: `Extract all concrete reservation details from this WhatsApp message:\n\n${text}`,
      },
    ],
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse) throw new Error('Could not parse message');
  return toolUse.input;
}

// ── Find package by name (fuzzy) ──────────────────────────────────────────────
async function findPackage(packageName) {
  const { rows } = await query(
    `SELECT * FROM packages WHERE package_name ILIKE $1 AND active_flag = TRUE LIMIT 1`,
    [`%${packageName}%`]
  );
  return rows[0] || null;
}

// ── Find PM user for a package ────────────────────────────────────────────────
async function findPackagePM(packageName) {
  const { rows } = await query(
    `SELECT u.* FROM users u
     JOIN user_packages up ON u.user_id = up.user_id
     JOIN packages p ON up.package_id = p.package_id
     WHERE u.role = 'PM' AND p.package_name ILIKE $1 AND u.active_flag = TRUE
     LIMIT 1`,
    [`%${packageName}%`]
  );
  return rows[0] || null;
}

// ── Find slot by date, batching plant, slot name ──────────────────────────────
async function findSlot(date, batchingPlant, slotName) {
  const shiftTime = SHIFT_TIMES.find((s) => s.name === slotName);
  if (!shiftTime) return null;

  const { rows } = await query(
    `SELECT * FROM slots
     WHERE slot_date = $1::date
       AND batching_plant = $2
       AND start_time::time = $3::time
       AND is_active = TRUE`,
    [date, batchingPlant, shiftTime.start + ':00']
  );
  return rows[0] || null;
}

// ── Find site engineer by name (fuzzy, within package) ───────────────────────
async function findSiteEngineer(name, packageId) {
  if (!name) return null;
  const { rows } = await query(
    `SELECT * FROM site_engineers
     WHERE name ILIKE $1 AND package_id = $2 AND active_flag = TRUE LIMIT 1`,
    [`%${name}%`, packageId]
  );
  return rows[0] || null;
}

// ── Find contractor by name (fuzzy) ──────────────────────────────────────────
async function findContractor(name) {
  if (!name) return null;
  const { rows } = await query(
    `SELECT * FROM contractors WHERE name ILIKE $1 AND active_flag = TRUE LIMIT 1`,
    [`%${name}%`]
  );
  return rows[0] || null;
}

// ── Create reservation from WhatsApp fields ───────────────────────────────────
async function createReservation(fields, pmUser, packageId) {
  logger.info(`[WA] Finding slot: date=${fields.date}, plant=${fields.batching_plant}, slot=${fields.slot_name}`);
  const slot = await findSlot(fields.date, fields.batching_plant, fields.slot_name);
  logger.info(`[WA] Slot found: ${slot ? slot.slot_id : 'NULL'}`);
  if (!slot) {
    throw new Error(`${fields.slot_name} not found for ${fields.batching_plant} on ${fields.date}`);
  }

  const available = parseFloat(slot.capacity_m3) - parseFloat(slot.booked_m3);
  if (available <= 0) {
    throw new Error(`${fields.slot_name} is fully booked for ${fields.batching_plant} on ${fields.date}`);
  }

  const engineer = await findSiteEngineer(fields.site_engineer_name, packageId);
  const contractor = await findContractor(fields.contractor_name);
  logger.info(`[WA] Engineer: ${engineer?.name || 'not found'}, Contractor: ${contractor?.name || 'not found'}`);
  logger.info(`[WA] Computing allocation for slot ${slot.slot_id}, qty=${fields.quantity_m3}`);
  const allocation = await capacityService.computeSlotAllocation(slot.slot_id, fields.quantity_m3);
  const isSameDay = capacityService.isSameDay(slot.start_time);

  const lastSlotId = allocation[allocation.length - 1].slot_id;
  const { rows: lastSlotRows } = await query('SELECT end_time FROM slots WHERE slot_id = $1', [lastSlotId]);

  const result = await withTransaction(async (client) => {
    const { rows: resRows } = await client.query(
      `INSERT INTO reservations
         (requester_id, package_id, quantity_m3, grade, structure, chainage,
          nature_of_work, pouring_type, site_engineer_id, contractor_id,
          priority_flag, status, requested_start, requested_end,
          is_split, rfi_id, batching_plant)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               $13::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
               $14::TIMESTAMP AT TIME ZONE 'Asia/Kolkata',
               $15,$16,$17)
       RETURNING *`,
      [
        pmUser.user_id, packageId, fields.quantity_m3, fields.grade,
        fields.structure, fields.chainage, fields.nature_of_work, fields.pouring_type,
        engineer?.engineer_id || null, contractor?.contractor_id || null,
        isSameDay ? 'SameDay' : 'Normal',
        isSameDay ? 'PendingApproval' : 'Submitted',
        slot.start_time,
        allocation.length > 1 ? lastSlotRows[0].end_time : slot.end_time,
        allocation.length > 1,
        fields.rfi_id || null,
        fields.batching_plant,
      ]
    );
    const reservation = resRows[0];

    await capacityService.applySlotAllocations(client, reservation.reservation_id, allocation);

    if (isSameDay) {
      const { rows: vpRows } = await client.query(
        `SELECT user_id FROM users WHERE role = 'VP' LIMIT 1`
      );
      if (vpRows[0]) {
        await client.query(
          `INSERT INTO approval_workflows (reservation_id, approver_id, approval_type, sla_due_at)
           VALUES ($1, $2, 'SameDay', NOW())`,
          [reservation.reservation_id, vpRows[0].user_id]
        );
      }
      await client.query(
        'UPDATE users SET same_day_request_count = same_day_request_count + 1 WHERE user_id = $1',
        [pmUser.user_id]
      );
    }

    return reservation;
  });

  return result;
}

module.exports = {
  sendMessage,
  parseMessage,
  findPackage,
  findPackagePM,
  findSlot,
  findSiteEngineer,
  findContractor,
  createReservation,
};
