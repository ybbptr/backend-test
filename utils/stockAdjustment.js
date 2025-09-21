const Inventory = require('../model/inventoryModel');
const StockAdjustment = require('../model/stockAdjustmentModel');

async function applyAdjustment(session, opts) {
  const {
    inventoryId,
    bucket,
    delta,
    reason_code,
    reason_note,
    actor,
    correlation
  } = opts;

  const inv = await Inventory.findById(inventoryId)
    .populate('product', 'product_code brand')
    .session(session);

  if (!inv) throw new Error('Inventory tidak ditemukan');
  const key = bucket === 'ON_HAND' ? 'on_hand' : 'on_loan';

  const next = inv[key] + delta;
  if (next < 0) throw new Error(`Hasil adjust membuat stok ${bucket} minus`);

  inv[key] = next;
  if (bucket === 'ON_HAND') {
    if (delta > 0) inv.last_in_at = new Date();
    if (delta < 0) inv.last_out_at = new Date();
  }
  await inv.save({ session });

  await StockAdjustment.create(
    [
      {
        inventory: inv._id,
        bucket,
        delta,
        reason_code,
        reason_note,
        product_code: inv.product?.product_code || '',
        brand: inv.product?.brand || '',
        changed_by: actor?.userId || null,
        changed_by_name: actor?.name || 'system',
        correlation: correlation || {}
      }
    ],
    { session }
  );

  return inv;
}

module.exports = { applyAdjustment };
