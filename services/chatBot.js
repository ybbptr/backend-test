'use strict';

const { Types } = require('mongoose');
const Conversation = require('../model/conversationModel');
const User = require('../model/userModel');
const { chatEmit } = require('./chatEmit');

// ==== ENV ====
const FE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BOT_USER_ID = process.env.BOT_USER_ID; // WAJIB di-set ke ObjectId user bot
const FALLBACK_ADMIN_DM =
  String(process.env.FALLBACK_ADMIN_DM || 'false') === 'true';

// ==== URL Helpers (sesuai mapping dari kamu) ====
const PATHS = {
  employee: {
    loan: '/pengajuan-alat-karyawan',
    returnLoan: '/pengembalian-alat-karyawan',
    expense: '/pengajuan-biaya-karyawan',
    pv: '/pertanggungjawaban-dana'
  },
  admin: {
    loan: '/admin/pengajuan',
    returnLoan: '/admin/pengembalian-alat',
    expense: '/admin/pengajuan-biaya',
    pv: '/admin/pertanggung-jawaban-dana'
  }
};

const mkUrl = (path, q = {}) => {
  const u = new URL(path, FE_URL);
  Object.entries(q || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '')
      u.searchParams.set(k, String(v));
  });
  return u.toString();
};

// ==== Guard BOT ====
function assertBotId() {
  if (!BOT_USER_ID || !Types.ObjectId.isValid(BOT_USER_ID)) {
    throw new Error('BOT_USER_ID env tidak valid / belum di-set');
  }
  return new Types.ObjectId(BOT_USER_ID);
}

// ==== Conversation helpers ====
async function getOrCreateDirect(botId, userId) {
  // Cari conv direct existing (unik via memberKey di schema)
  let conv = await Conversation.findOne({
    type: 'direct',
    'members.user': { $all: [botId, userId] }
  });

  if (conv) return conv;

  // Buat baru
  try {
    conv = await Conversation.create({
      type: 'direct',
      members: [
        { user: botId, role: 'member' },
        { user: userId, role: 'member' }
      ]
      // title akan dihapus oleh pre-validate untuk type 'direct'
    });
    return conv;
  } catch (e) {
    // Race: kalau kejadian duplicate memberKey, ambil ulang
    if (/\bE11000\b/.test(String(e?.code))) {
      const again = await Conversation.findOne({
        type: 'direct',
        'members.user': { $all: [botId, userId] }
      });
      if (again) return again;
    }
    throw e;
  }
}

async function getAdminIds() {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  return admins.map((u) => u._id);
}

async function getOrCreateAdminGroup() {
  // Kamu bisa ganti judul grup sesuai kebutuhan
  const title = 'Internal Admin';

  let conv = await Conversation.findOne({ type: 'group', title });
  if (conv) return conv;

  const botId = assertBotId();
  const adminIds = await getAdminIds();
  // Pastikan BOT ikut jadi member (boleh member role biasa)
  const members = [
    { user: botId, role: 'member' },
    ...adminIds.map((id) => ({ user: id, role: 'admin' }))
  ];

  conv = await Conversation.create({
    type: 'group',
    title,
    createdBy: botId,
    members
  });

  return conv;
}

// ==== Send helpers ====
async function sendDmToUser(userId, text, { clientId = null } = {}) {
  const botId = assertBotId();
  const conv = await getOrCreateDirect(botId, new mongoose.ObjectId(userId));
  return chatEmit({
    conversationId: String(conv._id),
    senderId: String(botId),
    text,
    type: 'text',
    clientId
  });
}

async function sendToAdmins(text, { clientId = null } = {}) {
  const botId = assertBotId();
  if (FALLBACK_ADMIN_DM) {
    const adminIds = await getAdminIds();
    // DM satu-satu
    const results = [];
    for (const uid of adminIds) {
      // beda clientId supaya tidak bentrok idempotensi lintas DM
      const cid = clientId ? `${clientId}:${String(uid)}` : null;
      results.push(await sendDmToUser(uid, text, { clientId: cid }));
    }
    return results;
  }
  const group = await getOrCreateAdminGroup();
  return chatEmit({
    conversationId: String(group._id),
    senderId: String(botId),
    text,
    type: 'text',
    clientId
  });
}

