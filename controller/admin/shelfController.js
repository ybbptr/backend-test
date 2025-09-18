const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Shelf = require('../../model/shelfModel');
const Warehouse = require('../../model/warehouseModel');
const Product = require('../../model/productModel');
const mongoose = require('mongoose');

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
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = req.query.search || '';
  const filter = search
    ? {
        $or: [
          { shelf_name: { $regex: search, $options: 'i' } },
          { shelf_code: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  if (req.query.warehouse) {
    filter.warehouse = req.query.warehouse;
  }

  const totalItems = await Shelf.countDocuments(filter);
  const data = await Shelf.find(filter)
    .populate('warehouse', 'warehouse_name warehouse_code')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data
  });
});

const getShelf = asyncHandler(async (req, res) => {
  const shelf = await Shelf.findById(req.params.id)
    .populate('warehouse', 'warehouse_name warehouse_code')
    .exec();

  if (!Shelf) throwError('Lemari tidak terdaftar!', 400);

  res.status(200).json(shelf);
});

const removeShelf = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const shelf = await Shelf.findById(req.params.id).session(session);
    if (!shelf) throwError('Lemari tidak terdaftar!', 400);

    await Product.updateMany(
      { shelf: shelf._id },
      { $set: { shelf: null } },
      { session }
    );

    await shelf.deleteOne({ session });

    await session.commitTransaction();
    res.status(200).json({ message: 'Lemari berhasil dihapus.' });
  } catch (err) {
    await session.abortTransaction();
    throwError('Gagal menghapus lemari', 400);
  } finally {
    session.endSession();
  }
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
