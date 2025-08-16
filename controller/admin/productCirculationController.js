const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const productCirculationModel = require('../../model/productCirculationModel');
const mongoose = require('mongoose');

const getProductCirculations = asyncHandler(async (req, res) => {
  const circulations = await productCirculationModel
    .find()
    .populate('warehouse_from', 'name')
    .populate('warehouse_to', 'name')
    .populate('shelf_from', 'name')
    .populate('shelf_to', 'name')
    .populate('product', 'product_name product_code');

  res.status(200).json(circulations);
});

const getProductCirculation = asyncHandler(async (req, res) => {
  const circulation = await productCirculationModel
    .findById(req.params.id)
    .populate('warehouse_from', 'name')
    .populate('warehouse_to', 'name')
    .populate('shelf_from', 'name')
    .populate('shelf_to', 'name')
    .populate('product', 'product_name product_code');

  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  res.status(200).json(circulation);
});

const removeProductCirculation = asyncHandler(async (req, res) => {
  const circulation = await productCirculationModel.findById(req.params.id);
  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  await circulation.deleteOne();
  res.status(200).json({ message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getProductCirculations,
  getProductCirculation,
  removeProductCirculation
};
