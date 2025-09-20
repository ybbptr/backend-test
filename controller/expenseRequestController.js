// controllers/expenseRequestController.js
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

// GANTI semua const num = (x) => Number(x) || 0;
const num = (x) => {
  if (x === null || x === undefined) return 0;
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;

  // buang simbol selain digit, koma, titik, minus (handle "Rp 2.500.000", "2,000,000", dll)
  let s = String(x)
    .trim()
    .replace(/[^\d.,-]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  // tentukan pemisah desimal (jika ada kedua-duanya, ambil yang terakhir muncul)
  let decimalSep = null;
  if (lastComma !== -1 && lastDot !== -1) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (lastComma !== -1) {
    decimalSep = ',';
  } else if (lastDot !== -1) {
    decimalSep = '.';
  }

  if (decimalSep) {
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    // hapus pemisah ribuan
    s = s.split(thousandsSep).join('');
    // ganti desimal ke titik (format JS)
    s = s.replace(decimalSep, '.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/* ===== Auth Guards ===== */
function requireAdmin(req) {
  if (req.user?.role !== 'admin') throwError('Hanya admin yang diizinkan', 403);
}
async function assertOwnerOrAdmin(req, er) {
  if (req.user?.role === 'admin') return;
  const me = await Employee.findOne({ user: req.user.id }).select('_id');
  if (!me) throwError('Data karyawan tidak ditemukan', 404);
  if (!er.name?.equals(me._id)) {
    throwError('Tidak boleh mengakses/ubah pengajuan milik orang lain', 403);
  }
}

/* ====== Bag & RAP ====== */
function buildBagFromER(er) {
  const bag = {};
  const group = mapExpenseType(er.expense_type);
  if (!group) return bag;
  bag[group] = bag[group] || {};
  for (const d of er.details || []) {
    const cat = typeof d.category === 'object' ? d.category.value : d.category;
    const amt = num(d.amount);
    if (!cat || amt <= 0) continue;
    bag[group][cat] = num(bag[group][cat]) + amt;
  }
  return bag;
}
function applyBagToRAP(rapDoc, bag, sign = +1) {
  for (const group of Object.keys(bag || {})) {
    const grp = rapDoc[group];
    if (!grp) throwError(`Grup RAP tidak ditemukan: ${group}`, 422);
    for (const cat of Object.keys(bag[group])) {
      if (!grp[cat]) throwError(`Kategori RAP tidak ditemukan: ${cat}`, 422);
      const delta = num(bag[group][cat]) * sign;
      const bucket = grp[cat];
      bucket.biaya_pengajuan = num(bucket.biaya_pengajuan) + delta;
      bucket.is_overbudget = num(bucket.biaya_pengajuan) > num(bucket.jumlah);
    }
  }
}

/** Flag proyeksi overbudget untuk ER status Diproses */
async function markOverbudgetFlags({
  projectId,
  expenseType,
  details,
  session,
  excludeId = null
}) {
  const rap = await RAP.findById(projectId).session(session);
  if (!rap) throwError('RAP tidak ditemukan', 404);

  const group = mapExpenseType(expenseType);
  if (!group) return details;

  const match = {
    project: projectId,
    expense_type: expenseType,
    status: 'Diproses'
  };
  if (excludeId) match._id = { $ne: excludeId };

  const pending = await ExpenseRequest.aggregate([
    { $match: match },
    { $unwind: '$details' },
    { $group: { _id: '$details.category', total: { $sum: '$details.amount' } } }
  ]).session(session);

  const pendingMap = new Map(pending.map((p) => [p._id, num(p.total)]));

  return details.map((raw) => {
    const qty = num(raw.quantity);
    const unitPrice = num(raw.unit_price);
    const cat =
      typeof raw.category === 'object' ? raw.category.value : raw.category;
    const amount = num(raw.amount ?? qty * unitPrice);

    const bucket = rap[group]?.[cat];
    if (!bucket) {
      return { ...raw, category: cat, amount, is_overbudget: false };
    }
    const approved = num(bucket.biaya_pengajuan);
    const pendingOthers = num(pendingMap.get(cat));
    const projected = approved + pendingOthers + amount;
    const limit = num(bucket.jumlah);
    const isOver = projected > limit;

    return { ...raw, category: cat, amount, is_overbudget: isOver };
  });
}

/* ================= Create ================= */
const addExpenseRequest = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
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

    // requester (field "name") by role
    let requesterId = null;
    if (req.user?.role === 'admin') {
      if (req.body.name) {
        if (!mongoose.Types.ObjectId.isValid(req.body.name))
          throwError('ID requester tidak valid', 400);
        const emp = await Employee.findById(req.body.name).select('_id');
        if (!emp) throwError('Requester tidak ditemukan', 404);
        requesterId = emp._id;
      } else {
        const me = await Employee.findOne({ user: req.user.id }).select('_id');
        if (!me)
          throwError('Requester (name) wajib dipilih atau tersedia', 400);
        requesterId = me._id;
      }
    } else {
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
      const qty = num(item.quantity);
      const unitPrice = num(item.unit_price);
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

    // status awal SELALU Diproses
    const status = 'Diproses';
    const request_status = 'Pending';

    // proyeksi overbudget
    const detailsForSave = await markOverbudgetFlags({
      projectId: project,
      expenseType: expense_type,
      details: normalizedDetails,
      session
    });

    const total_amount = detailsForSave.reduce(
      (acc, curr) => acc + num(curr.amount),
      0
    );
    const voucher_number = await generateVoucherNumber(voucher_prefix);

    const [expenseRequest] = await ExpenseRequest.create(
      [
        {
          name: requesterId,
          project,
          voucher_prefix,
          voucher_number,
          payment_voucher: null,
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
          details: detailsForSave,
          total_amount,
          status,
          request_status,
          applied_bag_snapshot: null,
          pv_locked: false,
          over_budget: detailsForSave.some((d) => d.is_overbudget),
          note: null
        }
      ],
      { session }
    );

    // Upsert ExpenseLog (TANPA menulis ke "details", karena "details" = hanya approved items dari PV)
    await ExpenseLog.updateOne(
      { voucher_number },
      {
        $setOnInsert: {
          voucher_number,
          payment_voucher: null,
          requester: requesterId,
          project,
          expense_type,
          request_date: submission_date || new Date()
          // details: []    // biarkan default
          // batches: []    // biarkan default
        }
      },
      { session, upsert: true }
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
      { payment_voucher: { $regex: search, $options: 'i' } }
    ];
  }

  if (req.user?.role !== 'admin') {
    const me = await Employee.findOne({ user: req.user.id }).select('_id');
    if (!me) throwError('Karyawan tidak ditemukan', 404);
    filter.name = me._id;
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
  const er = await ExpenseRequest.findById(req.params.id)
    .populate('name', 'name')
    .populate('project', 'project_name');

  if (!er) throwError('Pengajuan biaya tidak ditemukan', 404);
  await assertOwnerOrAdmin(req, er);

  res.status(200).json(er);
});

const getMyExpenseRequests = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const me = await Employee.findOne({ user: req.user.id }).select('_id name');
  if (!me) throwError('Karyawan tidak ditemukan', 404);

  const filter = { name: me._id };

  const [totalItems, requests] = await Promise.all([
    ExpenseRequest.countDocuments(filter),
    ExpenseRequest.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .populate('project', 'project_name')
  ]);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data: requests
  });
});

