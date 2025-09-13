const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../../model/productModel');
const ProductCirculation = require('../../model/productCirculationModel');
const Inventory = require('../../model/inventoryModel');
const StockChangeLog = require('../../model/stockLogModel');
const Warehouse = require('../../model/warehouseModel');
const Shelf = require('../../model/shelfModel');
const User = require('../../model/userModel');
const { uploadBuffer, getFileUrl } = require('../../utils/wasabi');
const path = require('path');
const formatDate = require('../../utils/formatDate');
const throwError = require('../../utils/throwError');

const addNewProductInInventory = asyncHandler(async (req, res) => {
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
      initial_stock // { warehouse, shelf, condition, quantity }
    } = req.body;

    if (typeof initial_stock === 'string') {
      try {
        initial_stock = JSON.parse(initial_stock);
      } catch (e) {
        throwError('Format initial_stock tidak valid (harus JSON)', 400);
      }
    }

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

    // 2. Buat Inventory awal
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
      message: 'Barang baru berhasil ditambahkan lewat Inventory',
      product,
      inventory
    });
  } catch (err) {
    await session.abortTransaction();
    throwError(
      err.message || 'Gagal menambahkan barang baru lewat Inventory',
      400
    );
  } finally {
    session.endSession();
  }
});

const addStock = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      product,
      warehouse,
      shelf,
      condition = 'Baik',
      quantity
    } = req.body;

    if (!product || !warehouse || !shelf || !quantity) {
      throwError(
        'Semua field wajib diisi (product, warehouse, shelf, quantity)',
        400
      );
    }

    // cari inventory existing
    const existing = await Inventory.findOne({
      product,
      warehouse,
      shelf,
      condition
    }).session(session);

    let inventory, message;

    if (existing) {
      // update stok existing
      inventory = await Inventory.findOneAndUpdate(
        { product, warehouse, shelf, condition },
        {
          $inc: { on_hand: quantity },
          $set: { last_in_at: new Date() }
        },
        { new: true, session }
      );
      message = 'Stok berhasil ditambah';
    } else {
      // buat record baru
      inventory = await Inventory.create(
        [
          {
            product,
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
    throwError(err.message || 'Gagal menambah stok', 400);
  } finally {
    session.endSession();
  }
});

const getInventory = asyncHandler(async (req, res) => {
  const { product, warehouse, shelf, condition, search, sort } = req.query;

  const filter = {};
  if (product) filter.product = product;
  if (warehouse) filter.warehouse = warehouse;
  if (shelf) filter.shelf = shelf;
  if (condition) filter.condition = condition;

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const inventory = await Inventory.find(filter)
    .populate('product', 'product_code brand type category product_image')
    .populate('warehouse', 'warehouse_name')
    .populate('shelf', 'shelf_name')
    .sort(sortOption)
    .lean();

  const inventoryWithImages = await Promise.all(
    inventory.map(async (i) => {
      let imageUrl = null;
      if (i.product?.product_image?.key) {
        imageUrl = await getFileUrl(i.product.product_image.key);
      }
      return { ...i, product_image_url: imageUrl };
    })
  );

  res.status(200).json({ success: true, data: inventoryWithImages });
});

const getInventoryById = asyncHandler(async (req, res) => {
  const inventory = await Inventory.findById(req.params.id)
    .populate('product', 'product_code brand type category product_image')
    .populate('warehouse', 'warehouse_name')
    .populate('shelf', 'shelf_name')
    .lean();

  if (!inventory) throwError('Data inventory tidak ditemukan', 404);

  let imageUrl = null;
  if (inventory.product?.product_image?.key) {
    imageUrl = await getFileUrl(inventory.product.product_image.key);
  }

  res.status(200).json({
    success: true,
    data: {
      ...inventory,
      product_image_url: imageUrl
    }
  });
});

const updateInventory = asyncHandler(async (req, res) => {
  const { quantity, condition, warehouse, shelf } = req.body;

  const inventory = await Inventory.findById(req.params.id);
  if (!inventory) throwError('Data inventory tidak ditemukan', 404);

  if (quantity !== undefined) inventory.on_hand = quantity;
  if (condition) inventory.condition = condition;
  if (warehouse) inventory.warehouse = warehouse;
  if (shelf) inventory.shelf = shelf;

  await inventory.save();

  res.status(200).json({
    success: true,
    message: 'Inventory berhasil diperbarui',
    data: inventory
  });
});

const removeInventory = asyncHandler(async (req, res) => {
  const inventory = await Inventory.findById(req.params.id);
  if (!inventory) throwError('Data inventory tidak ditemukan', 404);

  await inventory.deleteOne();

  res
    .status(200)
    .json({ success: true, message: 'Inventory berhasil dihapus' });
});

const getWarehouses = asyncHandler(async (req, res) => {
  const data = await Warehouse.find().select('warehouse_name');
  res.json({ success: true, data });
});

const getShelvesByWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const shelves = await Shelf.find({ warehouse: id }).select('shelf_name');
  res.json({ success: true, data: shelves });
});

