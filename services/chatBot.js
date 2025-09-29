'use strict';

const mongoose = require('mongoose');
const { Types } = mongoose;

const Conversation = require('../model/conversationModel');
const Message = require('../model/messageModel');
const User = require('../model/userModel');
const Employee = require('../model/employeeModel');

const BOT_ID = process.env.BOT_USER_ID;

/* ============ Helpers ============ */

function ensureObjectId(id, label = 'ObjectId') {
  if (!Types.ObjectId.isValid(String(id))) {
    throw new Error(`${label} tidak valid: ${id}`);
  }
}

async function ensureBotUser() {
  ensureObjectId(BOT_ID, 'BOT_USER_ID');
  const u = await User.findById(BOT_ID).select('_id name role').lean();
  if (!u) throw new Error('BOT_USER_ID tidak ditemukan di koleksi users');
  return u;
}

async function getAdminUserIds() {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  return admins.map((a) => a._id);
}

async function employeeIdToUserId(employeeId) {
  if (!employeeId) return null;
  const emp = await Employee.findById(employeeId).select('user').lean();
  return emp?.user || null;
}

async function ensureGroup({ title, members /* array of userId */ }) {
  const unique = [...new Set((members || []).map(String))];

  // Coba cari group dg judul sama
  let conv = await Conversation.findOne({ type: 'group', title });
  const toMemberObj = (id) => ({ user: id, role: 'member' });

  if (!conv) {
    conv = await Conversation.create({
      type: 'group',
      title,
      createdBy: BOT_ID,
      members: unique.map(toMemberObj),
      lastMessage: null,
      lastMessageAt: null
    });
    console.log('[bot] group created:', title, String(conv._id));
    return conv;
  }

  const existSet = new Set((conv.members || []).map((m) => String(m.user)));
  const missing = unique.filter((id) => !existSet.has(String(id)));
  if (missing.length) {
    await Conversation.updateOne(
      { _id: conv._id },
      { $addToSet: { members: { $each: missing.map(toMemberObj) } } }
    );
    console.log('[bot] group members added:', title, missing.map(String));
  }

  return await Conversation.findById(conv._id);
}

function computeMemberKey(u1, u2) {
  const a = String(u1);
  const b = String(u2);
  return [a, b].sort().join(':');
}

async function ensureDirect({ userA, userB }) {
  const mk = computeMemberKey(userA, userB);

  // Cari direct pakai memberKey (index unik sudah ada di schema)
  let conv = await Conversation.findOne({ type: 'direct', memberKey: mk });

  if (!conv) {
    conv = await Conversation.create({
      type: 'direct',
      title: undefined, // direct tidak pakai title
      createdBy: BOT_ID,
      members: [
        { user: userA, role: 'member' },
        { user: userB, role: 'member' }
      ]
    });
    console.log('[bot] direct created:', mk, String(conv._id));
  }
  return conv;
}

async function pushMessage({
  convId,
  text,
  type = 'system',
  attachments = []
}) {
  ensureObjectId(convId, 'conversationId');
  await ensureBotUser();

  const conv = await Conversation.findById(convId).select('_id type').lean();
  if (!conv) throw new Error('Percakapan tidak ditemukan');

  const msg = await Message.create({
    conversation: conv._id,
    sender: BOT_ID,
    type,
    text,
    attachments
  });

  await Conversation.updateOne(
    { _id: conv._id },
    { $set: { lastMessage: msg._id, lastMessageAt: msg.createdAt } }
  );

  // Emit realtime jika ada socket namespace
  try {
    if (global.io) {
      const nsp = global.io.of('/chat');
      nsp.to(String(conv._id)).emit('chat:new', {
        id: String(msg._id),
        conversationId: String(conv._id),
        sender: String(BOT_ID),
        type: msg.type,
        text: msg.text,
        attachments: msg.attachments || [],
        clientId: null,
        createdAt: msg.createdAt,
        editedAt: null,
        deletedAt: null
      });
    }
  } catch (e) {
    console.warn('[bot] emit error:', e.message);
  }

  console.log(
    '[bot] message inserted:',
    String(msg._id),
    '-> conv',
    String(conv._id)
  );
  return msg;
}

/* ============ Message Templates (ringkas & URL FE) ============ */

const FE = {
  // user/karyawan
  loanMine: '/pengajuan-alat-karyawan',
  expenseMine: '/pengajuan-biaya-karyawan',
  pvMine: '/pertanggungjawaban-dana',
  // admin
  adminLoan: '/admin/pengajuan',
  adminReturn: '/admin/pengembalian-alat',
  adminExpense: '/admin/pengajuan-biaya',
  adminPV: '/admin/pertanggung-jawaban-dana'
};

/* ============ Public API (dipanggil controller) ============ */

// LOAN
async function notifyLoanCreatedToAdmins(loan) {
  console.log('[bot] notifyLoanCreatedToAdmins called', loan?.loan_number);
  await ensureBotUser();
  const adminIds = await getAdminUserIds();
  const conv = await ensureGroup({
    title: 'Internal Admin',
    members: [...adminIds, BOT_ID]
  });

  const borrowerName = loan?.borrower?.name || '(pemohon)';
  const text =
    `🔔 Pengajuan Alat Baru\n` +
    `• Loan: ${loan.loan_number}\n` +
    `• Peminjam: ${borrowerName}\n` +
    `• Tanggal ambil: ${
      loan.pickup_date
        ? new Date(loan.pickup_date).toLocaleDateString('id-ID')
        : '-'
    }\n` +
    `Buka: ${FE.adminLoan}`;
  return pushMessage({ convId: conv._id, text });
}

