const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');
const generateVoucherNumber = require('../utils/generateVoucher');
const ExpenseRequest = require('../model/expenseRequestModel');
const Employee = require('../model/employeeModel');
const RAP = require('../model/rapModel');
const expenseRequestModel = require('../model/expenseRequestModel');

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
    details = [],
    approved_by,
    paid_by,
    status: reqStatus // ambil dari body kalau admin
  } = req.body || {};

  console.log('Role:', req.user.role, 'Status:', req.body.status);
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

  // hitung amount per detail
  const normalizedDetails = details.map((item) => {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    return {
      ...item,
      category:
        typeof item.category === 'object' ? item.category.value : item.category, // normalize category
      amount: qty * unitPrice
    };
  });

  const total_amount = normalizedDetails.reduce(
    (acc, curr) => acc + curr.amount,
    0
  );

  // generate nomor voucher (PDxxx)
  const voucher_number = await generateVoucherNumber(voucher_prefix);

  // tentukan status berdasarkan role
  let status;
  if (req.user?.role === 'karyawan') {
    status = 'Diproses';
  } else if (req.user?.role === 'admin') {
    status = reqStatus || 'Diproses';
    console.log('Masuk ke role admin');
  } else {
    status = 'Diproses';
    console.log('Disini');
  }

  // default
  let payment_voucher = null;
  let approvedBy = null;
  let paidBy = null;

  // kalau admin langsung setujui
  if (status === 'Disetujui' && req.user?.role === 'admin') {
    const paymentPrefix = mapPaymentPrefix(voucher_prefix);
    if (!paymentPrefix) throwError('Prefix voucher tidak valid', 400);
    payment_voucher = await generateVoucherNumber(paymentPrefix);

    // isi approved_by & paid_by dari body
    if (approved_by) {
      if (!mongoose.Types.ObjectId.isValid(approved_by)) {
        throwError('ID approved_by tidak valid', 400);
      }
      approvedBy = approved_by;
    } else {
      throwError('Approved_by wajib diisi saat status Disetujui', 400);
    }

    if (paid_by) {
      if (!mongoose.Types.ObjectId.isValid(paid_by)) {
        throwError('ID paid_by tidak valid', 400);
      }
      paidBy = paid_by;
    } else {
      throwError('Paid_by wajib diisi saat status Disetujui', 400);
    }

    // update RAP.jumlah
    for (const item of normalizedDetails) {
      const group = mapExpenseType(expense_type);
      if (group && item.category) {
        await RAP.updateOne(
          { _id: project },
          { $inc: { [`${group}.${item.category}.jumlah`]: item.amount } }
        );
      }
    }
  }

  // create document
  const expenseRequest = await ExpenseRequest.create({
    name,
    project,
    voucher_prefix,
    voucher_number,
    payment_voucher,
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
    status,
    approved_by: approvedBy,
    paid_by: paidBy
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
  const userRole = req.user?.role;
  const updates = req.body;

  // ==== ADMIN ====
  if (userRole === 'Admin') {
    // 1. Voucher prefix berubah → generate nomor baru
    if (
      updates.voucher_prefix &&
      updates.voucher_prefix !== expenseRequest.voucher_prefix
    ) {
      expenseRequest.voucher_prefix = updates.voucher_prefix;
      expenseRequest.voucher_number = await generateVoucherNumber(
        updates.voucher_prefix
      );
    }

    // 2. Expense type berubah → reset details
    if (
      updates.expense_type &&
      updates.expense_type !== expenseRequest.expense_type
    ) {
      expenseRequest.expense_type = updates.expense_type;
      expenseRequest.details = [];
      expenseRequest.total_amount = 0;

      expenseRequest.status = 'Diproses';
      expenseRequest.payment_voucher = null;
      expenseRequest.approved_by = null;
      expenseRequest.paid_by = null;

      if (!updates.details || !Array.isArray(updates.details)) {
        throwError('Jenis biaya diubah, harap isi ulang detail keperluan', 400);
      }
    }

    // 3. Kalau ada details → hitung ulang total
    if (updates.details && Array.isArray(updates.details)) {
      expenseRequest.details = updates.details.map((item) => {
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        return {
          ...item,
          category:
            typeof item.category === 'object'
              ? item.category.value
              : item.category,
          amount: qty * unitPrice
        };
      });

      expenseRequest.total_amount = expenseRequest.details.reduce(
        (acc, curr) => acc + curr.amount,
        0
      );
    }

    // 4. Update field dasar
    if (updates.description !== undefined)
      expenseRequest.description = updates.description;
    if (updates.method !== undefined) expenseRequest.method = updates.method;

    // 5. Handle method bank
    if (updates.method === 'Tunai') {
      expenseRequest.bank_account_number = null;
      expenseRequest.bank = null;
      expenseRequest.bank_branch = null;
      expenseRequest.bank_account_holder = null;
    } else if (updates.method === 'Transfer') {
      expenseRequest.bank_account_number =
        updates.bank_account_number ?? expenseRequest.bank_account_number;
      expenseRequest.bank = updates.bank ?? expenseRequest.bank;
      expenseRequest.bank_branch =
        updates.bank_branch ?? expenseRequest.bank_branch;
      expenseRequest.bank_account_holder =
        updates.bank_account_holder ?? expenseRequest.bank_account_holder;
    }

    // 6. Cek perubahan status
    const newStatus = updates.status;
    if (newStatus && prevStatus !== newStatus) {
      if (newStatus === 'Disetujui') {
        if (!updates.approved_by)
          throwError('approved_by wajib diisi saat menyetujui', 400);
        if (!mongoose.Types.ObjectId.isValid(updates.approved_by))
          throwError('ID approved_by tidak valid', 400);

        expenseRequest.approved_by = updates.approved_by;

        if (updates.paid_by) {
          if (!mongoose.Types.ObjectId.isValid(updates.paid_by))
            throwError('ID paid_by tidak valid', 400);
          expenseRequest.paid_by = updates.paid_by;
        }

        const paymentPrefix = mapPaymentPrefix(expenseRequest.voucher_prefix);
        if (!paymentPrefix) throwError('Prefix voucher tidak valid', 400);
        expenseRequest.payment_voucher = await generateVoucherNumber(
          paymentPrefix
        );

        // Tambah dana ke RAP.jumlah
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

      expenseRequest.status = newStatus;
    }
  }

  // ==== KARYAWAN ====
  else {
    const { status, approved_by, paid_by, ...allowedUpdates } = updates;

    // update field aman
    if (allowedUpdates.description !== undefined)
      expenseRequest.description = allowedUpdates.description;
    if (allowedUpdates.method !== undefined)
      expenseRequest.method = allowedUpdates.method;

    if (allowedUpdates.details && Array.isArray(allowedUpdates.details)) {
      expenseRequest.details = allowedUpdates.details.map((item) => {
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        return {
          ...item,
          category:
            typeof item.category === 'object'
              ? item.category.value
              : item.category,
          amount: qty * unitPrice
        };
      });
      expenseRequest.total_amount = expenseRequest.details.reduce(
        (acc, curr) => acc + curr.amount,
        0
      );
    }

    if (allowedUpdates.method === 'Tunai') {
      expenseRequest.bank_account_number = null;
      expenseRequest.bank = null;
      expenseRequest.bank_branch = null;
      expenseRequest.bank_account_holder = null;
    } else if (allowedUpdates.method === 'Transfer') {
      expenseRequest.bank_account_number =
        allowedUpdates.bank_account_number ??
        expenseRequest.bank_account_number;
      expenseRequest.bank = allowedUpdates.bank ?? expenseRequest.bank;
      expenseRequest.bank_branch =
        allowedUpdates.bank_branch ?? expenseRequest.bank_branch;
      expenseRequest.bank_account_holder =
        allowedUpdates.bank_account_holder ??
        expenseRequest.bank_account_holder;
    }

    // reset status kalau ada perubahan
    if (
      allowedUpdates.details ||
      allowedUpdates.total_amount ||
      allowedUpdates.description ||
      allowedUpdates.method ||
      allowedUpdates.expense_type
    ) {
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

const categoryLabels = {
  // PERSIAPAN PEKERJAAN
  biaya_survey_awal_lapangan: 'Biaya Survey Awal Lapangan',
  uang_saku_survey_osa: 'Uang Saku Survey / OSA',
  biaya_perizinan_koordinasi_lokasi: 'Biaya Perizinan / Koordinasi @Lokasi',
  akomodasi_surveyor: 'Akomodasi Surveyor',
  mobilisasi_demobilisasi_alat: 'Mobilisasi dan Demobilisasi Alat',
  mobilisasi_demobilisasi_tim: 'Mobilisasi dan Demobilisasi Tim',
  akomodasi_tim: 'Akomodasi Tim',
  penginapan_mess: 'Penginapan / Mess',
  biaya_kalibrasi_alat_mesin: 'Biaya Kalibrasi Alat / Mesin',
  biaya_accessories_alat_mesin: 'Biaya Accessories Alat / Mesin',
  biaya_asuransi_tim: 'Biaya Asuransi Tim',
  biaya_apd: 'Biaya APD',
  biaya_atk: 'Biaya ATK',

  // OPERASIONAL LAPANGAN
  gaji: 'Gaji',
  gaji_tenaga_lokal: 'Gaji Tenaga Lokal',
  uang_makan: 'Uang Makan',
  uang_wakar: 'Uang Wakar',
  akomodasi_transport: 'Akomodasi Transport',
  mobilisasi_demobilisasi_titik: 'Mobilisasi + Demobilisasi / Titik',
  biaya_rtk_takterduga: 'Biaya RTK / Tak Terduga',

  // OPERASIONAL TENAGA AHLI
  penginapan: 'Penginapan',
  transportasi_akomodasi_lokal: 'Transportasi & Akomodasi Lokal',
  transportasi_akomodasi_site: 'Transportasi & Akomodasi Site',
  uang_makan_ta: 'Uang Makan',
  osa: 'Osa',
  fee_tenaga_ahli: 'Fee Tenaga Ahli',

  // SEWA ALAT
  alat_sondir: 'Alat Sondir',
  alat_bor: 'Alat Bor',
  alat_cptu: 'Alat CPTu',
  alat_topography: 'Alat Topography',
  alat_geolistrik: 'Alat Geolistrik',

  // OPERASIONAL LAB
  ambil_sample: 'Ambil Sample',
  packaging_sample: 'Packaging Sample',
  kirim_sample: 'Kirim Sample',
  uji_lab_vendor_luar: 'Uji Lab Vendor Luar',
  biaya_perlengkapan_lab: 'Biaya Perlengkapan Lab',
  alat_uji_lab: 'Alat Uji Lab',

  // PAJAK
  pajak_tenaga_ahli: 'Pajak Tenaga Ahli',
  pajak_sewa: 'Pajak Sewa',
  pajak_pph_final: 'Pajak PPh Final',
  pajak_lapangan: 'Pajak Lapangan',
  pajak_ppn: 'Pajak PPN',

  // BIAYA LAIN-LAIN
  scf: 'SCF',
  admin_bank: 'Admin Bank'
};

const getCategoriesByExpenseType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { expense_type } = req.query;

  const rap = await RAP.findById(id).lean();
  if (!rap) throwError('RAP tidak ditemukan', 404);

  let keys = [];

  switch (expense_type) {
    case 'Persiapan Pekerjaan':
      keys = Object.keys(rap.persiapan_pekerjaan || {});
      break;
    case 'Operasional Lapangan':
      keys = Object.keys(rap.operasional_lapangan || {});
      break;
    case 'Operasional Tenaga Ahli':
      keys = Object.keys(rap.operasional_tenaga_ahli || {});
      break;
    case 'Sewa Alat':
      keys = Object.keys(rap.sewa_alat || {});
      break;
    case 'Operasional Lab':
      keys = Object.keys(rap.operasional_lab || {});
      break;
    case 'Pajak':
      keys = Object.keys(rap.pajak || {});
      break;
    case 'Biaya Lain':
      keys = Object.keys(rap.biaya_lain_lain || {});
      break;
    default:
      throwError('Jenis biaya tidak valid', 400);
  }

  const categories = keys.map((key) => ({
    value: key, // untuk disimpan di DB
    label: categoryLabels[key] || key // untuk ditampilkan di FE
  }));

  res.status(200).json({ expense_type, categories });
});

const getAllEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.find().select('name');
  if (!employee) throwError('Karyawan tidak ada', 404);

  res.status(200).json(employee);
});

const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user.id }).select('name');

  if (!employee) throwError('Data karyawan tidak ditemukan', 404);

  res.status(200).json(employee);
});

const getMyExpenseRequests = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const employee = await Employee.findOne({ user: req.user.id }).select('name');
  console.log(req.user.id);
  console.log(employee);

  if (!employee) throwError('Karyawan tidak ditemukan', 404);

  const filter = { name: employee._id };

  const [totalItems, requests] = await Promise.all([
    ExpenseRequest.countDocuments(filter),
    ExpenseRequest.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .populate('project', 'project_name')
      .populate('approved_by', 'name')
      .populate('paid_by', 'name')
  ]);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data: requests
  });
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
  getEmployee,
  getMyExpenseRequests,
  getAllProject
};
