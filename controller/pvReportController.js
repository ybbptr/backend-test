// controllers/pvReportController.js
'use strict';

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const path = require('path');

const throwError = require('../utils/throwError');
const PVReport = require('../model/pvReportModel');
const Employee = require('../model/employeeModel');
const ExpenseRequest = require('../model/expenseRequestModel');
const ExpenseLog = require('../model/expenseLogModel');
const RAP = require('../model/rapModel');
const { uploadBuffer, deleteFile, getFileUrl } = require('../utils/wasabi');
const formatDate = require('../utils/formatDate');

/* ========================= Utils & Guards ========================= */

const toNum = (v, d = 0) => {
  if (v === '' || v === null || v === undefined) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const hasKey = (obj, k) => Object.prototype.hasOwnProperty.call(obj || {}, k);

const ensureObjectId = (id, label = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(id))
    throwError(`${label} tidak valid`, 400);
};

const getEmployeeId = async (req) => {
  const emp = await Employee.findOne({ user: req.user.id }).select('_id');
  if (!emp) throwError('Karyawan tidak ditemukan', 404);
  return emp._id;
};

const ensureNotLocked = (pv) => {
  if (pv.pv_locked) throwError('PV terkunci (pv_locked = true)', 403);
};

const ensureRole = (req, role = 'admin') => {
  if (req.user?.role !== role) throwError('Akses ditolak', 403);
};

const ensureOwnershipOrAdmin = async (req, pv) => {
  if (req.user.role === 'admin') return;
  const myId = await getEmployeeId(req);
  if (String(pv.created_by) !== String(myId)) {
    throwError('Anda tidak berhak mengakses data ini', 403);
  }
};

const parseItems = (raw) => {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throwError('Format items bukan JSON valid', 400);
    }
  }
  if (!Array.isArray(parsed) && typeof parsed === 'object')
    parsed = Object.values(parsed);
  if (!Array.isArray(parsed)) throwError('items harus berupa array', 400);
  return parsed;
};

const getNotaFile = (req, idx1) => {
  // ekspektasi fieldname: nota_1, nota_2, ...
  const field = `nota_${idx1}`;
  if (Array.isArray(req.files))
    return req.files.find((f) => f.fieldname === field) || null;
  if (req.files && typeof req.files === 'object') {
    const arr = req.files[field];
    return arr && arr[0] ? arr[0] : null;
  }
  return null;
};

const mapExpenseType = (expenseType) => {
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
};

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

/* ---------------- RAP helpers ---------------- */

const buildRapIncBagFromItems = (items) => {
  const bag = {};
  for (const it of items || []) {
    const group = mapExpenseType(it.expense_type);
    if (!group || !it.category) continue;
    const path = `${group}.${it.category}.aktual`;
    const val = toNum(it.aktual);
    if (val !== 0) bag[path] = (bag[path] || 0) + val;
  }
  return bag;
};

const clampNegativesWithSnapshot = async (projectId, incBag, session) => {
  const rap = await RAP.findById(projectId).lean().session(session);
  const adjusted = {};
  for (const [path, delta] of Object.entries(incBag || {})) {
    const n = Number(delta);
    if (!Number.isFinite(n) || n === 0) continue;
    if (n > 0) {
      adjusted[path] = n;
      continue;
    }
    const curr = path.split('.').reduce((o, k) => (o ? o[k] : 0), rap || {});
    const safe = -Math.min(toNum(curr), Math.abs(n));
    if (safe !== 0) adjusted[path] = safe;
  }
  return adjusted;
};

const applyRapBag = async (projectId, incBag, session) => {
  const entries = Object.entries(incBag || {});
  if (entries.length === 0) return;
  await RAP.updateOne({ _id: projectId }, { $inc: incBag }, { session });
};

/* ---------------- ExpenseLog helpers ---------------- */

const upsertExpenseLogIfNeeded = async (pvReport, expenseReq, session) => {
  const base = {
    voucher_number: pvReport.voucher_number,
    payment_voucher: pvReport.pv_number,
    requester: expenseReq.name,
    project: expenseReq.project,
    expense_type: expenseReq.expense_type,
    request_date: expenseReq.createdAt || new Date()
  };
  await ExpenseLog.updateOne(
    { voucher_number: pvReport.voucher_number },
    { $setOnInsert: base },
    { upsert: true, session }
  );
};