async function notifyLoanReviewedToBorrower(loan, { approved, reason } = {}) {
  console.log(
    '[bot] notifyLoanReviewedToBorrower called',
    loan?.loan_number,
    approved
  );
  await ensureBotUser();
  const userId = await employeeIdToUserId(loan.borrower);
  if (!userId) throw new Error('User peminjam tidak ditemukan dari employee');

  const conv = await ensureDirect({ userA: BOT_ID, userB: userId });

  const status = approved ? '✅ Disetujui' : '❌ Ditolak';
  const extra = approved
    ? `Silakan lanjut proses di: ${FE.loanMine}`
    : `Alasan: ${reason || '-'}`;
  const text =
    `Status pengajuan alat kamu (${loan.loan_number})\n` +
    `• ${status}\n` +
    `${extra}`;
  return pushMessage({ convId: conv._id, text });
}

// RETURN (final)
async function notifyReturnFinalizedToAdmins(returnDoc) {
  console.log(
    '[bot] notifyReturnFinalizedToAdmins called',
    String(returnDoc?._id)
  );
  await ensureBotUser();
  const adminIds = await getAdminUserIds();
  const conv = await ensureGroup({
    title: 'Internal Admin',
    members: [...adminIds, BOT_ID]
  });

  const text =
    `📦 Pengembalian Alat Final\n` +
    `• Loan: ${returnDoc.loan_number}\n` +
    `• Status: ${returnDoc.status}\n` +
    `Review: ${FE.adminReturn}`;
  return pushMessage({ convId: conv._id, text });
}

// EXPENSE REQUEST
async function notifyERCreatedToAdmins(er) {
  console.log('[bot] notifyERCreatedToAdmins called', er?.voucher_number);
  await ensureBotUser();
  const adminIds = await getAdminUserIds();
  const conv = await ensureGroup({
    title: 'Internal Admin',
    members: [...adminIds, BOT_ID]
  });

  const employeeName = er?.name?.name || '(pemohon)';
  const text =
    `📝 Pengajuan Biaya Baru\n` +
    `• Voucher: ${er.voucher_number}\n` +
    `• Pemohon: ${employeeName}\n` +
    `Buka: ${FE.adminExpense}`;
  return pushMessage({ convId: conv._id, text });
}

async function notifyERReviewedToEmployee(er, { approved, reason } = {}) {
  console.log(
    '[bot] notifyERReviewedToEmployee called',
    er?.voucher_number,
    approved
  );
  await ensureBotUser();
  const userId = await employeeIdToUserId(er.name);
  if (!userId) throw new Error('User pemohon tidak ditemukan dari employee');

  const conv = await ensureDirect({ userA: BOT_ID, userB: userId });

  const status = approved ? '✅ Disetujui' : '❌ Ditolak';
  const extra = approved
    ? `PV akan diproses. Cek: ${FE.expenseMine}`
    : `Alasan: ${reason || '-'}`;
  const text =
    `Status pengajuan biaya (${er.voucher_number})\n` +
    `• ${status}\n` +
    `${extra}`;
  return pushMessage({ convId: conv._id, text });
}

// PV REPORT (batch)
async function notifyPVBatchCreatedToAdmins(pv) {
  console.log('[bot] notifyPVBatchCreatedToAdmins called', pv?.pv_number);
  await ensureBotUser();
  const adminIds = await getAdminUserIds();
  const conv = await ensureGroup({
    title: 'Internal Admin',
    members: [...adminIds, BOT_ID]
  });

  const text =
    `🧾 PV Batch Baru\n` +
    `• PV: ${pv.pv_number}\n` +
    `• Voucher: ${pv.voucher_number}\n` +
    `Review: ${FE.adminPV}`;
  return pushMessage({ convId: conv._id, text });
}

async function notifyPVReviewedToEmployee(
  pv,
  { approved, reason, employeeId } = {}
) {
  console.log(
    '[bot] notifyPVReviewedToEmployee called',
    pv?.pv_number,
    approved
  );
  await ensureBotUser();

  // pv.created_by = employeeId (Employee._id)
  const empId = employeeId || pv.created_by;
  const userId = await employeeIdToUserId(empId);
  if (!userId) throw new Error('User pembuat PV tidak ditemukan dari employee');

  const conv = await ensureDirect({ userA: BOT_ID, userB: userId });

  const status = approved ? '✅ Disetujui' : '❌ Ditolak';
  const extra = approved
    ? `Terima kasih. Cek riwayat: ${FE.pvMine}`
    : `Catatan: ${reason || '-'}`;
  const text = `Status PV (${pv.pv_number})\n` + `• ${status}\n` + `${extra}`;
  return pushMessage({ convId: conv._id, text });
}

module.exports = {
  // Loan
  notifyLoanCreatedToAdmins,
  notifyLoanReviewedToBorrower,
  // Return
  notifyReturnFinalizedToAdmins,
  // Expense Request
  notifyERCreatedToAdmins,
  notifyERReviewedToEmployee,
  // PV
  notifyPVBatchCreatedToAdmins,
  notifyPVReviewedToEmployee
};