const getProductList = asyncHandler(async (req, res) => {
  const data = await Product.find().select('brand product_code');
  res.json({ success: true, data });
});

const getWarehousesWithStock = asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.find()
    .populate('shelves', 'shelf_name shelf_code')
    .select('warehouse_name warehouse_code shelves')
    .lean();

  // ambil total stok per gudang
  const totals = await Inventory.aggregate([
    {
      $group: {
        _id: '$warehouse',
        total_on_hand: { $sum: '$on_hand' },
        total_on_loan: { $sum: '$on_loan' }
      }
    }
  ]);

  const totalsMap = totals.reduce((acc, t) => {
    acc[t._id.toString()] = {
      total_on_hand: t.total_on_hand,
      total_on_loan: t.total_on_loan
    };
    return acc;
  }, {});

  const data = warehouses.map((w) => ({
    warehouse_id: w._id,
    warehouse_name: w.warehouse_name,
    warehouse_code: w.warehouse_code,
    shelves: w.shelves,
    total_on_hand: totalsMap[w._id.toString()]?.total_on_hand || 0,
    total_on_loan: totalsMap[w._id.toString()]?.total_on_loan || 0
  }));

  res.status(200).json({ success: true, data });
});

const getTotalByWarehouse = asyncHandler(async (req, res) => {
  const data = await Warehouse.aggregate([
    {
      $lookup: {
        from: 'inventories',
        localField: '_id',
        foreignField: 'warehouse',
        as: 'inventories'
      }
    },
    {
      $addFields: {
        total_on_hand: { $sum: '$inventories.on_hand' },
        total_on_loan: { $sum: '$inventories.on_loan' },
        total_products: { $size: { $setUnion: ['$inventories.product', []] } }
      }
    },
    {
      $project: {
        _id: 0,
        warehouse_id: '$_id',
        warehouse_name: 1,
        warehouse_code: 1,
        warehouse_image: 1,
        total_on_hand: 1,
        total_on_loan: 1,
        total_products: 1
      }
    }
  ]);

  // Hitung summary global
  const summary = data.reduce(
    (acc, w) => {
      acc.total_on_hand += w.total_on_hand || 0;
      acc.total_on_loan += w.total_on_loan || 0;
      acc.total_products += w.total_products || 0;
      return acc;
    },
    { total_on_hand: 0, total_on_loan: 0, total_products: 0 }
  );
  summary.total_all = summary.total_on_hand + summary.total_on_loan;

  // Generate signed URL
  const withUrls = await Promise.all(
    data.map(async (w) => {
      let image_url = null;
      if (w.warehouse_image?.key) {
        image_url = await getFileUrl(w.warehouse_image.key);
      }
      return { ...w, warehouse_image_url: image_url };
    })
  );

  res.status(200).json({ success: true, summary, data: withUrls });
});

