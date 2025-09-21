const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const path = require('path');

const throwError = require('../utils/throwError');
const Loan = require('../model/loanModel');
const LoanCirculation = require('../model/loanCirculationModel');
const ReturnLoan = require('../model/returnLoanModel');
const { uploadBuffer } = require('../utils/wasabi');
const formatDate = require('../utils/formatDate');

/* ========================= DEBUG HELPERS ========================= */

function debugLog(label, payload) {
  try {
    // Hindari nge-log buffer besar
    console.log(`[RETURN-DEBUG] ${label}:`, payload);
  } catch {
    console.log(`[RETURN-DEBUG] ${label}: <unserializable>`);
  }
}

/* ========================= PARSER SUPER-ROBUST ========================= */

function toNullish(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === '' || s === 'null' || s === 'undefined') return null;
  return v;
}

function normalizeReturnedItem(raw) {
  const item = { ...raw };

  if (item.quantity !== undefined) {
    const n = Number(item.quantity);
    item.quantity = Number.isFinite(n) ? n : undefined;
  }

  // id-id tetap string / null
  [
    '_id',
    'inventory',
    'product',
    'warehouse_return',
    'shelf_return',
    'project'
  ].forEach((k) => {
    if (item[k] !== undefined) item[k] = toNullish(item[k]);
  });

  item.loss_reason = toNullish(item.loss_reason);

  // Jika hilang, gudang/shelf harus null
  if (String(item.condition_new || '').toLowerCase() === 'hilang') {
    item.warehouse_return = null;
    item.shelf_return = null;
  }

  return item;
}

/**
 * Dukung format:
 * 1) returned_items JSON string / array
 * 2) returned_items[0][field] = '...'
 * 3) returned_items.0.field = '...'
 * 4) returned_items[0] = '{"_id":"..."}'
 */
function parseReturnedItemsFromRequest(req) {
  const body = req.body || {};
  let raw = body.returned_items;

  // 1) Sudah array
  if (Array.isArray(raw)) {
    return raw.map(normalizeReturnedItem);
  }

  // 2) JSON string
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalizeReturnedItem);
      if (parsed && typeof parsed === 'object') {
        const arr = Object.keys(parsed)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => parsed[k]);
        return arr.map(normalizeReturnedItem);
      }
    } catch {
      // lanjut ke rekonstruksi
    }
  }

  // 3) Rekonstruksi dari key path
  const bag = {};
  const pushKV = (idx, field, value) => {
    const i = Number(idx);
    if (!Number.isFinite(i)) return;
    if (!bag[i]) bag[i] = {};
    bag[i][field] = value;
  };

  for (const [k, v] of Object.entries(body)) {
    // returned_items[0][field]
    let m = k.match(/^returned_items\[(\d+)\]\[(.+)\]$/);
    if (m) {
      pushKV(m[1], m[2], v);
      continue;
    }
    // returned_items.0.field
    m = k.match(/^returned_items\.(\d+)\.(.+)$/);
    if (m) {
      pushKV(m[1], m[2], v);
      continue;
    }
    // returned_items[0] = '{"_id":"..."}'
    m = k.match(/^returned_items\[(\d+)\]$/);
    if (m && typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        pushKV(m[1], '_whole', parsed);
      } catch {}
      continue;
    }
    // returned_items.0 = '{"_id":"..."}'
    m = k.match(/^returned_items\.(\d+)$/);
    if (m && typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        pushKV(m[1], '_whole', parsed);
      } catch {}
      continue;
    }
  }

  const idxs = Object.keys(bag)
    .map(Number)
    .sort((a, b) => a - b);
  const arr = idxs.map((i) => {
    const obj = bag[i];
    const merged =
      obj._whole && typeof obj._whole === 'object'
        ? { ...obj._whole, ...obj } // _whole baseline, field per-key override
        : obj;
    delete merged._whole;
    return normalizeReturnedItem(merged);
  });

  return arr;
}

/* ============== Proof file helper (mendukung array/obj Multer) ============== */
function getProofFile(req, idx1) {
  const field = `bukti_${idx1}`;
  if (Array.isArray(req.files)) {
    return req.files.find((f) => f.fieldname === field) || null;
  }
  if (req.files && typeof req.files === 'object') {
    const arr = req.files[field];
    return arr && arr[0] ? arr[0] : null;
  }
  return null;
}

/* ========================= SISA VALIDATOR ========================= */

async function buildReturnedMap(loan_number, { session } = {}) {
  const agg = ReturnLoan.aggregate([
    { $match: { loan_number, status: 'Dikembalikan' } },
    { $unwind: '$returned_items' },
    {
      $group: {
        _id: '$returned_items._id',
        returned: {
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
        }
      }
    }
  ]);
  if (session) agg.session(session);
  const rows = await agg;
  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), { returned: r.returned || 0, lost: r.lost || 0 });
  }
  return map;
}

const VALID_CONDS = ['Baik', 'Rusak', 'Maintenance', 'Hilang'];

