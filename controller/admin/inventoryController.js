const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../../model/productModel');
const ProductCirculation = require('../../model/productCirculationModel');
const Inventory = require('../../model/inventoryModel');
const Warehouse = require('../../model/warehouseModel');
const Shelf = require('../../model/shelfModel');
const { uploadBuffer, getFileUrl } = require('../../utils/wasabi');
const path = require('path');
const formatDate = require('../../utils/formatDate');
const throwError = require('../../utils/throwError');
const { resolveActor } = require('../../utils/actor');
const { applyAdjustment } = require('../../utils/stockAdjustment');

const normalizeId = (v) => (v ? String(v) : null);
const sameId = (a, b) => normalizeId(a) === normalizeId(b);

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
    const getNonEmptySingleFile = (fieldName) => {
      const aliasMap = {
        product_image: 'Gambar barang',
        invoice: 'Invoice pembelian barang'
      };

      const displayName = aliasMap[fieldName] || fieldName;

      const list = files[fieldName];
      if (!list || !list[0]) {
        throwError(`${displayName} wajib diupload.`, 400);
      }
      const f = list[0];

      // Robust check ukuran
      const size = typeof f.size === 'number' ? f.size : f.buffer?.length ?? 0;
      if (!f.buffer || size <= 0) {
        throwError(`${displayName} tidak boleh kosong atau korup.`, 400);
      }
      if (!f.mimetype) {
        throwError(`${displayName} tidak valid.`, 400);
      }
      if (!f.originalname) {
        throwError(`${displayName} tidak valid (nama file kosong).`, 400);
      }

      return f;
    };

    // === Wajib ada: product_image & invoice ===
    const productImageFile = getNonEmptySingleFile('product_image');
    const invoiceFile = getNonEmptySingleFile('invoice');

    // Upload gambar produk
    let productImageMeta = null;
    {
      const ext = path.extname(productImageFile.originalname);
      const key = `inventaris/${product_code}/${category}_${brand}_${type}_${formatDate()}${ext}`;
      await uploadBuffer(key, productImageFile.buffer, {
        contentType: productImageFile.mimetype
      });
      productImageMeta = {
        key,
        contentType: productImageFile.mimetype,
        size: productImageFile.size ?? productImageFile.buffer.length,
        uploadedAt: new Date()
      };
    }

    // Upload invoice
    let invoiceMeta = null;
    {
      const ext = path.extname(invoiceFile.originalname);
      const date = formatDate();
      const key = `inventaris/${product_code}/invoice_${date}${ext}`;
      await uploadBuffer(key, invoiceFile.buffer, {
        contentType: invoiceFile.mimetype
      });
      invoiceMeta = {
        key,
        contentType: invoiceFile.mimetype,
        size: invoiceFile.size ?? invoiceFile.buffer.length,
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
          'Stok awal harus menyertakan gudang, lemari, dan stok awal',
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

  const qty = Number(quantity_move);
  if (!Number.isFinite(qty) || qty <= 0) {
    throwError('Jumlah barang yang dipindah harus > 0', 400);
  }
  if (!warehouse_to) throwError('Gudang tujuan wajib diisi', 400);

  // Normalisasi shelf_to: izinkan null
  const targetWarehouse = warehouse_to;
  const targetShelf = shelf_to ?? null;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const src = await Inventory.findById(inventoryId)
      .populate('product', 'product_code brand')
      .populate('warehouse', 'warehouse_name')
      .populate('shelf', 'shelf_name')
      .session(session);

    if (!src) throwError('Inventory asal tidak ditemukan', 404);
    if (qty > src.on_hand) {
      throwError(`Stok tidak mencukupi. Stok tersisa : ${src.on_hand}`, 400);
    }

    const isSameWarehouse = sameId(targetWarehouse, src.warehouse?._id);
    const isSameShelf = sameId(targetShelf, src.shelf?._id);
    if (isSameWarehouse && isSameShelf) {
      throwError('Lokasi tujuan sama dengan lokasi asal.', 400);
    }

    let dst = await Inventory.findOne({
      product: src.product._id,
      warehouse: targetWarehouse,
      shelf: targetShelf,
      condition: src.condition
    }).session(session);

    if (!dst) {
      const [created] = await Inventory.create(
        [
          {
            product: src.product._id,
            warehouse: targetWarehouse,
            shelf: targetShelf,
            condition: src.condition,
            on_hand: 0,
            on_loan: 0
          }
        ],
        { session }
      );
      dst = created;
    }

    // Update stok fisik
    src.on_hand -= qty;
    src.last_out_at = new Date();
    await src.save({ session });

    dst.on_hand += qty;
    dst.last_in_at = new Date();
    await dst.save({ session });

    // Ledger (dua sisi) – catat arah yang benar di reason_note
    await applyAdjustment(session, {
      inventoryId: src._id,
      bucket: 'ON_HAND',
      delta: -qty,
      reason_code: 'MOVE_INTERNAL',
      reason_note: `Pindah ke gudang:${normalizeId(targetWarehouse)} lemari:${
        normalizeId(targetShelf) || '-'
      }`,
      actor,
      correlation: {
        from_inventory_id: src._id,
        to_inventory_id: dst._id,
        product_id: src.product._id,
        product_code: src.product.product_code
      }
    });
    await applyAdjustment(session, {
      inventoryId: dst._id,
      bucket: 'ON_HAND',
      delta: +qty,
      reason_code: 'MOVE_INTERNAL',
      reason_note: `Barang pindahan dari gudang:${normalizeId(
        src.warehouse?._id
      )} lemari:${normalizeId(src.shelf?._id) || '-'}`,
      actor,
      correlation: {
        from_inventory_id: src._id,
        to_inventory_id: dst._id,
        product_id: src.product._id,
        product_code: src.product.product_code
      }
    });

    // ProductCirculation – TRANSFER dengan path & kondisi lengkap
    await ProductCirculation.create(
      [
        {
          movement_type: 'TRANSFER',
          reason_note: 'Barang di pindah secara internal',
          product: src.product._id,
          product_code: src.product.product_code,
          product_name: src.product.brand,
          quantity: qty,

          inventory_from: src._id,
          inventory_to: dst._id,

          warehouse_from: src.warehouse?._id || null,
          shelf_from: src.shelf?._id || null,
          warehouse_to: targetWarehouse,
          shelf_to: targetShelf,

          from_condition: src.condition,
          to_condition: src.condition,

          loan_id: null,
          loan_number: null,
          return_loan_id: null,

          moved_by: req.user.id,
          moved_by_model: 'User',
          moved_by_name: req.user.name
        }
      ],
      { session }
    );

    // Bersihkan src jika 0/0
    if (src.on_hand <= 0 && src.on_loan <= 0) {
      await Inventory.deleteOne({ _id: src._id }, { session });
    }

    await session.commitTransaction();
    res.status(200).json({
      message: 'Barang berhasil dipindahkan',
      from: {
        id: src._id,
        warehouse: src.warehouse?._id || null,
        shelf: src.shelf?._id || null,
        remaining: Math.max(src.on_hand, 0)
      },
      to: {
        id: dst._id,
        warehouse: targetWarehouse,
        shelf: targetShelf,
        added: qty
      }
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
  const { quantity, new_condition, warehouse_to, shelf_to, note } = req.body;

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throwError('Jumlah barang yang diubah harus > 0', 400);
  }
  if (!new_condition) throwError('Kondisi baru wajib diisi', 400);

  const targetWarehouse = warehouse_to ?? null;
  const targetShelf = typeof shelf_to !== 'undefined' ? shelf_to : null;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const src = await Inventory.findById(inventoryId)
      .populate('product', 'product_code brand')
      .populate('warehouse', 'warehouse_name')
      .populate('shelf', 'shelf_name')
      .session(session);

    if (!src) throwError('Inventory asal tidak ditemukan', 404);
    if (qty > src.on_hand) {
      throwError(`Jumlah melebihi stok tersedia (${src.on_hand})`, 400);
    }

    const finalWarehouse = targetWarehouse ?? src.warehouse?._id ?? null;
    const finalShelf =
      typeof shelf_to !== 'undefined' ? targetShelf : src.shelf?._id ?? null;

    let dst = await Inventory.findOne({
      product: src.product._id,
      warehouse: finalWarehouse,
      shelf: finalShelf,
      condition: new_condition
    }).session(session);

    if (!dst) {
      const [created] = await Inventory.create(
        [
          {
            product: src.product._id,
            warehouse: finalWarehouse,
            shelf: finalShelf,
            condition: new_condition,
            on_hand: 0,
            on_loan: 0
          }
        ],
        { session }
      );
      dst = created;
    }

    // Update stok fisik
    src.on_hand -= qty;
    src.last_out_at = new Date();
    await src.save({ session });

    dst.on_hand += qty;
    dst.last_in_at = new Date();
    await dst.save({ session });

    const movedWarehouse = !sameId(finalWarehouse, src.warehouse?._id);
    const movedShelf = !sameId(finalShelf, src.shelf?._id);

    const reasonCmp = `Ubah kondisi ${src.condition} → ${new_condition}${
      movedWarehouse || movedShelf ? ' & pindah lokasi' : ''
    }`;

    // Ledger (dua sisi) – alasan konsisten
    await applyAdjustment(session, {
      inventoryId: src._id,
      bucket: 'ON_HAND',
      delta: -qty,
      reason_code: 'CHANGE_CONDITION',
      reason_note: note || reasonCmp,
      actor,
      correlation: {
        from_inventory_id: src._id,
        to_inventory_id: dst._id,
        product_id: src.product._id,
        product_code: src.product.product_code
      }
    });
    await applyAdjustment(session, {
      inventoryId: dst._id,
      bucket: 'ON_HAND',
      delta: +qty,
      reason_code: 'CHANGE_CONDITION',
      reason_note: note || reasonCmp,
      actor,
      correlation: {
        from_inventory_id: src._id,
        to_inventory_id: dst._id,
        product_id: src.product._id,
        product_code: src.product.product_code
      }
    });

    // ProductCirculation – selalu catat CONDITION_CHANGE (baik pindah lokasi atau tidak)
    await ProductCirculation.create(
      [
        {
          movement_type: 'CONDITION_CHANGE',
          reason_note: note || null,

          product: src.product._id,
          product_code: src.product.product_code,
          product_name: src.product.brand,
          quantity: qty,

          inventory_from: src._id,
          inventory_to: dst._id,

          warehouse_from: src.warehouse?._id || null,
          shelf_from: src.shelf?._id || null,
          warehouse_to: finalWarehouse,
          shelf_to: finalShelf,

          from_condition: src.condition,
          to_condition: new_condition,

          loan_id: null,
          loan_number: null,
          return_loan_id: null,

          moved_by: req.user.id,
          moved_by_model: 'User',
          moved_by_name: req.user.name
        }
      ],
      { session }
    );

    // Bersihkan src kalau 0/0
    if (src.on_hand <= 0 && src.on_loan <= 0) {
      await Inventory.deleteOne({ _id: src._id }, { session });
    }

    await session.commitTransaction();
    res.status(200).json({
      message: 'Perubahan kondisi berhasil',
      from: {
        id: src._id,
        warehouse: src.warehouse?._id || null,
        shelf: src.shelf?._id || null,
        condition: src.condition,
        remaining: Math.max(src.on_hand, 0)
      },
      to: {
        id: dst._id,
        warehouse: finalWarehouse,
        shelf: finalShelf,
        condition: new_condition,
        added: qty
      }
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const updateStock = asyncHandler(async (req, res) => {
  const { inventoryId } = req.params;
  let { delta, change, note } = req.body;

  // kompatibel ke belakang: terima "change" juga
  const qty = Number(delta ?? change);
  if (!Number.isFinite(qty) || qty === 0) {
    throwError('Perubahan stok tidak boleh nol (0)', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const inv = await Inventory.findById(inventoryId)
      .populate('product', 'product_code brand')
      .session(session);
    if (!inv) throwError('Inventory tidak ditemukan', 404);

    const after = inv.on_hand + qty;
    if (after < 0) throwError('Stok tidak boleh kurang dari 0', 400);

    // update stok
    inv.on_hand = after;
    if (qty > 0) inv.last_in_at = new Date();
    if (qty < 0) inv.last_out_at = new Date();
    await inv.save({ session });

    // ledger
    const actor = await resolveActor(req, session);
    await applyAdjustment(session, {
      inventoryId: inv._id,
      bucket: 'ON_HAND',
      delta: qty,
      reason_code: 'MANUAL_CORRECTION',
      reason_note: note || 'Koreksi jumlah stok secara manual',
      actor,
      correlation: {
        inventory_id: inv._id,
        product_id: inv.product?._id,
        product_code: inv.product?.product_code
      }
    });

    // hapus doc jika 0/0
    if (inv.on_hand <= 0 && inv.on_loan <= 0) {
      await Inventory.deleteOne({ _id: inv._id }, { session });
    }

    await session.commitTransaction();
    res.status(200).json({
      message: 'Stok berhasil diperbarui',
      on_hand: Math.max(after, 0)
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
