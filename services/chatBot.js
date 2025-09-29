// utils/chatbot.js
'use strict';

const { Types } = require('mongoose');
const Conversation = require('../model/conversationModel');
const User = require('../model/userModel');
const Employee = require('../model/employeeModel');
const { chatEmit } = require('./chatEmit'); // DB + socket emitter

/* ===================== ENV & CONSTANTS ===================== */

const FE_URL = process.env.APP_URL || 'http://localhost:5173';
const BOT_USER_ID = process.env.BOT_USER_ID || ''; // ObjectId string milik user bot
const FALLBACK_ADMIN_DM =
  String(process.env.FALLBACK_ADMIN_DM || 'false') === 'true';

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

const SEP = '────────────────────────────────';

/* ===================== FORMAT HELPERS ===================== */

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('id-ID') : null);

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('id-ID') : null);

const fmtCurrency = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('id-ID')
    : (Number(n || 0) || 0).toLocaleString('id-ID');

const line = (label, value) =>
  value === undefined || value === null || value === ''
    ? null
    : `• ${label} : ${value}`;

const joinLines = (parts) => parts.filter(Boolean).join('\n');

const summarizeItems = (items, opts = {}) => {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return null;
  const {
    nameKey = 'name', // fallback kunci nama item
    descKey = 'description',
    qtyKey = 'qty',
    amountKey = 'amount', // fallback kunci nominal
    max = 3,
    title = 'Ringkasan Item'
  } = opts;

  const head = `🔎 ${title}`;
  const sample = arr.slice(0, max).map((it, i) => {
    const name =
      it?.[nameKey] ||
      it?.[descKey] ||
      it?.item_name ||
      it?.desc ||
      `Item ${i + 1}`;
    const qty = it?.[qtyKey];
    const amt = it?.[amountKey] ?? it?.price ?? it?.subtotal ?? null;
    const parts = [];
    parts.push(`  ${i + 1}. ${name}`);
    if (qty !== undefined) parts.push(` (Qty: ${qty})`);
    if (amt !== null && amt !== undefined)
      parts.push(` — Rp ${fmtCurrency(amt)}`);
    return parts.join('');
  });

  const more =
    arr.length > max ? `  … dan ${arr.length - max} item lain` : null;
  return [head, ...sample, more].filter(Boolean).join('\n');
};

const countBy = (items, key, expected) => {
  const arr = Array.isArray(items) ? items : [];
  return arr.filter((it) => it?.[key] === expected).length;
};

const sumBy = (items, key) => {
  const arr = Array.isArray(items) ? items : [];
  return arr.reduce((acc, it) => acc + (Number(it?.[key] ?? 0) || 0), 0);
};

/* ===================== URL HELPER ===================== */

