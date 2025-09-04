const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');
const generateVoucherNumber = require('../utils/generateVoucher');
const ExpenseRequest = require('../model/expenseRequestModel');
const Employee = require('../model/employeeModel');
const RAP = require('../model/rapModel');

function mapPaymentPrefix(voucherPrefix) {
  switch (voucherPrefix) {
    case 'PDLAP':
      return 'PVLAP';
    case 'PDOFC':
      return 'PVOFC';
    case 'PDPYR':
      return 'PVPYR';
    default:
      return null;
  }
}

function mapExpenseType(expenseType) {
  switch (expenseType) {
    case 'Persiapan Pekerjaan':
      return 'persiapan_pekerjaan';
    case 'Operasional Lapangan':
      return 'operasional_lapangan';
    case 'Operasional Tenaga Ahli':
      return 'operasional_tenaga_ahli';
    case 'Sewa Alat':
      return 'sewa_alat';
    case 'Operasional Lab':
      return 'operasional_lab';
    case 'Pajak':
      return 'pajak';
    case 'Biaya Lain':
      return 'biaya_lain_lain';
    default:
      return null;
  }
}

const addExpenseRequest = asyncHandler(async (req, res) => {
  const {
    name,
    project,
    voucher_prefix,
    expense_type,
    submission_date,
    method,
    bank_account_number,
    bank,
    bank_branch,
    bank_account_holder,
    description,
    details = []
  } = req.body || {};

  if (
    !name ||
    !project ||
    !voucher_prefix ||
    !expense_type ||
    !method ||
    !details.length
  ) {
    throwError('Field wajib tidak boleh kosong', 400);
  }

  const normalizedDetails = details.map((item) => {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    return { ...item, amount: qty * unitPrice };
  });

  const total_amount = normalizedDetails.reduce(
    (acc, curr) => acc + curr.amount,
    0
  );

  const voucher_number = await generateVoucherNumber(voucher_prefix);

  const expenseRequest = await ExpenseRequest.create({
    name,
    project,
    voucher_prefix,
    voucher_number,
    payment_voucher: null,
    expense_type,
    submission_date,
    method,
    bank_account_number: method === 'Transfer' ? bank_account_number : null,
    bank: method === 'Transfer' ? bank : null,
    bank_branch: method === 'Transfer' ? bank_branch : null,
    bank_account_holder: method === 'Transfer' ? bank_account_holder : null,
    description,
    details: normalizedDetails,
    total_amount,
    status: 'Diproses'
  });

  res.status(201).json({
    message: 'Pengajuan biaya berhasil dibuat',
    data: expenseRequest
  });
});

const getExpenseRequests = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { status, voucher_prefix, expense_type, search } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (voucher_prefix) filter.voucher_prefix = voucher_prefix;
  if (expense_type) filter.expense_type = expense_type;
  if (search) {
    filter.$or = [
      { voucher_number: { $regex: search, $options: 'i' } },
      { payment_voucher: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const [totalItems, requests] = await Promise.all([
    ExpenseRequest.countDocuments(filter),
    ExpenseRequest.find(filter)
      .populate('name', 'name')
      .populate('project', 'project_name')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
  ]);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data: requests
  });
});

const getExpenseRequest = asyncHandler(async (req, res) => {
  const expenseRequest = await ExpenseRequest.findById(req.params.id)
    .populate('name', 'name')
    .populate('project', 'project_name')
    .populate('approved_by', 'name')
    .populate('paid_by', 'name');

  if (!expenseRequest) throwError('Pengajuan biaya tidak ditemukan', 404);

  res.status(200).json(expenseRequest);
});

