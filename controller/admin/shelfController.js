const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Shelf = require('../../model/shelfModel');
const Warehouse = require('../../model/warehouseModel');

const addShelf = asyncHandler(async (req, res) => {
  const { shelf_name, shelf_code, description, warehouse } = req.body || {};

  if (!shelf_name || !shelf_code || !warehouse)
    throwError('Field ini harus diisi', 400);

  const shelf = await Shelf.create({
    shelf_name,
    shelf_code,
    description,
    warehouse
  });

  res.status(201).json(shelf);
});

const getShelfs = asyncHandler(async (req, res) => {
  const shelfs = await Shelf.find()
    .populate('warehouse', 'warehouse_name warehouse_code')
    .exec();

  res.status(200).json(shelfs);
});

const getShelf = asyncHandler(async (req, res) => {
  const shelf = await Shelf.findById(req.params.id).populate([
    { path: 'warehouse', select: 'warehouse_name warehouse_code' }
  ]);

  if (!Shelf) throwError('Lemari tidak terdaftar!', 400);

  res.status(200).json(shelf);
});

const removeShelf = asyncHandler(async (req, res) => {
  const shelf = await Shelf.findById(req.params.id);
  if (!shelf) throwError('Lemari tidak terdaftar!', 400);

  await Shelf.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Lemari berhasil dihapus.' });
});

const updateShelf = asyncHandler(async (req, res) => {
  const { shelf_name, shelf_code, description, warehouse } = req.body || {};

  const shelf = await Shelf.findById(req.params.id);
  if (!shelf) throwError('Lemari berhasil dihapus', 404);

  shelf.shelf_name = shelf_name || shelf.shelf_name;
  shelf.shelf_code = shelf_code || shelf.shelf_code;
  shelf.description = description || shelf.description;
  shelf.warehouse = warehouse || shelf.warehouse;

  await shelf.save();
  res.status(200).json(shelf);
});

const getAllWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.find().select(
    'warehouse_code warehouse_name'
  );

  res.json(warehouse);
});

module.exports = {
  addShelf,
  getShelfs,
  getShelf,
  removeShelf,
  updateShelf,
  getAllWarehouse
};
