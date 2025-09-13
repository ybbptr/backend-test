const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const ProductCirculation = require('../../model/productCirculationModel');

// ✅ GET all product circulations
const getProductCirculations = asyncHandler(async (req, res) => {
  const circulations = await ProductCirculation.find()
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_from', 'shelf_name shelf_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('product', 'product_name product_code')
    .populate('moved_by_id', 'name role') // bisa Employee atau User
    .lean();

  res.status(200).json({ success: true, data: circulations });
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
