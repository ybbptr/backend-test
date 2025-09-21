const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const ProductCirculation = require('../../model/productCirculationModel');

const getProductCirculations = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const {
    product_code,
    warehouse_from,
    warehouse_to,
    moved_by_name,
    movement_type,
    search,
    sort
  } = req.query;

  const filter = {};
  if (product_code)
    filter.product_code = { $regex: product_code, $options: 'i' };
  if (warehouse_from) filter.warehouse_from = warehouse_from;
  if (warehouse_to) filter.warehouse_to = warehouse_to;
  if (moved_by_name)
    filter.moved_by_name = { $regex: moved_by_name, $options: 'i' };
  if (movement_type) filter.movement_type = movement_type; // RETURN_IN | MOVE | CHANGE_CONDITION_MOVE | ...

  if (search) {
    filter.$or = [
      { product_code: { $regex: search, $options: 'i' } },
      { product_name: { $regex: search, $options: 'i' } },
      { moved_by_name: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = String(sort).split(':');
    if (field) sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const [totalItems, rows] = await Promise.all([
    ProductCirculation.countDocuments(filter),
    ProductCirculation.find(filter)
      .populate('warehouse_from', 'warehouse_name warehouse_code')
      .populate('warehouse_to', 'warehouse_name warehouse_code')
      .populate('shelf_from', 'shelf_name shelf_code')
      .populate('shelf_to', 'shelf_name shelf_code')
      .populate('product', 'product_name product_code')
      .populate('moved_by', 'name')
      .skip(skip)
      .limit(limit)
      .sort(sortOption)
      .lean()
  ]);

  res.status(200).json({
    success: true,
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    sort: sortOption,
    data: rows
  });
});

// GET /product-circulations/:id
const getProductCirculation = asyncHandler(async (req, res) => {
  const row = await ProductCirculation.findById(req.params.id)
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_from', 'shelf_name shelf_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('product', 'product_name product_code')
    .populate('moved_by', 'name')
    .lean();
  if (!row) throwError('Sirkulasi tidak ditemukan!', 404);
  res.status(200).json({ success: true, data: row });
});

// (opsional) DELETE /product-circulations/remove/:id
const removeProductCirculation = asyncHandler(async (req, res) => {
  const row = await ProductCirculation.findById(req.params.id);
  if (!row) throwError('Sirkulasi tidak ditemukan!', 404);
  await row.deleteOne();
  res
    .status(200)
    .json({ success: true, message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getProductCirculations,
  getProductCirculation,
  removeProductCirculation
};