const getTotalByShelf = asyncHandler(async (req, res) => {
  const { warehouse } = req.query;

  const matchStage = {};
  if (warehouse && mongoose.Types.ObjectId.isValid(warehouse)) {
    matchStage.warehouse = new mongoose.Types.ObjectId(warehouse);
  }

  const data = await Shelf.aggregate([
    ...(warehouse ? [{ $match: matchStage }] : []),

    {
      $lookup: {
        from: 'inventories',
        localField: '_id',
        foreignField: 'shelf',
        as: 'inventories'
      }
    },
    {
      $addFields: {
        total_on_hand: { $sum: '$inventories.on_hand' },
        total_on_loan: { $sum: '$inventories.on_loan' },
        total_products: { $size: { $setUnion: ['$inventories.product', []] } }
      }
    },
    {
      $lookup: {
        from: 'warehouses',
        localField: 'warehouse',
        foreignField: '_id',
        as: 'warehouse'
      }
    },
    { $unwind: '$warehouse' },
    {
      $project: {
        _id: 0,
        shelf_id: '$_id',
        shelf_name: 1,
        shelf_code: 1,
        warehouse_id: '$warehouse._id',
        warehouse_name: '$warehouse.warehouse_name',
        warehouse_code: '$warehouse.warehouse_code',
        total_on_hand: 1,
        total_on_loan: 1,
        total_products: 1
      }
    }
  ]);

  // Summary global
  const summary = data.reduce(
    (acc, s) => {
      acc.total_on_hand += s.total_on_hand || 0;
      acc.total_on_loan += s.total_on_loan || 0;
      acc.total_products += s.total_products || 0;
      return acc;
    },
    { total_on_hand: 0, total_on_loan: 0, total_products: 0 }
  );
  summary.total_all = summary.total_on_hand + summary.total_on_loan;

  res.status(200).json({ success: true, summary, data });
});