// ===================================================================
// ===================== DOMAIN NOTIFICATIONS ========================
// ===================================================================

/** PENGAJUAN ALAT */
// Karyawan → Admin (pengajuan dibuat)
async function notifyLoanCreatedToAdmins(loan) {
  const url = mkUrl(PATHS.admin.loan, { loan: loan?.loan_number });
  const borrower = loan?.borrower?.name || loan?.borrower_name || 'Karyawan';
  const total = Array.isArray(loan?.borrowed_items)
    ? loan.borrowed_items.length
    : 0;

  const msg =
    `📦 Pengajuan Alat Baru\n` +
    `• Karyawan : ${borrower}\n` +
    `• No. Pengajuan : ${loan?.loan_number || '-'}\n` +
    `• Item : ${total} baris\n` +
    `• Tanggal Pinjam : ${
      loan?.loan_date ? new Date(loan.loan_date).toLocaleDateString() : '-'
    }\n\n` +
    `Review di: ${url}`;

  return sendToAdmins(msg, { clientId: `loan:create:${loan?.loan_number}` });
}

// Admin → Karyawan (hasil review)
async function notifyLoanReviewedToBorrower(loan, { approved, reason = null }) {
  const url = mkUrl(PATHS.employee.loan, { loan: loan?.loan_number });
  const status = approved ? '✅ Disetujui' : '❌ Ditolak';
  const reasonLine = approved ? '' : `\nAlasan: ${reason || '-'}`;

  const msg =
    `📦 Pengajuan Alat ${status}\n` +
    `• No. Pengajuan : ${loan?.loan_number || '-'}${reasonLine}\n\n` +
    `Detail: ${url}`;

  return sendDmToUser(loan.borrower, msg, {
    clientId: `loan:review:${loan?.loan_number}`
  });
}

/** PENGEMBALIAN ALAT */
// Karyawan → Admin (finalisasi batch)
async function notifyReturnFinalizedToAdmins(ret, opts = {}) {
  // ret: ReturnLoan doc (status "Dikembalikan")
  const url = mkUrl(PATHS.admin.returnLoan, { loan: ret?.loan_number });
  const borrower = ret?.borrower?.name || 'Karyawan';
  const items = Array.isArray(ret?.returned_items) ? ret.returned_items : [];

  const lostCount = items.filter((it) => it?.condition_new === 'Hilang').length;
  const lostLine = lostCount > 0 ? `\n• Hilang : ${lostCount} baris` : '';

  const msg =
    `↩️ Pengembalian Alat (Final)\n` +
    `• Karyawan : ${borrower}\n` +
    `• No. Peminjaman : ${ret?.loan_number || '-'}\n` +
    `• Item : ${items.length} baris${lostLine}\n` +
    `• Tgl Lapor : ${
      ret?.report_date ? new Date(ret.report_date).toLocaleDateString() : '-'
    }\n\n` +
    `Review di: ${url}`;

  return sendToAdmins(msg, { clientId: `return:final:${ret?._id}` });
}

/** PENGAJUAN BIAYA (Expense Request) */
// Karyawan → Admin (pengajuan dibuat)
async function notifyERCreatedToAdmins(er) {
  const url = mkUrl(PATHS.admin.expense, { voucher: er?.voucher_number });
  const emp = er?.name?.name || 'Karyawan';
  const over = Array.isArray(er?.details)
    ? er.details.filter((d) => d?.is_overbudget).length
    : 0;
  const overLine = over > 0 ? `\n• Overbudget (proyeksi): ${over} item` : '';

  const msg =
    `🧾 Pengajuan Biaya Baru\n` +
    `• Pemohon : ${emp}\n` +
    `• Voucher : ${er?.voucher_number || '-'}\n` +
    `• Jenis : ${er?.expense_type || '-'}\n` +
    `• Total : Rp ${Number(er?.total_amount || 0).toLocaleString(
      'id-ID'
    )}${overLine}\n\n` +
    `Review di: ${url}`;

  return sendToAdmins(msg, { clientId: `er:create:${er?.voucher_number}` });
}

