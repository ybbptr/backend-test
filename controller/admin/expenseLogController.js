// controllers/expenseLogController.js
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const throwError = require('../../utils/throwError');
const ExpenseLog = require('../../model/expenseLogModel');
const { getFileUrl } = require('../../utils/wasabi');

/* =============== Helpers =============== */
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

function requireAdmin(req) {
  if (req.user?.role !== 'admin') throwError('Hanya admin yang diizinkan', 403);
}

async function attachNotaUrls(doc) {
  if (!doc?.details?.length) return doc;

  const details = await Promise.all(
    doc.details.map(async (item) => {
      let nota_url = null;
      if (item.nota?.key) {
        try {
          nota_url = await getFileUrl(item.nota.key);
        } catch (_) {
          nota_url = null;
        }
      }
      return { ...item, nota_url };
    })
  );

  return { ...doc, details };
}

/* =============== Controllers =============== */

// LIST (admin only)
const getExpenseLogs = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.voucher_number)
    filter.voucher_number = req.query.voucher_number;
  if (req.query.payment_voucher)
    filter.payment_voucher = req.query.payment_voucher;
  if (req.query.project && isObjectId(req.query.project))
    filter.project = req.query.project;
  if (req.query.requester && isObjectId(req.query.requester))
    filter.requester = req.query.requester;

  const [totalItems, logs] = await Promise.all([
    ExpenseLog.countDocuments(filter),
    ExpenseLog.find(filter)
      .select('-details.nota') // biar ringan di list
      .populate('requester', 'name')
      .populate('project', 'project_name -_id')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean()
  ]);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data: logs
  });
});

const getExpenseLog = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { id } = req.params;
  if (!isObjectId(id)) throwError('ID tidak valid', 400);

  const log = await ExpenseLog.findById(id)
    .populate('requester', 'name')
    .populate('project', 'project_name')
    .lean();

  if (!log) throwError('Log laporan biaya tidak ditemukan!', 404);

  const withUrl = await attachNotaUrls(log);
  res.status(200).json(withUrl);
});

const refreshExpenseLogUrls = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { id } = req.params;
  if (!isObjectId(id)) throwError('ID tidak valid', 400);

  const log = await ExpenseLog.findById(id, { 'details.nota': 1 }).lean();
  if (!log) throwError('Log laporan biaya tidak ditemukan!', 404);

  const withUrl = await attachNotaUrls(log);

  res.status(200).json({
    details: (withUrl.details || []).map((it) => ({
      nota_url: it.nota_url || null
    }))
  });
});

const removeExpenseLog = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { id } = req.params;
  if (!isObjectId(id)) throwError('ID tidak valid', 400);

  const log = await ExpenseLog.findById(id);
  if (!log) throwError('Log laporan biaya tidak ditemukan!', 404);

  await log.deleteOne();

  res.status(200).json({ message: 'Log laporan biaya berhasil dihapus.' });
});

module.exports = {
  getExpenseLogs,
  getExpenseLog,
  refreshExpenseLogUrls,
  removeExpenseLog
};
