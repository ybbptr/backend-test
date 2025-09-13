const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const StockChangeLog = require('../../model/stockLogModel');

// GET all logs
const getStockChangeLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { product_code, changed_by_name, start_date, end_date, search } =
    req.query;

  const filter = {};

  // Filter by product_code (exact)
  if (product_code) {
    filter.product_code = product_code;
  }

  // Filter by changed_by_name (partial, case-insensitive)
  if (changed_by_name) {
    filter.changed_by_name = { $regex: changed_by_name, $options: 'i' };
  }

  // Filter by search (search in brand or note)
  if (search) {
    filter.$or = [
      { brand: { $regex: search, $options: 'i' } },
      { note: { $regex: search, $options: 'i' } },
      { product_code: { $regex: search, $options: 'i' } }
    ];
  }

  // Filter by date range
  if (start_date || end_date) {
    filter.createdAt = {};
    if (start_date) filter.createdAt.$gte = new Date(start_date);
    if (end_date) {
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  // Query with pagination
  const [totalItems, logs] = await Promise.all([
    StockChangeLog.countDocuments(filter),
    StockChangeLog.find(filter)
      .populate('inventory', 'condition on_hand on_loan')
      .populate('changed_by', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data: logs
  });
});

// GET single log
const getStockChangeLog = asyncHandler(async (req, res) => {
  const log = await StockChangeLog.findById(req.params.id)
    .populate('inventory', 'condition on_hand on_loan')
    .populate('changed_by', 'name')
    .lean();

  if (!log) throwError('Log perubahan stok tidak ditemukan!', 404);

  res.status(200).json(log);
});

// DELETE log
const removeStockChangeLog = asyncHandler(async (req, res) => {
  const log = await StockChangeLog.findById(req.params.id);
  if (!log) throwError('Log perubahan stok tidak ditemukan!', 404);

  await log.deleteOne();
  res.status(200).json({ message: 'Log perubahan stok berhasil dihapus.' });
});

module.exports = {
  getStockChangeLogs,
  getStockChangeLog,
  removeStockChangeLog
};
