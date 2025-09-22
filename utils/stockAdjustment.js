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

  // Ambil inventory + snapshot produk/warehouse/shelf
  const inv = await Inventory.findById(inventoryId)
    .populate('product', 'product_code product_name brand')
    .populate('warehouse', 'warehouse_name warehouse_code')
    .populate('shelf', 'shelf_name shelf_code')
    .select('on_hand on_loan product warehouse shelf')
    .session(session);

  if (!inv) throwError('Inventory tidak ditemukan', 404);

  const field = bucket === 'ON_HAND' ? 'on_hand' : 'on_loan';

  // Karena inv sudah disave sebelum applyAdjustment dipanggil:
  // after = nilai terkini; before = after - delta
  const after = Number(inv[field]) || 0;
  const before = after - delta;

  const p = inv.product || {};
  const w = inv.warehouse || {};
  const s = inv.shelf || {};

  const snapshot = {
    product_id: p._id || null,
    product_code: p.product_code || null,
    product_name: p.product_name || null,
    brand: p.brand || null,
    warehouse_id: w._id || null,
    warehouse_name: w.warehouse_name || null,
    shelf_id: s._id || null,
    shelf_name: s.shelf_name || null
  };

  await StockAdjustment.create(
    [
      {
        inventory: inv._id,
        bucket,
        delta,
        before,
        after,
        reason_code,
        reason_note: reason_note || null,
        actor_id: actor?.id || null,
        actor_name: actor?.name || 'system',
        correlation: correlation || {},
        snapshot
      }
    ],
    { session }
  );

  return { before, after };
}

module.exports = { applyAdjustment };
