// utils/chatbot.js
'use strict';

const { Types } = require('mongoose');
const Conversation = require('../model/conversationModel');
const User = require('../model/userModel');
const Employee = require('../model/employeeModel');
const { chatEmit } = require('./chatEmit'); // <<— gunakan util chatEmit terpisah

/* ===================== ENV & CONSTANTS ===================== */

const FE_URL = process.env.APP_URL || 'http://localhost:5173';
const BOT_USER_ID = process.env.BOT_USER_ID || ''; // ObjectId string milik user bot
const FALLBACK_ADMIN_DM =
  String(process.env.FALLBACK_ADMIN_DM || 'false') === 'true';

// FE path mapping (ikuti rute kamu)
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

/* ===================== URL HELPER ===================== */

function mkUrl(path, q = {}) {
  const u = new URL(path, FE_URL);
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      u.searchParams.set(k, String(v));
    }
  });
  return u.toString();
}

/* ===================== BOT GUARD ===================== */

function assertBotId() {
  if (!BOT_USER_ID || !Types.ObjectId.isValid(BOT_USER_ID)) {
    throw new Error('BOT_USER_ID env tidak valid / belum di-set');
  }
  // return string saja; biar Mongoose yang auto-cast
  return String(BOT_USER_ID);
}

/* ===================== CONVERSATION HELPERS ===================== */

async function getOrCreateDirect(botId, userId) {
  const bid = String(botId);
  const uid = String(userId);

  // cari existing (unik by memberKey di schema)
  let conv = await Conversation.findOne({
    type: 'direct',
    'members.user': { $all: [bid, uid] }
  });
  if (conv) return conv;

  try {
    conv = await Conversation.create({
      type: 'direct',
      members: [
        { user: bid, role: 'member' },
        { user: uid, role: 'member' }
      ]
    });
    return conv;
  } catch (e) {
    // handle race duplicate key
    if (String(e?.code) === '11000') {
      const again = await Conversation.findOne({
        type: 'direct',
        'members.user': { $all: [bid, uid] }
      });
      if (again) return again;
    }
    throw e;
  }
}

async function getAdminIds() {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  return admins.map((u) => String(u._id));
}

async function getOrCreateAdminGroup() {
  const title = 'Internal Admin';
  let conv = await Conversation.findOne({ type: 'group', title });
  if (conv) return conv;

  const botId = assertBotId();
  const adminIds = await getAdminIds();

  conv = await Conversation.create({
    type: 'group',
    title,
    createdBy: botId,
    members: [
      { user: botId, role: 'member' },
      ...adminIds.map((id) => ({ user: id, role: 'admin' }))
    ]
  });

  return conv;
}

/* ===================== TARGET USER RESOLVER ===================== */
/**
 * Bisa terima: UserId string / EmployeeId string / Employee doc (punya field user)
 * Balikannya: UserId string
 */
async function resolveTargetUserId(idOrDoc) {
  if (!idOrDoc) throw new Error('target user kosong');
  // Employee doc dengan field user
  if (typeof idOrDoc === 'object') {
    if (idOrDoc.user) return String(idOrDoc.user);
    if (idOrDoc._id) {
      const emp = await Employee.findById(idOrDoc._id).select('user').lean();
      return emp?.user ? String(emp.user) : String(idOrDoc._id);
    }
  }
  const id = String(idOrDoc);
  // coba resolve sebagai EmployeeId → ambil user
  if (Types.ObjectId.isValid(id)) {
    const emp = await Employee.findById(id).select('user').lean();
    if (emp?.user) return String(emp.user);
  }
  // fallback: anggap sudah userId
  return id;
}

/* ===================== SEND HELPERS ===================== */

async function sendDmToUser(userOrEmployeeId, text, { clientId = null } = {}) {
  const botId = assertBotId();
  const targetUserId = await resolveTargetUserId(userOrEmployeeId);
  const conv = await getOrCreateDirect(botId, targetUserId);
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
    const results = [];
    for (const uid of adminIds) {
      const cid = clientId ? `${clientId}:${uid}` : null; // idempotensi per-DM
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

/* =========================================================
 * ============== DOMAIN NOTIFICATIONS =====================
 * =======================================================*/

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
      loan?.loan_date
        ? new Date(loan.loan_date).toLocaleDateString('id-ID')
        : '-'
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

  // loan.borrower = EmployeeId → auto di-resolve ke UserId
  return sendDmToUser(loan.borrower, msg, {
    clientId: `loan:review:${loan?.loan_number}`
  });
}

/** PENGEMBALIAN ALAT */
// Karyawan → Admin (finalisasi batch)
async function notifyReturnFinalizedToAdmins(ret) {
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
      ret?.report_date
        ? new Date(ret.report_date).toLocaleDateString('id-ID')
        : '-'
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

  // er.name = EmployeeId
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
  const itemsCount = Array.isArray(pv?.items) ? pv.items.length : 0;

  const msg =
    `🧾📎 Pertanggungjawaban Dana - Batch Baru\n` +
    `• PV : ${pv?.pv_number || '-'}\n` +
    `• Voucher : ${pv?.voucher_number || '-'}\n` +
    `• Item : ${itemsCount} baris\n\n` +
    `Review di: ${url}`;

  return sendToAdmins(msg, { clientId: `pv:create:${pv?.pv_number}` });
}

// Admin → Karyawan (hasil review)
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

  // pv.created_by = EmployeeId
  const target = employeeId || pv?.created_by;

  const msg =
    `🧾📎 Pertanggungjawaban ${status}\n` +
    `• PV : ${pv?.pv_number || '-'}\n` +
    `• Voucher : ${pv?.voucher_number || '-'}${reasonLine}\n\n` +
    `Detail: ${url}`;

  return sendDmToUser(target, msg, { clientId: `pv:review:${pv?.pv_number}` });
}

/* ===================== EXPORTS ===================== */

module.exports = {
  // utils
  mkUrl,

  // sends
  sendDmToUser,
  sendToAdmins,

  // notifications
  notifyLoanCreatedToAdmins,
  notifyLoanReviewedToBorrower,
  notifyReturnFinalizedToAdmins,
  notifyERCreatedToAdmins,
  notifyERReviewedToEmployee,
  notifyPVBatchCreatedToAdmins,
  notifyPVReviewedToEmployee
};