const attachOrUpdateBatchInLog = async (pvReport, mode, session) => {
  // mode: 'create' | 'sync-items' | 'approve' | 'reject' | 'reopen-to-diproses' | 'reopen-from-approved' | 'delete'
  const log = await ExpenseLog.findOne({
    voucher_number: pvReport.voucher_number
  }).session(session);
  if (!log) return;

  const idx = (log.batches || []).findIndex(
    (b) => String(b.pv_report) === String(pvReport._id)
  );

  if (mode === 'create') {
    if (idx !== -1) return;
    log.batches.push({
      pv_report: pvReport._id,
      pv_number: pvReport.pv_number,
      status: pvReport.status,
      note: pvReport.note,
      items: pvReport.items.map((it) => ({
        er_detail_id: it.er_detail_id,
        purpose: it.purpose,
        category: it.category,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: toNum(it.amount),
        aktual: toNum(it.aktual),
        nota: it.nota
      })),
      approved_at: null,
      created_at: pvReport.createdAt
    });
  }

  if (mode === 'sync-items') {
    if (idx === -1) return;
    log.batches[idx].items = pvReport.items.map((it) => ({
      er_detail_id: it.er_detail_id,
      purpose: it.purpose,
      category: it.category,
      quantity: it.quantity,
      unit_price: it.unit_price,
      amount: toNum(it.amount),
      aktual: toNum(it.aktual),
      nota: it.nota
    }));
    log.batches[idx].status = pvReport.status;
    log.batches[idx].note = pvReport.note;
  }

  if (mode === 'approve') {
    if (idx === -1) return;
    log.batches[idx].status = 'Disetujui';
    log.batches[idx].approved_at = new Date();
    log.batches[idx].note = null;

    const existingIds = new Set(
      (log.details || []).map((d) => String(d.er_detail_id || ''))
    );
    for (const it of log.batches[idx].items) {
      if (it.er_detail_id && existingIds.has(String(it.er_detail_id))) continue;
      log.details.push({
        er_detail_id: it.er_detail_id,
        purpose: it.purpose,
        category: it.category,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: toNum(it.amount),
        aktual: toNum(it.aktual),
        nota: it.nota
      });
    }
  }

  if (mode === 'reject') {
    if (idx === -1) return;
    log.batches[idx].status = 'Ditolak';
    log.batches[idx].approved_at = null;
    log.batches[idx].note = pvReport.note || null;
  }

  if (mode === 'reopen-to-diproses') {
    if (idx === -1) return;
    log.batches[idx].status = 'Diproses';
    log.batches[idx].approved_at = null;
    log.batches[idx].note = null;
  }

  if (mode === 'reopen-from-approved') {
    if (idx === -1) return;
    const rmIds = new Set(
      (log.batches[idx].items || []).map((it) => String(it.er_detail_id))
    );
    log.details = (log.details || []).filter(
      (d) => !d.er_detail_id || !rmIds.has(String(d.er_detail_id))
    );
    log.batches[idx].status = 'Diproses';
    log.batches[idx].approved_at = null;
    log.batches[idx].note = null;
  }

  if (mode === 'delete') {
    if (idx !== -1) log.batches.splice(idx, 1);
  }

  await log.save({ session });
};

const recomputeCompletionFlag = async (voucher_number, session) => {
  const er = await ExpenseRequest.findOne({ voucher_number })
    .lean()
    .session(session);
  const log = await ExpenseLog.findOne({ voucher_number })
    .lean()
    .session(session);
  if (!er || !log) return;

  const totalER = (er.details || []).length;
  const totalApproved = (log.details || []).length;
  const done = totalApproved >= totalER && totalER > 0;

  await ExpenseLog.updateOne(
    { voucher_number },
    { $set: { completed_at: done ? new Date() : null } },
    { session }
  );

  await ExpenseRequest.updateOne(
    { voucher_number },
    { $set: { request_status: done ? 'Selesai' : 'Aktif' } },
    { session }
  );
};

const ensureNoDoubleClaim = async (
  voucher_number,
  erDetailIds,
  exceptPvId,
  session
) => {
  if (!erDetailIds || erDetailIds.length === 0) return;

  const clash = await PVReport.findOne({
    voucher_number,
    _id: { $ne: exceptPvId || undefined },
    'items.er_detail_id': { $in: erDetailIds }
  })
    .select('_id')
    .session(session);

  if (clash)
    throwError(
      'Beberapa item sudah diklaim di batch lain. Gunakan batch tersebut (reopen) atau buat batch baru untuk item sisa.',
      400
    );
};

