const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Warehouse = require('../../model/warehouseModel');

const addWarehouse = asyncHandler(async (req, res) => {
  const { warehouse_code, warehouse_name, image, description } = req.body || {};

  if (!warehouse_code || !warehouse_name)
    throwError('Field ini harus diisi', 400);

  const warehouse = await Warehouse.create({
    warehouse_code,
    warehouse_name,
    image,
    description
  });

  res.status(201).json(warehouse);
});

const getWarehouses = asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.find();
  res.status(200).json(warehouses);
});

const removeWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) throwError('Gudang yang anda cari tidak ada!', 400);

  await Warehouse.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Gudang berhasil dihapus.' });
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const { warehouse_code, warehouse_name, image, description } = req.body || {};

  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) throwError('Gudang yang anda cari tidak ada!', 404);

  warehouse.warehouse_code = warehouse_code || warehouse.warehouse_code;
  warehouse.warehouse_name = warehouse_name || warehouse.warehouse_name;
  warehouse.image = image || warehouse.image;
  warehouse.description = description || warehouse.description;

  await warehouse.save();
  res.status(200).json(warehouse);
});

const getWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) throwError('Gudang yang anda cari tidak ada!', 400);

  res.status(200).json({ warehouse });
});

module.exports = {
  addWarehouse,
  getWarehouses,
  removeWarehouse,
  updateWarehouse,
  getWarehouse
};
