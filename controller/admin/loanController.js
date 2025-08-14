const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const throwError = require('../../utils/throwError');
const Loan = require('../../model/loanModel');
const Employee = require('../../model/employeeModel');
const Product = require('../../model/productModel');

const addLoan = asyncHandler(async (req, res) => {
  const {
    loan_number,
    loan_date,
    return_date,
    employee,
    approval,
    project_type,
    product,
    loan_quantity
  } = req.body || {};

  if (
    !loan_number ||
    !loan_date ||
    !return_date ||
    !employee ||
    !project_type ||
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

    if (approval === 'Disetujui') {
      if (item.quantity <= 0) {
        throwError('Stok barang kosong, tidak dapat dipinjam', 400);
      }

      if (item.quantity < loan_quantity) {
        throwError('Stok barang tidak mencukupi', 400);
      }
      item.quantity -= loan_quantity;
      await item.save({ session });
    }

    const loan_item = await Loan.create(
      [
        {
          loan_number,
          loan_date,
          return_date,
          employee,
          approval,
          project_type,
          product,
          loan_quantity
        }
      ],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json(loan_item[0]);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

const getLoans = asyncHandler(async (req, res) => {
  const loan_items = await Loan.find().populate('employee', 'name').exec();
  res.status(200).json(loan_items);
});

const getLoan = asyncHandler(async (req, res) => {
  const loan_item = await Loan.findById(req.params.id)
    .populate('employee', 'name')
    .exec();
  if (!loan_item) throwError('Pengajuan tidak terdaftar!', 400);

  res.status(200).json(loan_item);
});

const removeLoan = asyncHandler(async (req, res) => {
  const loan_item = await Loan.findById(req.params.id);
  if (!loan_item) throwError('Pengajuan tidak terdaftar!', 400);

  await loan_item.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Pengajuan berhasil dihapus.' });
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
      project_type,
      product,
      loan_quantity
    } = req.body || {};

    // Ambil data loan lama
    const loan_item = await Loan.findById(req.params.id).session(session);
    if (!loan_item) throwError('Pengajuan tidak terdaftar!', 404);

    // Ambil produk terkait
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
      await item.save({ session });
    }

    // 2. Dari Disetujui → Ditolak/Diproses (balikin stok)
    if (loan_item.approval === 'Disetujui' && approval !== 'Disetujui') {
      item.quantity += loan_item.loan_quantity;
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
      await item.save({ session });
    }

    // ====== Update field loan ======
    loan_item.loan_number = loan_number || loan_item.loan_number;
    loan_item.loan_date = loan_date || loan_item.loan_date;
    loan_item.return_date = return_date || loan_item.return_date;
    loan_item.employee = employee || loan_item.employee;
    loan_item.approval = approval || loan_item.approval;
    loan_item.project_type = project_type || loan_item.project_type;
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

module.exports = {
  addLoan,
  getLoans,
  getLoan,
  removeLoan,
  updateLoan,
  getAllEmployee,
  getAllProduct
};
