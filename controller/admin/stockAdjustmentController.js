const asyncHandler = require('express-async-handler');
const StockAdjustment = require('../../model/stockAdjustmentModel');
const throwError = require('../../utils/throwError');

const getStockAdjustments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { loan_number, product_code, start_date, end_date } = req.query;

  const filter = {};
  if (loan_number) filter['correlation.loan_number'] = loan_number;
  if (product_code)
    filter['snapshot.product_code'] = new RegExp(product_code, 'i');

  if (start_date || end_date) {
    filter.createdAt = {};
    if (start_date) filter.createdAt.$gte = new Date(start_date);
    if (end_date) {
      const d = new Date(end_date);
      d.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = d;
    }
  }

  const [totalItems, rows] = await Promise.all([
    StockAdjustment.countDocuments(filter),
    StockAdjustment.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean()
  ]);

  const data = rows.map((r) => ({
    id: String(r._id),
    date: r.createdAt,
    document_number: r.correlation?.loan_number || null,
    product_code: r.snapshot?.product_code || null, // dipisah
    brand: r.snapshot?.brand || null, // dipisah
    change: r.delta,
    stock_after: r.after,
    note: r.reason_note || r.reason_code || null
  }));

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data
  });
});

const getStockAdjustment = asyncHandler(async (req, res) => {
  const row = await StockAdjustment.findById(req.params.id).lean();
  if (!row) throwError('Log penyesuaian stok tidak ditemukan', 404);

  const actionLabel = (code) =>
    ({
      LOAN_OUT: 'Peminjaman',
      REVERT_LOAN_OUT: 'Buka ulang peminjaman',
      RETURN_IN: 'Pengembalian',
      REVERT_RETURN: 'Batal pengembalian',
      MARK_LOST: 'Ditandai hilang',
      REVERT_MARK_LOST: 'Batalkan penandaan hilang',
      MOVE_INTERNAL: 'Transfer internal',
      MANUAL_EDIT: 'Penyesuaian manual',
      MANUAL_CORRECTION: 'Koreksi manual',
      SYSTEM_CORRECTION: 'Koreksi sistem',
      CHANGE_CONDITION: 'Perubahan kondisi'
    }[code] ||
    code ||
    '-');

  const direction =
    row.delta > 0 ? 'Masuk' : row.delta < 0 ? 'Keluar' : 'Netral';

  res.status(200).json({
    date: row.createdAt, // waktu log
    document_number: row.correlation?.loan_number || null, // nomor peminjaman (jika ada)
    product: {
      code: row.snapshot?.product_code || null,
      name: row.snapshot?.product_name || null,
      brand: row.snapshot?.brand || null
    },
    action: actionLabel(row.reason_code), // label aksi (Indonesia)
    change: row.delta, // +/- perubahan
    before: row.before, // stok sebelum
    after: row.after, // stok sesudah
    direction, // Masuk/Keluar/Netral
    note: row.reason_note || null // catatan (opsional)
  });
});

const removeStockAdjustment = asyncHandler(async (req, res) => {
  const row = await StockAdjustment.findById(req.params.id);
  if (!row) throwError('Log adjustment tidak ditemukan!', 404);
  await row.deleteOne();
  res.status(200).json({ message: 'Log adjustment dihapus.' });
});

module.exports = {
  getStockAdjustments,
  getStockAdjustment,
  removeStockAdjustment
};
