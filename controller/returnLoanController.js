const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const path = require('path');
const throwError = require('../utils/throwError');
const Loan = require('../model/loanModel');
const Product = require('../model/productModel');
const Employee = require('../model/employeeModel');
const Warehouse = require('../model/warehouseModel');
const Shelf = require('../model/shelfModel');
const loanCirculationModel = require('../model/loanCirculationModel');
const productCirculationModel = require('../model/productCirculationModel');
const ReturnLoan = require('../model/returnLoanModel');
const { uploadBuffer, deleteFile, getFileUrl } = require('../utils/wasabi');
const formatDate = require('../utils/formatDate');

const createReturnLoan = asyncHandler(async (req, res) => {
  const {
    loan_number,
    borrower,
    position,
    report_date,
    return_date,
    inventory_manager
  } = req.body || {};
  let returned_items = [];
  if (req.body.returned_items) {
    try {
      const parsed = Array.isArray(req.body.returned_items)
        ? req.body.returned_items
        : JSON.parse(req.body.returned_items);

      if (!Array.isArray(parsed)) {
        throwError('returned_items harus berupa array', 400);
      }
      returned_items = parsed;
    } catch (e) {
      throwError('Format returned_items tidak valid', 400);
    }
  }

  if (!loan_number || returned_items.length === 0) {
    throwError('Nomor peminjaman dan daftar barang wajib diisi!', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loan_number }).session(session);
    if (!loan) throwError('Peminjaman tidak ditemukan!', 404);

    const circulation = await loanCirculationModel
      .findOne({ loan_number })
      .session(session);
    if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

    const [returnLoan] = await ReturnLoan.create(
      [
        {
          loan_number,
          borrower,
          position,
          report_date,
          return_date,
          inventory_manager,
          returned_items: []
        }
      ],
      { session }
    );

    for (let i = 0; i < returned_items.length; i++) {
      const ret = returned_items[i];
      const product = await Product.findById(ret.product).session(session);
      if (!product) throwError('Produk tidak ditemukan', 404);

      const circItem = circulation.borrowed_items.id(ret._id);

      if (ret.condition_new === 'Hilang') {
        // Barang hilang → hanya kurangi loan_quantity
        product.loan_quantity -= ret.quantity;
        await product.save({ session });

        ret.proof_image = null;
        if (circItem) {
          circItem.item_status = 'Hilang';
          circItem.return_date_circulation = return_date || new Date();
        }
      } else {
        // Barang kembali normal (Baik / Rusak / Maintenance)
        product.quantity += ret.quantity;
        product.loan_quantity -= ret.quantity;
        product.warehouse = ret.warehouse_return || product.warehouse;
        product.shelf = ret.shelf_return || product.shelf;
        product.condition = ret.condition_new || product.condition;
        await product.save({ session });

        const file = req.files?.[`bukti_${i + 1}`]?.[0];
        if (file) {
          const ext = path.extname(file.originalname);
          const key = `bukti_pengembalian_barang/${loan_number}/bukti_${
            i + 1
          }_${formatDate()}${ext}`;
          await uploadBuffer(file.buffer, key, file.mimetype);

          ret.proof_image = {
            key,
            contentType: file.mimetype,
            size: file.size,
            uploadedAt: new Date()
          };
        }

        if (circItem) {
          circItem.item_status = 'Dikembalikan';
          circItem.return_date_circulation = return_date || new Date();
        }

        // Catat perpindahan hanya kalau ada barang fisik
        await productCirculationModel.create(
          [
            {
              product: product._id,
              product_code: product.product_code,
              product_name: product.brand,
              product_image: product.product_image,
              warehouse_from: loan.warehouse,
              shelf_from: loan.shelf,
              warehouse_to: ret.warehouse_return,
              shelf_to: ret.shelf_return,
              return_loan_id: returnLoan._id
            }
          ],
          { session }
        );
      }

      returnLoan.returned_items.push(ret);
    }

    await returnLoan.save({ session });
    await circulation.save({ session });

    // Kalau semua status sudah Dikembalikan atau Hilang → selesai
    const allReturned = circulation.borrowed_items.every((it) =>
      ['Dikembalikan', 'Hilang'].includes(it.item_status)
    );
    if (allReturned) {
      loan.circulation_status = 'Selesai';
      await loan.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(returnLoan);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

const getAllReturnLoan = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  let filter = {};

  if (req.user.role === 'karyawan') {
    const employee = await Employee.findOne({ user: req.user.id }).select(
      'name'
    );
    if (!employee) throwError('Karyawan tidak ditemukan', 404);

    filter = { borrower: employee._id };
  }

  const totalItems = await ReturnLoan.countDocuments(filter);

  let data = await ReturnLoan.find(filter)
    .populate('returned_items.product', 'product_code brand')
    .populate('returned_items.warehouse_return', 'warehouse_name')
    .populate('returned_items.shelf_return', 'shelf_name')
    .populate('returned_items.project', 'project_name')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  for (const rl of data) {
    rl.returned_items = await Promise.all(
      rl.returned_items.map(async (item) => {
        let proof_url = null;
        if (item.proof_image?.key) {
          proof_url = await getFileUrl(item.proof_image.key);
        }
        return { ...item, proof_url };
      })
    );
  }

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data
  });
});

const getReturnLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const returnLoan = await ReturnLoan.findById(id)
    .populate('returned_items.product', 'product_code brand')
    .populate('returned_items.warehouse_return', 'warehouse_name')
    .populate('returned_items.shelf_return', 'shelf_name')
    .populate('returned_items.project', 'project_name')
    .lean();

  if (!returnLoan) throwError('Data pengembalian tidak ditemukan', 404);

  // 🚨 Validasi kepemilikan kalau karyawan
  if (req.user.role === 'karyawan') {
    const employee = await Employee.findOne({ user: req.user.id }).select(
      'name'
    );
    if (
      !employee ||
      returnLoan.borrower.toString() !== employee._id.toString()
    ) {
      throwError('Tidak punya akses ke data ini', 403);
    }
  }

  returnLoan.returned_items = await Promise.all(
    returnLoan.returned_items.map(async (item) => {
      let proof_url = null;
      if (item.proof_image?.key) {
        proof_url = await getFileUrl(item.proof_image.key, 60 * 5);
      }
      return { ...item, proof_url };
    })
  );

  res.status(200).json(returnLoan);
});

const updateReturnLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  let returned_items = [];
  if (req.body.returned_items) {
    try {
      const parsed = Array.isArray(req.body.returned_items)
        ? req.body.returned_items
        : JSON.parse(req.body.returned_items);

      if (!Array.isArray(parsed)) {
        throwError('returned_items harus berupa array', 400);
      }
      returned_items = parsed;
    } catch (e) {
      throwError('Format returned_items tidak valid', 400);
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const returnLoan = await ReturnLoan.findById(id).session(session);
    if (!returnLoan) throwError('Data pengembalian tidak ditemukan', 404);

    const circulation = await loanCirculationModel
      .findOne({ loan_number: returnLoan.loan_number })
      .session(session);
    if (!circulation) throwError('Sirkulasi tidak ditemukan', 404);

    for (let i = 0; i < returned_items.length; i++) {
      const ret = returned_items[i];
      const oldItem = returnLoan.returned_items.id(ret._id);
      if (!oldItem) throwError('Barang tidak valid di return loan', 400);

      if (ret.condition_new) oldItem.condition_new = ret.condition_new;
      if (ret.warehouse_return) oldItem.warehouse_return = ret.warehouse_return;
      if (ret.shelf_return) oldItem.shelf_return = ret.shelf_return;

      const file = req.files?.[`bukti_${i + 1}`]?.[0];
      if (ret.condition_new === 'Hilang') {
        // Pastikan bukti kosong
        if (oldItem.proof_image?.key) {
          await deleteFile(oldItem.proof_image.key);
        }
        oldItem.proof_image = null;

        const circItem = circulation.borrowed_items.id(ret._id);
        if (circItem) {
          circItem.item_status = 'Hilang';
          circItem.return_date_circulation =
            req.body.return_date || returnLoan.return_date || new Date();
        }
      } else if (file) {
        // Update foto
        if (oldItem.proof_image?.key) await deleteFile(oldItem.proof_image.key);
        const ext = path.extname(file.originalname);
        const key = `bukti_pengembalian_barang/${
          returnLoan.loan_number
        }/bukti_${i + 1}_${formatDate()}${ext}`;
        await uploadBuffer(file.buffer, key, file.mimetype);
        oldItem.proof_image = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };

        const circItem = circulation.borrowed_items.id(ret._id);
        if (circItem) {
          circItem.item_status = 'Dikembalikan';
          circItem.return_date_circulation =
            req.body.return_date || returnLoan.return_date || new Date();
        }
      }

      // Update histori pergerakan hanya untuk barang fisik
      if (ret.condition_new !== 'Hilang') {
        await productCirculationModel.findOneAndUpdate(
          { product: oldItem.product, return_loan_id: returnLoan._id },
          {
            $set: {
              warehouse_to: ret.warehouse_return,
              shelf_to: ret.shelf_return
            }
          },
          { session }
        );
      }
    }

    await returnLoan.save({ session });
    await circulation.save({ session });

    await session.commitTransaction();
    session.endSession();
    res.status(200).json(returnLoan);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

const deleteReturnLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const returnLoan = await ReturnLoan.findById(id).session(session);
    if (!returnLoan) throwError('Data pengembalian tidak ditemukan', 404);

    const loan = await Loan.findOne({
      loan_number: returnLoan.loan_number
    }).session(session);
    const circulation = await loanCirculationModel
      .findOne({ loan_number: returnLoan.loan_number })
      .session(session);
    if (!loan || !circulation)
      throwError('Data peminjaman tidak ditemukan', 404);

    for (const item of returnLoan.returned_items) {
      const product = await Product.findById(item.product).session(session);
      if (product) {
        if (item.condition_new === 'Hilang') {
          // Barang hilang dihapus → restore ke loan_quantity
          product.loan_quantity += item.quantity;
        } else {
          // Barang kembali dihapus → rollback stok
          product.quantity -= item.quantity;
          product.loan_quantity += item.quantity;
        }
        await product.save({ session });
      }

      const circItem = circulation.borrowed_items.id(item._id);
      if (circItem) {
        circItem.item_status = 'Dipinjam';
        circItem.return_date_circulation = null;
      }

      if (item.proof_image?.key) await deleteFile(item.proof_image.key);
    }

    await circulation.save({ session });
    await productCirculationModel
      .deleteMany({ return_loan_id: returnLoan._id })
      .session(session);
    await returnLoan.deleteOne({ session });

    loan.circulation_status = 'Aktif';
    await loan.save({ session });

    await session.commitTransaction();
    session.endSession();
    res.status(200).json({
      message:
        'Laporan pengembalian & histori perpindahan dihapus, stok di-rollback.'
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

const getReturnForm = asyncHandler(async (req, res) => {
  const { loan_number } = req.params;

  const loan = await Loan.findOne({ loan_number })
    .populate('borrower', 'name position')
    .lean();

  if (!loan) throwError('Peminjaman tidak ditemukan!', 404);

  const circulation = await loanCirculationModel
    .findOne({ loan_number })
    .populate('borrowed_items.project', 'project_name')
    .select('borrowed_items')
    .lean();

  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  res.status(200).json({
    loan_number: loan.loan_number,
    borrower: loan.borrower?.name || loan.borrower,
    position: loan.position || loan.borrower?.position || null,
    inventory_manager: loan.inventory_manager,
    items: circulation.borrowed_items.map((it) => ({
      _id: it._id,
      product: it.product,
      product_code: it.product_code,
      brand: it.brand,
      quantity: it.quantity,
      item_status: it.item_status,
      project: it.project?._id || null,
      project_name: it.project?.project_name || null
    }))
  });
});

const getAllEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.find().select('name');
  if (!employee) throwError('Karyawan tidak ada', 404);

  res.status(200).json(employee);
});

const getAllWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.find().select('warehouse_name');

  res.json(warehouse);
});

const getShelvesByWarehouse = asyncHandler(async (req, res) => {
  const { warehouse } = req.query;
  if (!warehouse) throwError('ID gudang tidak valid', 400);

  const shelves = await Shelf.find({ warehouse }).select('shelf_name');

  res.json(shelves);
});

const getMyLoanNumbers = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user.id }).select(
    '_id name'
  );
  if (!employee) throwError('Karyawan tidak ditemukan', 404);

  const loans = await Loan.find({
    borrower: employee._id,
    approval: 'Disetujui',
    circulation_status: 'Aktif'
  })
    .select('loan_number')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    borrower: employee.name,
    loan_numbers: loans.map((loan) => ({
      id: loan._id,
      loan_number: loan.loan_number
    }))
  });
});

module.exports = {
  createReturnLoan,
  deleteReturnLoan,
  getAllReturnLoan,
  getReturnLoan,
  getReturnForm,
  updateReturnLoan,
  getShelvesByWarehouse,
  getAllWarehouse,
  getAllEmployee,
  getMyLoanNumbers
};
