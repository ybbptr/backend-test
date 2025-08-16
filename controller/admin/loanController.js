const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const throwError = require('../../utils/throwError');
const Loan = require('../../model/loanModel');
const Employee = require('../../model/employeeModel');
const Product = require('../../model/productModel');
const Warehouse = require('../../model/warehouseModel');
const loanCirculationModel = require('../../model/loanCirculationModel');

const addLoan = asyncHandler(async (req, res) => {
  const {
    loan_number,
    loan_date,
    return_date,
    employee,
    approval,
    warehouse,
    product,
    loan_quantity
  } = req.body || {};

  // Validasi field wajib
  if (
    !loan_number ||
    !loan_date ||
    !return_date ||
    !employee ||
    !warehouse ||
    !product ||
    !loan_quantity
  ) {
    throwError('Field ini harus diisi', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const item = await Product.findById(product).session(session);
    if (!item) throwError('Produk tidak ditemukan', 404);

    // ====== Cek stok kalau Disetujui ======
    if (approval === 'Disetujui') {
      if (!item.warehouse) throwError('Produk belum punya gudang asal', 400);
      if (item.quantity <= 0)
        throwError('Stok barang kosong, tidak dapat dipinjam', 400);
      if (item.quantity < loan_quantity)
        throwError('Stok barang tidak mencukupi', 400);

      item.quantity -= loan_quantity;
      item.loan_quantity = loan_quantity;
      await item.save({ session });
    }

    // ====== Buat Loan ======
    const loan_item = await Loan.create(
      [
        {
          loan_number,
          loan_date,
          return_date,
          employee,
          approval,
          warehouse,
          product,
          loan_quantity
        }
      ],
      { session }
    );

    if (approval === 'Disetujui') {
      await loanCirculationModel.create(
        [
          {
            loan_id: loan_item[0]._id,
            product: item._id,
            product_name: item.product_name,
            loan_quantity,
            warehouse_from: item.warehouse,
            warehouse_to: warehouse,
            imageUrl: item.imageUrl
          }
        ],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(loan_item[0]);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

const getLoans = asyncHandler(async (req, res) => {
  const loan_items = await Loan.find().populate([
    { path: 'employee', select: 'name' },
    { path: 'product', select: 'product_name product_code quantity' },
    { path: 'warehouse', select: 'warehouse_name warehouse_code' }
  ]);

  res.status(200).json(loan_items);
});

const getLoan = asyncHandler(async (req, res) => {
  const loan_item = await Loan.findById(req.params.id).populate([
    { path: 'employee', select: 'name' },
    { path: 'product', select: 'product_name product_code quantity' },
    { path: 'warehouse', select: 'warehouse_name warehouse_code' }
  ]);
  if (!loan_item) throwError('Pengajuan tidak terdaftar!', 400);

  res.status(200).json(loan_item);
});

const removeLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan_item = await Loan.findById(req.params.id).session(session);
    if (!loan_item) throwError('Pengajuan tidak terdaftar!', 400);

    const item = await Product.findById(loan_item.product).session(session);
    if (!item) throwError('Produk tidak ditemukan', 404);

    if (loan_item.approval === 'Disetujui') {
      item.quantity += loan_item.loan_quantity;
      item.loan_quantity = loan_item.loan_quantity;

      await item.save({ session });
    }

    // ===== Hapus sirkulasi terkait =====
    await loanCirculationModel
      .deleteMany({ loan_id: loan_item._id })
      .session(session);

    await loan_item.deleteOne({ session });

    await session.commitTransaction();
    session.endSession();

    res
      .status(200)
      .json({ message: 'Pengajuan dan sirkulasi terkait berhasil dihapus.' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

const updateLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      loan_number,
      loan_date,
      return_date,
      employee,
      approval,
      warehouse,
      product,
      loan_quantity
    } = req.body || {};

    const loan_item = await Loan.findById(req.params.id).session(session);
    if (!loan_item) throwError('Pengajuan tidak terdaftar!', 404);

    const item = await Product.findById(product || loan_item.product).session(
      session
    );
    if (!item) throwError('Produk tidak ditemukan', 404);

    // ====== Kondisi update stok ======

    // 1. Dari belum disetujui → Disetujui
    if (loan_item.approval !== 'Disetujui' && approval === 'Disetujui') {
      if (item.quantity < loan_quantity) {
        throwError('Stok tidak mencukupi', 400);
      }
      item.quantity -= loan_quantity;
      item.loan_quantity = loan_quantity;

      await item.save({ session });

      await loanCirculationModel.create(
        [
          {
            loan_id: loan_item._id,
            product: item._id,
            product_name: item.product_name,
            loan_quantity,
            warehouse_from: item.warehouse,
            warehouse_to: warehouse,
            imageUrl: item.imageUrl
          }
        ],
        { session }
      );
    }

    // 2. Dari Disetujui → Ditolak/Diproses (balikin stok)
    if (loan_item.approval === 'Disetujui' && approval !== 'Disetujui') {
      item.quantity += loan_item.loan_quantity;
      item.loan_quantity = loan_quantity;

      await item.save({ session });
    }

    // 3. Sama-sama Disetujui, tapi jumlah berubah
    if (loan_item.approval === 'Disetujui' && approval === 'Disetujui') {
      const diff = loan_quantity - loan_item.loan_quantity;
      if (diff > 0) {
        // Pinjam lebih banyak
        if (item.quantity < diff) {
          throwError('Stok tidak mencukupi', 400);
        }
        item.quantity -= diff;
      } else if (diff < 0) {
        // Balikin sebagian
        item.quantity += Math.abs(diff);
      }
      item.loan_quantity = loan_quantity;

      await item.save({ session });
    }

    loan_item.loan_number = loan_number || loan_item.loan_number;
    loan_item.loan_date = loan_date || loan_item.loan_date;
    loan_item.return_date = return_date || loan_item.return_date;
    loan_item.employee = employee || loan_item.employee;
    loan_item.approval = approval || loan_item.approval;
    loan_item.warehouse = warehouse || loan_item.warehouse;
    loan_item.product = product || loan_item.product;
    loan_item.loan_quantity = loan_quantity || loan_item.loan_quantity;

    await loan_item.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json(loan_item);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

const getAllEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.find().select('name');

  res.json(employee);
});

const getAllProduct = asyncHandler(async (req, res) => {
  const product = await Product.find().select('product_code product_name');

  res.json(product);
});

const getAllWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.find().select(
    'warehouse_code warehouse_name'
  );

  res.json(warehouse);
});

module.exports = {
  addLoan,
  getLoans,
  getLoan,
  removeLoan,
  updateLoan,
  getAllEmployee,
  getAllProduct,
  getAllWarehouse
};
