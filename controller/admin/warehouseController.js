const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const { checkDuplicateValue } = require('../../middleware/checkDuplicate');
const Warehouse = require('../../model/warehouseModel');
const Shelf = require('../../model/shelfModel');
const mongoose = require('mongoose');

const addWarehouse = asyncHandler(async (req, res) => {
  const {
    warehouse_code,
    warehouse_name,
    image,
    description,
    shelves = []
  } = req.body || {};

  if (!warehouse_code || !warehouse_name) {
    throwError('Field ini harus diisi', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [warehouse] = await Warehouse.create(
      [{ warehouse_code, warehouse_name, image, description }],
      { session }
    );

    let createdShelves = [];
    if (shelves.length > 0) {
      for (const s of shelves) {
        await checkDuplicateValue(
          Shelf,
          'shelf_code',
          s.shelf_code,
          'Kode Lemari'
        );
      }

      const shelvesWithWarehouse = shelves.map((s) => ({
        ...s,
        warehouse: warehouse._id
      }));

      createdShelves = await Shelf.insertMany(shelvesWithWarehouse, {
        session
      });

      warehouse.shelves = createdShelves.map((s) => s._id);
      await warehouse.save({ session });
    }
    await session.commitTransaction();
    res.status(201).json({ warehouse, shelves: createdShelves });
  } catch (err) {
    await session.abortTransaction();
    throwError(err.message || 'Gagal membuat gudang', 400);
  } finally {
    session.endSession();
  }
});

const getWarehouses = asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.find()
    .populate('shelves', 'shelf_name shelf_code')
    .exec();
  res.status(200).json(warehouses);
});

const removeWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) throwError('Gudang yang anda cari tidak ada!', 400);

  await Warehouse.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Gudang berhasil dihapus.' });
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const { warehouse_code, warehouse_name, image, description, shelves } =
    req.body || {};

  const warehouse = await Warehouse.findById(req.params.id);

  if (!warehouse) throwError('Gudang yang anda cari tidak ada!', 404);

  warehouse.warehouse_code = warehouse_code || warehouse.warehouse_code;
  warehouse.warehouse_name = warehouse_name || warehouse.warehouse_name;
  warehouse.image = image || warehouse.image;
  warehouse.description = description || warehouse.description;
  warehouse.shelves = shelves || warehouse.shelves;

  await warehouse.save();
  res.status(200).json(warehouse);
});

const getWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id)
    .populate('shelves', 'shelf_name shelf_code')
    .exec();
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
