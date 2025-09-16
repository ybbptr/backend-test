// controller/expenseLogController.js
const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const ExpenseLog = require('../../model/expenseLogModel');
const { getFileUrl } = require('../../utils/wasabi');

/* =============== Helper =============== */
async function attachNotaUrls(doc) {
  if (!doc.details?.length) return doc;

  doc.details = await Promise.all(
    doc.details.map(async (item) => {
      let nota_url = null;
      if (item.nota?.key) {
        try {
          nota_url = await getFileUrl(item.nota.key);
        } catch (e) {
          nota_url = null;
        }
      }
      return { ...item, nota_url };
    })
  );

  return doc;
}

/* =============== Controller =============== */
const getExpenseLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.voucher_number)
    filter.voucher_number = req.query.voucher_number;
  if (req.query.payment_voucher)
    filter.payment_voucher = req.query.payment_voucher;
  if (req.query.project) filter.project = req.query.project;
  if (req.query.requester) filter.requester = req.query.requester;

  const [totalItems, logs] = await Promise.all([
    ExpenseLog.countDocuments(filter),
    ExpenseLog.find(filter)
      .populate('requester', 'name')
      .populate('project', 'project_name -_id')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean()
  ]);

  const withUrls = await Promise.all(logs.map((l) => attachNotaUrls(l)));

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data: withUrls
  });
});

const getExpenseLog = asyncHandler(async (req, res) => {
  const log = await ExpenseLog.findById(req.params.id)
    .populate('requester', 'name')
    .populate('project', 'project_name')
    .lean();

  if (!log) throwError('Log laporan biaya tidak ditemukan!', 404);

  const withUrl = await attachNotaUrls(log);
  res.status(200).json(withUrl);
});

const refreshExpenseLogUrls = asyncHandler(async (req, res) => {
  const log = await ExpenseLog.findById(req.params.id, {
    'details.nota': 1
  }).lean();
  if (!log) throwError('Log laporan biaya tidak ditemukan!', 404);

  const withUrl = await attachNotaUrls(log);

  res.status(200).json({
    details: withUrl.details.map((it) => ({
      nota_url: it.nota_url || null
    }))
  });
});

const removeExpenseLog = asyncHandler(async (req, res) => {
  const log = await ExpenseLog.findById(req.params.id);
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