/* ========================= Create (batch baru) ========================= */

const addPVReport = asyncHandler(async (req, res) => {
  const { pv_number, voucher_number, report_date } = req.body || {};
  const items = parseItems(req.body.items);
  if (!pv_number || !voucher_number || items.length === 0) {
    throwError('Field wajib belum lengkap', 400);
  }

  const expenseReq = await ExpenseRequest.findOne({
    payment_voucher: pv_number,
    voucher_number
  })
    .select('name project expense_type details createdAt')
    .lean();
  if (!expenseReq) throwError('Pengajuan biaya (ER) tidak ditemukan', 404);

  const erIndex = new Map(
    (expenseReq.details || []).map((d) => [String(d._id), d])
  );
  const erDetailIds = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    if (!it.er_detail_id)
      throwError(`Item #${i + 1} tidak punya er_detail_id`, 400);
    const src = erIndex.get(String(it.er_detail_id));
    if (!src)
      throwError(`er_detail_id pada item #${i + 1} tidak ada di ER`, 400);
    if (toNum(it.aktual) < 0)
      throwError(`Aktual item #${i + 1} tidak boleh negatif`, 400);
    erDetailIds.push(it.er_detail_id);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await ensureNoDoubleClaim(voucher_number, erDetailIds, null, session);

    let createdById;
    if (req.user?.role === 'admin' && req.body.created_by) {
      ensureObjectId(req.body.created_by, 'created_by');
      const chosen = await Employee.findById(req.body.created_by).select('_id');
      if (!chosen) throwError('Karyawan (created_by) tidak ditemukan', 404);
      createdById = chosen._id;
    } else {
      const me = await Employee.findOne({ user: req.user.id }).select('_id');
      createdById = me?._id || expenseReq.name;
    }

    const [pv] = await PVReport.create(
      [
        {
          pv_number,
          voucher_number,
          project: expenseReq.project,
          created_by: createdById,
          report_date: report_date || new Date(),
          status: 'Diproses',
          items: []
        }
      ],
      { session }
    );

    for (let i = 0; i < items.length; i++) {
      const sel = items[i];
      const src = erIndex.get(String(sel.er_detail_id));

      const file = getNotaFile(req, i + 1);
      if (!file)
        throwError(`Nota (bukti) untuk item #${i + 1} wajib diupload`, 400);

      const ext = path.extname(file.originalname);
      const key = `Pertanggungjawaban Dana/${pv_number}/nota_${
        i + 1
      }_${formatDate()}${ext}`;
      await uploadBuffer(key, file.buffer);

      pv.items.push({
        er_detail_id: src._id,
        purpose: src.purpose,
        category: src.category,
        quantity: src.quantity,
        unit_price: src.unit_price,
        amount: src.amount,
        expense_type: expenseReq.expense_type,
        aktual: toNum(sel.aktual || 0),
        overbudget: toNum(sel.aktual || 0) > toNum(src.amount),
        nota: {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        }
      });
    }

    await pv.save({ session });

    await upsertExpenseLogIfNeeded(pv, expenseReq, session);
    await attachOrUpdateBatchInLog(pv, 'create', session);

    await ExpenseRequest.updateOne(
      { voucher_number },
      { $set: { request_status: 'Aktif' } },
      { session }
    );

    await session.commitTransaction();
    res.status(201).json(pv);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ========================= Read (list & detail) ========================= */

const getPVReports = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = req.query.search || '';
  const filter = search
    ? {
        $or: [
          { voucher_number: { $regex: search, $options: 'i' } },
          { pv_number: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  if (req.query.project) filter.project = req.query.project;

  if (req.user.role === 'karyawan') {
    const myId = await getEmployeeId(req);
    filter.created_by = myId;
  }

  const totalItems = await PVReport.countDocuments(filter);
  const data = await PVReport.find(filter)
    .populate('created_by', 'name')
    .populate('project', 'project_name')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data
  });
});

const getPVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const pv = await PVReport.findById(id)
    .populate('created_by', 'name')
    .populate('project', 'project_name')
    .lean();
  if (!pv) throwError('PV Report tidak ditemukan', 404);

  await ensureOwnershipOrAdmin(req, pv);

  pv.items = await Promise.all(
    (pv.items || []).map(async (item) => {
      let nota_url = null;
      if (item.nota?.key) {
        try {
          nota_url = await getFileUrl(item.nota.key);
        } catch {}
      }
      return { ...item, nota_url };
    })
  );

  res.status(200).json(pv);
});

