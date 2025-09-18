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

/* ================= Helpers ================= */
function parseItems(raw) {
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
}

function getNotaFile(req, idx) {
  const field = `nota_${idx + 1}`;
  if (Array.isArray(req.files))
    return req.files.find((f) => f.fieldname === field) || null;
  if (req.files && typeof req.files === 'object') {
    const arr = req.files[field];
    return arr && arr[0] ? arr[0] : null;
  }
  return null;
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

const toNum = (v, d = 0) => {
  if (v === '' || v === null || v === undefined) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const getByPath = (obj, path) =>
  path
    .split('.')
    .reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const addInc = (bag, path, val) => {
  const n = Number(val);
  if (!Number.isFinite(n) || n === 0) return;
  bag[path] = (bag[path] || 0) + n;
};
const hasKey = (obj, k) => Object.prototype.hasOwnProperty.call(obj || {}, k);
const normNum = (patch, base, key) =>
  hasKey(patch, key) ? toNum(patch[key], base?.[key]) : base?.[key];

const clampIncBagNegatives = async (projectId, incBag, session) => {
  const rapSnap = await RAP.findById(projectId).lean().session(session);
  const adjusted = {};
  for (const [path, delta] of Object.entries(incBag)) {
    const n = Number(delta);
    if (!Number.isFinite(n) || n === 0) continue;
    if (n > 0) {
      adjusted[path] = n;
    } else {
      const curr = toNum(getByPath(rapSnap || {}, path), 0);
      const safe = -Math.min(curr, Math.abs(n));
      if (safe !== 0) adjusted[path] = safe;
    }
  }
  return adjusted;
};

/* ================= Create ================= */
const createPVReport = asyncHandler(async (req, res) => {
  const {
    pv_number,
    voucher_number,
    report_date,
    status,
    approved_by,
    recipient,
    note
  } = req.body || {};
  const items = parseItems(req.body.items);
  if (!pv_number || !voucher_number || items.length === 0)
    throwError('Field wajib belum lengkap', 400);

  // Validasi angka & wajib source_detail_id
  for (const it of items) {
    if ((it.aktual ?? 0) < 0)
      throwError(`Aktual untuk "${it.purpose}" tidak boleh negatif`, 400);
    if (!it.source_detail_id)
      throwError('source_detail_id wajib di setiap item', 400);
  }

  const expenseReq = await ExpenseRequest.findOne({
    payment_voucher: pv_number,
    voucher_number
  }).select('name project expense_type details total_amount');

  if (!expenseReq) throwError('Pengajuan biaya tidak ditemukan', 404);

  // Role → created_by
  let createdById = null;
  if (req.user?.role === 'admin' && req.body.created_by) {
    if (!mongoose.Types.ObjectId.isValid(req.body.created_by))
      throwError('created_by tidak valid', 400);
    const chosen = await Employee.findById(req.body.created_by).select('_id');
    if (!chosen) throwError('Karyawan (created_by) tidak ditemukan', 404);
    createdById = chosen._id;
  } else {
    const me = await Employee.findOne({ user: req.user.id }).select('_id');
    createdById = me?._id || expenseReq.name;
  }

  // Block duplikat item yang sudah dipakai (Diproses / Disetujui)
  const ids = items.map((x) => String(x.source_detail_id));
  const dup = await PVReport.exists({
    pv_number,
    voucher_number,
    status: { $in: ['Diproses', 'Disetujui'] },
    'items.source_detail_id': { $in: ids }
  });
  if (dup)
    throwError(
      'Sebagian item sudah dipakai pada PV lain (Diproses/Disetujui). Muat ulang form.',
      409
    );

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (req.user.role === 'admin' && status === 'Disetujui' && !approved_by) {
      throwError('approved_by wajib diisi jika status Disetujui', 400);
    }

    const [pvReport] = await PVReport.create(
      [
        {
          pv_number,
          voucher_number,
          project: expenseReq.project,
          created_by: createdById,
          report_date: report_date || new Date(),
          status: req.user.role === 'admin' ? status || 'Diproses' : 'Diproses',
          approved_by: req.user.role === 'admin' ? approved_by || null : null,
          recipient: req.user.role === 'admin' ? recipient || null : null,
          note:
            req.user.role === 'admin' && status === 'Ditolak'
              ? note || null
              : null,
          items: []
        }
      ],
      { session }
    );

    // Upload nota per item (wajib)
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const file = getNotaFile(req, i);
      if (!file)
        throwError(`Nota (bukti) untuk item #${i + 1} wajib diupload`, 400);

      const ext = path.extname(file.originalname);
      const key = `Pertanggungjawaban Dana/${pv_number}/nota_${
        i + 1
      }_${formatDate()}${ext}`;
      await uploadBuffer(key, file.buffer);

      const notaObj = {
        key,
        contentType: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      };

      pvReport.items.push({
        ...it,
        expense_type: expenseReq.expense_type,
        nota: notaObj,
        overbudget: toNum(it.aktual) > toNum(it.amount)
      });
    }

    await pvReport.save({ session });

    if (req.user.role === 'admin' && status === 'Disetujui') {
      // Guard anti dobel approve antar batch
      const currentIds = pvReport.items.map((it) =>
        String(it.source_detail_id)
      );
      const conflict = await PVReport.exists({
        _id: { $ne: pvReport._id },
        pv_number,
        voucher_number,
        status: 'Disetujui',
        'items.source_detail_id': { $in: currentIds }
      }).session(session);
      if (conflict)
        throwError(
          'Ada item yang sudah pernah Disetujui di batch lain. Muat ulang PV Form.',
          409
        );

      // Validasi & apply RAP
      for (const item of pvReport.items) {
        if (toNum(item.aktual) > toNum(item.amount)) {
          throwError(
            `Aktual untuk "${item.purpose}" melebihi pengajuan (${item.amount})`,
            400
          );
        }
        const group = mapExpenseType(item.expense_type);
        if (group && item.category) {
          await RAP.updateOne(
            { _id: pvReport.project },
            {
              $inc: {
                [`${group}.${item.category}.aktual`]: toNum(item.aktual, 0)
              }
            },
            { session }
          );
        }
      }

      // Cek apakah semua detail selesai → tentukan completed_at & request_status
      const approvedReports = await PVReport.find({
        pv_number,
        voucher_number,
        status: 'Disetujui'
      })
        .select('items.source_detail_id')
        .lean();

      const settled = new Set();
      for (const rep of approvedReports)
        for (const it of rep.items || [])
          if (it.source_detail_id) settled.add(String(it.source_detail_id));
      const allDetailIds = new Set(
        (expenseReq.details || []).map((d) => String(d._id))
      );
      const allCleared = [...allDetailIds].every((id) => settled.has(id));

      // Catat ExpenseLog (append detail per-batch) + completed_at bila allCleared
      await ExpenseLog.updateOne(
        { voucher_number },
        {
          $push: {
            details: {
              $each: pvReport.items.map((it) => ({
                pv_report_id: pvReport._id,
                source_detail_id: it.source_detail_id,
                purpose: it.purpose,
                category: it.category,
                quantity: it.quantity,
                unit_price: it.unit_price,
                amount: it.amount,
                aktual: toNum(it.aktual, 0),
                nota: it.nota
              }))
            }
          },
          ...(allCleared
            ? { $set: { completed_at: new Date() } }
            : { $unset: { completed_at: '' } })
        },
        { session, upsert: true }
      );

      await ExpenseRequest.updateOne(
        { payment_voucher: pv_number, voucher_number },
        { $set: { request_status: allCleared ? 'Selesai' : 'Aktif' } },
        { session }
      );
    } else {
      await ExpenseRequest.updateOne(
        { payment_voucher: pv_number, voucher_number },
        { $set: { request_status: 'Aktif' } },
        { session }
      );
    }

    await session.commitTransaction();
    res.status(201).json(pvReport);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= Read/List ================= */
const getAllPVReports = asyncHandler(async (req, res) => {
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

  const totalItems = await PVReport.countDocuments(filter);
  const data = await PVReport.find(filter)
    .populate('created_by', 'name')
    .populate('recipient', 'name')
    .populate('approved_by', 'name')
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
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const report = await PVReport.findById(id)
    .populate('created_by', 'name')
    .populate('recipient', 'name')
    .populate('approved_by', 'name')
    .populate('project', 'project_name')
    .lean();

  if (!report) throwError('PV Report tidak ditemukan', 404);

  report.items = await Promise.all(
    (report.items || []).map(async (item) => {
      let nota_url = null;
      if (item.nota?.key) {
        try {
          nota_url = await getFileUrl(item.nota.key);
        } catch {}
      }
      return { ...item, nota_url };
    })
  );

  res.status(200).json(report);
});

/* ================= Update (PUT, partial-merge) ================= */
const updatePVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const updates = req.body || {};
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pvReport = await PVReport.findById(id).session(session);
    if (!pvReport) throwError('PV Report tidak ditemukan', 404);

    const prevStatus = pvReport.status;
    const userRole = req.user?.role || 'unknown';

    // FE kadang nggak kirim status → pakai status efektif
    const effectiveStatus =
      typeof updates.status !== 'undefined' ? updates.status : pvReport.status;
    const wantApproveNow =
      userRole === 'admin' && effectiveStatus === 'Disetujui';

    const hasItemPayload =
      Array.isArray(updates.items) && updates.items.length > 0;
    const hasFiles = Array.isArray(req.files)
      ? req.files.length > 0
      : req.files &&
        typeof req.files === 'object' &&
        Object.keys(req.files).length > 0;
    const isEditingPayload =
      hasItemPayload || !!updates.report_date || hasFiles;

    // ===== Snapshot kontribusi lama untuk rollback akurat (sebelum merge apapun) =====
    let approvedOldBag = {};
    if (prevStatus === 'Disetujui') {
      for (const it of pvReport.items) {
        const group = mapExpenseType(it.expense_type || pvReport.expense_type);
        if (group && it.category) {
          addInc(
            approvedOldBag,
            `${group}.${it.category}.aktual`,
            -toNum(it.aktual, 0)
          );
        }
      }
    }

    // ===== Jika minta manual reset Disetujui -> Diproses, lakukan rollback dulu =====
    let didManualReset = false;
    if (
      userRole === 'admin' &&
      updates.status === 'Diproses' &&
      prevStatus === 'Disetujui'
    ) {
      const safeRb = await clampIncBagNegatives(
        pvReport.project,
        approvedOldBag,
        session
      );
      if (Object.keys(safeRb).length > 0) {
        await RAP.updateOne(
          { _id: pvReport.project },
          { $inc: safeRb },
          { session }
        );
      }
      await ExpenseLog.updateOne(
        { voucher_number: pvReport.voucher_number },
        {
          $pull: { details: { pv_report_id: pvReport._id } },
          $unset: { completed_at: '' }
        },
        { session }
      );

      pvReport.status = 'Diproses';
      pvReport.approved_by = null;
      pvReport.note = null;

      await ExpenseRequest.updateOne(
        {
          payment_voucher: pvReport.pv_number,
          voucher_number: pvReport.voucher_number
        },
        { $set: { request_status: 'Aktif' } },
        { session }
      );

      didManualReset = true;
    }

    // ===== Larang edit saat masih Disetujui, kecuali reset/approve-now =====
    if (
      prevStatus === 'Disetujui' &&
      isEditingPayload &&
      effectiveStatus !== 'Diproses' &&
      !wantApproveNow
    ) {
      throwError(
        'PV sudah Disetujui. Ubah status ke "Diproses" dulu untuk mengedit.',
        400
      );
    }

    // ===== Merge items (siapkan delta utk approve→approve) =====
    let aktualChanged = false;
    let notaChanged = false;
    const incDeltaBag = {}; // untuk approve->approve (delta RAP)

    if (hasItemPayload || hasFiles) {
      if (userRole === 'admin') {
        // Admin: ubah AKTUAL (opsional) dan boleh ganti NOTA (per index)
        const nextItems = [];
        for (let idx = 0; idx < pvReport.items.length; idx++) {
          const oldItem = pvReport.items[idx];
          const oldObj = oldItem.toObject?.() ?? oldItem;
          const patch = Array.isArray(updates.items)
            ? updates.items[idx]
            : null;

          let next = { ...oldObj };

          // aktual
          if (patch && Object.prototype.hasOwnProperty.call(patch, 'aktual')) {
            const oldAkt = toNum(oldObj.aktual);
            const newAkt = toNum(patch.aktual, oldObj.aktual);
            if (newAkt < 0)
              throwError(
                `Aktual untuk "${oldObj.purpose}" tidak boleh negatif`,
                400
              );
            if (newAkt > toNum(oldObj.amount))
              throwError(
                `Aktual untuk "${oldObj.purpose}" melebihi pengajuan (${oldObj.amount})`,
                400
              );

            if (newAkt !== oldAkt) {
              aktualChanged = true;
              next.aktual = newAkt;
              next.overbudget = toNum(newAkt) > toNum(next.amount);

              if (prevStatus === 'Disetujui') {
                const group = mapExpenseType(
                  next.expense_type || pvReport.expense_type
                );
                const cat = next.category;
                if (group && cat) {
                  addInc(
                    incDeltaBag,
                    `${group}.${cat}.aktual`,
                    newAkt - oldAkt
                  );
                }
              }
            }
          }

          // nota (by index: nota_{i+1})
          const field = `nota_${idx + 1}`;
          let file = null;
          if (Array.isArray(req.files))
            file = req.files.find((f) => f.fieldname === field) || null;
          else if (req.files && typeof req.files === 'object')
            file = (req.files[field] && req.files[field][0]) || null;

          if (file) {
            notaChanged = true;
            if (next?.nota?.key) {
              try {
                await deleteFile(next.nota.key);
              } catch (_) {}
            }
            const ext = path.extname(file.originalname);
            const key = `Pertanggungjawaban Dana/${pvReport.pv_number}/nota_${
              idx + 1
            }_${formatDate()}${ext}`;
            await uploadBuffer(key, file.buffer);
            next.nota = {
              key,
              contentType: file.mimetype,
              size: file.size,
              uploadedAt: new Date()
            };
          }

          nextItems.push(next);
        }
        pvReport.items = nextItems;
        pvReport.markModified('items');
      } else {
        // Karyawan: partial merge by _id (saat Diproses) + handle nota by index
        if (pvReport.status === 'Diproses') {
          const existing = pvReport.items.map((d) =>
            d.toObject ? d.toObject() : d
          );
          const byId = new Map(
            existing
              .filter((it) => it && it._id)
              .map((it) => [String(it._id), it])
          );
          const result = [];

          for (let idx = 0; idx < updates.items.length; idx++) {
            const patch = updates.items[idx] || {};
            const base =
              (patch && patch._id && byId.get(String(patch._id))) ||
              existing[idx] ||
              {};
            const merged = { ...base, ...patch };

            const quantity = normNum(patch, base, 'quantity');
            const unit_price = normNum(patch, base, 'unit_price');
            let amount;
            if (hasKey(patch, 'amount'))
              amount = toNum(patch.amount, base.amount);
            else if (hasKey(patch, 'quantity') || hasKey(patch, 'unit_price'))
              amount =
                toNum(quantity, base.quantity) *
                toNum(unit_price, base.unit_price);
            else amount = base.amount;

            const nextAkt = normNum(patch, base, 'aktual');
            if (toNum(nextAkt) < 0)
              throwError(
                `Aktual untuk "${merged.purpose}" tidak boleh negatif`,
                400
              );
            if (toNum(nextAkt) > toNum(amount))
              throwError(
                `Aktual untuk "${merged.purpose}" melebihi pengajuan (${amount})`,
                400
              );
            if (toNum(nextAkt) !== toNum(base.aktual)) aktualChanged = true;

            merged.quantity = quantity;
            merged.unit_price = unit_price;
            merged.amount = amount;
            merged.aktual = nextAkt;
            merged.expense_type =
              merged.expense_type || base.expense_type || pvReport.expense_type;
            merged.overbudget = toNum(merged.aktual) > toNum(merged.amount);

            // nota per index
            const field = `nota_${idx + 1}`;
            let file = null;
            if (Array.isArray(req.files))
              file = req.files.find((f) => f.fieldname === field) || null;
            else if (req.files && typeof req.files === 'object')
              file = (req.files[field] && req.files[field][0]) || null;

            if (file) {
              notaChanged = true;
              if (base?.nota?.key) {
                try {
                  await deleteFile(base.nota.key);
                } catch (_) {}
              }
              const ext = path.extname(file.originalname);
              const key = `Pertanggungjawaban Dana/${pvReport.pv_number}/nota_${
                idx + 1
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

          pvReport.items = result;
          pvReport.markModified('items');
        }
      }
    }

    // report_date boleh diubah kapan pun selama lolos guard di atas
    if (updates.report_date) {
      pvReport.report_date = updates.report_date;
    }

    // ===== APPROVE → APPROVE (admin), termasuk ubah NOTA saja =====
    if (
      prevStatus === 'Disetujui' &&
      wantApproveNow &&
      (aktualChanged || notaChanged || !!updates.report_date)
    ) {
      // Delta RAP hanya utk perubahan aktual
      if (aktualChanged) {
        const safeInc = await clampIncBagNegatives(
          pvReport.project,
          incDeltaBag,
          session
        );
        if (Object.keys(safeInc).length > 0) {
          await RAP.updateOne(
            { _id: pvReport.project },
            { $inc: safeInc },
            { session }
          );
        }
      }

      // Replace detail batch ini di ExpenseLog (agar nota & aktual terbaru)
      await ExpenseLog.updateOne(
        { voucher_number: pvReport.voucher_number },
        { $pull: { details: { pv_report_id: pvReport._id } } },
        { session }
      );

      // Re-evaluate completeness
      const expense = await ExpenseRequest.findOne({
        payment_voucher: pvReport.pv_number,
        voucher_number: pvReport.voucher_number
      }).select('details');

      await ExpenseLog.updateOne(
        { voucher_number: pvReport.voucher_number },
        {
          $push: {
            details: {
              $each: pvReport.items.map((it) => ({
                pv_report_id: pvReport._id,
                source_detail_id: it.source_detail_id,
                purpose: it.purpose,
                category: it.category,
                quantity: it.quantity,
                unit_price: it.unit_price,
                amount: toNum(it.amount),
                aktual: toNum(it.aktual),
                nota: it.nota
              }))
            }
          }
        },
        { session, upsert: true }
      );

      const approvedReports = await PVReport.find({
        pv_number: pvReport.pv_number,
        voucher_number: pvReport.voucher_number,
        status: 'Disetujui'
      })
        .select('items.source_detail_id')
        .lean();

      const settled = new Set();
      for (const rep of approvedReports)
        for (const it of rep.items || [])
          if (it.source_detail_id) settled.add(String(it.source_detail_id));

      const allDetailIds = new Set(
        (expense?.details || []).map((d) => String(d._id))
      );
      const allCleared =
        [...allDetailIds].length > 0 &&
        [...allDetailIds].every((id) => settled.has(id));

      await ExpenseLog.updateOne(
        { voucher_number: pvReport.voucher_number },
        allCleared
          ? { $set: { completed_at: new Date() } }
          : { $unset: { completed_at: '' } },
        { session }
      );

      // (opsional) update approver/recipient jika dikirim lagi
      if (updates.approved_by) pvReport.approved_by = updates.approved_by;
      if (updates.recipient) pvReport.recipient = updates.recipient;

      await pvReport.save({ session });
      await session.commitTransaction();
      return res.status(200).json(pvReport);
    }

    // ===== EDIT berubah aktual tapi BUKAN approve sekarang → reset ke Diproses (hindari double rollback bila baru di-reset manual) =====
    if (aktualChanged && !wantApproveNow && !didManualReset) {
      if (prevStatus === 'Disetujui') {
        const safeRbBag = await clampIncBagNegatives(
          pvReport.project,
          approvedOldBag,
          session
        );
        if (Object.keys(safeRbBag).length > 0) {
          await RAP.updateOne(
            { _id: pvReport.project },
            { $inc: safeRbBag },
            { session }
          );
        }
        await ExpenseLog.updateOne(
          { voucher_number: pvReport.voucher_number },
          {
            $pull: { details: { pv_report_id: pvReport._id } },
            $unset: { completed_at: '' }
          },
          { session }
        );
      }

      await ExpenseRequest.findOneAndUpdate(
        {
          payment_voucher: pvReport.pv_number,
          voucher_number: pvReport.voucher_number
        },
        { $set: { request_status: 'Aktif' } },
        { session }
      );

      pvReport.status = 'Diproses';
      pvReport.approved_by = null;
      pvReport.note = null;

      await pvReport.save({ session });
      await session.commitTransaction();
      return res.status(200).json(pvReport);
    }

    // ===== Transisi status eksplisit (bukan approve→approve) =====
    if (
      userRole === 'admin' &&
      typeof updates.status !== 'undefined' &&
      updates.status !== pvReport.status
    ) {
      if (updates.status === 'Disetujui' && pvReport.status === 'Diproses') {
        if (!updates.approved_by) throwError('approved_by wajib diisi', 400);

        // Anti dobel approve antar-batch
        const currentIds = pvReport.items
          .map((it) => String(it.source_detail_id))
          .filter(Boolean);
        if (currentIds.length !== pvReport.items.length) {
          throwError('source_detail_id wajib di setiap item', 400);
        }
        const conflict = await PVReport.exists({
          _id: { $ne: pvReport._id },
          pv_number: pvReport.pv_number,
          voucher_number: pvReport.voucher_number,
          status: 'Disetujui',
          'items.source_detail_id': { $in: currentIds }
        }).session(session);
        if (conflict)
          throwError(
            'Ada item yang sudah Disetujui di batch lain. Muat ulang PV Form.',
            409
          );

        // Validasi & apply RAP full
        for (const it of pvReport.items) {
          if (toNum(it.aktual) < 0)
            throwError(`Aktual untuk "${it.purpose}" tidak boleh negatif`, 400);
          if (toNum(it.aktual) > toNum(it.amount))
            throwError(
              `Aktual untuk "${it.purpose}" melebihi pengajuan (${it.amount})`,
              400
            );
        }
        for (const it of pvReport.items) {
          const group = mapExpenseType(
            it.expense_type || pvReport.expense_type
          );
          if (group && it.category) {
            await RAP.updateOne(
              { _id: pvReport.project },
              {
                $inc: {
                  [`${group}.${it.category}.aktual`]: toNum(it.aktual, 0)
                }
              },
              { session }
            );
          }
        }

        // Hitung completeness
        const expense = await ExpenseRequest.findOne({
          payment_voucher: pvReport.pv_number,
          voucher_number: pvReport.voucher_number
        }).select('details');

        const approvedReports = await PVReport.find({
          pv_number: pvReport.pv_number,
          voucher_number: pvReport.voucher_number,
          status: 'Disetujui'
        })
          .select('items.source_detail_id')
          .lean();

        const settled = new Set();
        for (const rep of approvedReports)
          for (const it of rep.items || [])
            if (it.source_detail_id) settled.add(String(it.source_detail_id));
        const allDetailIds = new Set(
          (expense?.details || []).map((d) => String(d._id))
        );
        const allCleared =
          [...allDetailIds].length > 0 &&
          [...allDetailIds].every((id) => settled.has(id));

        // Append details + set/unset completed_at
        await ExpenseLog.updateOne(
          { voucher_number: pvReport.voucher_number },
          {
            $push: {
              details: {
                $each: pvReport.items.map((it) => ({
                  pv_report_id: pvReport._id,
                  source_detail_id: it.source_detail_id,
                  purpose: it.purpose,
                  category: it.category,
                  quantity: it.quantity,
                  unit_price: it.unit_price,
                  amount: toNum(it.amount),
                  aktual: toNum(it.aktual),
                  nota: it.nota
                }))
              }
            },
            ...(allCleared
              ? { $set: { completed_at: new Date() } }
              : { $unset: { completed_at: '' } })
          },
          { session, upsert: true }
        );

        pvReport.status = 'Disetujui';
        pvReport.approved_by = updates.approved_by || pvReport.approved_by;
        pvReport.recipient = updates.recipient || pvReport.recipient;

        await ExpenseRequest.updateOne(
          {
            payment_voucher: pvReport.pv_number,
            voucher_number: pvReport.voucher_number
          },
          { $set: { request_status: allCleared ? 'Selesai' : 'Aktif' } },
          { session }
        );
      }

      if (updates.status === 'Ditolak') {
        if (!updates.note)
          throwError('Catatan wajib diisi jika laporan ditolak', 400);

        if (prevStatus === 'Disetujui') {
          const safeRb = await clampIncBagNegatives(
            pvReport.project,
            approvedOldBag,
            session
          );
          if (Object.keys(safeRb).length > 0) {
            await RAP.updateOne(
              { _id: pvReport.project },
              { $inc: safeRb },
              { session }
            );
          }
          await ExpenseLog.updateOne(
            { voucher_number: pvReport.voucher_number },
            {
              $pull: { details: { pv_report_id: pvReport._id } },
              $unset: { completed_at: '' }
            },
            { session }
          );
        }

        pvReport.status = 'Ditolak';
        pvReport.note = updates.note;
        pvReport.approved_by = null;

        await ExpenseRequest.updateOne(
          {
            payment_voucher: pvReport.pv_number,
            voucher_number: pvReport.voucher_number
          },
          { $set: { request_status: 'Pending' } },
          { session }
        );
      }

      if (updates.status === 'Diproses' && prevStatus !== 'Disetujui') {
        pvReport.status = 'Diproses';
        pvReport.approved_by = null;
        pvReport.note = null;

        await ExpenseRequest.updateOne(
          {
            payment_voucher: pvReport.pv_number,
            voucher_number: pvReport.voucher_number
          },
          { $set: { request_status: 'Aktif' } },
          { session }
        );
      }
    }

    await pvReport.save({ session });
    await session.commitTransaction();
    res.status(200).json(pvReport);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= Delete ================= */
const deletePVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pvReport = await PVReport.findById(id).session(session);
    if (!pvReport) throwError('PV Report tidak ditemukan', 404);

    if (pvReport.status === 'Disetujui')
      throwError('Laporan yang sudah disetujui tidak bisa dihapus', 403);

    // rollback ke pengajuan biaya aktif
    await ExpenseRequest.findOneAndUpdate(
      {
        payment_voucher: pvReport.pv_number,
        voucher_number: pvReport.voucher_number
      },
      { $set: { request_status: 'Aktif' } },
      { session }
    );

    // hapus nota
    for (const item of pvReport.items) {
      if (item?.nota?.key) {
        try {
          await deleteFile(item.nota.key);
        } catch (_) {}
      }
    }

    await pvReport.deleteOne({ session });
    await session.commitTransaction();
    res.status(200).json({ message: 'PV Report berhasil dihapus' });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const getAllEmployee = asyncHandler(async (_req, res) => {
  const employee = await Employee.find().select('name');
  if (!employee) throwError('Karyawan tidak ada', 404);
  res.status(200).json(employee);
});

const getMyPVNumbers = asyncHandler(async (req, res) => {
  if (req.user.role !== 'karyawan') {
    return res.status(200).json({ pv_numbers: [] });
  }

  const employee = await Employee.findOne({ user: req.user.id }).select(
    '_id name'
  );
  if (!employee) throwError('Karyawan tidak ditemukan', 404);

  const expenses = await ExpenseRequest.find({
    status: 'Disetujui',
    payment_voucher: { $ne: null },
    name: employee._id
  })
    .select('payment_voucher voucher_number project name details createdAt')
    .populate('project', 'project_name')
    .populate('name', 'name')
    .sort({ createdAt: -1 })
    .lean();

  if (expenses.length === 0) return res.status(200).json({ pv_numbers: [] });

  const pairOr = expenses.map((e) => ({
    pv_number: e.payment_voucher,
    voucher_number: e.voucher_number
  }));
  const reports = await PVReport.find({
    status: { $in: ['Diproses', 'Disetujui'] },
    $or: pairOr
  })
    .select('pv_number voucher_number items.source_detail_id')
    .lean();

  const usedMap = new Map(); // key: "pv::voucher" -> Set(detail_id)
  for (const r of reports) {
    const key = `${r.pv_number}::${r.voucher_number}`;
    let set = usedMap.get(key);
    if (!set) {
      set = new Set();
      usedMap.set(key, set);
    }
    for (const it of r.items || [])
      if (it?.source_detail_id) set.add(String(it.source_detail_id));
  }

  const available = expenses.filter((exp) => {
    const key = `${exp.payment_voucher}::${exp.voucher_number}`;
    const used = usedMap.get(key) || new Set();
    return (exp.details || []).some((d) => !used.has(String(d._id)));
  });

  res.status(200).json({
    pv_numbers: available.map((exp) => ({
      id: exp._id,
      pv_number: exp.payment_voucher,
      voucher_number: exp.voucher_number,
      employee: exp.name?.name || null,
      project_name: exp.project?.project_name || null
    }))
  });
});

const getPVForm = asyncHandler(async (req, res) => {
  const { pv_number } = req.params;

  const expense = await ExpenseRequest.findOne({
    payment_voucher: pv_number,
    status: 'Disetujui'
  })
    .populate('project', 'project_name')
    .populate('name', 'name position')
    .lean();

  if (!expense) throwError('Payment Voucher tidak ditemukan!', 404);

  const reports = await PVReport.find({
    pv_number: expense.payment_voucher,
    voucher_number: expense.voucher_number,
    status: { $in: ['Diproses', 'Disetujui'] }
  })
    .select('items.source_detail_id')
    .lean();

  const used = new Set();
  for (const rep of reports)
    for (const it of rep.items || [])
      if (it?.source_detail_id) used.add(String(it.source_detail_id));

  const remaining = (expense.details || []).filter(
    (d) => !used.has(String(d._id))
  );

  res.status(200).json({
    pv_number: expense.payment_voucher,
    voucher_number: expense.voucher_number,
    project: expense.project?._id,
    project_name: expense.project?.project_name,
    name: expense.name?.name,
    position: expense.name?.position || null,
    items: remaining.map((it) => {
      const key = it.category;
      const label = categoryLabels[key] ?? key;
      return {
        source_detail_id: it._id,
        purpose: it.purpose,
        category: key,
        category_label: label,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount
      };
    }),
    total_amount: expense.total_amount
  });
});

module.exports = {
  createPVReport,
  getAllPVReports,
  getPVReport,
  updatePVReport,
  deletePVReport,
  getAllEmployee,
  getMyPVNumbers,
  getPVForm
};
