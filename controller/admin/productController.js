const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Warehouse = require('../../model/warehouseModel');
const Product = require('../../model/productModel');
const Inventory = require('../../model/inventoryModel');
const { uploadBuffer, getFileUrl, deleteFile } = require('../../utils/wasabi');
const path = require('path');
const formatDate = require('../../utils/formatDate');
const Shelf = require('../../model/shelfModel');
const Loan = require('../../model/loanModel');
const mongoose = require('mongoose');

const addProduct = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let {
      product_code,
      category,
      brand,
      type,
      description,
      purchase_date,
      price,
      initial_stock
    } = req.body;

    if (typeof initial_stock === 'string') {
      try {
        initial_stock = JSON.parse(initial_stock);
      } catch (e) {
        throwError('Format initial_stock tidak valid (harus JSON)', 400);
      }
    }

    const files = req.files || {};

    // Upload gambar produk
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

    // Upload invoice
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

    // 1. Buat Product baru
    const [product] = await Product.create(
      [
        {
          product_code,
          category,
          brand,
          type,
          description,
          purchase_date,
          price,
          product_image: productImageMeta,
          invoice: invoiceMeta
        }
      ],
      { session }
    );

    let inventory = null;

    // 2. Jika ada stok awal → buat Inventory
    if (initial_stock) {
      const { warehouse, shelf, condition, quantity } = initial_stock;
      if (!warehouse || !shelf || !quantity) {
        throwError(
          'Stok awal harus menyertakan warehouse, shelf, dan quantity',
          400
        );
      }

      inventory = await Inventory.findOneAndUpdate(
        {
          product: product._id,
          warehouse,
          shelf,
          condition: condition || 'Baik'
        },
        {
          $inc: { on_hand: quantity },
          $setOnInsert: { on_loan: 0 },
          $set: { last_in_at: new Date() }
        },
        { new: true, upsert: true, session }
      );
    }

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: 'Produk berhasil ditambahkan',
      product,
      inventory
    });
  } catch (err) {
    await session.abortTransaction();
    throwError(err.message || 'Gagal menambahkan produk', 400);
  } finally {
    session.endSession();
  }
});

const getProducts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { product_code, type, brand, category, search, sort } = req.query;

  const filter = {};
  if (product_code)
    filter.product_code = { $regex: product_code, $options: 'i' };
  if (type) filter.type = { $regex: type, $options: 'i' };
  if (brand) filter.brand = { $regex: brand, $options: 'i' };
  if (category) filter.category = category;
  if (search) {
    filter.$or = [
      { product_code: { $regex: search, $options: 'i' } },
      { brand: { $regex: search, $options: 'i' } },
      { type: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  // aggregate join ke Inventory
  const products = await Product.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: 'inventories',
        localField: '_id',
        foreignField: 'product',
        as: 'inventories'
      }
    },
    {
      $addFields: {
        total_on_hand: { $sum: '$inventories.on_hand' },
        total_on_loan: { $sum: '$inventories.on_loan' }
      }
    },
    {
      $project: {
        product_code: 1,
        category: 1,
        brand: 1,
        type: 1,
        price: 1,
        purchase_date: 1,
        description: 1,
        product_image: 1,
        total_on_hand: 1,
        total_on_loan: 1
      }
    },
    { $sort: sortOption },
    { $skip: skip },
    { $limit: limit }
  ]);

  // generate signed URL utk setiap gambar produk
  const productsWithUrl = await Promise.all(
    products.map(async (p) => {
      let imageUrl = null;
      if (p.product_image?.key) {
        imageUrl = await getFileUrl(p.product_image.key); // expired 5 menit
      }
      return {
        ...p,
        product_image_url: imageUrl
      };
    })
  );

  const totalItems = await Product.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages,
    sort: sortOption,
    data: productsWithUrl
  });
});