/* ========================= Update (edit batch) ========================= */

const updatePVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const updates = req.body || {};
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pv = await PVReport.findById(id).session(session);
    if (!pv) throwError('PV Report tidak ditemukan', 404);

    await ensureOwnershipOrAdmin(req, pv);
    ensureNotLocked(pv);

    // === HARD GUARD: tidak boleh edit saat sudah Disetujui ===
    if (pv.status === 'Disetujui') {
      throwError('Batch sudah Disetujui. Gunakan Reopen untuk koreksi.', 400);
    }

    // === Ditolak: harus self-reopen dulu (biar audit & flow rapi)
    if (pv.status === 'Ditolak') {
      throwError(
        'PV Ditolak tidak bisa diedit. Gunakan Perbaiki & Kirim Ulang (Reopen).',
        400
      );
    }

    // === Diproses → boleh ubah isi item batch yang ADA (tidak boleh tambah item baru dari ER) ===
    if (hasKey(updates, 'items')) {
      const incoming = parseItems(updates.items);

      const existingIds = new Set(
        (pv.items || []).map((it) => String(it.er_detail_id))
      );
      const incomingIds = new Set(
        incoming.filter(Boolean).map((it) => String(it.er_detail_id))
      );
      for (const idStr of incomingIds) {
        if (!existingIds.has(idStr)) {
          throwError(
            'Tidak boleh menambah item baru ke batch ini. Buat batch baru untuk item lain.',
            400
          );
        }
      }

      const byId = new Map(
        (pv.items || []).map((it) => [
          String(it.er_detail_id),
          it.toObject ? it.toObject() : it
        ])
      );
      const result = [];

      for (let i = 0; i < incoming.length; i++) {
        const patch = incoming[i] || {};
        const base = byId.get(String(patch.er_detail_id));
        if (!base) continue;

        const merged = { ...base, ...patch };

        const qty = hasKey(patch, 'quantity')
          ? toNum(patch.quantity, base.quantity)
          : base.quantity;
        const up = hasKey(patch, 'unit_price')
          ? toNum(patch.unit_price, base.unit_price)
          : base.unit_price;

        let amount;
        if (hasKey(patch, 'amount')) amount = toNum(patch.amount, base.amount);
        else if (hasKey(patch, 'quantity') || hasKey(patch, 'unit_price'))
          amount = toNum(qty) * toNum(up);
        else amount = base.amount;

        const nextAkt = hasKey(patch, 'aktual')
          ? toNum(patch.aktual, base.aktual)
          : base.aktual;
        if (toNum(nextAkt) < 0)
          throwError(
            `Aktual untuk "${merged.purpose}" tidak boleh negatif`,
            400
          );

        merged.quantity = qty;
        merged.unit_price = up;
        merged.amount = amount;
        merged.aktual = nextAkt;
        merged.overbudget = toNum(nextAkt) > toNum(amount);

        const file = getNotaFile(req, i + 1);
        if (file) {
          if (base?.nota?.key) {
            try {
              await deleteFile(base.nota.key);
            } catch {}
          }
          const ext = path.extname(file.originalname);
          const key = `Pertanggungjawaban Dana/${pv.pv_number}/nota_${
            i + 1
          }_${formatDate()}${ext}`;
          await uploadBuffer(key, file.buffer);
          merged.nota = {
            key,
            contentType: file.mimetype,
            size: file.size,
            uploadedAt: new Date()
          };
        } else {
          merged.nota = hasKey(merged, 'nota')
            ? merged.nota
            : base.nota ?? null;
        }

        result.push(merged);
      }

      // allow removal: item yang tidak dikirim dianggap dihapus (klaim dilepas)
      pv.items = result;
      pv.markModified('items');

      await attachOrUpdateBatchInLog(pv, 'sync-items', session);
    }

    if (hasKey(updates, 'report_date')) pv.report_date = updates.report_date;
    if (hasKey(updates, 'project')) {
      ensureObjectId(updates.project, 'project');
      pv.project = updates.project;
    }
    if (hasKey(updates, 'pv_number')) pv.pv_number = updates.pv_number;
    if (hasKey(updates, 'voucher_number'))
      pv.voucher_number = updates.voucher_number;

    await pv.save({ session });

    await ExpenseRequest.updateOne(
      { voucher_number: pv.voucher_number },
      { $set: { request_status: 'Aktif' } },
      { session }
    );

    await session.commitTransaction();
    res.status(200).json(pv);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ========================= Approve / Reject / Reopen ========================= */

const approvePVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);
  ensureRole(req, 'admin');

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pv = await PVReport.findById(id).session(session);
    if (!pv) throwError('PV Report tidak ditemukan', 404);

    ensureNotLocked(pv);
    if (pv.status !== 'Diproses')
      throwError('PV harus berstatus Diproses untuk Approve', 400);

    for (const it of pv.items) {
      if (toNum(it.aktual) > toNum(it.amount)) {
        throwError(
          `Aktual untuk "${it.purpose}" melebihi pengajuan (${toNum(
            it.amount
          )})`,
          400
        );
      }
    }

    const incBag = buildRapIncBagFromItems(pv.items);
    if (Object.keys(incBag).length)
      await applyRapBag(pv.project, incBag, session);

    await attachOrUpdateBatchInLog(pv, 'approve', session);

    pv.status = 'Disetujui';
    pv.note = null;
    await pv.save({ session });

    await recomputeCompletionFlag(pv.voucher_number, session);

    await session.commitTransaction();
    res.status(200).json(pv);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const rejectPVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body || {};
  ensureObjectId(id);
  ensureRole(req, 'admin');

  if (!note) throwError('Catatan (note) wajib diisi saat Reject', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pv = await PVReport.findById(id).session(session);
    if (!pv) throwError('PV Report tidak ditemukan', 404);

    ensureNotLocked(pv);
    if (pv.status !== 'Diproses')
      throwError('PV harus berstatus Diproses untuk Reject', 400);

    pv.status = 'Ditolak';
    pv.note = note;
    await pv.save({ session });

    await attachOrUpdateBatchInLog(pv, 'reject', session);

    await ExpenseRequest.updateOne(
      { voucher_number: pv.voucher_number },
      { $set: { request_status: 'Pending' } },
      { session }
    );

    await session.commitTransaction();
    res.status(200).json(pv);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const reopenPVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pv = await PVReport.findById(id).session(session);
    if (!pv) throwError('PV Report tidak ditemukan', 404);

    ensureNotLocked(pv);

    if (pv.status === 'Ditolak') {
      await ensureOwnershipOrAdmin(req, pv);
      pv.status = 'Diproses';
      pv.note = null;
      await pv.save({ session });

      await attachOrUpdateBatchInLog(pv, 'reopen-to-diproses', session);
      await ExpenseRequest.updateOne(
        { voucher_number: pv.voucher_number },
        { $set: { request_status: 'Aktif' } },
        { session }
      );

      await session.commitTransaction();
      return res.status(200).json(pv);
    }

    ensureRole(req, 'admin');
    if (pv.status !== 'Disetujui')
      throwError('PV harus Ditolak/Disetujui untuk Reopen', 400);

    const bag = buildRapIncBagFromItems(pv.items);
    for (const k of Object.keys(bag)) bag[k] = -Math.abs(bag[k]);
    const safe = await clampNegativesWithSnapshot(pv.project, bag, session);
    if (Object.keys(safe).length) await applyRapBag(pv.project, safe, session);

    await attachOrUpdateBatchInLog(pv, 'reopen-from-approved', session);

    pv.status = 'Diproses';
    pv.note = null;
    await pv.save({ session });

    await recomputeCompletionFlag(pv.voucher_number, session);

    await session.commitTransaction();
    res.status(200).json(pv);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const deletePVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pv = await PVReport.findById(id).session(session);
    if (!pv) throwError('PV Report tidak ditemukan', 404);

    await ensureOwnershipOrAdmin(req, pv);
    ensureNotLocked(pv);

    if (pv.status === 'Disetujui') {
      throwError(
        'PV Disetujui tidak boleh dihapus. Reopen dulu jika perlu.',
        403
      );
    }

    const erIds = (pv.items || [])
      .map((it) => it?.er_detail_id)
      .filter(Boolean)
      .map(String);

    if (erIds.length) {
      const leak = await ExpenseLog.findOne({
        voucher_number: pv.voucher_number,
        'details.er_detail_id': { $in: erIds }
      }).session(session);

      if (leak) {
        // 1) Rollback RAP (pakai clamp agar tidak minus)
        const negBag = buildRapIncBagFromItems(pv.items);
        for (const k of Object.keys(negBag)) negBag[k] = -Math.abs(negBag[k]);
        const safeDec = await clampNegativesWithSnapshot(
          pv.project,
          negBag,
          session
        );
        if (Object.keys(safeDec).length) {
          await applyRapBag(pv.project, safeDec, session);
        }

        // 2) Cabut dari ExpenseLog.details
        await ExpenseLog.updateOne(
          { voucher_number: pv.voucher_number },
          { $pull: { details: { er_detail_id: { $in: erIds } } } },
          { session }
        );

        await recomputeCompletionFlag(pv.voucher_number, session);
      }
    }

    for (const item of pv.items || []) {
      if (item?.nota?.key) {
        try {
          await deleteFile(item.nota.key);
        } catch {}
      }
    }

    await attachOrUpdateBatchInLog(pv, 'delete', session);

    await pv.deleteOne({ session });

    await ExpenseRequest.updateOne(
      { voucher_number: pv.voucher_number },
      { $set: { request_status: 'Aktif' } },
      { session }
    );

    await session.commitTransaction();
    res.status(200).json({ message: 'PV Report (batch) berhasil dihapus' });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ========================= Misc (FE helpers) ========================= */

const getAllEmployee = asyncHandler(async (_req, res) => {
  const employee = await Employee.find().select('name');
  if (!employee) throwError('Karyawan tidak ada', 404);
  res.status(200).json(employee);
});

const getMyPVNumbers = asyncHandler(async (req, res) => {
  const filter = { status: 'Disetujui', payment_voucher: { $ne: null } };

  if (req.user.role === 'karyawan') {
    const myId = await getEmployeeId(req);
    filter.name = myId;
  }

  const ers = await ExpenseRequest.find(filter)
    .select('payment_voucher voucher_number project name details')
    .populate('project', 'project_name')
    .populate('name', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const result = [];
  for (const er of ers) {
    const allIds = (er.details || []).map((d) => String(d._id));
    const related = await PVReport.find({ voucher_number: er.voucher_number })
      .select('items.er_detail_id')
      .lean();
    const claimed = new Set(
      related.flatMap((d) =>
        (d.items || []).map((it) => String(it.er_detail_id))
      )
    );

    const remaining = allIds.filter((id) => !claimed.has(id));
    if (remaining.length > 0) {
      result.push({
        pv_number: er.payment_voucher,
        voucher_number: er.voucher_number,
        project_name: er.project?.project_name,
        employee: er.name?.name || null,
        remaining_count: remaining.length
      });
    }
  }

  res.status(200).json({ pv_numbers: result });
});

const getPVForm = asyncHandler(async (req, res) => {
  const { pv_number } = req.params;

  const expense = await ExpenseRequest.findOne({
    payment_voucher: pv_number
  })
    .populate('project', 'project_name')
    .populate('name', 'name position')
    .lean();

  if (!expense) throwError('Payment Voucher tidak ditemukan!', 404);

  const used = await PVReport.find({ voucher_number: expense.voucher_number })
    .select('items.er_detail_id')
    .lean();
  const claimed = new Set(
    used.flatMap((r) => (r.items || []).map((it) => String(it.er_detail_id)))
  );

  const selectable = (expense.details || [])
    .filter((d) => !claimed.has(String(d._id)))
    .map((it) => {
      const key = it.category;
      return {
        er_detail_id: it._id,
        purpose: it.purpose,
        category: key,
        category_label: categoryLabels[key] ?? key,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount
      };
    });

  res.status(200).json({
    pv_number: expense.payment_voucher,
    voucher_number: expense.voucher_number,
    project: expense.project?._id,
    project_name: expense.project?.project_name,
    name: expense.name?.name,
    position: expense.name?.position || null,
    items: selectable,
    total_amount: selectable.reduce((s, x) => s + (Number(x.amount) || 0), 0)
  });
});

/* ========================= Exports ========================= */

module.exports = {
  addPVReport,
  getPVReports,
  getPVReport,
  updatePVReport,
  deletePVReport,
  approvePVReport,
  rejectPVReport,
  reopenPVReport,
  // misc
  getAllEmployee,
  getMyPVNumbers,
  getPVForm
};
