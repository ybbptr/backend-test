const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Warehouse = require('../../model/warehouseModel');
const Product = require('../../model/productModel');
const Shelf = require('../../model/shelfModel');
const Loan = require('../../model/loanModel');
const cloudinary = require('cloudinary');
const mongoose = require('mongoose');

const addProduct = asyncHandler(async (req, res) => {
  const {
    product_code,
    product_name,
    description,
    quantity,
    warehouse,
    condition,
    shelf
  } = req.body || {};

  if (!product_code || !product_name) throwError('Field ini harus diisi', 400);

  const imageUrl = req.file
    ? req.file.path
    : 'https://res.cloudinary.com/dwnvblf1g/image/upload/v1746338190/placeholder_aanaig.png';

  const imagePublicId = req.file ? req.file.filename : null;

  const product = await Product.create({
    imageUrl,
    imagePublicId,
    product_code,
    product_name,
    description,
    quantity,
    warehouse,
    condition,
    shelf
  });

  res.status(201).json(product);
});

const getProducts = asyncHandler(async (req, res) => {
  const products = await Product.find().populate([
    { path: 'warehouse', select: 'warehouse_name warehouse_code' },
    { path: 'shelf', select: 'shelf_name shelf_code' }
  ]);

  res.status(200).json(products);
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate([
    { path: 'warehouse', select: 'warehouse_name warehouse_code' },
    { path: 'shelf', select: 'shelf_name shelf_code' }
  ]);
  if (!product) throwError('Barang tidak tersedia!', 400);

  res.status(200).json(product);
});

const removeProduct = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(req.params.id);
    if (!product) throwError('Barang tidak tersedia!', 400);

    if (product.imagePublicId != null) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }

    await Loan.updateMany(
      { product: product._id },
      { $set: { product: null } },
      { session }
    );

    await product.deleteOne({ session });

    await session.commitTransaction();
    res.status(200).json({ message: 'Barang berhasil dihapus.' });
  } catch (err) {
    await session.abortTransaction();
    throwError('Gagal menghapus barang', 400);
  } finally {
    session.endSession();
  }
});

const updateProduct = asyncHandler(async (req, res) => {
  const {
    product_code,
    product_name,
    description,
    quantity,
    warehouse,
    condition,
    shelf
  } = req.body;

  const product = await Product.findById(req.params.id);
  if (!product) throwError('Barang tidak ditemukan!', 404);

  const previousWarehouse = product.warehouse;
  const previousShelf = product.shelf;

  const warehouseChanged =
    warehouse &&
    previousWarehouse &&
    warehouse.toString() !== previousWarehouse.toString();

  const shelfChanged =
    shelf && previousShelf && shelf.toString() !== previousShelf.toString();

  let imageUrl = product.imageUrl;
  let imagePublicId = product.imagePublicId;

  if (req.file) {
    if (imagePublicId) {
      await cloudinary.uploader.destroy(imagePublicId);
    }
    imageUrl = req.file.path;
    imagePublicId = req.file.filename;
  }

  product.product_code = product_code || product.product_code;
  product.product_name = product_name || product.product_name;
  product.description = description || product.description;
  product.quantity = quantity || product.quantity;
  product.warehouse = warehouse || product.warehouse;
  product.condition = condition || product.condition;
  product.shelf = shelf || product.shelf;
  product.imageUrl = imageUrl;
  product.imagePublicId = imagePublicId;

  await product.save();

  if (warehouseChanged || shelfChanged) {
    await productCirculationModel.create({
      product: product._id,
      product_code: product.product_code,
      product_name: product.product_name,
      imageUrl: product.imageUrl,
      warehouse_from: previousWarehouse,
      shelf_from: previousShelf,
      warehouse_to: product.warehouse,
      shelf_to: product.shelf
    });

    const maxCirculations = 3;
    const allCirculations = await productCirculationModel
      .find({ product: product._id })
      .sort({ createdAt: 1 });

    if (allCirculations.length > maxCirculations) {
      const excess = allCirculations.length - maxCirculations;
      const toDelete = allCirculations.slice(0, excess);
      const deleteIds = toDelete.map((c) => c._id);
      await productCirculationModel.deleteMany({ _id: { $in: deleteIds } });
    }
  }

  res.status(200).json(product);
});

const getAllWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.find().select(
    'warehouse_code warehouse_name shelves'
  );

  res.json(warehouse);
});

const getShelvesByWarehouse = asyncHandler(async (req, res) => {
  const { warehouse } = req.query;
  if (!warehouse) throwError('ID gudang tidak valid', 400);

  const shelves = await Shelf.find({ warehouse }).select(
    'shelf_name shelf_code'
  );

  res.json(shelves);
});

module.exports = {
  addProduct,
  getProducts,
  getProduct,
  removeProduct,
  updateProduct,
  getAllWarehouse,
  getShelvesByWarehouse
};