const getProduct = asyncHandler(async (req, res) => {
  const productId = req.params.id;

  const product = await Product.findById(productId).lean();
  if (!product) throwError('Barang tidak tersedia!', 404);

  // ambil breakdown inventory
  const inventories = await Inventory.find({ product: productId })
    .populate('warehouse', 'warehouse_name')
    .populate('shelf', 'shelf_name')
    .lean();

  const total_on_hand = inventories.reduce((sum, i) => sum + i.on_hand, 0);
  const total_on_loan = inventories.reduce((sum, i) => sum + i.on_loan, 0);

  // breakdown per gudang
  const breakdownByWarehouse = inventories.reduce((acc, i) => {
    const wId = i.warehouse?._id.toString();
    if (!acc[wId]) {
      acc[wId] = {
        warehouse_id: wId,
        warehouse_name: i.warehouse?.warehouse_name,
        total_on_hand: 0,
        total_on_loan: 0,
        shelves: []
      };
    }
    acc[wId].total_on_hand += i.on_hand;
    acc[wId].total_on_loan += i.on_loan;
    acc[wId].shelves.push({
      shelf_id: i.shelf?._id,
      shelf_name: i.shelf?.shelf_name,
      condition: i.condition,
      on_hand: i.on_hand,
      on_loan: i.on_loan
    });
    return acc;
  }, {});

  // generate URL untuk gambar
  let imageUrl = null;
  if (product.product_image?.key) {
    imageUrl = await getFileUrl(product.product_image.key);
  }

  let invoiceUrl = null;
  if (product.invoice?.key) {
    invoiceUrl = await getFileUrl(product.invoice.key);
  }

  res.status(200).json({
    ...product,
    product_image_url: imageUrl,
    invoice_url: invoiceUrl,
    total_on_hand,
    total_on_loan,
    detail: Object.values(breakdownByWarehouse)
  });
});

const removeProduct = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let filesToDelete = [];

  try {
    await session.withTransaction(async () => {
      const product = await Product.findById(req.params.id).session(session);
      if (!product) throwError('Barang tidak tersedia!', 404);

      // Cek total stok (opsional tapi recommended)
      const totalsAgg = await Inventory.aggregate([
        { $match: { product: product._id } },
        {
          $group: {
            _id: null,
            total_on_hand: { $sum: '$on_hand' },
            total_on_loan: { $sum: '$on_loan' },
            rows: { $sum: 1 }
          }
        }
      ]).session(session);

      const totals = totalsAgg[0] || {
        total_on_hand: 0,
        total_on_loan: 0,
        rows: 0
      };

      if (totals.total_on_hand > 0 || totals.total_on_loan > 0) {
        throwError(
          `Tidak bisa menghapus produk karena masih ada stok (on_hand=${totals.total_on_hand}) atau sedang dipinjam (on_loan=${totals.total_on_loan}). Kosongkan/kembalikan dulu.`,
          400
        );
      }

      await Loan.updateMany(
        { product: product._id },
        { $set: { product: null } },
        { session }
      );

      // HAPUS semua inventory yang terkait produk ini
      await Inventory.deleteMany({ product: product._id }).session(session);

      // Hapus dokumen product
      await Product.deleteOne({ _id: product._id }).session(session);

      filesToDelete = [product.product_image?.key, product.invoice?.key].filter(
        Boolean
      );
    });

    for (const key of filesToDelete) {
      try {
        await deleteFile(key);
      } catch (e) {
        console.error('Gagal hapus file:', key, e?.message);
      }
    }

    res.status(200).json({ message: 'Barang berhasil dihapus.' });
  } catch (err) {
    console.error('removeProduct error:', err?.message);
    throwError(err?.message || 'Gagal menghapus barang', 400);
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
    description,
    product_code
  } = req.body;

  const product = await Product.findById(req.params.id);
  if (!product) throwError('Barang tidak ditemukan!', 404);

  if (req.files) {
    if (req.files.product_image && req.files.product_image[0]) {
      const file = req.files.product_image[0];
      const ext = path.extname(file.originalname);
      const date = formatDate();
      const key = `inventaris/${product_code || product.product_code}/${
        category || product.category
      }_${brand || product.brand}_${type || product.type}_${date}${ext}`;

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
      const key = `inventaris/${
        product_code || product.product_code
      }/invoice_${date}${ext}`;

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
  product.description = description ?? product.description;

  await product.save();

  res.status(200).json(product);
});

const getAllWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.find().select('warehouse_name shelves');
  res.json(warehouse);
});

const getShelvesByWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throwError('ID gudang tidak valid', 400);
  }

  const shelves = await Shelf.find({ warehouse: id })
    .select('shelf_name')
    .lean();

  res.status(200).json({ success: true, data: shelves });
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