const updateExpenseRequest = asyncHandler(async (req, res) => {
  const expenseRequest = await ExpenseRequest.findById(req.params.id);
  if (!expenseRequest) throwError('Pengajuan biaya tidak ditemukan', 404);

  const prevStatus = expenseRequest.status;
  const newStatus = req.body.status;
  const userRole = req.user?.role;

  // kalau ada details → hitung ulang
  if (req.body.details && Array.isArray(req.body.details)) {
    req.body.details = req.body.details.map((item) => {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      return { ...item, amount: qty * unitPrice };
    });
    req.body.total_amount = req.body.details.reduce(
      (acc, curr) => acc + curr.amount,
      0
    );
  }

  if (userRole === 'admin') {
    Object.assign(expenseRequest, req.body);

    if (req.body.method) {
      if (req.body.method === 'Tunai') {
        expenseRequest.bank_account_number = null;
        expenseRequest.bank = null;
        expenseRequest.bank_branch = null;
        expenseRequest.bank_account_holder = null;
      } else if (req.body.method === 'Transfer') {
        expenseRequest.bank_account_number =
          req.body.bank_account_number || null;
        expenseRequest.bank = req.body.bank || null;
        expenseRequest.bank_branch = req.body.bank_branch || null;
        expenseRequest.bank_account_holder =
          req.body.bank_account_holder || null;
      }
    }

    if (prevStatus !== newStatus) {
      if (
        newStatus === 'Disetujui' &&
        req.body.paid_by &&
        !mongoose.Types.ObjectId.isValid(req.body.paid_by)
      ) {
        throwError('ID karyawan tidak valid untuk paid_by', 400);
      }

      if (prevStatus !== 'Disetujui' && newStatus === 'Disetujui') {
        const paymentPrefix = mapPaymentPrefix(expenseRequest.voucher_prefix);
        if (!paymentPrefix) throwError('Prefix voucher tidak valid', 400);
        expenseRequest.payment_voucher = await generateVoucherNumber(
          paymentPrefix
        );

        expenseRequest.approved_by = req.user.id;
        expenseRequest.paid_by = req.body.paid_by || null;

        // update RAP.jumlah (tambah)
        for (const item of expenseRequest.details) {
          const group = mapExpenseType(expenseRequest.expense_type);
          if (group && item.category) {
            await RAP.updateOne(
              { _id: expenseRequest.project },
              { $inc: { [`${group}.${item.category}.jumlah`]: item.amount } }
            );
          }
        }
      }

      if (prevStatus === 'Disetujui' && newStatus !== 'Disetujui') {
        expenseRequest.payment_voucher = null;
        expenseRequest.approved_by = null;
        expenseRequest.paid_by = null;

        // rollback RAP.jumlah (kurang)
        for (const item of expenseRequest.details) {
          const group = mapExpenseType(expenseRequest.expense_type);
          if (group && item.category) {
            await RAP.updateOne(
              { _id: expenseRequest.project },
              { $inc: { [`${group}.${item.category}.jumlah`]: -item.amount } }
            );
          }
        }
      }
    }
  } else {
    // === Karyawan ===
    const { status, approved_by, paid_by, ...allowedUpdates } = req.body;
    Object.assign(expenseRequest, allowedUpdates);

    if (req.body.method) {
      if (req.body.method === 'Tunai') {
        expenseRequest.bank_account_number = null;
        expenseRequest.bank = null;
        expenseRequest.bank_branch = null;
        expenseRequest.bank_account_holder = null;
      } else if (req.body.method === 'Transfer') {
        expenseRequest.bank_account_number =
          req.body.bank_account_number || null;
        expenseRequest.bank = req.body.bank || null;
        expenseRequest.bank_branch = req.body.bank_branch || null;
        expenseRequest.bank_account_holder =
          req.body.bank_account_holder || null;
      }
    }

    // reset status kalau ada perubahan biaya
    if (req.body.details || req.body.total_amount || req.body.description) {
      expenseRequest.status = 'Diproses';
      expenseRequest.payment_voucher = null;
      expenseRequest.approved_by = null;
      expenseRequest.paid_by = null;
    }
  }

  await expenseRequest.save();

  res.status(200).json({
    message: 'Pengajuan biaya berhasil diperbarui',
    data: expenseRequest
  });
});

const deleteExpenseRequest = asyncHandler(async (req, res) => {
  const expenseRequest = await ExpenseRequest.findById(req.params.id);
  if (!expenseRequest) throwError('Pengajuan biaya tidak ditemukan', 404);

  const userRole = req.user?.role;

  if (userRole !== 'admin' && expenseRequest.status !== 'Diproses') {
    throwError(
      'Karyawan hanya boleh menghapus pengajuan dengan status Diproses',
      403
    );
  }

  if (expenseRequest.status === 'Disetujui') {
    for (const item of expenseRequest.details) {
      const group = mapExpenseType(expenseRequest.expense_type);
      if (group && item.category) {
        await RAP.updateOne(
          { _id: expenseRequest.project },
          { $inc: { [`${group}.${item.category}.jumlah`]: -item.amount } }
        );
      }
    }
  }

  await expenseRequest.deleteOne();

  res.status(200).json({ message: 'Pengajuan biaya berhasil dihapus' });
});

const getCategoriesByExpenseType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { expense_type } = req.query;

  const rap = await RAP.findById(id).lean();
  if (!rap) throwError('RAP tidak ditemukan', 404);

  let categories = [];
  switch (expense_type) {
    case 'Persiapan Pekerjaan':
      categories = Object.keys(rap.persiapan_pekerjaan || {});
      break;
    case 'Operasional Lapangan':
      categories = Object.keys(rap.operasional_lapangan || {});
      break;
    case 'Operasional Tenaga Ahli':
      categories = Object.keys(rap.operasional_tenaga_ahli || {});
      break;
    case 'Sewa Alat':
      categories = Object.keys(rap.sewa_alat || {});
      break;
    case 'Operasional Lab':
      categories = Object.keys(rap.operasional_lab || {});
      break;
    case 'Pajak':
      categories = Object.keys(rap.pajak || {});
      break;
    case 'Biaya Lain':
      categories = Object.keys(rap.biaya_lain_lain || {});
      break;
    default:
      throwError('Jenis biaya tidak valid', 400);
  }

  res.status(200).json({ expense_type, categories });
});

const getAllEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.find().select('name');

  res.json(employee);
});

const getAllProject = asyncHandler(async (req, res) => {
  const project = await RAP.find().select('project_name');

  res.json(project);
});

module.exports = {
  addExpenseRequest,
  getExpenseRequests,
  getExpenseRequest,
  updateExpenseRequest,
  deleteExpenseRequest,
  getCategoriesByExpenseType,
  getAllEmployee,
  getAllProject
};
