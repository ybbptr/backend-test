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
  if (Array.isArray(req.files)) {
    return req.files.find((f) => f.fieldname === field) || null;
  }
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

  if (!pv_number || !voucher_number || items.length === 0) {
    throwError('Field wajib belum lengkap', 400);
  }

  for (const it of items) {
    if ((it.aktual ?? 0) < 0) {
      throwError(
        `Aktual untuk "${it.purpose}" (kategori: ${it.category}) tidak boleh negatif`,
        400
      );
    }
  }

  const expenseReq = await ExpenseRequest.findOne({
    payment_voucher: pv_number,
    voucher_number
  }).select('name project expense_type request_status details');

  if (!expenseReq) throwError('Pengajuan biaya tidak ditemukan', 404);

  // Tentukan created_by berdasar role
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
          note: req.user.role === 'admin' && status === 'Ditolak' ? note : null,
          items: []
        }
      ],
      { session }
    );

    // Upload nota per item (wajib ada)
    for (let i = 0; i < items.length; i++) {
      const it = items[i];

      const file = getNotaFile(req, i);
      if (!file) {
        throwError(`Nota (bukti) untuk item #${i + 1} wajib diupload`, 400);
      }

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
        overbudget: (Number(it.aktual) || 0) > (Number(it.amount) || 0)
      });
    }

    await pvReport.save({ session });

    if (req.user.role === 'admin' && status === 'Disetujui') {
      for (const item of pvReport.items) {
        if ((item.aktual ?? 0) > item.amount) {
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
              $inc: { [`${group}.${item.category}.aktual`]: item.aktual || 0 }
            },
            { session }
          );
        }
      }

      await ExpenseLog.findOneAndUpdate(
        { voucher_number },
        {
          $set: {
            details: pvReport.items.map((it) => ({
              purpose: it.purpose,
              category: it.category,
              quantity: it.quantity,
              unit_price: it.unit_price,
              amount: it.amount,
              aktual: it.aktual || 0,
              nota: it.nota
            })),
            completed_at: new Date()
          }
        },
        { session }
      );

      await ExpenseRequest.findOneAndUpdate(
        { payment_voucher: pv_number, voucher_number },
        { $set: { request_status: 'Selesai' } },
        { session }
      );
    } else {
      await ExpenseRequest.findOneAndUpdate(
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

/* ================= Read ================= */
const getAllPVReports = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = req.query.search || '';
  const filter = search
    ? {
        $or: [
          { voucher_number: { $regex: search, $options: 'i' } },
          { payment_voucher: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  if (req.query.project) {
    filter.project = req.query.project;
  }

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
    report.items.map(async (item) => {
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

const updatePVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  // ===== Helpers aman =====
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

  // Clamp delta negatif agar nilai akhir tidak < 0
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

  const updates = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pvReport = await PVReport.findById(id).session(session);
    if (!pvReport) throwError('PV Report tidak ditemukan', 404);

    const prevStatus = pvReport.status;
    const userRole = req.user?.role || 'unknown';
    const wantApproveNow =
      userRole === 'admin' && updates.status === 'Disetujui';

    // ===== Snapshot kontribusi lama (untuk rollback akurat bila sebelumnya approved) =====
    let approvedOldBag = {};
    if (prevStatus === 'Disetujui') {
      for (const item of pvReport.items) {
        const expenseType = item.expense_type || pvReport.expense_type;
        const group = mapExpenseType(expenseType);
        const category = item.category;
        if (group && category) {
          const pathStr = `${group}.${category}.aktual`;
          addInc(approvedOldBag, pathStr, -toNum(item.aktual));
        }
      }
    }

    // ===== Merge items & deteksi perubahan AKTUAL =====
    let aktualChanged = false;
    const incDeltaBag = {}; // dipakai saat approve->approve

    if (updates.items && Array.isArray(updates.items)) {
      if (userRole === 'admin') {
        // Admin: update AKTUAL saja (tanpa await di callback)
        const nextItems = [];
        for (let idx = 0; idx < pvReport.items.length; idx++) {
          const oldItem = pvReport.items[idx];
          const oldObj = oldItem.toObject?.() ?? oldItem;
          const patch = updates.items[idx];

          if (!patch) {
            nextItems.push(oldItem);
            continue;
          }

          const oldAkt = toNum(oldObj.aktual);
          const newAkt = toNum(patch.aktual, oldObj.aktual);
          if (newAkt !== oldAkt) aktualChanged = true;

          const next = { ...oldObj, aktual: newAkt };
          next.overbudget = toNum(next.aktual) > toNum(next.amount);

          // Kalau sudah approved & tetap mau approved (approve->approve), siapkan delta
          if (prevStatus === 'Disetujui') {
            const oldExpType = oldObj.expense_type || pvReport.expense_type;
            const newExpType = next.expense_type || pvReport.expense_type;
            const oldGroup = mapExpenseType(oldExpType);
            const newGroup = mapExpenseType(newExpType);
            const oldCat = oldObj.category;
            const newCat = next.category;
            const oldPath =
              oldGroup && oldCat ? `${oldGroup}.${oldCat}.aktual` : null;
            const newPath =
              newGroup && newCat ? `${newGroup}.${newCat}.aktual` : null;

            if (newPath && oldPath) {
              if (newPath === oldPath) {
                addInc(incDeltaBag, newPath, newAkt - oldAkt);
              } else {
                addInc(incDeltaBag, oldPath, -oldAkt);
                addInc(incDeltaBag, newPath, newAkt);
              }
            } else if (oldPath && !newPath) {
              addInc(incDeltaBag, oldPath, -oldAkt);
            } else if (!oldPath && newPath) {
              addInc(incDeltaBag, newPath, newAkt);
            }
          }

          nextItems.push(next);
        }
        pvReport.items = nextItems;
        pvReport.markModified('items');
      } else {
        // Karyawan: merge menyeluruh + handle nota (pakai loop async-friendly)
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

          // Numeric fields: hanya ubah kalau field dikirim
          const quantity = normNum(patch, base, 'quantity');
          const unit_price = normNum(patch, base, 'unit_price');

          let amount;
          if (hasKey(patch, 'amount')) {
            amount = toNum(patch.amount, base.amount);
          } else if (hasKey(patch, 'quantity') || hasKey(patch, 'unit_price')) {
            // kalau qty/price berubah, amount turunan
            amount =
              toNum(quantity, base.quantity) *
              toNum(unit_price, base.unit_price);
          } else {
            amount = base.amount;
          }

          const nextAkt = normNum(patch, base, 'aktual');
          if (toNum(nextAkt) !== toNum(base.aktual)) aktualChanged = true;
          if (toNum(nextAkt) < 0)
            throwError(
              `Aktual untuk "${merged.purpose}" tidak boleh negatif`,
              400
            );

          merged.quantity = quantity;
          merged.unit_price = unit_price;
          merged.amount = amount;
          merged.aktual = nextAkt;

          merged.expense_type =
            merged.expense_type || base.expense_type || pvReport.expense_type;

          merged.overbudget = toNum(merged.aktual) > toNum(merged.amount);

          const fileField = `nota_${idx + 1}`;
          let file = null;
          if (Array.isArray(req.files)) {
            file = req.files.find((f) => f.fieldname === fileField) || null;
          } else if (req.files && typeof req.files === 'object') {
            file = (req.files[fileField] && req.files[fileField][0]) || null;
          }

          if (file) {
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

    if (updates.report_date) {
      pvReport.report_date = updates.report_date;
    }

    if (aktualChanged && !wantApproveNow) {
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
        // Log: unset completed_at
        await ExpenseLog.findOneAndUpdate(
          { voucher_number: pvReport.voucher_number },
          { $unset: { completed_at: '' } },
          { session }
        );
      }

      // Sinkron detail log (tanpa completed_at)
      await ExpenseLog.findOneAndUpdate(
        { voucher_number: pvReport.voucher_number },
        {
          $set: {
            details: pvReport.items.map((it) => ({
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
        { session }
      );

      // ExpenseRequest -> Aktif
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

    // ===== Jalur perubahan STATUS (tanpa perubahan aktual, atau aktualChanged + approveNow) =====
    if (
      userRole === 'admin' &&
      updates.status &&
      updates.status !== prevStatus
    ) {
      if (updates.status === 'Disetujui') {
        if (!updates.approved_by) throwError('approved_by wajib diisi', 400);
        pvReport.approved_by = updates.approved_by;
        pvReport.recipient = updates.recipient || pvReport.recipient;

        if (prevStatus === 'Disetujui') {
          // approve -> approve: terapkan delta (clamp)
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
        } else {
          // (Diproses/Ditolak) -> Disetujui: full inc sesuai aktual
          for (const item of pvReport.items) {
            const incVal = toNum(item.aktual);
            const amount = toNum(item.amount);
            if (incVal > amount) {
              throwError(
                `Aktual untuk "${item.purpose}" melebihi pengajuan (${amount})`,
                400
              );
            }
            const expenseType = item.expense_type || pvReport.expense_type;
            const group = mapExpenseType(expenseType);
            const category = item.category;
            if (group && category) {
              const pathStr = `${group}.${category}.aktual`;
              await RAP.updateOne(
                { _id: pvReport.project },
                { $inc: { [pathStr]: incVal } },
                { session }
              );
            }
          }
        }

        // Log + completed_at
        await ExpenseLog.findOneAndUpdate(
          { voucher_number: pvReport.voucher_number },
          {
            $set: {
              details: pvReport.items.map((it) => ({
                purpose: it.purpose,
                category: it.category,
                quantity: it.quantity,
                unit_price: it.unit_price,
                amount: toNum(it.amount),
                aktual: toNum(it.aktual),
                nota: it.nota
              })),
              completed_at: new Date()
            }
          },
          { session }
        );

        // ExpenseRequest -> Selesai
        await ExpenseRequest.findOneAndUpdate(
          {
            payment_voucher: pvReport.pv_number,
            voucher_number: pvReport.voucher_number
          },
          { $set: { request_status: 'Selesai' } },
          { session }
        );
      }

      if (updates.status === 'Ditolak') {
        if (!updates.note)
          throwError('Catatan wajib diisi jika laporan ditolak', 400);
        pvReport.note = updates.note;
        pvReport.approved_by = null;

        if (prevStatus === 'Disetujui') {
          const rbBag = {};
          for (const item of pvReport.items) {
            const expenseType = item.expense_type || pvReport.expense_type;
            const group = mapExpenseType(expenseType);
            const category = item.category;
            if (group && category) {
              const pathStr = `${group}.${category}.aktual`;
              addInc(rbBag, pathStr, -toNum(item.aktual));
            }
          }
          const safeRbBag = await clampIncBagNegatives(
            pvReport.project,
            rbBag,
            session
          );
          if (Object.keys(safeRbBag).length > 0) {
            await RAP.updateOne(
              { _id: pvReport.project },
              { $inc: safeRbBag },
              { session }
            );
          }
          await ExpenseLog.findOneAndUpdate(
            { voucher_number: pvReport.voucher_number },
            { $unset: { completed_at: '' } },
            { session }
          );
        }

        // ExpenseRequest -> Pending
        await ExpenseRequest.findOneAndUpdate(
          {
            payment_voucher: pvReport.pv_number,
            voucher_number: pvReport.voucher_number
          },
          { $set: { request_status: 'Pending' } },
          { session }
        );
      }

      if (updates.status === 'Diproses') {
        if (prevStatus === 'Disetujui') {
          const rbBag = {};
          for (const item of pvReport.items) {
            const expenseType = item.expense_type || pvReport.expense_type;
            const group = mapExpenseType(expenseType);
            const category = item.category;
            if (group && category) {
              const pathStr = `${group}.${category}.aktual`;
              addInc(rbBag, pathStr, -toNum(item.aktual));
            }
          }
          const safeRbBag = await clampIncBagNegatives(
            pvReport.project,
            rbBag,
            session
          );
          if (Object.keys(safeRbBag).length > 0) {
            await RAP.updateOne(
              { _id: pvReport.project },
              { $inc: safeRbBag },
              { session }
            );
          }
          await ExpenseLog.findOneAndUpdate(
            { voucher_number: pvReport.voucher_number },
            { $unset: { completed_at: '' } },
            { session }
          );
        }

        // ExpenseRequest -> Aktif
        await ExpenseRequest.findOneAndUpdate(
          {
            payment_voucher: pvReport.pv_number,
            voucher_number: pvReport.voucher_number
          },
          { $set: { request_status: 'Aktif' } },
          { session }
        );
      }

      pvReport.status = updates.status;
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

const deletePVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pvReport = await PVReport.findById(id).session(session);
    if (!pvReport) throwError('PV Report tidak ditemukan', 404);

    if (pvReport.status === 'Disetujui') {
      throwError('Laporan yang sudah disetujui tidak bisa dihapus', 403);
    }

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

const getAllEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.find().select('name');
  if (!employee) throwError('Karyawan tidak ada', 404);
  res.status(200).json(employee);
});

const getMyPVNumbers = asyncHandler(async (req, res) => {
  let filter = { status: 'Disetujui', payment_voucher: { $ne: null } };

  if (req.user.role === 'karyawan') {
    const employee = await Employee.findOne({ user: req.user.id }).select(
      '_id name'
    );
    if (!employee) throwError('Karyawan tidak ditemukan', 404);
    filter.name = employee._id;
  }

  const expenseRequests = await ExpenseRequest.find(filter)
    .select('payment_voucher voucher_number project name')
    .populate('project', 'project_name')
    .populate('name', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const usedReports = await PVReport.find({
    pv_number: { $in: expenseRequests.map((exp) => exp.payment_voucher) }
  }).select('pv_number');

  const usedPV = new Set(usedReports.map((r) => r.pv_number));
  const available = expenseRequests.filter(
    (exp) => !usedPV.has(exp.payment_voucher)
  );

  res.status(200).json({
    pv_numbers: available.map((exp) => ({
      id: exp._id,
      pv_number: exp.payment_voucher,
      voucher_number: exp.voucher_number,
      employee: exp.name?.name || null
    }))
  });
});

// Label kategori (untuk PV Form)
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

  res.status(200).json({
    pv_number: expense.payment_voucher,
    voucher_number: expense.voucher_number,
    project: expense.project?._id,
    project_name: expense.project?.project_name,
    name: expense.name?.name,
    position: expense.name?.position || null,
    items: expense.details.map((it, idx) => {
      const key = it.category;
      const label = categoryLabels[key] ?? key;
      return {
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