/* ================= Update ================= */
const updateExpenseRequest = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const er = await ExpenseRequest.findById(req.params.id).session(session);
    if (!er) throwError('Pengajuan biaya tidak ditemukan', 404);

    const updates = req.body || {};

    if (er.pv_locked) {
      throwError('Data terkunci karena sudah dipakai di PV final', 409);
    }

    if (er.status !== 'Diproses') {
      throwError(
        'Tidak bisa edit karena status bukan Diproses. Gunakan Reopen.',
        409
      );
    }

    await assertOwnerOrAdmin(req, er);

    if (req.user?.role === 'admin' && updates.name) {
      if (!mongoose.Types.ObjectId.isValid(updates.name))
        throwError('ID karyawan tidak valid', 400);
      const emp = await Employee.findById(updates.name).select('_id');
      if (!emp) throwError('Karyawan tidak ditemukan', 404);
      er.name = emp._id;

      // Sinkron log: hanya meta requester
      await ExpenseLog.updateOne(
        { voucher_number: er.voucher_number },
        { $set: { requester: emp._id } },
        { session }
      );
    }

    // ===== Jika jenis biaya berganti → details wajib diisi ulang =====
    if (updates.expense_type && updates.expense_type !== er.expense_type) {
      er.expense_type = updates.expense_type;
      if (
        !updates.details ||
        !Array.isArray(updates.details) ||
        !updates.details.length
      ) {
        throwError(
          'Jenis biaya berubah, harap isi ulang detail keperluan',
          400
        );
      }
    }

    // ===== Edit details (recalc + proyeksi overbudget) =====
    if (updates.details && Array.isArray(updates.details)) {
      let newDetails = updates.details.map((item) => {
        const qty = num(item.quantity);
        const unitPrice = num(item.unit_price);
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

      newDetails = await markOverbudgetFlags({
        projectId: er.project,
        expenseType: er.expense_type,
        details: newDetails,
        session,
        excludeId: er._id
      });

      er.details = newDetails;
      er.total_amount = newDetails.reduce((a, c) => a + num(c.amount), 0);
      er.over_budget = newDetails.some((d) => d.is_overbudget);

      // Catatan: di sini kita TIDAK menyentuh "details" pada ExpenseLog,
      // hanya update meta expense_type (sesuai preferensi kamu).
      await ExpenseLog.updateOne(
        { voucher_number: er.voucher_number },
        { $set: { expense_type: er.expense_type } },
        { session }
      );
    }

    // ===== Deskripsi =====
    if (updates.description !== undefined) er.description = updates.description;

    // ===== Metode pembayaran + data bank =====
    if (updates.method !== undefined) er.method = updates.method;

    if (er.method === 'Tunai') {
      er.bank_account_number = null;
      er.bank = null;
      er.bank_branch = null;
      er.bank_account_holder = null;
    } else if (er.method === 'Transfer') {
      er.bank_account_number =
        updates.bank_account_number ?? er.bank_account_number;
      er.bank = updates.bank ?? er.bank;
      er.bank_branch = updates.bank_branch ?? er.bank_branch;
      er.bank_account_holder =
        updates.bank_account_holder ?? er.bank_account_holder;
    }

    // ===== Tetap Diproses setelah edit =====
    er.status = 'Diproses';
    er.request_status = 'Pending';
    er.payment_voucher = null;
    er.applied_bag_snapshot = null;

    await er.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      message: 'Pengajuan biaya berhasil diperbarui',
      data: er
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= Aksi: APPROVE (admin) ================= */
const approveExpenseRequest = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const er = await ExpenseRequest.findById(req.params.id).session(session);
    if (!er) throwError('Pengajuan biaya tidak ditemukan', 404);

    if (er.pv_locked)
      throwError('Tidak bisa disetujui karena sudah dipakai di PV final', 409);
    if (er.status !== 'Diproses')
      throwError('Hanya bisa menyetujui dokumen yang Diproses', 409);

    const rap = await RAP.findById(er.project).session(session);
    if (!rap) throwError('RAP tidak ditemukan', 404);

    const bag = buildBagFromER(er);
    applyBagToRAP(rap, bag, +1);
    await rap.save({ session });

    const pvPrefix = mapPaymentPrefix(er.voucher_prefix);
    if (!pvPrefix) throwError('Prefix voucher tidak valid', 400);
    er.payment_voucher = await generateVoucherNumber(pvPrefix);

    er.status = 'Disetujui';
    // Dengan partial PV, ER setelah approve = "Aktif" (masih bisa ada batch PV)
    er.request_status = 'Aktif';
    er.applied_bag_snapshot = bag;

    // set flag over_budget aktual berdasarkan RAP terkini
    const group = Object.keys(bag)[0];
    if (group && rap[group]) {
      er.details = er.details.map((d) => {
        const cat =
          typeof d.category === 'object' ? d.category.value : d.category;
        const bucket = rap[group]?.[cat];
        const isOver = bucket
          ? num(bucket.biaya_pengajuan) > num(bucket.jumlah)
          : false;
        return { ...d, category: cat, is_overbudget: !!isOver };
      });
      er.over_budget = er.details.some((d) => d.is_overbudget);
    }

    await er.save({ session });

    // ExpenseLog: set meta dan payment_voucher SAJA (jangan sentuh "details")
    await ExpenseLog.updateOne(
      { voucher_number: er.voucher_number },
      {
        $set: {
          payment_voucher: er.payment_voucher,
          requester: er.name,
          project: er.project,
          expense_type: er.expense_type
        }
      },
      { session, upsert: true }
    );

    await session.commitTransaction();
    res.status(200).json({ message: 'Pengajuan disetujui', data: er });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= Aksi: REJECT (admin) ================= */
const rejectExpenseRequest = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { note } = req.body || {};
    const er = await ExpenseRequest.findById(req.params.id).session(session);
    if (!er) throwError('Pengajuan biaya tidak ditemukan', 404);

    if (er.status !== 'Diproses')
      throwError('Hanya bisa menolak dokumen yang Diproses', 409);
    if (!note) throwError('Alasan penolakan (note) wajib diisi', 400);

    er.status = 'Ditolak';
    er.request_status = 'Ditolak';
    er.note = note;
    er.payment_voucher = null;
    er.applied_bag_snapshot = null;

    await er.save({ session });

    // ExpenseLog: TIDAK dihapus (biarkan dokumennya; batches & details masih kosong)
    // Optionally set payment_voucher null untuk kejelasan
    await ExpenseLog.updateOne(
      { voucher_number: er.voucher_number },
      { $set: { payment_voucher: null } },
      { session }
    );

    await session.commitTransaction();
    res.status(200).json({ message: 'Pengajuan ditolak', data: er });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= Aksi: REOPEN ================= */
/** Reopen rules:
 * - Dari Ditolak: **owner atau admin** boleh self-reopen → kembali ke Diproses (tanpa sentuh RAP).
 * - Dari Disetujui: **admin only** → rollback RAP snapshot → kembali ke Diproses.
 */
const reopenExpenseRequest = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const er = await ExpenseRequest.findById(req.params.id).session(session);
    if (!er) throwError('Pengajuan biaya tidak ditemukan', 404);

    if (er.pv_locked)
      throwError(
        'Tidak bisa dibuka ulang karena sudah dipakai di PV final',
        409
      );
    if (er.status === 'Diproses')
      throwError('Dokumen sudah berstatus Diproses', 409);

    if (er.status === 'Ditolak') {
      // self-reopen (owner/admin)
      await assertOwnerOrAdmin(req, er);

      er.status = 'Diproses';
      er.request_status = 'Pending';
      er.note = null;

      // Log: pastikan tetap ada; tidak perlu dihapus
      await ExpenseLog.updateOne(
        { voucher_number: er.voucher_number },
        { $set: { payment_voucher: null } },
        { session, upsert: true }
      );

      await er.save({ session });
      await session.commitTransaction();

      return res
        .status(200)
        .json({ message: 'Pengajuan dibuka ulang (Diproses)', data: er });
    }

    // Dari Disetujui → admin only + rollback RAP
    requireAdmin(req);

    const rap = await RAP.findById(er.project).session(session);
    if (!rap) throwError('RAP tidak ditemukan', 404);

    const bag =
      er.applied_bag_snapshot && Object.keys(er.applied_bag_snapshot).length
        ? er.applied_bag_snapshot
        : buildBagFromER(er);

    applyBagToRAP(rap, bag, -1);
    await rap.save({ session });

    er.payment_voucher = null;
    er.applied_bag_snapshot = null;

    // refresh proyeksi flag overbudget setelah rollback
    const recalced = await markOverbudgetFlags({
      projectId: er.project,
      expenseType: er.expense_type,
      details: er.details,
      session,
      excludeId: er._id
    });
    er.details = recalced;
    er.over_budget = recalced.some((d) => d.is_overbudget);

    er.status = 'Diproses';
    er.request_status = 'Pending';

    // ExpenseLog: jangan dihapus; reset PV number
    await ExpenseLog.updateOne(
      { voucher_number: er.voucher_number },
      { $set: { payment_voucher: null } },
      { session, upsert: true }
    );

    await er.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      message: 'Pengajuan dibuka ulang dari Disetujui (Diproses)',
      data: er
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
    const er = await ExpenseRequest.findById(req.params.id).session(session);
    if (!er) throwError('Pengajuan biaya tidak ditemukan', 404);

    if (req.user?.role !== 'admin') {
      await assertOwnerOrAdmin(req, er);
      if (er.status !== 'Diproses') {
        throwError(
          'Karyawan hanya boleh menghapus pengajuan dengan status Diproses',
          403
        );
      }
    }
    if (er.status === 'Disetujui') {
      throwError(
        'Sudah Disetujui: tidak bisa dihapus, gunakan Reopen terlebih dahulu',
        400
      );
    }

    await ExpenseLog.deleteOne(
      { voucher_number: er.voucher_number },
      { session }
    );
    await er.deleteOne({ session });
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
  biaya_rtk_tak_terduga: 'Biaya RTK / Tak Terduga',
  penginapan: 'Penginapan',
  transportasi_akomodasi_lokal: 'Transportasi & Akomodasi Lokal',
  transportasi_akomodasi_site: 'Transportasi & Akomodasi Site',
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
  requireAdmin(req);
  const employee = await Employee.find().select('name');
  if (!employee) throwError('Karyawan tidak ada', 404);
  res.status(200).json(employee);
});

const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user.id }).select('name');
  if (!employee) throwError('Data karyawan tidak ditemukan', 404);
  res.status(200).json(employee);
});

const getAllProject = asyncHandler(async (_req, res) => {
  const project = await RAP.find().select('project_name');
  res.json(project);
});

module.exports = {
  // CRUD
  addExpenseRequest,
  getExpenseRequests,
  getExpenseRequest,
  updateExpenseRequest,
  deleteExpenseRequest,

  // Aksi status
  approveExpenseRequest,
  rejectExpenseRequest,
  reopenExpenseRequest,

  // misc
  getCategoriesByExpenseType,
  getAllEmployee,
  getEmployee,
  getMyExpenseRequests,
  getAllProject
};