async function validateReturnPayloadAndSisa({ session, loan_number, items }) {
  const circulation = await LoanCirculation.findOne({ loan_number })
    .select('borrowed_items')
    .session(session);
  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  const idSet = new Set(circulation.borrowed_items.map((b) => String(b._id)));

  // Struktur dasar
  items.forEach((it, idx) => {
    if (!it || !it._id)
      throwError(`returned_items[#${idx + 1}] tidak punya _id sirkulasi`, 400);
    if (!idSet.has(String(it._id)))
      throwError(`Item #${idx + 1} tidak valid di sirkulasi`, 400);
    if (!VALID_CONDS.includes(it.condition_new))
      throwError(`condition_new item #${idx + 1} tidak valid`, 400);
    if (!it.quantity || Number(it.quantity) <= 0)
      throwError(`quantity item #${idx + 1} harus > 0`, 400);

    // Aturan gudang/shelf
    if (it.condition_new !== 'Hilang' && !it.warehouse_return) {
      throwError(
        `Item #${idx + 1}: warehouse_return wajib untuk kondisi != "Hilang"`,
        400
      );
    }
    if (
      it.condition_new === 'Hilang' &&
      (it.warehouse_return || it.shelf_return)
    ) {
      throwError(
        `Item #${idx + 1}: tidak boleh isi gudang/lemari saat "Hilang"`,
        400
      );
    }
  });

  // Sisa vs batch final lain
  const totalMap = await buildReturnedMap(loan_number, { session });

  items.forEach((it, idx) => {
    const circItem = circulation.borrowed_items.id(it._id);
    const agg = totalMap.get(String(it._id)) || { returned: 0, lost: 0 };
    const used = (agg.returned || 0) + (agg.lost || 0);
    const available = (circItem?.quantity || 0) - used;

    debugLog(`sisa check [#${idx + 1}]`, {
      item_id: it._id,
      req_qty: it.quantity,
      circ_qty: circItem?.quantity,
      used_returned: agg.returned,
      used_lost: agg.lost,
      available
    });

    if (it.quantity > available) {
      throwError(
        `Qty retur (${it.quantity}) > sisa (${available}) utk item ${
          it.product_code || it._id
        }`,
        400
      );
    }
  });

  return circulation;
}

/* ========================= CONTROLLER: CREATE DRAFT ========================= */

const createReturnLoan = asyncHandler(async (req, res) => {
  // ---- DEBUG: request snapshot
  debugLog('content-type', req.headers['content-type']);
  debugLog('body keys', Object.keys(req.body || {}));
  debugLog('loan_number', req.body?.loan_number);
  debugLog(
    'typeof returned_items',
    `${typeof req.body?.returned_items} | isArray=${Array.isArray(
      req.body?.returned_items
    )}`
  );
  debugLog(
    'body.returned_items sample',
    typeof req.body?.returned_items === 'string'
      ? req.body.returned_items.length > 800
        ? req.body.returned_items.slice(0, 800) + '...<truncated>'
        : req.body.returned_items
      : req.body?.returned_items
  );
  debugLog(
    'files',
    Array.isArray(req.files)
      ? req.files.map((f) => ({ field: f.fieldname, size: f.size }))
      : Object.fromEntries(
          Object.entries(req.files || {}).map(([k, arr]) => [
            k,
            Array.isArray(arr) ? arr.length : 1
          ])
        )
  );

  // ---- PARSE
  const returned_items = parseReturnedItemsFromRequest(req);
  debugLog('parsed.items.length', returned_items.length);
  debugLog('parsed.items[0]', returned_items[0]);

  const {
    loan_number,
    borrower,
    position,
    report_date,
    return_date,
    inventory_manager
  } = req.body || {};

  if (!loan_number || returned_items.length === 0) {
    debugLog('validation.fail', {
      loan_number,
      items_len: returned_items.length
    });
    throwError('Nomor peminjaman dan daftar barang wajib diisi!', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // pastikan loan exist
    const loan = await Loan.findOne({ loan_number }).session(session);
    if (!loan) throwError('Peminjaman tidak ditemukan!', 404);

    // validasi struktur & sisa
    await validateReturnPayloadAndSisa({
      session,
      loan_number,
      items: returned_items
    });

    // buat dokumen Draft
    const [doc] = await ReturnLoan.create(
      [
        {
          loan_number,
          borrower,
          position,
          report_date,
          return_date,
          inventory_manager,
          status: 'Draft',
          loan_locked: false,
          need_review: false,
          returned_items: []
        }
      ],
      { session }
    );

    // simpan bukti per-item (skip kalau Hilang)
    for (let i = 0; i < returned_items.length; i++) {
      const ret = returned_items[i];
      const file = getProofFile(req, i + 1);
      let proofImage = null;

      if (file && String(ret.condition_new).toLowerCase() !== 'hilang') {
        const ext = path.extname(file.originalname || '');
        const key = `bukti_pengembalian_barang/${loan_number}/bukti_${
          i + 1
        }_${formatDate()}${ext}`;
        debugLog(`upload bukti_${i + 1}`, {
          key,
          size: file.size,
          mimetype: file.mimetype
        });
        await uploadBuffer(key, file.buffer);
        proofImage = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      } else {
        debugLog(`no proof for item #${i + 1}`, {
          condition_new: ret.condition_new,
          hasFile: !!file
        });
      }

      doc.returned_items.push({
        ...ret,
        proof_image:
          String(ret.condition_new).toLowerCase() === 'hilang'
            ? null
            : proofImage
      });
    }

    await doc.save({ session });
    await session.commitTransaction();

    debugLog('createDraft.success', {
      id: doc._id,
      items: doc.returned_items.length
    });
    res.status(201).json(doc);
  } catch (err) {
    await session.abortTransaction();
    debugLog('createDraft.error', { message: err?.message, stack: err?.stack });
    throw err;
  } finally {
    session.endSession();
  }
});

module.exports = {
  createReturnLoan
};
