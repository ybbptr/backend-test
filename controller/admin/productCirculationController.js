const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const ProductCirculation = require('../../model/productCirculationModel');

// ✅ GET all product circulations
const getProductCirculations = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const {
    product_code,
    warehouse_from,
    warehouse_to,
    moved_by_name,
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

  if (search) {
    filter.$or = [
      { product_code: { $regex: search, $options: 'i' } },
      { product_name: { $regex: search, $options: 'i' } },
      { moved_by_name: { $regex: search, $options: 'i' } }
    ];
  }

  // default sort by newest
  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const [totalItems, circulations] = await Promise.all([
    ProductCirculation.countDocuments(filter),
    ProductCirculation.find(filter)
      .populate('warehouse_from', 'warehouse_name warehouse_code')
      .populate('warehouse_to', 'warehouse_name warehouse_code')
      .populate('shelf_from', 'shelf_name shelf_code')
      .populate('shelf_to', 'shelf_name shelf_code')
      .populate('product', 'product_name product_code')
      .populate('moved_by_id', 'name role')
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
    data: circulations
  });
});

// ✅ GET detail product circulation by ID
const getProductCirculation = asyncHandler(async (req, res) => {
  const circulation = await ProductCirculation.findById(req.params.id)
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_from', 'shelf_name shelf_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('product', 'product_name product_code')
    .populate('moved_by_id', 'name role')
    .lean();

  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  res.status(200).json({ success: true, data: circulation });
});

// ✅ DELETE product circulation
const removeProductCirculation = asyncHandler(async (req, res) => {
  const circulation = await ProductCirculation.findById(req.params.id);
  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  await circulation.deleteOne();
  res
    .status(200)
    .json({ success: true, message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getProductCirculations,
  getProductCirculation,
  removeProductCirculation
};