// Admin → Karyawan (hasil review)
async function notifyERReviewedToEmployee(er, { approved, reason = null }) {
  const url = mkUrl(PATHS.employee.expense, { voucher: er?.voucher_number });
  const status = approved ? '✅ Disetujui' : '❌ Ditolak';
  const reasonLine = approved ? '' : `\nAlasan: ${reason || '-'}`;

  const msg =
    `🧾 Pengajuan Biaya ${status}\n` +
    `• Voucher : ${er?.voucher_number || '-'}${reasonLine}\n\n` +
    `Detail: ${url}`;

  return sendDmToUser(er.name, msg, {
    clientId: `er:review:${er?.voucher_number}`
  });
}

/** PERTANGGUNGJAWABAN DANA (PV Report) */
// Karyawan → Admin (batch dibuat)
async function notifyPVBatchCreatedToAdmins(pv) {
  const url = mkUrl(PATHS.admin.pv, {
    voucher: pv?.voucher_number,
    pv: pv?.pv_number
  });
  const items = Array.isArray(pv?.items) ? pv.items.length : 0;

  const msg =
    `🧾📎 Pertanggungjawaban Dana - Batch Baru\n` +
    `• PV : ${pv?.pv_number || '-'}\n` +
    `• Voucher : ${pv?.voucher_number || '-'}\n` +
    `• Item : ${items} baris\n\n` +
    `Review di: ${url}`;

  return sendToAdmins(msg, { clientId: `pv:create:${pv?.pv_number}` });
}

async function notifyPVReviewedToEmployee(
  pv,
  { approved, reason = null, employeeId = null }
) {
  const url = mkUrl(PATHS.employee.pv, {
    voucher: pv?.voucher_number,
    pv: pv?.pv_number
  });
  const status = approved ? '✅ Disetujui' : '❌ Ditolak';
  const reasonLine = approved ? '' : `\nCatatan: ${reason || '-'}`;

  const target = employeeId || pv?.created_by;

  const msg =
    `🧾📎 Pertanggungjawaban ${status}\n` +
    `• PV : ${pv?.pv_number || '-'}\n` +
    `• Voucher : ${pv?.voucher_number || '-'}${reasonLine}\n\n` +
    `Detail: ${url}`;

  return sendDmToUser(target, msg, { clientId: `pv:review:${pv?.pv_number}` });
}

// ===================================================================
// ====================== WIRING DI CONTROLLERS ======================
// ===================================================================
//
// • Pengajuan Alat:
//   - after createLoan (oleh karyawan): await notifyLoanCreatedToAdmins(loan)
//   - after approveLoan: await notifyLoanReviewedToBorrower(loan, { approved: true })
//   - after rejectLoan:  await notifyLoanReviewedToBorrower(loan, { approved: false, reason: loan.note })
//
// • Pengembalian Alat:
//   - after finalizeReturnLoanById / OneShot: await notifyReturnFinalizedToAdmins(returnLoanDoc)
//
// • Pengajuan Biaya (ER):
//   - after addExpenseRequest: await notifyERCreatedToAdmins(er)
//   - after approveExpenseRequest: await notifyERReviewedToEmployee(er, { approved: true })
//   - after rejectExpenseRequest:  await notifyERReviewedToEmployee(er, { approved: false, reason: note })
//
// • Pertanggungjawaban Dana (PV):
//   - after addPVReport: await notifyPVBatchCreatedToAdmins(pv)
//   - after approvePVReport: await notifyPVReviewedToEmployee(pv, { approved: true, employeeId: pv.created_by })
//   - after rejectPVReport:  await notifyPVReviewedToEmployee(pv, { approved: false, reason: req.body?.note, employeeId: pv.created_by })
//
module.exports = {
  sendDmToUser,
  sendToAdmins,

  notifyLoanCreatedToAdmins,
  notifyLoanReviewedToBorrower,
  notifyReturnFinalizedToAdmins,
  notifyERCreatedToAdmins,
  notifyERReviewedToEmployee,
  notifyPVBatchCreatedToAdmins,
  notifyPVReviewedToEmployee
};
