// utils/stockAdjustment.js
'use strict';

const StockAdjustment = require('../model/stockAdjustmentModel');
const Inventory = require('../model/inventoryModel');
const throwError = require('./throwError');

const VALID_BUCKETS = ['ON_HAND', 'ON_LOAN'];

async function applyAdjustment(
  session,
  { inventoryId, bucket, delta, reason_code, reason_note, actor, correlation }
) {
  if (!VALID_BUCKETS.includes(bucket)) {
    throwError('Bucket tidak valid (ON_HAND / ON_LOAN)', 400);
  }
  if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) {
    throwError('Delta harus angka non-nol', 400);
  }

  const inv = await Inventory.findById(inventoryId)
    .select('on_hand on_loan')
    .lean()
    .session(session);
  if (!inv) throwError('Inventory tidak ditemukan', 404);

  const field = bucket === 'ON_HAND' ? 'on_hand' : 'on_loan';

  const after = Number(inv[field]);
  const before = after - delta;

  await StockAdjustment.create(
    [
      {
        inventory: inventoryId,
        bucket,
        delta,
        before,
        after,
        reason_code,
        reason_note: reason_note || null,
        actor_id: actor?.id || null,
        actor_name: actor?.name || null,
        correlation: correlation || {}
      }
    ],
    { session }
  );
}

module.exports = { applyAdjustment };
