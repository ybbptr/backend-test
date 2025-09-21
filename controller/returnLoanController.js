// controllers/returnLoanController.js
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const path = require('path');

const throwError = require('../utils/throwError');
const Loan = require('../model/loanModel');
const Inventory = require('../model/inventoryModel');
const Employee = require('../model/employeeModel');
const Warehouse = require('../model/warehouseModel');
const Shelf = require('../model/shelfModel');
const LoanCirculation = require('../model/loanCirculationModel');
const ProductCirculation = require('../model/productCirculationModel');
const ReturnLoan = require('../model/returnLoanModel');
const StockAdjustment = require('../model/stockAdjustmentModel');

const { resolveActor } = require('../utils/actor');
const { applyAdjustment } = require('../utils/stockAdjustment');
const { uploadBuffer, deleteFile, getFileUrl } = require('../utils/wasabi');
const formatDate = require('../utils/formatDate');

const VALID_CONDS = ['Baik', 'Rusak', 'Maintenance', 'Hilang'];

/* ========================= Helpers ========================= */

const ensureObjectId = (id, label = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(id))
    throwError(`${label} tidak valid`, 400);
};

// FE mengirim bukti_n (mulai 1)
function getProofFile(req, idx1) {
  const field = `bukti_${idx1}`;
  if (Array.isArray(req.files))
    return req.files.find((f) => f.fieldname === field) || null;
  if (req.files && typeof req.files === 'object') {
    const arr = req.files[field];
    return arr && arr[0] ? arr[0] : null;
  }
  return null;
}

/**
 * Parser BARU untuk membaca returned_items dari berbagai format:
 * - Array JSON langsung
 * - String JSON (termasuk double-encoded)
 * - Object {0:{...},1:{...}}
 * - Bracket notation: returned_items[0][field]
 */
function parseReturnedItemsFromRequest(req) {
  const body = req?.body || {};

  // Kandidat field yang mungkin dipakai FE
  let raw =
    body?.returned_items ??
    body?.['returned_items[]'] ??
    body?.returnedItems ??
    null;

  // a) Sudah array
  if (Array.isArray(raw)) return raw;

  // b) Object (mis. {0:{...},1:{...}})
  if (raw && typeof raw === 'object') return Object.values(raw);

  // c) String JSON (single/double encoded)
  if (typeof raw === 'string') {
    let s = raw.trim();
    if (s) {
      while (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"')
        s = s.slice(1, -1);
      s = s.replace(/\r?\n/g, '');
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr;
      } catch {
        try {
          const fixed = s.replace(/'/g, '"');
          const arr = JSON.parse(fixed);
          if (Array.isArray(arr)) return arr;
        } catch {
          // lanjut ke bracket parser
        }
      }
    }
  }

  // d) BRACKET NOTATION: returned_items[0][field]
  const REG = /^returned_items\[(\d+)\]\[([^\]]+)\]$/;
  const buckets = new Map();

  for (const [k, v] of Object.entries(body)) {
    const m = k.match(REG);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    const field = m[2];

    if (!buckets.has(idx)) buckets.set(idx, {});

    let val = v;
    if (field === 'quantity') {
      const n = Number(v);
      val = Number.isFinite(n) ? n : v;
    }
    if (v === '' || v === 'null' || v === null) val = null;

    buckets.get(idx)[field] = val;
  }

  if (buckets.size) {
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, obj]) => obj);
  }

  // Format tidak dikenali → kosong
  return [];
}

function decideItemStatus(totalQty, totalReturned, totalLost) {
  const used = totalReturned + totalLost;
  if (used <= 0) return 'Dipinjam';
  if (used < totalQty) return 'Dipinjam';
  return totalReturned > 0 ? 'Dikembalikan' : 'Hilang';
}

// Akumulasi semua ReturnLoan FINAL ("Dikembalikan") untuk loan_number (per borrowed_item id)
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
  for (const r of rows)
    map.set(String(r._id), { returned: r.returned || 0, lost: r.lost || 0 });
  return map;
}