function mkUrl(path, q = {}) {
  const u = new URL(path, FE_URL);
  Object.entries(q || {}).forEach(([k, v]) => {
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
  return String(BOT_USER_ID); // biar Mongoose auto-cast
}

/* ===================== EMPLOYEE RESOLVER ===================== */

async function getEmployeeName(ref) {
  if (!ref) return null;
  if (typeof ref === 'object') {
    if (typeof ref.name === 'string' && ref.name) return ref.name;
    if (ref._id) {
      const row = await Employee.findById(ref._id).select('name').lean();
      return row?.name || null;
    }
  }
  if (Types.ObjectId.isValid(String(ref))) {
    const row = await Employee.findById(ref).select('name').lean();
    return row?.name || null;
  }
  return null;
}

async function resolveTargetUserId(idOrDoc) {
  if (!idOrDoc) throw new Error('target user kosong');
  if (typeof idOrDoc === 'object') {
    if (idOrDoc.user) return String(idOrDoc.user);
    if (idOrDoc._id) {
      const emp = await Employee.findById(idOrDoc._id).select('user').lean();
      return emp?.user ? String(emp.user) : String(idOrDoc._id);
    }
  }
  const id = String(idOrDoc);
  if (Types.ObjectId.isValid(id)) {
    const emp = await Employee.findById(id).select('user').lean();
    if (emp?.user) return String(emp.user);
  }
  return id; // already userId
}

/* ===================== CONVERSATION HELPERS ===================== */

async function getOrCreateDirect(botId, userId) {
  const bid = String(botId);
  const uid = String(userId);

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
      const cid = clientId ? `${clientId}:${uid}` : null;
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
 * ============== DOMAIN NOTIFICATIONS (detailed) ===========
 * =======================================================*/

/** PENGAJUAN ALAT */
// Karyawan → Admin (pengajuan dibuat)
async function notifyLoanCreatedToAdmins(loan) {
  const url = mkUrl(PATHS.admin.loan, { loan: loan?.loan_number });
  const borrower =
    (await getEmployeeName(loan?.borrower)) ||
    loan?.borrower_name ||
    'Karyawan';
  const items = Array.isArray(loan?.borrowed_items) ? loan.borrowed_items : [];
  const total = items.length;

  const msg = joinLines([
    `📦 Pengajuan Alat — Baru`,
    SEP,
    line('No. Pengajuan', loan?.loan_number || '-'),
    line('Karyawan', borrower),
    line('Tanggal Pinjam', fmtDate(loan?.loan_date)),
    line('Rencana Kembali', fmtDate(loan?.expected_return_date)),
    line('Total Item', `${total} baris`),
    loan?.project ? line('Proyek', loan.project) : null,
    loan?.department ? line('Departemen', loan.department) : null,
    SEP,
    summarizeItems(items, {
      title: 'Ringkasan Item Dipinjam',
      nameKey: 'item_name',
      qtyKey: 'qty'
    }),
    SEP,
    `🔗 Review: ${url}`
  ]);

  return sendToAdmins(msg, { clientId: `loan:create:${loan?.loan_number}` });
}

// Admin → Karyawan (hasil review)
async function notifyLoanReviewedToBorrower(loan, { approved, reason = null }) {
  const url = mkUrl(PATHS.employee.loan, { loan: loan?.loan_number });
  const status = approved ? '✅ Disetujui' : '❌ Ditolak';
  const next = approved
    ? 'Silakan ambil/melanjutkan proses sesuai instruksi gudang.'
    : 'Silakan lengkapi/ajukan ulang sesuai catatan berikut.';

  const msg = joinLines([
    `📦 Pengajuan Alat — ${status}`,
    SEP,
    line('No. Pengajuan', loan?.loan_number || '-'),
    !approved ? line('Alasan/Catatan', reason || '-') : null,
    SEP,
    line('Diajukan', fmtDateTime(loan?.createdAt)),
    line('Diputuskan', fmtDateTime(loan?.updatedAt)),
    SEP,
    `🧭 Tindak Lanjut: ${next}`,
    `🔗 Detail: ${url}`
  ]);

  return sendDmToUser(loan?.borrower, msg, {
    clientId: `loan:review:${loan?.loan_number}`
  });
}

/** PENGEMBALIAN ALAT */
// Karyawan → Admin (finalisasi batch)
async function notifyReturnFinalizedToAdmins(ret) {
  const url = mkUrl(PATHS.admin.returnLoan, { loan: ret?.loan_number });
  const borrower = (await getEmployeeName(ret?.borrower)) || 'Karyawan';
  const items = Array.isArray(ret?.returned_items) ? ret.returned_items : [];

  const lost = countBy(items, 'condition_new', 'Hilang');
  const broken = countBy(items, 'condition_new', 'Rusak');
  const good = countBy(items, 'condition_new', 'Baik');

  const msg = joinLines([
    `↩️ Pengembalian Alat — Final`,
    SEP,
    line('No. Peminjaman', ret?.loan_number || '-'),
    line('Karyawan', borrower),
    line('Tanggal Lapor', fmtDate(ret?.report_date)),
    line('Total Item', `${items.length} baris`),
    lost + broken + good > 0
      ? joinLines([
          '• Kondisi :',
          `  - Baik  : ${good}`,
          `  - Rusak : ${broken}`,
          `  - Hilang: ${lost}`
        ])
      : null,
    SEP,
    summarizeItems(items, {
      title: 'Ringkasan Item Dikembalikan',
      nameKey: 'item_name',
      qtyKey: 'qty'
    }),
    SEP,
    `🔗 Review: ${url}`
  ]);

  return sendToAdmins(msg, { clientId: `return:final:${ret?._id}` });
}

/** PENGAJUAN BIAYA (Expense Request) */
// Karyawan → Admin (pengajuan dibuat)
async function notifyERCreatedToAdmins(er) {
  const url = mkUrl(PATHS.admin.expense, { voucher: er?.voucher_number });
  const emp = (await getEmployeeName(er?.name)) || 'Karyawan';
  const details = Array.isArray(er?.details) ? er.details : [];
  const overCount = details.filter((d) => d?.is_overbudget).length;
  const totalAmount = er?.total_amount ?? sumBy(details, 'amount');

  const msg = joinLines([
    `🧾 Pengajuan Biaya — Baru`,
    SEP,
    line('Voucher', er?.voucher_number || '-'),
    line('Pemohon', emp),
    line('Jenis', er?.expense_type),
    line('Total Diminta', `Rp ${fmtCurrency(totalAmount)}`),
    line('Jumlah Rincian', `${details.length} item`),
    overCount ? line('Overbudget (proyeksi)', `${overCount} item`) : null,
    er?.needed_by ? line('Dibutuhkan Pada', fmtDate(er.needed_by)) : null,
    SEP,
    summarizeItems(details, {
      title: 'Ringkasan Rincian',
      nameKey: 'title',
      descKey: 'description',
      amountKey: 'amount'
    }),
    SEP,
    `🔗 Review: ${url}`
  ]);

  return sendToAdmins(msg, { clientId: `er:create:${er?.voucher_number}` });
}

// Admin → Karyawan (hasil review)
async function notifyERReviewedToEmployee(er, { approved, reason = null }) {
  const url = mkUrl(PATHS.employee.expense, { voucher: er?.voucher_number });
  const status = approved ? '✅ Disetujui' : '❌ Ditolak';
  const next = approved
    ? 'Tim keuangan akan memproses sesuai SOP.'
    : 'Silakan revisi pengajuan sesuai catatan, lalu ajukan ulang.';

  const msg = joinLines([
    `🧾 Pengajuan Biaya — ${status}`,
    SEP,
    line('Voucher', er?.voucher_number || '-'),
    !approved ? line('Alasan/Catatan', reason || '-') : null,
    SEP,
    line('Jenis', er?.expense_type),
    line('Total Disetujui/Diminta', `Rp ${fmtCurrency(er?.total_amount)}`),
    SEP,
    `🧭 Tindak Lanjut: ${next}`,
    `🔗 Detail: ${url}`
  ]);

  return sendDmToUser(er?.name, msg, {
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
  const items = Array.isArray(pv?.items) ? pv.items : [];
  const totalAmount = sumBy(items, 'amount');

  const msg = joinLines([
    `🧾📎 Pertanggungjawaban Dana — Batch Baru`,
    SEP,
    line('PV', pv?.pv_number || '-'),
    line('Voucher', pv?.voucher_number || '-'),
    line('Total Item', `${items.length} baris`),
    line('Total Nilai', `Rp ${fmtCurrency(totalAmount)}`),
    pv?.period ? line('Periode', pv.period) : null,
    SEP,
    summarizeItems(items, {
      title: 'Ringkasan Bukti/Item',
      nameKey: 'title',
      amountKey: 'amount'
    }),
    SEP,
    `🔗 Review: ${url}`
  ]);

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
  const next = approved
    ? 'Terima kasih, PV telah disetujui.'
    : 'Silakan lengkapi/benahi bukti & keterangan sesuai catatan berikut.';

  const msg = joinLines([
    `🧾📎 Pertanggungjawaban Dana — ${status}`,
    SEP,
    line('PV', pv?.pv_number || '-'),
    line('Voucher', pv?.voucher_number || '-'),
    !approved ? line('Catatan', reason || '-') : null,
    SEP,
    `🧭 Tindak Lanjut: ${next}`,
    `🔗 Detail: ${url}`
  ]);

  const target = employeeId || pv?.created_by;
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