const dropdownWarehouseWithStock = asyncHandler(async (req, res) => {
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

const moveInventory = asyncHandler(async (req, res) => {
  const { inventoryId } = req.params;
  const { quantity_move, warehouse_to, shelf_to } = req.body;

  if (!quantity_move || quantity_move <= 0) {
    throwError('Jumlah barang yang dipindah harus lebih dari 0', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const inv = await Inventory.findById(inventoryId)
      .populate('product')
      .session(session);

    if (!inv) throwError('Inventory asal tidak ditemukan', 404);

    if (quantity_move > inv.on_hand) {
      throwError(
        `Stok tidak mencukupi. Maksimal bisa pindah ${inv.on_hand}`,
        400
      );
    }

    inv.on_hand -= quantity_move;
    await inv.save({ session });
    if (inv.on_hand <= 0 && inv.on_loan <= 0) {
      await Inventory.deleteOne({ _id: inv._id }, { session });
    }
    let target = await Inventory.findOne({
      product: inv.product._id,
      warehouse: warehouse_to,
      shelf: shelf_to,
      condition: inv.condition
    }).session(session);

    if (target) {
      target.on_hand += quantity_move;
      await target.save({ session });
    } else {
      target = await Inventory.create(
        [
          {
            product: inv.product._id,
            warehouse: warehouse_to,
            shelf: shelf_to,
            condition: inv.condition,
            on_hand: quantity_move,
            on_loan: 0
          }
        ],
        { session }
      );
    }

    const user = await User.findById(req.user.id).select('name');
    await ProductCirculation.create(
      [
        {
          product: inv.product._id,
          product_code: inv.product.product_code,
          product_name: inv.product.brand,
          product_image: inv.product.product_image,
          warehouse_from: inv.warehouse._id,
          shelf_from: inv.shelf?._id || null,
          warehouse_to,
          shelf_to,
          moved_by: req.user.id,
          moved_by_name: user?.name || 'Admin'
        }
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: 'Barang berhasil dipindahkan',
      from: { id: inv._id, remaining: inv.on_hand },
      to: {
        id: target._id,
        warehouse: warehouse_to,
        shelf: shelf_to,
        added: quantity_move
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

const updateStock = asyncHandler(async (req, res) => {
  const { inventoryId } = req.params;
  const { change, note } = req.body;

  if (!change || change === 0) {
    throwError('Perubahan stok harus lebih dari 0 atau kurang dari 0', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const inv = await Inventory.findById(inventoryId)
      .populate('product', 'product_code brand')
      .session(session);
    if (!inv) throwError('Inventory tidak ditemukan', 404);

    const newStock = inv.on_hand + change;
    if (newStock < 0) {
      throwError('Stok tidak boleh kurang dari 0', 400);
    }

    inv.on_hand = newStock;
    await inv.save({ session });

    const user = await User.findById(req.user.id).select('name').lean();
    if (!user) throwError('User tidak ditemukan', 404);

    await StockChangeLog.create(
      [
        {
          inventory: inv._id,
          product_code: inv.product.product_code,
          brand: inv.product.brand,
          change,
          note,
          changed_by: req.user.id,
          changed_by_name: user.name
        }
      ],
      { session }
    );

    await session.commitTransaction();
    res.status(200).json({
      message: 'Stok berhasil diperbarui',
      new_stock: inv.on_hand
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const changeCondition = asyncHandler(async (req, res) => {
  const { inventoryId } = req.params;
  const { quantity, new_condition, warehouse_to, shelf_to } = req.body;

  const user = await User.findById(req.user.id).select('name').lean();
  if (!user) throwError('User tidak ditemukan', 404);

  if (!quantity || quantity <= 0) {
    throwError('Jumlah barang yang diubah harus lebih dari 0', 400);
  }
  if (!new_condition) {
    throwError('Kondisi baru wajib diisi', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const inv = await Inventory.findById(inventoryId)
      .populate('product')
      .populate('warehouse')
      .populate('shelf')
      .session(session);

    if (!inv) throwError('Inventory asal tidak ditemukan', 404);
    if (quantity > inv.on_hand) {
      throwError(`Jumlah melebihi stok tersedia (${inv.on_hand})`, 400);
    }

    inv.on_hand -= quantity;
    await inv.save({ session });
    if (inv.on_hand <= 0 && inv.on_loan <= 0) {
      await Inventory.deleteOne({ _id: inv._id }, { session });
    }

    const targetWarehouse = warehouse_to || inv.warehouse._id;
    const targetShelf = shelf_to || inv.shelf?._id;

    let target = await Inventory.findOne({
      product: inv.product._id,
      warehouse: targetWarehouse,
      shelf: targetShelf,
      condition: new_condition
    }).session(session);

    if (target) {
      target.on_hand += quantity;
      await target.save({ session });
    } else {
      target = new Inventory({
        product: inv.product._id,
        warehouse: targetWarehouse,
        shelf: targetShelf,
        condition: new_condition,
        on_hand: quantity,
        on_loan: 0
      });
      await target.save({ session });
    }

    const logOut = new StockChangeLog({
      product: inv.product._id,
      product_code: inv.product.product_code,
      brand: inv.product.brand,
      quantity: -quantity,
      condition: inv.condition,
      warehouse: inv.warehouse._id,
      shelf: inv.shelf?._id,
      changed_by_name: user.name
    });
    await logOut.save({ session });

    const logIn = new StockChangeLog({
      product: target.product,
      product_code: inv.product.product_code,
      brand: inv.product.brand,
      quantity: quantity,
      condition: new_condition,
      warehouse: targetWarehouse,
      shelf: targetShelf,
      changed_by_name: user.name
    });
    await logIn.save({ session });

    // 🔹 Kalau pindah lokasi, catat ke ProductCirculation
    if (
      warehouse_to &&
      warehouse_to.toString() !== inv.warehouse._id.toString()
    ) {
      const circ = new ProductCirculation({
        product: inv.product._id,
        product_code: inv.product.product_code,
        product_name: inv.product.brand,
        quantity,
        condition: new_condition,
        warehouse_from: inv.warehouse._id,
        shelf_from: inv.shelf?._id || null,
        warehouse_to,
        shelf_to,
        moved_by_id: req.user.id,
        moved_by_name: user.name
      });
      await circ.save({ session });
    }

    await session.commitTransaction();
    res.status(200).json({
      message: 'Kondisi barang berhasil diubah',
      from: {
        id: inv._id,
        condition: inv.condition,
        remaining: inv.on_hand
      },
      to: {
        id: target._id,
        condition: new_condition,
        added: quantity,
        warehouse: targetWarehouse,
        shelf: targetShelf
      }
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

module.exports = {
  // Tambah barang baru
  addNewProductInInventory,
  getWarehouses,
  getShelvesByWarehouse,
  // Tambah stok
  addStock,
  getInventory,
  getInventoryById,
  updateInventory,
  removeInventory,
  getProductList,
  getWarehousesWithStock,
  dropdownWarehouseWithStock,
  // Dashboard
  getTotalByWarehouse,
  getTotalByShelf,
  // Utility
  moveInventory,
  updateStock,
  changeCondition
};
