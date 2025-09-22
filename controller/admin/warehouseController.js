const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const { uploadBuffer, getFileUrl, deleteFile } = require('../../utils/wasabi');
const formatDate = require('../../utils/formatDate');
const path = require('path');

const { checkDuplicateValue } = require('../../middleware/checkDuplicate');
const Warehouse = require('../../model/warehouseModel');
const Shelf = require('../../model/shelfModel');
const Product = require('../../model/productModel');
const Loan = require('../../model/loanModel');
const mongoose = require('mongoose');

const addWarehouse = asyncHandler(async (req, res) => {
  const {
    warehouse_code,
    warehouse_name,
    description,
    shelves = []
  } = req.body || {};

  if (!warehouse_code || !warehouse_name) {
    throwError('Field ini harus diisi', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let imageData = null;
    if (req.file) {
      const file = req.file;
      const ext = path.extname(file.originalname);
      const key = `gudang/${warehouse_code}/${warehouse_name}_${formatDate()}${ext}`;

      await uploadBuffer(key, file.buffer);

      imageData = {
        key,
        contentType: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      };
    }

    const [warehouse] = await Warehouse.create(
      [
        {
          warehouse_code,
          warehouse_name,
          warehouse_image: imageData,
          description
        }
      ],
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

    res.status(201).json({
      warehouse: { ...warehouse.toObject() },
      shelves: createdShelves
    });
  } catch (err) {
    await session.abortTransaction();
    throwError(err.message || 'Gagal membuat gudang', 400);
  } finally {
    session.endSession();
  }
});

const getShelvesByWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const shelves = await Shelf.find({ warehouse: id }).select('shelf_name');
  res.json({ success: true, data: shelves });
});

const getWarehouses = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { warehouse_code, warehouse_name, search, sort } = req.query;

  const filter = {};
  if (warehouse_code)
    filter.warehouse_code = { $regex: warehouse_code, $options: 'i' };
  if (warehouse_name)
    filter.warehouse_name = { $regex: warehouse_name, $options: 'i' };
  if (search) {
    filter.$or = [
      { warehouse_code: { $regex: search, $options: 'i' } },
      { warehouse_name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const warehouses = await Warehouse.find(filter)
    .populate('shelves', 'shelf_name shelf_code')
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  const totalItems = await Warehouse.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  const warehousesWithUrls = await Promise.all(
    warehouses.map(async (w) => {
      let imageUrl = null;
      if (w.warehouse_image?.key) {
        imageUrl = await getFileUrl(w.warehouse_image.key);
      }
      return { ...w, warehouse_image_url: imageUrl };
    })
  );

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages,
    sort: sortOption,
    data: warehousesWithUrls
  });
});

const removeWarehouse = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const warehouse = await Warehouse.findById(req.params.id).session(session);
    if (!warehouse) throwError('Gudang tidak ditemukan!', 404);

    if (warehouse.warehouse_image?.key) {
      await deleteFile(warehouse.warehouse_image.key);
    }

    await Shelf.updateMany(
      { warehouse: warehouse._id },
      { $set: { warehouse: null } },
      { session }
    );

    await Product.updateMany(
      { warehouse: warehouse._id },
      { $set: { warehouse: null } },
      { session }
    );

    await Loan.updateMany(
      { warehouse: warehouse._id },
      { $set: { warehouse: null } },
      { session }
    );

    await warehouse.deleteOne({ session });

    await session.commitTransaction();
    res.status(200).json({ message: 'Gudang berhasil dihapus.' });
  } catch (err) {
    await session.abortTransaction();
    throwError(err.message || 'Gagal menghapus gudang', 400);
  } finally {
    session.endSession();
  }
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const { warehouse_code, warehouse_name, description, shelves } =
    req.body || {};

  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) throwError('Gudang yang anda cari tidak ada!', 404);

  if (req.file) {
    const file = req.file;

    if (warehouse.warehouse_image?.key) {
      await deleteFile(warehouse.warehouse_image.key);
    }

    const ext = path.extname(file.originalname);
    const key = `gudang/${warehouse_code}/${warehouse_name}_${formatDate()}${ext}`;

    await uploadBuffer(key, file.buffer);

    warehouse.warehouse_image = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  warehouse.warehouse_code = warehouse_code || warehouse.warehouse_code;
  warehouse.warehouse_name = warehouse_name || warehouse.warehouse_name;
  warehouse.description = description || warehouse.description;
  warehouse.shelves = shelves || warehouse.shelves;

  await warehouse.save();

  let imageUrl = null;
  if (warehouse.warehouse_image?.key) {
    imageUrl = await getFileUrl(warehouse.warehouse_image.key);
  }

  res.status(200).json({
    ...warehouse.toObject(),
    warehouse_image_url: imageUrl
  });
});

const getWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id)
    .populate('shelves', 'shelf_name shelf_code')
    .lean();

  if (!warehouse) throwError('Gudang yang anda cari tidak ada!', 404);

  let imageUrl = null;
  if (warehouse.warehouse_image?.key) {
    imageUrl = await getFileUrl(warehouse.warehouse_image.key);
  }

  res.status(200).json({
    ...warehouse,
    warehouse_image_url: imageUrl
  });
});

module.exports = {
  addWarehouse,
  getWarehouses,
  removeWarehouse,
  updateWarehouse,
  getWarehouse,
  getShelvesByWarehouse
};
