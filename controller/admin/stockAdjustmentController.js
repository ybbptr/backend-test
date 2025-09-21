const asyncHandler = require('express-async-handler');
const StockAdjustment = require('../../model/stockAdjustmentModel');
const throwError = require('../../utils/throwError');

// GET /stock-adjustments
const getStockAdjustments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const {
    bucket, // ON_HAND | ON_LOAN
    reason_code, // LOAN_OUT | RETURN_IN | MARK_LOST | MOVE_OUT | MOVE_IN | ...
    product_code,
    inventory, // inventoryId
    loan_number,
    return_loan_id,
    search,
    start_date,
    end_date,
    sort
  } = req.query;

  const filter = {};
  if (bucket) filter.bucket = bucket;
  if (reason_code) filter.reason_code = reason_code;
  if (inventory) filter.inventory = inventory;
  if (product_code)
    filter['snapshot.product_code'] = new RegExp(product_code, 'i');
  if (loan_number) filter['correlation.loan_number'] = loan_number;
  if (return_loan_id) filter['correlation.return_loan_id'] = return_loan_id;

  if (search) {
    filter.$or = [
      { reason_code: new RegExp(search, 'i') },
      { reason_note: new RegExp(search, 'i') },
      { 'snapshot.product_code': new RegExp(search, 'i') },
      { 'snapshot.product_name': new RegExp(search, 'i') }
    ];
  }

  if (start_date || end_date) {
    filter.createdAt = {};
    if (start_date) filter.createdAt.$gte = new Date(start_date);
    if (end_date) {
      const d = new Date(end_date);
      d.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = d;
    }
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = String(sort).split(':');
    if (field) sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const [totalItems, rows] = await Promise.all([
    StockAdjustment.countDocuments(filter),
    StockAdjustment.find(filter).skip(skip).limit(limit).sort(sortOption).lean()
  ]);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    sort: sortOption,
    data: rows
  });
});

// GET /stock-adjustments/:id
const getStockAdjustment = asyncHandler(async (req, res) => {
  const row = await StockAdjustment.findById(req.params.id).lean();
  if (!row) throwError('Log adjustment tidak ditemukan!', 404);
  res.status(200).json(row);
});

// (opsional) DELETE /stock-adjustments/remove/:id
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
