const mongoose = require('mongoose');
const ReturnLoan = require('../../model/returnLoanModel');
const Loan = require('../../model/loanModel');
const LoanCirculation = require('../../model/loanCirculationModel');

async function buildApprovedReturnMap(loan_number, { session } = {}) {
  // agregasi jumlah OK (non hilang) & LOST
  const base = ReturnLoan.aggregate([
    { $match: { loan_number, status: 'Disetujui' } },
    { $unwind: '$returned_items' },
    {
      $group: {
        _id: '$returned_items._id',
        ok: {
          $sum: {
            $cond: [
              { $ne: ['$returned_items.condition_new', 'Hilang'] },
              '$returned_items.quantity',
              0
            ]
          }
        },
        lost: {
          $sum: {
            $cond: [
              { $eq: ['$returned_items.condition_new', 'Hilang'] },
              '$returned_items.quantity',
              0
            ]
          }
        },
        // ambil tanggal approve terbaru per item (pakai return_date jika ada, fallback createdAt ReturnLoan)
        lastDate: { $max: { $ifNull: ['$return_date', '$createdAt'] } }
      }
    }
  ]);
  if (session) base.session(session);
  const rows = await base;

  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), {
      ok: Number(r.ok) || 0,
      lost: Number(r.lost) || 0,
      lastDate: r.lastDate ? new Date(r.lastDate) : null
    });
  }
  return map;
}

async function recomputeCirculationAndLoan({ session, loan, circulation }) {
  let loanDoc = loan;
  if (!loanDoc) {
    throw new Error('recomputeCirculationAndLoan: loan tidak diberikan');
  }
  if (!circulation) {
    circulation = await LoanCirculation.findOne({
      loan_number: loanDoc.loan_number
    }).session(session);
    if (!circulation)
      throw new Error(
        'recomputeCirculationAndLoan: circulation tidak ditemukan'
      );
  }

  const map = await buildApprovedReturnMap(loanDoc.loan_number, { session });

  let allDone = true;

  // mutasi borrowed_items sesuai akumulasi pengembalian
  for (const bi of circulation.borrowed_items || []) {
    const qty = Number(bi.quantity) || 0;
    const stat = map.get(String(bi._id)) || { ok: 0, lost: 0, lastDate: null };
    const used = stat.ok + stat.lost;

    if (used >= qty) {
      // selesai untuk item ini
      bi.item_status = stat.lost > 0 ? 'Hilang' : 'Dikembalikan';
      bi.return_date_circulation = stat.lastDate || new Date();
    } else {
      bi.item_status = 'Dipinjam';
      bi.return_date_circulation = null;
      allDone = false;
    }
  }

  await circulation.save({ session });

  // status loan
  loanDoc.circulation_status = allDone ? 'Selesai' : 'Aktif';
  // optional: tandai selesai
  if (allDone) {
    loanDoc.completed_at = loanDoc.completed_at || new Date();
  } else {
    loanDoc.completed_at = null;
  }

  await loanDoc.save({ session });
}

module.exports = {
  recomputeCirculationAndLoan,
  buildApprovedReturnMap
};
