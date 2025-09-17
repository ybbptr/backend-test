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

  // validasi aktual non-negatif
  for (const it of items) {
    if ((it.aktual ?? 0) < 0) {
      throwError(
        `Aktual untuk "${it.purpose}" (kategori: ${it.category}) tidak boleh negatif`,
        400
      );
    }
  }

  // cari ExpenseRequest terkait
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
    createdById = me?._id || expenseReq.name; // fallback ke pemohon ER
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (req.user.role === 'admin' && status === 'Disetujui' && !approved_by) {
      throwError('approved_by wajib diisi jika status Disetujui', 400);
    }

    // buat PV Report
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

    // upload nota per item
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const file = req.files?.[`nota_${i + 1}`]?.[0];
      let notaObj = null;

      if (file) {
        const ext = path.extname(file.originalname);
        const key = `Pertanggungjawaban Dana/${pv_number}/nota_${
          i + 1
        }_${formatDate()}${ext}`;
        await uploadBuffer(key, file.buffer);
        notaObj = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }

      pvReport.items.push({
        ...it,
        expense_type: expenseReq.expense_type,
        nota: notaObj,
        overbudget: (it.aktual ?? 0) > it.amount
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
      // default kalau karyawan buat → status Aktif
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

  // generate nota_url
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

/* ================= Update ================= */
const updatePVReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const updates = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pvReport = await PVReport.findById(id).session(session);
    if (!pvReport) throwError('PV Report tidak ditemukan', 404);

    const prevStatus = pvReport.status;
    const userRole = req.user?.role;

    if (userRole === 'admin') {
      if (updates.status && updates.status !== prevStatus) {
        if (updates.status === 'Disetujui') {
          if (!updates.approved_by) throwError('approved_by wajib diisi', 400);
          pvReport.approved_by = updates.approved_by;
          pvReport.recipient = updates.recipient || pvReport.recipient;

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
                  $inc: {
                    [`${group}.${item.category}.aktual`]: item.aktual || 0
                  }
                },
                { session }
              );
            }
          }

          await ExpenseLog.findOneAndUpdate(
            { voucher_number: pvReport.voucher_number },
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

          await ExpenseRequest.findOneAndUpdate(
            {
              payment_voucher: pvReport.pv_number,
              voucher_number: pvReport.voucher_number
            },
            { $set: { request_status: 'Pending' } },
            { session }
          );
        }

        if (prevStatus === 'Disetujui' && updates.status !== 'Disetujui') {
          // rollback RAP aktual
          for (const item of pvReport.items) {
            const group = mapExpenseType(item.expense_type);
            if (group && item.category) {
              await RAP.updateOne(
                { _id: pvReport.project },
                {
                  $inc: {
                    [`${group}.${item.category}.aktual`]: -(item.aktual || 0)
                  }
                },
                { session }
              );
            }
          }

          await ExpenseLog.findOneAndUpdate(
            { voucher_number: pvReport.voucher_number },
            { $unset: { completed_at: '' } },
            { session }
          );
        }

        pvReport.status = updates.status;
      }
    } else {
      // Karyawan: boleh update items & report_date, reset status ke Diproses
      if (updates.items && Array.isArray(updates.items)) {
        for (const it of updates.items) {
          if ((it.aktual ?? 0) < 0)
            throwError(`Aktual untuk "${it.purpose}" tidak boleh negatif`, 400);
        }
        pvReport.items = updates.items.map((it) => ({
          ...it,
          expense_type: it.expense_type || pvReport.expense_type,
          overbudget: (it.aktual ?? 0) > it.amount
        }));
      }

      if (updates.report_date) pvReport.report_date = updates.report_date;

      pvReport.status = 'Diproses';
      pvReport.approved_by = null;
      pvReport.note = null;

      await ExpenseLog.findOneAndUpdate(
        { voucher_number: pvReport.voucher_number },
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
            }))
          }
        },
        { session }
      );
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

    if (pvReport.status === 'Disetujui') {
      for (const item of pvReport.items) {
        const group = mapExpenseType(item.expense_type);
        if (group && item.category) {
          await RAP.updateOne(
            { _id: pvReport.project },
            {
              $inc: {
                [`${group}.${item.category}.aktual`]: -(item.aktual || 0)
              }
            },
            { session }
          );
        }
      }
    }

    for (const item of pvReport.items) {
      if (item?.nota?.key) {
        await deleteFile(item.nota.key);
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

/* ================= Helpers for FE ================= */
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
    filter.name = employee._id; // hanya milik karyawan tsb
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
    items: expense.details.map((it) => ({
      purpose: it.purpose,
      category: it.category,
      quantity: it.quantity,
      unit_price: it.unit_price,
      amount: it.amount
    })),
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
