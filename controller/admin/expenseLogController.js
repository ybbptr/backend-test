// controller/expenseLogController.js
const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const ExpenseLog = require('../../model/expenseLogModel');
const { getFileUrl } = require('../../utils/wasabi');

/* =============== Helper =============== */
async function attachNotaUrls(log) {
  const doc = log.toObject ? log.toObject() : log;

  if (doc.details?.length > 0) {
    doc.details = await Promise.all(
      doc.details.map(async (item) => {
        let nota_url = null;

        if (item.nota) {
          if (typeof item.nota === 'string') {
            nota_url = item.nota;
          } else if (item.nota.key) {
            nota_url = await getFileUrl(item.nota.key);
          }
        }

        return {
          ...item,
          nota_url
        };
      })
    );
  }

  return doc;
}

/* =============== Controller =============== */
const getExpenseLogs = asyncHandler(async (req, res) => {
  const logs = await ExpenseLog.find()
    .populate('requester', 'name')
    .populate('project', 'project_name')
    .lean();

  const withUrls = await Promise.all(logs.map((l) => attachNotaUrls(l)));

  res.status(200).json(withUrls);
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
  const log = await ExpenseLog.findById(req.params.id).lean();
  if (!log) throwError('Log laporan biaya tidak ditemukan!', 404);

  const withUrl = await attachNotaUrls(log);

  res.status(200).json({
    voucher_number: log.voucher_number,
    payment_voucher: log.payment_voucher,
    details: withUrl.details.map((it) => ({
      purpose: it.purpose,
      category: it.category,
      amount: it.amount,
      aktual: it.aktual,
      nota_url: it.nota_url
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
