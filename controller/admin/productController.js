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

  const totalItems = await Product.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages,
    sort: sortOption,
    data: products
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
  session.startTransaction();

  try {
    const product = await Product.findById(req.params.id);
    if (!product) throwError('Barang tidak tersedia!', 400);

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
  const { warehouse } = req.query;
  if (!warehouse) throwError('ID gudang tidak valid', 400);

  const shelves = await Shelf.find({ warehouse }).select('shelf_name');

  res.json(shelves);
});

const addStock = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params; // productId
    const { warehouse, shelf, condition = 'Baik', quantity } = req.body;

    if (!warehouse || !shelf || !quantity) {
      throwError('Field warehouse, shelf, dan quantity wajib diisi', 400);
    }

    // cari inventory existing
    const existing = await Inventory.findOne({
      product: id,
      warehouse,
      shelf,
      condition
    }).session(session);

    let inventory, message;

    if (existing) {
      // update stok existing
      inventory = await Inventory.findOneAndUpdate(
        { product: id, warehouse, shelf, condition },
        {
          $inc: { on_hand: quantity },
          $set: { last_in_at: new Date() }
        },
        { new: true, session }
      );
      message = 'Stok ditambahkan ke record existing';
    } else {
      // buat stok baru
      inventory = await Inventory.create(
        [
          {
            product: id,
            warehouse,
            shelf,
            condition,
            on_hand: quantity,
            on_loan: 0,
            last_in_at: new Date()
          }
        ],
        { session }
      );
      inventory = inventory[0];
      message = 'Stok baru dibuat untuk gudang/lemari ini';
    }

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message,
      data: inventory
    });
  } catch (err) {
    await session.abortTransaction();
    throwError(err.message || 'Gagal menambah stok dari Master Product', 400);
  } finally {
    session.endSession();
  }
});

const getWarehousesAndShelvesWithStock = asyncHandler(async (req, res) => {
  const { id } = req.params; // productId

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throwError('ID produk tidak valid', 400);
  }

  // ambil semua gudang beserta shelves
  const warehouses = await Warehouse.find()
    .populate('shelves', 'shelf_name shelf_code')
    .select('warehouse_name warehouse_code shelves')
    .lean();

  // ambil inventory khusus product ini
  const inventories = await Inventory.find({ product: id })
    .select('warehouse shelf on_hand on_loan condition')
    .lean();

  // bikin map stok per gudang+shelf
  const stockMap = {};
  inventories.forEach((inv) => {
    const key = `${inv.warehouse}_${inv.shelf}_${inv.condition}`;
    stockMap[key] = {
      on_hand: inv.on_hand,
      on_loan: inv.on_loan,
      condition: inv.condition
    };
  });

  // gabungin data
  const data = warehouses.map((w) => ({
    warehouse_id: w._id,
    warehouse_name: w.warehouse_name,
    warehouse_code: w.warehouse_code,
    shelves: w.shelves.map((s) => {
      // stok di lemari ini
      const stokPerCondition = Object.values(stockMap)
        .filter(
          (st, idx) =>
            inventories[idx].warehouse.toString() === w._id.toString() &&
            inventories[idx].shelf.toString() === s._id.toString()
        )
        .map((st) => ({
          condition: st.condition,
          on_hand: st.on_hand,
          on_loan: st.on_loan
        }));

      return {
        shelf_id: s._id,
        shelf_name: s.shelf_name,
        shelf_code: s.shelf_code,
        stock: stokPerCondition
      };
    })
  }));

  res.status(200).json({ success: true, data });
});

const getProductList = asyncHandler(async (req, res) => {
  const data = await Product.find().select('brand product_code');
  res.json({ success: true, data });
});

module.exports = {
  // Tambah barang baru
  addProduct,
  getProducts,
  getProduct,
  removeProduct,
  updateProduct,
  getAllWarehouse,
  getShelvesByWarehouse,
  // Tambah stok
  addStock,
  getWarehousesAndShelvesWithStock, // Dropdown khusus munculin stok
  getProductList
};