// Hitung ulang status item & status loan
async function recomputeCirculationAndLoan({ session, loan, circulation }) {
  const map = await buildReturnedMap(loan.loan_number, { session });
  let allDone = true;

  for (const it of circulation.borrowed_items || []) {
    const agg = map.get(String(it._id)) || { returned: 0, lost: 0 };
    const status = decideItemStatus(it.quantity || 0, agg.returned, agg.lost);
    it.item_status = status;
    if (!['Dikembalikan', 'Hilang'].includes(status)) allDone = false;
  }
  await circulation.save({ session });

  loan.circulation_status = allDone ? 'Selesai' : 'Aktif';
  loan.completed_at = allDone ? new Date() : null;
  await loan.save({ session });
}

/* ============================================================
   CORE SERVICES (dipakai oleh by-id finalize & one-shot)
   ============================================================ */

// Validasi struktur & sisa kuantitas
async function validateReturnPayloadAndSisa({ session, loan_number, items }) {
  const circulation = await LoanCirculation.findOne({ loan_number })
    .select('borrowed_items')
    .session(session);
  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  const idSet = new Set(circulation.borrowed_items.map((b) => String(b._id)));

  items.forEach((it, idx) => {
    if (!it || !it._id)
      throwError(`returned_items[#${idx + 1}] tidak punya _id sirkulasi`, 400);
    if (!idSet.has(String(it._id)))
      throwError(`Item #${idx + 1} tidak valid di sirkulasi`, 400);
    if (!VALID_CONDS.includes(it.condition_new))
      throwError(`condition_new item #${idx + 1} tidak valid`, 400);
    if (!it.quantity || Number(it.quantity) <= 0)
      throwError(`quantity item #${idx + 1} harus > 0`, 400);
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

  // Cek sisa vs batch FINAL lain
  const totalMap = await buildReturnedMap(loan_number, { session });
  for (const it of items) {
    const circItem = circulation.borrowed_items.id(it._id);
    const agg = totalMap.get(String(it._id)) || { returned: 0, lost: 0 };
    const used = agg.returned + agg.lost;
    const available = (circItem?.quantity || 0) - used;
    if (it.quantity > available) {
      throwError(
        `Qty retur (${it.quantity}) > sisa (${available}) utk item ${
          it.product_code || it._id
        }`,
        400
      );
    }
  }

  return circulation;
}

// Buat Draft ReturnLoan (tanpa efek stok)
async function createDraftReturnLoan(session, req) {
  const {
    loan_number,
    borrower,
    position,
    report_date,
    return_date,
    inventory_manager
  } = req.body || {};
  const returned_items = parseReturnedItemsFromRequest(req);

  if (!loan_number || returned_items.length === 0) {
    throwError('Nomor peminjaman dan daftar barang wajib diisi!', 400);
  }

  const loan = await Loan.findOne({ loan_number }).session(session);
  if (!loan) throwError('Peminjaman tidak ditemukan!', 404);
  const borrowerId = req.body?.borrower || loan.borrower;
  // Validasi struktur + sisa
  await validateReturnPayloadAndSisa({
    session,
    loan_number,
    items: returned_items
  });

  const [doc] = await ReturnLoan.create(
    [
      {
        loan_number,
        borrower: borrowerId,
        position,
        report_date,
        return_date,
        inventory_manager,
        status: 'Draft',
        loan_locked: false,
        needs_review: false,
        returned_items: []
      }
    ],
    { session }
  );

  // Attach bukti per item (opsional; hilang → skip)
  for (let i = 0; i < returned_items.length; i++) {
    const ret = returned_items[i];
    const file = getProofFile(req, i + 1);
    let proofImage = null;
    if (file && ret.condition_new !== 'Hilang') {
      const ext = path.extname(file.originalname);
      const key = `bukti_pengembalian_barang/${loan_number}/bukti_${
        i + 1
      }_${formatDate()}${ext}`;
      await uploadBuffer(key, file.buffer);
      proofImage = {
        key,
        contentType: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      };
    }
    doc.returned_items.push({
      ...ret,
      proof_image: ret.condition_new === 'Hilang' ? null : proofImage
    });
  }

  await doc.save({ session });
  return { loan, doc };
}

// Finalisasi satu ReturnLoan draft → gerak stok, log, recompute
async function finalizeReturnLoanCore(session, { loan, doc, actor }) {
  if (doc.status !== 'Draft')
    throwError('Batch bukan Draft, tidak bisa difinalisasi', 400);

  const circulation = await LoanCirculation.findOne({
    loan_number: doc.loan_number
  }).session(session);
  if (!circulation) throwError('Sirkulasi tidak ditemukan', 404);

  // Validasi ulang sisa agar race-safe
  await validateReturnPayloadAndSisa({
    session,
    loan_number: doc.loan_number,
    items: doc.returned_items || []
  });

  const circulationLogs = [];
  let hasLost = false;

  for (const ret of doc.returned_items || []) {
    const inv = await Inventory.findById(ret.inventory)
      .populate('product', 'product_code brand')
      .session(session);
    if (!inv) throwError('Inventory tidak ditemukan', 404);

    const circItem = circulation.borrowed_items.id(ret._id);
    if (!circItem) throwError('Item tidak ditemukan di sirkulasi', 404);

    if (ret.condition_new === 'Hilang') {
      hasLost = true;

      // Turunkan ON_LOAN (barang dipastikan tidak kembali)
      await applyAdjustment(session, {
        inventoryId: inv._id,
        bucket: 'ON_LOAN',
        delta: -ret.quantity,
        reason_code: 'MARK_LOST',
        reason_note: `Barang hilang (ReturnLoan ${doc._id})`,
        actor,
        correlation: {
          loan_id: loan._id,
          loan_number: loan.loan_number,
          return_loan_id: doc._id
        }
      });
    } else {
      // Pengembalian normal
      inv.on_hand += ret.quantity;
      inv.on_loan -= ret.quantity;
      inv.condition = ret.condition_new || inv.condition;
      inv.warehouse = ret.warehouse_return || inv.warehouse;
      inv.shelf = ret.shelf_return || inv.shelf;
      inv.last_in_at = new Date();
      await inv.save({ session });

      // Catat pergerakan fisik
      circulationLogs.push({
        movement_type: 'RETURN_IN',
        product: inv.product?._id,
        product_code: inv.product?.product_code,
        product_name: inv.product?.brand,
        quantity: ret.quantity,
        from_condition: circItem.condition,
        to_condition: ret.condition_new,
        warehouse_from: circItem.warehouse_from,
        shelf_from: circItem.shelf_from,
        warehouse_to: ret.warehouse_return,
        shelf_to: ret.shelf_return,
        moved_by_id: loan.borrower,
        moved_by_name: loan.borrower?.name,
        loan_id: loan._id,
        loan_number: loan.loan_number,
        return_loan_id: doc._id
      });
    }

    // Timestamp pengembalian per item (opsional untuk tampilan)
    circItem.return_date_circulation = new Date();
  }

  if (circulationLogs.length) {
    await ProductCirculation.insertMany(circulationLogs, { session });
  }

  // Recompute status sirkulasi & loan
  await recomputeCirculationAndLoan({ session, loan, circulation });

  // Tandai batch final
  doc.status = 'Dikembalikan';
  doc.needs_review = !!hasLost;
  doc.loan_locked = true;
  await doc.save({ session });

  // Kunci Loan (ada setidaknya satu batch final)
  await Loan.updateOne(
    { _id: loan._id },
    { $set: { loan_locked: true } },
    { session }
  );

  return { hasLost };
}

/* ========================= Controllers ========================= */

/** CREATE Draft */
const createReturnLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { doc } = await createDraftReturnLoan(session, req);

    await session.commitTransaction();
    res.status(201).json(doc);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/** UPDATE Draft */
const updateReturnLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const doc = await ReturnLoan.findById(id).session(session);
    if (!doc) throwError('Data pengembalian tidak ditemukan', 404);
    if (doc.status !== 'Draft') throwError('Hanya Draft yang bisa diubah', 400);

    const items = parseReturnedItemsFromRequest(req);
    await validateReturnPayloadAndSisa({
      session,
      loan_number: doc.loan_number,
      items
    });

    // Hapus bukti lama yang tidak ada di payload baru
    for (const old of doc.returned_items || []) {
      const incoming = items.find((x) => String(x._id) === String(old._id));
      if (!incoming && old?.proof_image?.key) {
        try {
          await deleteFile(old.proof_image.key);
        } catch {}
      }
    }

    // Rebuild item list + bukti
    const rebuilt = [];
    for (let i = 0; i < items.length; i++) {
      const ret = items[i];
      const prev = (doc.returned_items || []).find(
        (x) => String(x._id) === String(ret._id)
      );

      let proof = prev?.proof_image || null;
      const file = getProofFile(req, i + 1);
      if (file && ret.condition_new !== 'Hilang') {
        if (proof?.key) {
          try {
            await deleteFile(proof.key);
          } catch {}
        }
        const ext = path.extname(file.originalname);
        const key = `bukti_pengembalian_barang/${doc.loan_number}/bukti_${
          i + 1
        }_${formatDate()}${ext}`;
        await uploadBuffer(key, file.buffer);
        proof = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }
      if (ret.condition_new === 'Hilang') proof = null;

      rebuilt.push({ ...ret, proof_image: proof });
    }

    // Field meta
    if (req.body.report_date !== undefined)
      doc.report_date = req.body.report_date;
    if (req.body.return_date !== undefined)
      doc.return_date = req.body.return_date;
    if (req.body.inventory_manager !== undefined)
      doc.inventory_manager = req.body.inventory_manager;
    if (req.body.borrower !== undefined) doc.borrower = req.body.borrower;
    if (req.body.position !== undefined) doc.position = req.body.position;

    doc.returned_items = rebuilt;
    await doc.save({ session });

    await session.commitTransaction();
    res.status(200).json(doc);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/** FINALIZE by ID (Draft → Dikembalikan) */
const finalizeReturnLoanById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const doc = await ReturnLoan.findById(id).session(session);
    if (!doc) throwError('Data pengembalian tidak ditemukan', 404);
    if (doc.status !== 'Draft') throwError('Batch bukan Draft', 400);

    const loan = await Loan.findOne({ loan_number: doc.loan_number })
      .populate('borrower', 'name')
      .session(session);
    if (!loan) throwError('Loan tidak ditemukan', 404);

    const actor = await resolveActor(req, session);
    await finalizeReturnLoanCore(session, { loan, doc, actor });

    await session.commitTransaction();
    res.status(200).json({
      message: 'ReturnLoan difinalisasi',
      id: doc._id,
      needs_review: doc.needs_review
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/** ONE-SHOT FINALIZE (Create Draft + Finalize dalam satu transaksi) */
const finalizeReturnLoanOneShot = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  // DEBUG SNAPSHOT
  try {
    console.log('[RETURN-ONE] content-type:', req.headers['content-type']);
    console.log('[RETURN-ONE] body keys:', Object.keys(req.body || {}));
    console.log('[RETURN-ONE] loan_number:', req.body?.loan_number);
    console.log(
      '[RETURN-ONE] typeof returned_items:',
      typeof req.body?.returned_items,
      'isArray=',
      Array.isArray(req.body?.returned_items)
    );
    if (typeof req.body?.returned_items === 'string') {
      const s = req.body.returned_items;
      console.log(
        '[RETURN-ONE] returned_items(raw):',
        s.length > 800 ? s.slice(0, 800) + '...<truncated>' : s
      );
    }
    if (Array.isArray(req.files)) {
      console.log(
        '[RETURN-ONE] files(array):',
        req.files.map((f) => ({ field: f.fieldname, size: f.size }))
      );
    } else {
      console.log(
        '[RETURN-ONE] files(obj):',
        Object.fromEntries(
          Object.entries(req.files || {}).map(([k, arr]) => [
            k,
            Array.isArray(arr) ? arr.length : 1
          ])
        )
      );
    }
  } catch {}

  try {
    // 1) Buat Draft (pakai helper; sudah auto-fallback borrower dari Loan)
    const { doc, loan } = await (async () => {
      // panggil helper createDraftReturnLoan tapi kita override fallback meta di dalamnya
      // jadi cukup panggil seperti biasa
      const created = await createDraftReturnLoan(session, {
        body: req.body,
        files: req.files
      });

      // safety log
      console.log('[RETURN-ONE] draft.created:', {
        id: created.doc?._id?.toString(),
        items: created.doc?.returned_items?.length,
        borrower: created.doc?.borrower?.toString?.() || created.doc?.borrower
      });

      return created;
    })();

    // 2) Finalize langsung
    const actor = await resolveActor(req, session);
    console.log('[RETURN-ONE] actor:', actor);

    const result = await finalizeReturnLoanCore(session, { loan, doc, actor });
    console.log('[RETURN-ONE] finalize.result:', result);

    await session.commitTransaction();
    res.status(201).json({
      message: 'ReturnLoan dibuat & difinalisasi',
      id: doc._id,
      needs_review: doc.needs_review
    });
  } catch (err) {
    await session.abortTransaction();
    console.error('[RETURN-ONE] error:', err?.message, err?.stack);
    throw err;
  } finally {
    session.endSession();
  }
});

/** REOPEN (Dikembalikan → Draft) + rollback stok & log */
const reopenReturnLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const doc = await ReturnLoan.findById(req.params.id).session(session);
    if (!doc) throwError('Data pengembalian tidak ditemukan', 404);
    if (doc.status !== 'Dikembalikan')
      throwError('Hanya batch "Dikembalikan" yang bisa Reopen', 400);

    const loan = await Loan.findOne({ loan_number: doc.loan_number }).session(
      session
    );
    if (!loan) throwError('Loan tidak ditemukan', 404);

    const circulation = await LoanCirculation.findOne({
      loan_number: doc.loan_number
    }).session(session);
    if (!circulation) throwError('Sirkulasi tidak ditemukan', 404);

    const actor = await resolveActor(req, session);

    // rollback efek finalisasi sebelumnya
    for (const item of doc.returned_items || []) {
      const inv = await Inventory.findById(item.inventory).session(session);
      if (!inv) continue;

      const circItem = circulation.borrowed_items.id(item._id);

      if (item.condition_new === 'Hilang') {
        await applyAdjustment(session, {
          inventoryId: inv._id,
          bucket: 'ON_LOAN',
          delta: +item.quantity,
          reason_code: 'REVERT_MARK_LOST',
          reason_note: `Reopen ReturnLoan ${doc._id}`,
          actor,
          correlation: {
            loan_id: loan._id,
            loan_number: loan.loan_number,
            return_loan_id: doc._id
          }
        });
      } else {
        inv.on_hand -= item.quantity;
        inv.on_loan += item.quantity;
        inv.last_out_at = new Date();
        await inv.save({ session });

        await applyAdjustment(session, {
          inventoryId: inv._id,
          bucket: 'ON_HAND',
          delta: -item.quantity,
          reason_code: 'REVERT_RETURN',
          reason_note: `Reopen ReturnLoan ${doc._id}`,
          actor,
          correlation: {
            loan_id: loan._id,
            loan_number: loan.loan_number,
            return_loan_id: doc._id
          }
        });
        await applyAdjustment(session, {
          inventoryId: inv._id,
          bucket: 'ON_LOAN',
          delta: +item.quantity,
          reason_code: 'REVERT_RETURN',
          reason_note: `Reopen ReturnLoan ${doc._id}`,
          actor,
          correlation: {
            loan_id: loan._id,
            loan_number: loan.loan_number,
            return_loan_id: doc._id
          }
        });
      }

      if (circItem) {
        circItem.return_date_circulation = null;
      }
    }

    // bersihkan log/ledger batch ini
    await ProductCirculation.deleteMany({ return_loan_id: doc._id }).session(
      session
    );
    await StockAdjustment.deleteMany({
      'correlation.return_loan_id': doc._id
    }).session(session);

    // recompute sirkulasi & loan
    await recomputeCirculationAndLoan({ session, loan, circulation });

    // atur lock Loan: tetap true jika masih ada batch lain yang final
    const stillFinal = await ReturnLoan.exists({
      loan_number: loan.loan_number,
      status: 'Dikembalikan',
      _id: { $ne: doc._id }
    }).session(session);
    await Loan.updateOne(
      { _id: loan._id },
      { $set: { loan_locked: !!stillFinal } },
      { session }
    );

    // set batch ini kembali ke Draft
    doc.status = 'Draft';
    doc.loan_locked = false;
    doc.needs_review = false;
    await doc.save({ session });

    await session.commitTransaction();
    res.status(200).json({
      message: 'ReturnLoan dibuka ulang (Draft)',
      id: doc._id
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/** DELETE (hanya Draft) */
const deleteReturnLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const doc = await ReturnLoan.findById(id).session(session);
    if (!doc) throwError('Data pengembalian tidak ditemukan', 404);

    if (doc.status !== 'Draft') {
      throwError('Hanya boleh menghapus batch yang masih Draft', 400);
    }

    for (const it of doc.returned_items || []) {
      if (it?.proof_image?.key) {
        try {
          await deleteFile(it.proof_image.key);
        } catch {}
      }
    }

    await doc.deleteOne({ session });
    await session.commitTransaction();

    res.status(200).json({ message: 'ReturnLoan berhasil dihapus' });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ========================= Read: List & Detail ========================= */

const getAllReturnLoan = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { status, project, search } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (project) filter['returned_items.project'] = project;

  if (req.user.role === 'karyawan') {
    const me = await Employee.findOne({ user: req.user.id }).select('_id');
    if (!me) throwError('Karyawan tidak ditemukan', 404);
    filter.borrower = me._id;
  }

  if (search) {
    filter.$or = [
      { loan_number: { $regex: search, $options: 'i' } },
      { 'returned_items.product_code': { $regex: search, $options: 'i' } },
      { 'returned_items.brand': { $regex: search, $options: 'i' } }
    ];
  }

  const totalItems = await ReturnLoan.countDocuments(filter);
  const rows = await ReturnLoan.find(filter)
    .populate('borrower', 'name')
    .populate('returned_items.product', 'product_code brand')
    .populate(
      'returned_items.warehouse_return',
      'warehouse_name warehouse_code'
    )
    .populate('returned_items.shelf_return', 'shelf_name shelf_code')
    .populate('returned_items.project', 'project_name')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  // Progress per loan_number: total dari circulation vs final approved
  const loanNumbers = [...new Set(rows.map((r) => r.loan_number))];
  const circs = await LoanCirculation.find({
    loan_number: { $in: loanNumbers }
  })
    .select('loan_number borrowed_items.quantity')
    .lean();
  const totalsMap = new Map(
    circs.map((c) => [
      c.loan_number,
      (c.borrowed_items || []).reduce(
        (s, x) => s + (Number(x.quantity) || 0),
        0
      )
    ])
  );

  const approvedAgg = await ReturnLoan.aggregate([
    { $match: { loan_number: { $in: loanNumbers }, status: 'Dikembalikan' } },
    { $unwind: '$returned_items' },
    {
      $group: {
        _id: '$loan_number',
        qty_ok: {
          $sum: {
            $cond: [
              { $ne: ['$returned_items.condition_new', 'Hilang'] },
              '$returned_items.quantity',
              0
            ]
          }
        },
        qty_lost: {
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
  const approvedMap = new Map(
    approvedAgg.map((r) => [
      r._id,
      (Number(r.qty_ok) || 0) + (Number(r.qty_lost) || 0)
    ])
  );

  const data = rows.map((r) => {
    const total = totalsMap.get(r.loan_number) || 0;
    const approved = approvedMap.get(r.loan_number) || 0;
    return {
      ...r,
      progress: { approved, total },
      progress_label: `${approved}/${total || 0}`
    };
  });

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data
  });
});

const getReturnLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const doc = await ReturnLoan.findById(id)
    .populate('borrower', 'name')
    .populate('returned_items.product', 'product_code brand')
    .populate(
      'returned_items.warehouse_return',
      'warehouse_name warehouse_code'
    )
    .populate('returned_items.shelf_return', 'shelf_name shelf_code')
    .populate('returned_items.project', 'project_name')
    .lean();

  if (!doc) throwError('Data pengembalian tidak ditemukan', 404);

  // Signed URL utk bukti
  doc.returned_items = await Promise.all(
    (doc.returned_items || []).map(async (item) => {
      let proof_url = null;
      if (item.proof_image?.key) {
        try {
          proof_url = await getFileUrl(item.proof_image.key);
        } catch {}
      }
      return { ...item, proof_url };
    })
  );

  const circ = await LoanCirculation.findOne({ loan_number: doc.loan_number })
    .select('borrowed_items.quantity')
    .lean();
  const total = (circ?.borrowed_items || []).reduce(
    (s, x) => s + (Number(x.quantity) || 0),
    0
  );

  const approvedAgg = await ReturnLoan.aggregate([
    { $match: { loan_number: doc.loan_number, status: 'Dikembalikan' } },
    { $unwind: '$returned_items' },
    {
      $group: {
        _id: null,
        qty_ok: {
          $sum: {
            $cond: [
              { $ne: ['$returned_items.condition_new', 'Hilang'] },
              '$returned_items.quantity',
              0
            ]
          }
        },
        qty_lost: {
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
  const appr = approvedAgg[0] || { qty_ok: 0, qty_lost: 0 };
  const approved = (Number(appr.qty_ok) || 0) + (Number(appr.qty_lost) || 0);

  res.status(200).json({
    ...doc,
    progress: { approved, total },
    progress_label: `${approved}/${total}`
  });
});

/** FE: nomor loan milik karyawan yang masih ada sisa */
const getMyLoanNumbers = asyncHandler(async (req, res) => {
  const me = await Employee.findOne({ user: req.user.id })
    .select('_id name')
    .lean();
  if (!me) throwError('Karyawan tidak ditemukan', 404);

  const activeLoans = await Loan.find({
    borrower: me._id,
    approval: 'Disetujui',
    circulation_status: { $in: ['Aktif', 'Pending'] }
  })
    .select('loan_number borrowed_items')
    .sort({ createdAt: -1 })
    .lean();

  const result = [];
  for (const ln of activeLoans) {
    const circ = await LoanCirculation.findOne({ loan_number: ln.loan_number })
      .select('borrowed_items')
      .lean();
    if (!circ) continue;

    const usedMap = await buildReturnedMap(ln.loan_number);
    const hasRemaining = (circ.borrowed_items || []).some((b) => {
      const used = usedMap.get(String(b._id)) || { returned: 0, lost: 0 };
      const usedQty = (used.returned || 0) + (used.lost || 0);
      return (Number(b.quantity) || 0) - usedQty > 0;
    });

    if (hasRemaining) {
      result.push({ id: ln._id, loan_number: ln.loan_number });
    }
  }

  res.status(200).json({ borrower: me.name, loan_numbers: result });
});

/** FE: return form (list item + remaining) */
const getReturnForm = asyncHandler(async (req, res) => {
  const { loan_number } = req.params;

  const loan = await Loan.findOne({ loan_number })
    .populate('borrower', 'name position')
    .lean();
  if (!loan) throwError('Peminjaman tidak ditemukan!', 404);

  const circulation = await LoanCirculation.findOne({ loan_number })
    .populate('borrowed_items.project', 'project_name')
    .select('borrowed_items')
    .lean();
  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  const map = await buildReturnedMap(loan_number);
  const items = (circulation.borrowed_items || [])
    .map((it) => {
      const agg = map.get(String(it._id)) || { returned: 0, lost: 0 };
      const used = (agg.returned || 0) + (agg.lost || 0);
      const remaining = (it.quantity || 0) - used;
      return {
        _id: it._id,
        inventory: it.inventory,
        product: it.product,
        product_code: it.product_code,
        brand: it.brand,
        quantity: it.quantity,
        remaining,
        item_status: it.item_status,
        project: it.project?._id || it.project,
        project_name: it.project?.project_name
      };
    })
    .filter((row) => row.remaining > 0);

  res.status(200).json({
    loan_number: loan.loan_number,
    borrower: loan.borrower,
    position: loan.position || loan.borrower?.position || null,
    inventory_manager: loan.inventory_manager,
    items
  });
});

const getAllWarehouse = asyncHandler(async (_req, res) => {
  const warehouse = await Warehouse.find().select('warehouse_name');
  res.json(warehouse);
});

const getShelvesByWarehouse = asyncHandler(async (req, res) => {
  const { warehouse } = req.query;
  if (!warehouse) throwError('ID gudang tidak valid', 400);
  const shelves = await Shelf.find({ warehouse }).select('shelf_name');
  res.json(shelves);
});

module.exports = {
  // Draft CRUD
  createReturnLoan,
  updateReturnLoan,
  deleteReturnLoan,

  // Finalize
  finalizeReturnLoanById,
  finalizeReturnLoanOneShot,

  // Reopen
  reopenReturnLoan,

  // Read
  getAllReturnLoan,
  getReturnLoan,

  // FE helpers
  getMyLoanNumbers,
  getReturnForm,
  getAllWarehouse,
  getShelvesByWarehouse
};
