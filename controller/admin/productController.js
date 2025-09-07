const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Warehouse = require('../../model/warehouseModel');
const Product = require('../../model/productModel');
const { uploadBuffer, getFileUrl, deleteFile } = require('../../utils/wasabi');
const path = require('path');
const formatDate = require('../../utils/formatDate');
const Shelf = require('../../model/shelfModel');
const Loan = require('../../model/loanModel');
const productCirculationModel = require('../../model/productCirculationModel');
const mongoose = require('mongoose');

const addProduct = asyncHandler(async (req, res) => {
  const {
    purchase_date,
    price,
    category,
    brand,
    type,
    quantity,
    condition,
    warehouse,
    shelf,
    product_code,
    description
  } = req.body || {};

  const files = req.files || {};

  let productImageMeta = null;
  if (files.product_image && files.product_image[0]) {
    const file = files.product_image[0];
    const ext = path.extname(file.originalname);
    const key = `inventaris/${product_code}/${category}_${brand}_${type}_${formatDate()}${ext}`;
    await uploadBuffer(key, file.buffer);
    productImageMeta = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  let invoiceMeta = null;
  if (files.invoice && files.invoice[0]) {
    const file = files.invoice[0];
    const ext = path.extname(file.originalname);
    const date = formatDate();
    const key = `inventaris/${product_code}/invoice_${date}${ext}`;
    await uploadBuffer(key, file.buffer);
    invoiceMeta = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  const product = await Product.create({
    purchase_date,
    price,
    category,
    brand,
    type,
    quantity,
    condition,
    warehouse,
    shelf,
    product_code,
    description,
    product_image: productImageMeta,
    invoice: invoiceMeta
  });

  res.status(201).json(product);
});

const getProducts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const {
    product_code,
    type,
    condition,
    warehouse,
    shelf,
    brand,
    category,
    search,
    sort
  } = req.query;

  const filter = {};
  if (product_code)
    filter.product_code = { $regex: product_code, $options: 'i' };
  if (type) filter.type = { $regex: type, $options: 'i' };
  if (condition) filter.condition = condition;
  if (warehouse) filter.warehouse = warehouse;
  if (shelf) filter.shelf = shelf;
  if (brand) filter.brand = { $regex: brand, $options: 'i' };
  if (category) filter.category = category;
  if (search) {
    filter.$or = [
      { product_code: { $regex: search, $options: 'i' } },
      { product_name: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const products = await Product.find(filter)
    .populate([
      { path: 'warehouse', select: 'warehouse_name warehouse_code' },
      { path: 'shelf', select: 'shelf_name shelf_code' }
    ])
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  const totalItems = await Product.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  const productsWithUrls = await Promise.all(
    products.map(async (p) => {
      let imageUrl = null;
      if (p.product_image?.key) {
        imageUrl = await getFileUrl(p.product_image.key);
      }

      let invoiceUrl = null;
      if (p.invoice?.key) {
        invoiceUrl = await getFileUrl(p.invoice.key);
      }

      return { ...p, product_image_url: imageUrl, invoice_url: invoiceUrl };
    })
  );

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages,
    sort: sortOption,
    data: productsWithUrls
  });
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate([
    { path: 'warehouse', select: 'warehouse_name warehouse_code' },
    { path: 'shelf', select: 'shelf_name shelf_code' }
  ]);
  if (!product) throwError('Barang tidak tersedia!', 400);

  let imageUrl = null;
  if (product.product_image?.key) {
    imageUrl = await getFileUrl(product.product_image.key);
  }

  let invoiceUrl = null;
  if (product.invoice?.key) {
    invoiceUrl = await getFileUrl(product.invoice.key);
  }

  res.status(200).json({
    ...product.toObject(),
    product_image_url: imageUrl,
    invoice_url: invoiceUrl
  });
});

const removeProduct = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(req.params.id);
    if (!product) throwError('Barang tidak tersedia!', 400);

    // hapus file di Wasabi
    if (product.product_image?.key) {
      await deleteFile(product.product_image.key);
    }
    if (product.invoice?.key) {
      await deleteFile(product.invoice.key);
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
    purchase_date,
    price,
    category,
    brand,
    type,
    quantity,
    condition,
    warehouse,
    shelf,
    description,
    product_code
  } = req.body;

  if (warehouse && !mongoose.Types.ObjectId.isValid(warehouse)) {
    throwError('ID gudang tidak valid!', 400);
  }
  if (shelf && !mongoose.Types.ObjectId.isValid(shelf)) {
    throwError('ID lemari tidak valid!', 400);
  }

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

  if (req.files) {
    if (req.files.product_image && req.files.product_image[0]) {
      const file = req.files.product_image[0];
      const ext = path.extname(file.originalname);
      const date = formatDate();
      const key = `inventaris/${product_code}/${category}_${brand}_${type}_${date}${ext}`;

      if (product.product_image?.key) {
        await deleteFile(product.product_image.key);
      }

      await uploadBuffer(key, file.buffer);

      product.product_image = {
        key,
        contentType: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      };
    }

    if (req.files.invoice && req.files.invoice[0]) {
      const file = req.files.invoice[0];
      const ext = path.extname(file.originalname);
      const date = formatDate();
      const key = `inventaris/${product_code}/invoice_${date}${ext}`;

      if (product.invoice?.key) {
        await deleteFile(product.invoice.key);
      }

      await uploadBuffer(key, file.buffer);

      product.invoice = {
        key,
        contentType: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      };
    }
  }

  product.product_code = product_code ?? product.product_code;
  product.purchase_date = purchase_date ?? product.purchase_date;
  product.price = price ?? product.price;
  product.category = category ?? product.category;
  product.brand = brand ?? product.brand;
  product.type = type ?? product.type;
  product.quantity = quantity ?? product.quantity;
  product.condition = condition ?? product.condition;
  product.warehouse = warehouse ?? product.warehouse;
  product.shelf = shelf ?? product.shelf;
  product.description = description ?? product.description;

  await product.save();

  if (warehouseChanged || shelfChanged) {
    await productCirculationModel.create({
      product: product._id,
      product_code: product.product_code,
      product_name: product.product_name,
      product_image: product.product_image,
      warehouse_from: previousWarehouse,
      shelf_from: previousShelf,
      warehouse_to: product.warehouse,
      shelf_to: product.shelf
    });
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
