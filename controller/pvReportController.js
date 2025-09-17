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

  const filter = {};
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

  // ===== Helpers (local) =====
  const DBG = (...args) => console.log('[PVReport:update]', ...args);
  const toNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const getByPath = (obj, path) =>
    path
      .split('.')
      .reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);

  const updates = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pvReport = await PVReport.findById(id).session(session);
    if (!pvReport) throwError('PV Report tidak ditemukan', 404);

    const prevStatus = pvReport.status;
    const userRole = req.user?.role || 'unknown';

    DBG('START', {
      pv_id: String(pvReport._id),
      voucher_number: pvReport.voucher_number,
      pv_number: pvReport.pv_number,
      role: userRole,
      prevStatus,
      updateKeys: Object.keys(updates || {}),
      files: Array.isArray(req.files)
        ? req.files.map((f) => f.fieldname)
        : (req.files && Object.keys(req.files)) || []
    });

    /* ==================== ADMIN ==================== */
    if (userRole === 'admin') {
      // --- Merge aktual kalau dikirim (TIDAK auto-reset status) ---
      if (updates.items && Array.isArray(updates.items)) {
        DBG('ADMIN: merge items (aktual)', { count: updates.items.length });

        pvReport.items = pvReport.items.map((oldItem, idx) => {
          const oldObj = oldItem.toObject?.() ?? oldItem;
          const patch = updates.items[idx];

          if (!patch) return oldItem;

          const next = {
            ...oldObj,
            // hanya izinkan update aktual dari patch (biar jelas)
            aktual: toNum(patch.aktual, oldObj.aktual)
          };
          next.overbudget = toNum(next.aktual) > toNum(next.amount);

          if (toNum(patch.aktual) !== toNum(oldObj.aktual)) {
            DBG('ADMIN: aktual changed', {
              idx,
              purpose: next.purpose,
              before: toNum(oldObj.aktual),
              after: toNum(next.aktual),
              amount: toNum(next.amount),
              overbudget: next.overbudget
            });
          }

          return next;
        });

        pvReport.markModified('items');
      }

      // --- Ubah status manual (Disetujui / Ditolak / Diproses, dll) ---
      if (updates.status && updates.status !== prevStatus) {
        DBG('ADMIN: status change requested', {
          from: prevStatus,
          to: updates.status
        });

        if (updates.status === 'Disetujui') {
          if (!updates.approved_by) throwError('approved_by wajib diisi', 400);
          pvReport.approved_by = updates.approved_by;
          pvReport.recipient = updates.recipient || pvReport.recipient;

          // Validasi + update RAP
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

            DBG('APPROVE: prepare RAP inc', {
              purpose: item.purpose,
              expense_type: expenseType,
              map_group: group,
              category,
              inc: incVal
            });

            if (group && category) {
              const pathStr = `${group}.${category}.aktual`;

              const upd = await RAP.updateOne(
                { _id: pvReport.project },
                { $inc: { [pathStr]: incVal } },
                { session }
              );

              DBG('APPROVE: RAP $inc result', {
                path: pathStr,
                inc: incVal,
                matchedCount: upd.matchedCount,
                modifiedCount: upd.modifiedCount
              });

              // READ-BACK nilai terkini (debug verifikasi)
              try {
                const rapAfter = await RAP.findById(pvReport.project)
                  .select(pathStr)
                  .lean()
                  .session(session);
                const nowVal = getByPath(rapAfter || {}, pathStr);
                DBG('APPROVE: RAP read-back', {
                  path: pathStr,
                  current_value: nowVal
                });
              } catch (e) {
                DBG('APPROVE: RAP read-back FAILED', e?.message);
              }
            } else {
              DBG('APPROVE: SKIP RAP inc (missing group/category)', {
                expense_type: expenseType,
                group,
                category
              });
            }
          }

          // sinkronisasi ExpenseLog (set completed_at)
          const logUpd = await ExpenseLog.findOneAndUpdate(
            { voucher_number: pvReport.voucher_number },
            {
              $set: {
                details: pvReport.items.map((it) => ({
                  purpose: it.purpose,
                  category: it.category,
                  quantity: it.quantity,
                  unit_price: it.unit_price,
                  amount: it.amount,
                  aktual: toNum(it.aktual),
                  nota: it.nota
                })),
                completed_at: new Date()
              }
            },
            { session, new: true }
          );
          DBG('APPROVE: ExpenseLog updated', {
            log_found: !!logUpd,
            details_count: pvReport.items.length
          });

          // Update ExpenseRequest -> Selesai
          const erUpd = await ExpenseRequest.findOneAndUpdate(
            {
              payment_voucher: pvReport.pv_number,
              voucher_number: pvReport.voucher_number
            },
            { $set: { request_status: 'Selesai' } },
            { session, new: true }
          );
          DBG('APPROVE: ExpenseRequest status -> Selesai', { found: !!erUpd });
        }

        if (updates.status === 'Ditolak') {
          if (!updates.note)
            throwError('Catatan wajib diisi jika laporan ditolak', 400);
          pvReport.note = updates.note;
          pvReport.approved_by = null;

          const erUpd = await ExpenseRequest.findOneAndUpdate(
            {
              payment_voucher: pvReport.pv_number,
              voucher_number: pvReport.voucher_number
            },
            { $set: { request_status: 'Pending' } },
            { session, new: true }
          );
          DBG('REJECT: ExpenseRequest status -> Pending', { found: !!erUpd });
        }

        // Rollback RAP jika sebelumnya sudah Disetujui lalu berubah ke non-Disetujui
        if (prevStatus === 'Disetujui' && updates.status !== 'Disetujui') {
          DBG('ROLLBACK: from Approved -> non-Approved, revert RAP aktual');

          for (const item of pvReport.items) {
            const decVal = -toNum(item.aktual);
            const expenseType = item.expense_type || pvReport.expense_type;
            const group = mapExpenseType(expenseType);
            const category = item.category;

            if (group && category) {
              const pathStr = `${group}.${category}.aktual`;

              const upd = await RAP.updateOne(
                { _id: pvReport.project },
                { $inc: { [pathStr]: decVal } },
                { session }
              );

              DBG('ROLLBACK: RAP $inc result', {
                path: pathStr,
                inc: decVal,
                matchedCount: upd.matchedCount,
                modifiedCount: upd.modifiedCount
              });

              // READ-BACK nilai terkini (debug verifikasi)
              try {
                const rapAfter = await RAP.findById(pvReport.project)
                  .select(pathStr)
                  .lean()
                  .session(session);
                const nowVal = getByPath(rapAfter || {}, pathStr);
                DBG('ROLLBACK: RAP read-back', {
                  path: pathStr,
                  current_value: nowVal
                });
              } catch (e) {
                DBG('ROLLBACK: RAP read-back FAILED', e?.message);
              }
            } else {
              DBG('ROLLBACK: SKIP (missing group/category)', {
                expense_type: expenseType,
                group,
                category
              });
            }
          }

          // unset completed_at di ExpenseLog
          const logUpd = await ExpenseLog.findOneAndUpdate(
            { voucher_number: pvReport.voucher_number },
            { $unset: { completed_at: '' } },
            { session, new: true }
          );
          DBG('ROLLBACK: ExpenseLog unset completed_at', {
            log_found: !!logUpd
          });
        }

        pvReport.status = updates.status;
      }
    } else {
      /* ==================== KARYAWAN ==================== */
      // Karyawan update items (nota/aktual/amount dll)
      if (updates.items && Array.isArray(updates.items)) {
        DBG('EMPLOYEE: merge items', { count: updates.items.length });

        const existing = pvReport.items.map((d) =>
          d.toObject ? d.toObject() : d
        );
        const result = [];

        for (let idx = 0; idx < updates.items.length; idx++) {
          const patch = updates.items[idx] || {};
          const base = existing[idx] || {};
          const merged = { ...base, ...patch };

          merged.quantity = toNum(merged.quantity);
          merged.unit_price = toNum(merged.unit_price);
          merged.amount = toNum(merged.amount);
          merged.aktual = toNum(merged.aktual);

          if (merged.aktual < 0) {
            throwError(
              `Aktual untuk "${merged.purpose}" tidak boleh negatif`,
              400
            );
          }

          merged.expense_type =
            merged.expense_type || base.expense_type || pvReport.expense_type;
          merged.overbudget = merged.aktual > merged.amount;

          // --- handle file nota_i ---
          const fileField = `nota_${idx + 1}`;
          let file = null;
          if (Array.isArray(req.files)) {
            file = req.files.find((f) => f.fieldname === fileField) || null;
          } else if (req.files && typeof req.files === 'object') {
            file = req.files[fileField]?.[0] || null;
          }

          if (file) {
            DBG('EMPLOYEE: upload nota', {
              idx,
              field: fileField,
              name: file.originalname,
              size: file.size
            });

            // hapus file lama jika ada
            if (base?.nota?.key) {
              try {
                await deleteFile(base.nota.key);
                DBG('EMPLOYEE: delete old nota OK', {
                  idx,
                  key: base.nota.key
                });
              } catch (e) {
                DBG('EMPLOYEE: delete old nota FAILED', {
                  idx,
                  err: e?.message
                });
              }
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
            merged.nota = merged.nota ?? base.nota ?? null;
          }

          DBG('EMPLOYEE: item merged', {
            idx,
            purpose: merged.purpose,
            amount: merged.amount,
            aktual: merged.aktual,
            overbudget: merged.overbudget
          });

          result.push(merged);
        }

        pvReport.items = result;
        pvReport.markModified('items');
      }

      if (updates.report_date) {
        DBG('EMPLOYEE: set report_date', { report_date: updates.report_date });
        pvReport.report_date = updates.report_date;
      }

      // Karyawan SELALU reset status -> Diproses (sesuai requirement)
      pvReport.status = 'Diproses';
      pvReport.approved_by = null;
      pvReport.note = null;

      // Sinkronisasi ExpenseLog (tanpa completed_at)
      const logUpd = await ExpenseLog.findOneAndUpdate(
        { voucher_number: pvReport.voucher_number },
        {
          $set: {
            details: pvReport.items.map((it) => ({
              purpose: it.purpose,
              category: it.category,
              quantity: it.quantity,
              unit_price: it.unit_price,
              amount: it.amount,
              aktual: toNum(it.aktual),
              nota: it.nota
            }))
          }
        },
        { session, new: true }
      );
      DBG('EMPLOYEE: ExpenseLog updated (no completed_at)', {
        log_found: !!logUpd,
        details_count: pvReport.items.length
      });
    }

    await pvReport.save({ session });
    DBG('SAVE OK', { newStatus: pvReport.status });

    await session.commitTransaction();
    DBG('COMMIT OK');

    return res.status(200).json(pvReport);
  } catch (err) {
    DBG('ERROR', err?.message);
    DBG('STACK', err?.stack);
    try {
      await session.abortTransaction();
      DBG('ABORT OK');
    } catch (e) {
      DBG('ABORT FAILED', e?.message);
    }
    throw err;
  } finally {
    session.endSession();
    DBG('SESSION ENDED');
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
