const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');

const throwError = require('../utils/throwError');
const generateVoucherNumber = require('../utils/generateVoucher');
const ExpenseRequest = require('../model/expenseRequestModel');
const ExpenseLog = require('../model/expenseLogModel');
const Employee = require('../model/employeeModel');
const RAP = require('../model/rapModel');

/* ================= Helpers ================= */
function mapPaymentPrefix(voucherPrefix) {
  const mappings = { PDLAP: 'PVLAP', PDOFC: 'PVOFC', PDPYR: 'PVPYR' };
  return mappings[voucherPrefix] || null;
}
function mapExpenseType(expenseType) {
  const mappings = {
    'Persiapan Pekerjaan': 'persiapan_pekerjaan',
    'Operasional Lapangan': 'operasional_lapangan',
    'Operasional Tenaga Ahli': 'operasional_tenaga_ahli',
    'Sewa Alat': 'sewa_alat',
    'Operasional Lab': 'operasional_lab',
    Pajak: 'pajak',
    'Biaya Lain': 'biaya_lain_lain'
  };
  return mappings[expenseType] || null;
}
const num = (x) => Number(x) || 0;

/* ================= Create ================= */
const addExpenseRequest = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      // name: requester (Employee) — akan dioverride sesuai role
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
      status: reqStatus,
      note
    } = req.body || {};

    // Tentukan requester (field "name") berdasar role
    let requesterId = null;
    if (req.user?.role === 'admin') {
      // admin boleh pilih dari dropdown
      if (!req.body.name) {
        // fallback ke employee dari token jika ada
        const me = await Employee.findOne({ user: req.user.id }).select('_id');
        if (me) requesterId = me._id;
        else throwError('Requester (name) wajib dipilih oleh admin', 400);
      } else {
        if (!mongoose.Types.ObjectId.isValid(req.body.name))
          throwError('ID requester tidak valid', 400);
        const emp = await Employee.findById(req.body.name).select('_id');
        if (!emp) throwError('Requester tidak ditemukan', 404);
        requesterId = emp._id;
      }
    } else {
      // karyawan: selalu ambil dari token user
      const me = await Employee.findOne({ user: req.user.id }).select('_id');
      if (!me) throwError('Data karyawan tidak ditemukan', 404);
      requesterId = me._id;
    }

    if (
      !requesterId ||
      !project ||
      !voucher_prefix ||
      !expense_type ||
      !method ||
      !details.length
    ) {
      throwError('Field wajib tidak boleh kosong', 400);
    }

    // normalize details
    const normalizedDetails = details.map((item) => {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      return {
        ...item,
        category:
          typeof item.category === 'object'
            ? item.category.value
            : item.category,
        amount: qty * unitPrice,
        is_overbudget: false
      };
    });
    const total_amount = normalizedDetails.reduce(
      (acc, curr) => acc + curr.amount,
      0
    );

    const voucher_number = await generateVoucherNumber(voucher_prefix);

    // status & request_status
    let status, request_status;
    if (req.user?.role === 'karyawan') {
      status = 'Diproses';
      request_status = 'Pending';
    } else if (req.user?.role === 'admin') {
      status = reqStatus || 'Diproses';
      if (status === 'Disetujui') request_status = 'Aktif';
      else if (status === 'Ditolak') request_status = 'Ditolak';
      else request_status = 'Pending';
    } else {
      status = 'Diproses';
      request_status = 'Pending';
    }

    let payment_voucher = null;
    let approvedBy = null;
    let paidBy = null;

    if (status === 'Disetujui' && req.user?.role === 'admin') {
      const paymentPrefix = mapPaymentPrefix(voucher_prefix);
      if (!paymentPrefix) throwError('Prefix voucher tidak valid', 400);

      payment_voucher = await generateVoucherNumber(paymentPrefix);

      if (!approved_by || !mongoose.Types.ObjectId.isValid(approved_by)) {
        throwError('approved_by wajib diisi & valid', 400);
      }
      approvedBy = approved_by;

      if (!paid_by || !mongoose.Types.ObjectId.isValid(paid_by)) {
        throwError('paid_by wajib diisi & valid', 400);
      }
      paidBy = paid_by;

      const rap = await RAP.findById(project).session(session);
      if (!rap) throwError('RAP tidak ditemukan', 404);

      for (const item of normalizedDetails) {
        const group = mapExpenseType(expense_type);
        if (group && item.category && rap[group]?.[item.category]) {
          const biaya = rap[group][item.category];
          biaya.biaya_pengajuan = num(biaya.biaya_pengajuan) + item.amount;
          if (biaya.biaya_pengajuan > num(biaya.jumlah)) {
            biaya.is_overbudget = true;
            item.is_overbudget = true;
          }
        }
      }
      await rap.save({ session });
    }

    let finalnote = null;
    if (status === 'Ditolak') {
      if (!note) throwError('Alasan penolakan wajib diisi', 400);
      finalnote = note;
    }

    // create ExpenseRequest
    const [expenseRequest] = await ExpenseRequest.create(
      [
        {
          name: requesterId,
          project,
          voucher_prefix,
          voucher_number,
          payment_voucher,
          expense_type,
          submission_date,
          method,
          bank_account_number:
            method === 'Transfer' ? bank_account_number : null,
          bank: method === 'Transfer' ? bank : null,
          bank_branch: method === 'Transfer' ? bank_branch : null,
          bank_account_holder:
            method === 'Transfer' ? bank_account_holder : null,
          description,
          details: normalizedDetails,
          total_amount,
          status,
          request_status,
          approved_by: approvedBy,
          paid_by: paidBy,
          note: finalnote
        }
      ],
      { session }
    );

    // create ExpenseLog
    await ExpenseLog.create(
      [
        {
          voucher_number,
          payment_voucher,
          requester: requesterId,
          project,
          expense_type,
          details: normalizedDetails
        }
      ],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json({
      message: 'Pengajuan biaya berhasil dibuat',
      data: expenseRequest
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= Read ================= */
const getExpenseRequests = asyncHandler(async (req, res) => {
  const { status, voucher_prefix, expense_type, search } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

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

/* ================= Update ================= */
const updateExpenseRequest = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expenseRequest = await ExpenseRequest.findById(req.params.id).session(
      session
    );
    if (!expenseRequest) throwError('Pengajuan biaya tidak ditemukan', 404);

    const prevStatus = expenseRequest.status;
    const userRole = req.user?.role;
    const updates = req.body;

    // Admin boleh ganti requester (name)
    if (userRole === 'admin' && updates.name) {
      if (!mongoose.Types.ObjectId.isValid(updates.name))
        throwError('ID requester tidak valid', 400);
      const emp = await Employee.findById(updates.name).select('_id');
      if (!emp) throwError('Requester tidak ditemukan', 404);
      expenseRequest.name = emp._id;

      // sinkronkan log requester
      await ExpenseLog.updateOne(
        { voucher_number: expenseRequest.voucher_number },
        { $set: { requester: emp._id } },
        { session }
      );
    } else if (userRole !== 'admin') {
      // Non-admin tidak boleh ganti requester dari body
      delete updates.name;
    }

    if (userRole === 'admin') {
      if (
        updates.voucher_prefix &&
        updates.voucher_prefix !== expenseRequest.voucher_prefix
      ) {
        expenseRequest.voucher_prefix = updates.voucher_prefix;
        expenseRequest.voucher_number = await generateVoucherNumber(
          updates.voucher_prefix
        );
      }

      if (
        updates.expense_type &&
        updates.expense_type !== expenseRequest.expense_type
      ) {
        expenseRequest.expense_type = updates.expense_type;
        expenseRequest.details = [];
        expenseRequest.total_amount = 0;
        expenseRequest.status = 'Diproses';
        expenseRequest.request_status = 'Pending';
        expenseRequest.payment_voucher = null;
        expenseRequest.approved_by = null;
        expenseRequest.paid_by = null;

        if (!updates.details || !Array.isArray(updates.details)) {
          throwError(
            'Jenis biaya diubah, harap isi ulang detail keperluan',
            400
          );
        }
      }

      if (updates.details && Array.isArray(updates.details)) {
        const newDetails = updates.details.map((item) => {
          const qty = Number(item.quantity) || 0;
          const unitPrice = Number(item.unit_price) || 0;
          return {
            ...item,
            category:
              typeof item.category === 'object'
                ? item.category.value
                : item.category,
            amount: qty * unitPrice,
            is_overbudget: false
          };
        });
        const newTotal = newDetails.reduce((acc, curr) => acc + curr.amount, 0);

        if (expenseRequest.status === 'Disetujui') {
          const rap = await RAP.findById(expenseRequest.project).session(
            session
          );
          if (!rap) throwError('RAP tidak ditemukan', 404);

          const group = mapExpenseType(expenseRequest.expense_type);

          // rollback biaya lama
          for (const old of expenseRequest.details) {
            if (group && old.category && rap[group]?.[old.category]) {
              const b = rap[group][old.category];
              b.biaya_pengajuan = Math.max(
                0,
                num(b.biaya_pengajuan) - old.amount
              );
              if (num(b.biaya_pengajuan) <= num(b.jumlah)) {
                b.is_overbudget = false;
              }
            }
          }

          // apply biaya baru
          for (const item of newDetails) {
            if (group && item.category && rap[group]?.[item.category]) {
              const biaya = rap[group][item.category];
              biaya.biaya_pengajuan = num(biaya.biaya_pengajuan) + item.amount;
              if (biaya.biaya_pengajuan > num(biaya.jumlah)) {
                biaya.is_overbudget = true;
                item.is_overbudget = true;
              }
            }
          }

          await rap.save({ session });
        }

        // update expense request
        expenseRequest.details = newDetails;
        expenseRequest.total_amount = newTotal;

        await ExpenseLog.updateOne(
          { voucher_number: expenseRequest.voucher_number },
          { $set: { details: newDetails } },
          { session }
        );
      }

      // Update biasa
      if (updates.description !== undefined)
        expenseRequest.description = updates.description;
      if (updates.method !== undefined) expenseRequest.method = updates.method;
      if (updates.note !== undefined) expenseRequest.note = updates.note;

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

      // Status change
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

          // apply ke RAP
          const rap = await RAP.findById(expenseRequest.project).session(
            session
          );
          if (!rap) throwError('RAP tidak ditemukan', 404);

          for (const item of expenseRequest.details) {
            const group = mapExpenseType(expenseRequest.expense_type);
            if (group && item.category && rap[group]?.[item.category]) {
              const biaya = rap[group][item.category];
              biaya.biaya_pengajuan = num(biaya.biaya_pengajuan) + item.amount;
              if (biaya.biaya_pengajuan > num(biaya.jumlah)) {
                biaya.is_overbudget = true;
                item.is_overbudget = true;
              }
            }
          }
          await rap.save({ session });

          expenseRequest.request_status = 'Aktif';

          await ExpenseLog.findOneAndUpdate(
            { voucher_number: expenseRequest.voucher_number },
            {
              $set: {
                payment_voucher: expenseRequest.payment_voucher,
                requester: expenseRequest.name,
                project: expenseRequest.project,
                expense_type: expenseRequest.expense_type,
                details: expenseRequest.details
              }
            },
            { session, upsert: true }
          );
        }

        if (newStatus === 'Ditolak') {
          if (!updates.note)
            throwError('Alasan penolakan (note) wajib diisi', 400);

          expenseRequest.payment_voucher = null;
          expenseRequest.approved_by = null;
          expenseRequest.paid_by = null;
          expenseRequest.request_status = 'Ditolak';
          expenseRequest.note = updates.note;

          await ExpenseLog.deleteOne(
            { voucher_number: expenseRequest.voucher_number },
            { session }
          );
        }

        if (prevStatus === 'Disetujui' && newStatus !== 'Disetujui') {
          const rap = await RAP.findById(expenseRequest.project).session(
            session
          );
          if (rap) {
            for (const item of expenseRequest.details) {
              const group = mapExpenseType(expenseRequest.expense_type);
              if (group && item.category && rap[group]?.[item.category]) {
                const bucket = rap[group][item.category];
                bucket.biaya_pengajuan = Math.max(
                  0,
                  num(bucket.biaya_pengajuan) - item.amount
                );
                if (num(bucket.biaya_pengajuan) <= num(bucket.jumlah)) {
                  bucket.is_overbudget = false;
                }
              }
            }
            await rap.save({ session });
          }

          expenseRequest.payment_voucher = null;
          expenseRequest.approved_by = null;
          expenseRequest.paid_by = null;

          if (newStatus === 'Diproses')
            expenseRequest.request_status = 'Pending';

          await ExpenseLog.deleteOne(
            { voucher_number: expenseRequest.voucher_number },
            { session }
          );
        }

        expenseRequest.status = newStatus;
      }
    } else {
      // ================= Non-Admin =================
      const { status, approved_by, paid_by, note, name, ...allowedUpdates } =
        updates;

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
            amount: qty * unitPrice,
            is_overbudget: false
          };
        });
        expenseRequest.total_amount = expenseRequest.details.reduce(
          (acc, curr) => acc + curr.amount,
          0
        );

        await ExpenseLog.updateOne(
          { voucher_number: expenseRequest.voucher_number },
          { $set: { details: expenseRequest.details } },
          { session }
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

      // bila karyawan ubah konten, reset status → Diproses/Pending
      if (
        allowedUpdates.details ||
        allowedUpdates.total_amount ||
        allowedUpdates.description ||
        allowedUpdates.method ||
        allowedUpdates.expense_type
      ) {
        expenseRequest.status = 'Diproses';
        expenseRequest.request_status = 'Pending';
        expenseRequest.payment_voucher = null;
        expenseRequest.approved_by = null;
        expenseRequest.paid_by = null;

        await ExpenseLog.deleteOne(
          { voucher_number: expenseRequest.voucher_number },
          { session }
        );
      }
    }

    await expenseRequest.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      message: 'Pengajuan biaya berhasil diperbarui',
      data: expenseRequest
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= Delete ================= */
const deleteExpenseRequest = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    throwError('ID tidak valid', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expenseRequest = await ExpenseRequest.findById(req.params.id).session(
      session
    );
    if (!expenseRequest) throwError('Pengajuan biaya tidak ditemukan', 404);

    if (req.user?.role !== 'admin' && expenseRequest.status !== 'Diproses') {
      throwError(
        'Karyawan hanya boleh menghapus pengajuan dengan status Diproses',
        403
      );
    }

    if (expenseRequest.status === 'Disetujui') {
      throwError(
        'Pengajuan biaya yang sudah disetujui tidak bisa dihapus, silakan batalkan status dulu',
        400
      );
    }

    await expenseRequest.deleteOne({ session });
    await session.commitTransaction();

    res.status(200).json({ message: 'Pengajuan biaya berhasil dihapus' });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= Misc endpoints (tetap) ================= */
const categoryLabels = {
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
  gaji: 'Gaji',
  gaji_tenaga_lokal: 'Gaji Tenaga Lokal',
  uang_makan: 'Uang Makan',
  uang_wakar: 'Uang Wakar',
  akomodasi_transport: 'Akomodasi Transport',
  mobilisasi_demobilisasi_titik: 'Mobilisasi + Demobilisasi / Titik',
  biaya_rtk_takterduga: 'Biaya RTK / Tak Terduga',
  penginapan: 'Penginapan',
  transportasi_akomodasi_lokal: 'Transportasi & Akomodasi Lokal',
  transportasi_akomodasi_site: 'Transportasi & Akomodasi Site',
  uang_makan_ta: 'Uang Makan',
  osa: 'Osa',
  fee_tenaga_ahli: 'Fee Tenaga Ahli',
  alat_sondir: 'Alat Sondir',
  alat_bor: 'Alat Bor',
  alat_cptu: 'Alat CPTu',
  alat_topography: 'Alat Topography',
  alat_geolistrik: 'Alat Geolistrik',
  ambil_sample: 'Ambil Sample',
  packaging_sample: 'Packaging Sample',
  kirim_sample: 'Kirim Sample',
  uji_lab_vendor_luar: 'Uji Lab Vendor Luar',
  biaya_perlengkapan_lab: 'Biaya Perlengkapan Lab',
  alat_uji_lab: 'Alat Uji Lab',
  pajak_tenaga_ahli: 'Pajak Tenaga Ahli',
  pajak_sewa: 'Pajak Sewa',
  pajak_pph_final: 'Pajak PPh Final',
  pajak_lapangan: 'Pajak Lapangan',
  pajak_ppn: 'Pajak PPN',
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
    value: key,
    label: categoryLabels[key] || key
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

  const employee = await Employee.findOne({ user: req.user.id }).select(
    '_id name'
  );
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
