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

const { notifyReturnFinalizedToAdmins } = require('../utils/chatbot');

const VALID_CONDS = ['Baik', 'Rusak', 'Maintenance', 'Hilang'];

/* ========================= Helpers ========================= */
const safeNotify = (p) =>
  Promise.resolve(p).catch((err) => {
    console.warn('[notify return] ', err?.message || err);
  });

async function resolveBorrower(loan, session) {
  const borrowerId =
    loan?.borrower && loan.borrower._id ? loan.borrower._id : loan?.borrower;

  let borrowerName = loan?.borrower?.name || null;

  if (!borrowerName && borrowerId) {
    const emp = await Employee.findById(borrowerId)
      .select('name')
      .session(session)
      .lean();
    borrowerName = emp?.name || null;
  }

  return {
    borrowerId: borrowerId || null,
    borrowerName: borrowerName || 'Unknown'
  };
}

async function getEmployeeId(req) {
  const me = await Employee.findOne({ user: req.user.id }).select('_id').lean();
  if (!me) throwError('Karyawan tidak ditemukan', 404);
  return me._id;
}

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

function parseReturnedItemsFromRequest(req) {
  const body = req?.body || {};

  let raw =
    body?.returned_items ??
    body?.['returned_items[]'] ??
    body?.returnedItems ??
    null;

  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === 'object') return Object.values(raw);

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
        } catch {}
      }
    }
  }

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

  return [];
}

function decideItemStatus(totalQty, totalReturned, totalLost) {
  const used = totalReturned + totalLost;

  if (used <= 0) return 'Dipinjam'; // belum ada yang balik/hilang
  if (used < totalQty) return 'Dipinjam'; // sebagian aja → masih dianggap dipinjam
  if (used >= totalQty) {
    if (totalReturned > 0 && totalLost === 0) return 'Dikembalikan'; // semua balik normal
    if (totalReturned === 0 && totalLost > 0) return 'Hilang'; // semua hilang
    return 'Selesai';
  }
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

async function recomputeCirculationAndLoan({ session, loan, circulation }) {
  const map = await buildReturnedMap(loan.loan_number, { session });

  const DONE_STATUSES = new Set(['Dikembalikan', 'Hilang', 'Selesai']);

  let allDone = true;

  for (const it of circulation.borrowed_items || []) {
    const qty = Number(it.quantity) || 0;
    const agg = map.get(String(it._id)) || { returned: 0, lost: 0 };
    const returned = Number(agg.returned) || 0;
    const lost = Number(agg.lost) || 0;

    const status = decideItemStatus(qty, returned, lost);
    it.item_status = status;

    if (!DONE_STATUSES.has(status)) {
      allDone = false;
    }
  }

  await circulation.save({ session });

  loan.circulation_status = allDone ? 'Selesai' : 'Aktif';
  loan.completed_at = allDone ? new Date() : null;
  await loan.save({ session });
}

async function validateReturnPayloadAndSisa({
  session,
  loan_number,
  items,
  excludeId = null
}) {
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
      throwError(`Item #${idx + 1}: gudang pengembalian wajib diisi"`, 400);
    }
    if (
      it.condition_new === 'Hilang' &&
      (it.warehouse_return || it.shelf_return)
    ) {
      throwError(
        `Item #${idx + 1}: tidak bisa isi gudang/lemari saat "Hilang"`,
        400
      );
    }
  });

  const finalMap = await buildReturnedMap(loan_number, { session }); // Map<circItemId, {returned,lost}>

  const matchDraft = { loan_number, status: 'Draft' };
  if (excludeId) matchDraft._id = { $ne: excludeId };

  const draftAgg = await ReturnLoan.aggregate([
    { $match: matchDraft },
    { $unwind: '$returned_items' },
    {
      $group: {
        _id: '$returned_items._id',
        qty_draft: { $sum: '$returned_items.quantity' } // "Hilang" juga tetap reservasi
      }
    }
  ]).session(session);
  const draftMap = new Map(
    draftAgg.map((r) => [String(r._id), Number(r.qty_draft) || 0])
  );

  // 3) Validasi sisa efektif (quantity - usedFinal - usedDraft)
  for (const it of items) {
    const circItem = circulation.borrowed_items.id(it._id);
    const fin = finalMap.get(String(it._id)) || { returned: 0, lost: 0 };
    const usedFinal = (Number(fin.returned) || 0) + (Number(fin.lost) || 0);
    const usedDraft = draftMap.get(String(it._id)) || 0;

    const available = (Number(circItem?.quantity) || 0) - usedFinal - usedDraft;
    if (Number(it.quantity) > available) {
      throwError(
        `Stok yang dikembalikan kelebihan untuk barang ${
          it.product_code || ''
        }. Stok yang harus dikembalikan tersisa : ${available} .`,
        400
      );
    }
  }

  return circulation;
}

// Buat Draft ReturnLoan (tanpa efek stok)
async function createDraftReturnLoan(session, req) {
  const { loan_number, position, report_date, return_date, inventory_manager } =
    req.body || {};
  const returned_items = parseReturnedItemsFromRequest(req);

  if (!loan_number || returned_items.length === 0) {
    throwError('Nomor peminjaman dan daftar barang wajib diisi!', 400);
  }

  const loan = await Loan.findOne({ loan_number }).session(session);
  if (!loan) throwError('Peminjaman tidak ditemukan!', 404);
  const borrowerId = req.body?.borrower || loan.borrower;
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
      await uploadBuffer(key, file.buffer, { contentType: file.mimetype });
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

async function finalizeReturnLoanCore(session, { loan, doc, actor }) {
  if (doc.status !== 'Draft') {
    throwError('Batch bukan Draft, tidak bisa difinalisasi', 400);
  }

  const circulation = await LoanCirculation.findOne({
    loan_number: doc.loan_number
  }).session(session);
  if (!circulation) throwError('Sirkulasi tidak ditemukan', 404);

  await validateReturnPayloadAndSisa({
    session,
    loan_number: doc.loan_number,
    items: doc.returned_items || [],
    excludeId: doc._id
  });

  const { borrowerId, borrowerName } = await resolveBorrower(loan, session);

  const circulationLogs = [];
  let hasLost = false;

  for (const ret of doc.returned_items || []) {
    const inv = await Inventory.findById(ret.inventory)
      .populate('product', 'product_code brand')
      .populate('warehouse', 'warehouse_name')
      .populate('shelf', 'shelf_name')
      .session(session);
    if (!inv) throwError('Inventory tidak ditemukan', 404);

    const circItem = circulation.borrowed_items.id(ret._id);
    if (!circItem) throwError('Item tidak ditemukan di sirkulasi', 404);

    if (ret.condition_new === 'Hilang') {
      hasLost = true;

      await applyAdjustment(session, {
        inventoryId: inv._id,
        bucket: 'ON_LOAN',
        delta: -ret.quantity,
        reason_code: 'MARK_LOST',
        reason_note: `Barang hilang (${ret.quantity} ${
          inv.product?.brand || 'item'
        }) dari pinjaman ${loan.loan_number}`,
        actor,
        correlation: {
          loan_id: loan._id,
          loan_number: loan.loan_number,
          return_loan_id: doc._id
        }
      });

      inv.on_loan -= ret.quantity;
      await inv.save({ session });
    } else {
      // === NORMAL RETURN ===
      const targetWarehouse =
        ret.warehouse_return || inv.warehouse?._id || inv.warehouse;
      const targetShelf =
        ret.shelf_return ?? (inv.shelf?._id || inv.shelf || null);
      const targetCond = ret.condition_new || inv.condition;

      const sameIdentity =
        String(targetWarehouse) ===
          String(inv.warehouse?._id || inv.warehouse) &&
        String(targetShelf || '') ===
          String(inv.shelf?._id || inv.shelf || '') &&
        targetCond === inv.condition;

      // Ledger: ON_LOAN turun
      await applyAdjustment(session, {
        inventoryId: inv._id,
        bucket: 'ON_LOAN',
        delta: -ret.quantity,
        reason_code: 'RETURN_IN',
        reason_note: `Mengembalikan ${ret.quantity} ${
          inv.product?.brand || 'item'
        } dari pinjaman ${loan.loan_number}`,
        actor,
        correlation: {
          loan_id: loan._id,
          loan_number: loan.loan_number,
          return_loan_id: doc._id
        }
      });

      if (sameIdentity) {
        inv.on_hand += ret.quantity;
        inv.on_loan -= ret.quantity;
        inv.last_in_at = new Date();
        await inv.save({ session });

        await applyAdjustment(session, {
          inventoryId: inv._id,
          bucket: 'ON_HAND',
          delta: +ret.quantity,
          reason_code: 'RETURN_IN',
          reason_note: `Dikembalikan ke ${
            inv.warehouse?.warehouse_name || 'Gudang'
          }${inv.shelf?.shelf_name ? ' / ' + inv.shelf.shelf_name : ''}`,
          actor,
          correlation: {
            loan_id: loan._id,
            loan_number: loan.loan_number,
            return_loan_id: doc._id
          }
        });
      } else {
        inv.on_loan -= ret.quantity;
        await inv.save({ session });
        if ((inv.on_hand || 0) <= 0 && (inv.on_loan || 0) <= 0) {
          await Inventory.deleteOne({ _id: inv._id }).session(session);
        }

        let target = await Inventory.findOne({
          product: inv.product,
          warehouse: targetWarehouse,
          shelf: targetShelf || null,
          condition: targetCond
        }).session(session);

        if (target) {
          target.on_hand += ret.quantity;
          target.last_in_at = new Date();
          await target.save({ session });

          await applyAdjustment(session, {
            inventoryId: target._id,
            bucket: 'ON_HAND',
            delta: +ret.quantity,
            reason_code: 'RETURN_IN',
            reason_note: `Dikembalikan ke ${
              target.warehouse?.warehouse_name || 'Gudang'
            }${
              target.shelf?.shelf_name ? ' / ' + target.shelf.shelf_name : ''
            }`,
            actor,
            correlation: {
              loan_id: loan._id,
              loan_number: loan.loan_number,
              return_loan_id: doc._id
            }
          });
        } else {
          const created = await Inventory.create(
            [
              {
                product: inv.product,
                warehouse: targetWarehouse,
                shelf: targetShelf || null,
                condition: targetCond,
                on_hand: ret.quantity,
                on_loan: 0,
                last_in_at: new Date()
              }
            ],
            { session }
          );
          target = created[0];

          await applyAdjustment(session, {
            inventoryId: target._id,
            bucket: 'ON_HAND',
            delta: +ret.quantity,
            reason_code: 'RETURN_IN',
            reason_note: `Dikembalikan ke ${targetWarehouse || 'Gudang'}${
              targetShelf ? ' / ' + targetShelf : ''
            }`,
            actor,
            correlation: {
              loan_id: loan._id,
              loan_number: loan.loan_number,
              return_loan_id: doc._id
            }
          });
        }
      }

      // Catat pergerakan fisik untuk audit/riwayat
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

        moved_by: borrowerId,
        moved_by_model: 'Employee',
        moved_by_name: borrowerName,

        loan_id: loan._id,
        loan_number: loan.loan_number,
        return_loan_id: doc._id
      });
    }

    circItem.return_date_circulation = new Date();
  }

  if (circulationLogs.length) {
    await ProductCirculation.insertMany(circulationLogs, { session });
  }

  await recomputeCirculationAndLoan({ session, loan, circulation });

  doc.status = 'Dikembalikan';
  doc.needs_review = !!hasLost;
  doc.loan_locked = true;
  await doc.save({ session });

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

    // ⬅️ perbaikan: validasi sisa pakai FINAL + DRAFT lain (exclude draft ini sendiri)
    await validateReturnPayloadAndSisa({
      session,
      loan_number: doc.loan_number,
      items,
      excludeId: doc._id
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
        await uploadBuffer(key, file.buffer, { contentType: file.mimetype });
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
    safeNotify(notifyReturnFinalizedToAdmins(doc));
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

  try {
    const { doc, loan } = await createDraftReturnLoan(session, {
      body: req.body,
      files: req.files
    });

    const actor = await resolveActor(req, session);
    const result = await finalizeReturnLoanCore(session, { loan, doc, actor });

    await session.commitTransaction();
    safeNotify(notifyReturnFinalizedToAdmins(doc));
    res.status(201).json({
      message: 'ReturnLoan dibuat & difinalisasi',
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

const reopenReturnLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const doc = await ReturnLoan.findById(req.params.id).session(session);
    if (!doc) throwError('Data pengembalian tidak ditemukan', 404);
    if (doc.status !== 'Dikembalikan') {
      throwError(
        'Hanya batch "Dikembalikan" yang bisa dibuka ulang datanya',
        400
      );
    }

    const loan = await Loan.findOne({ loan_number: doc.loan_number }).session(
      session
    );
    if (!loan) throwError('Data peminjaman tidak ditemukan', 404);

    const circulation = await LoanCirculation.findOne({
      loan_number: doc.loan_number
    }).session(session);
    if (!circulation) throwError('Sirkulasi tidak ditemukan', 404);

    const actor = await resolveActor(req, session);

    for (const item of doc.returned_items || []) {
      const sourceInv = await Inventory.findById(item.inventory).session(
        session
      );
      if (!sourceInv) continue;

      const circItem = circulation.borrowed_items.id(item._id);

      if (item.condition_new === 'Hilang') {
        // Revert "mark lost" → kembalikan ke ON_LOAN (snapshot & ledger)
        sourceInv.on_loan += item.quantity;
        await sourceInv.save({ session });

        await applyAdjustment(session, {
          inventoryId: sourceInv._id,
          bucket: 'ON_LOAN',
          delta: +item.quantity,
          reason_code: 'REVERT_MARK_LOST',
          reason_note: `Buka ulang data pengembalian, ${loan.loan_number}`,
          actor,
          correlation: {
            loan_id: loan._id,
            loan_number: loan.loan_number,
            return_loan_id: doc._id
          }
        });
      } else {
        // Normal return yang harus di-revert
        const targetWarehouse = item.warehouse_return;
        const targetShelf = item.shelf_return ?? null;
        const targetCond = item.condition_new;

        const sameIdentity =
          String(targetWarehouse || '') === String(sourceInv.warehouse || '') &&
          String(targetShelf || '') === String(sourceInv.shelf || '') &&
          targetCond === sourceInv.condition;

        // 1) Kembalikan ON_LOAN di sumber (snapshot & ledger)
        sourceInv.on_loan += item.quantity;
        await sourceInv.save({ session });

        await applyAdjustment(session, {
          inventoryId: sourceInv._id,
          bucket: 'ON_LOAN',
          delta: +item.quantity,
          reason_code: 'REVERT_RETURN',
          reason_note: `Buka ulang data pengembalian, ${loan.loan_number}`,
          actor,
          correlation: {
            loan_id: loan._id,
            loan_number: loan.loan_number,
            return_loan_id: doc._id
          }
        });

        // 2) Turunkan ON_HAND dari lokasi yang dituju saat finalisasi
        if (sameIdentity) {
          // Semula ditaruh di inventory yang sama
          if (sourceInv.on_hand - item.quantity < 0) {
            throwError(
              'Rollback gagal: stok terkini menjadi negatif pada sumber.',
              400
            );
          }
          sourceInv.on_hand -= item.quantity;
          sourceInv.last_out_at = new Date();
          await sourceInv.save({ session });

          await applyAdjustment(session, {
            inventoryId: sourceInv._id,
            bucket: 'ON_HAND',
            delta: -item.quantity,
            reason_code: 'REVERT_RETURN',
            reason_note: `Buka ulang data pengembalian, ${loan.loan_number}`,
            actor,
            correlation: {
              loan_id: loan._id,
              loan_number: loan.loan_number,
              return_loan_id: doc._id
            }
          });
        } else {
          // Semula ditaruh di inventory target (warehouse_return/shelf_return/condition_new)
          let targetInv = await Inventory.findOne({
            product: sourceInv.product,
            warehouse: targetWarehouse,
            shelf: targetShelf,
            condition: targetCond
          }).session(session);

          if (!targetInv) {
            throwError(
              'Rollback gagal: inventory target pengembalian tidak ditemukan.',
              409
            );
          }
          if (targetInv.on_hand - item.quantity < 0) {
            throwError(
              'Rollback gagal: stok terkini menjadi negatif pada inventory target.',
              400
            );
          }

          targetInv.on_hand -= item.quantity;
          targetInv.last_out_at = new Date();
          await targetInv.save({ session });

          // Ledger ON_HAND -qty ke inventory target (bukan sumber)
          await applyAdjustment(session, {
            inventoryId: targetInv._id,
            bucket: 'ON_HAND',
            delta: -item.quantity,
            reason_code: 'REVERT_RETURN',
            reason_note: `Buka ulang data pengembalian, ${loan.loan_number}`,
            actor,
            correlation: {
              loan_id: loan._id,
              loan_number: loan.loan_number,
              return_loan_id: doc._id
            }
          });

          // Bila target kosong total, boleh dibersihkan
          if ((targetInv.on_hand || 0) <= 0 && (targetInv.on_loan || 0) <= 0) {
            await Inventory.deleteOne({ _id: targetInv._id }).session(session);
          }
        }
      }

      if (circItem) {
        circItem.return_date_circulation = null;
      }
    }

    // Bersihkan log/ledger batch ini
    await ProductCirculation.deleteMany({ return_loan_id: doc._id }).session(
      session
    );
    await StockAdjustment.deleteMany({
      'correlation.return_loan_id': doc._id
    }).session(session);

    // Recompute sirkulasi & loan
    await recomputeCirculationAndLoan({ session, loan, circulation });

    // Tetap lock loan jika masih ada batch final lain
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

    // Set batch ini kembali Draft
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
    .select(
      'loan_number borrower returned_items report_date return_date status pv_locked'
    )
    .populate('borrower', 'name')
    .populate('returned_items.product', 'product_code brand')
    .populate('returned_items.project', 'project_name')
    .populate(
      'returned_items.warehouse_return',
      'warehouse_name warehouse_code'
    )
    .populate('returned_items.shelf_return', 'shelf_name shelf_code')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  // Progress: total dari circulation vs final approved
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
      _id: r._id,
      loan_number: r.loan_number,
      borrower_name: r.borrower?.name || '-',
      report_date: r.report_date,
      return_date: r.return_date,
      total_item: r.returned_items?.length || 0,
      status: r.status,
      pv_locked: r.pv_locked || false,
      progress: { approved, total },
      progress_label: `${approved}/${total || 0}`,
      returned_items: (r.returned_items || []).map((it) => ({
        _id: it._id,
        product: it.product?._id,
        product_code: it.product?.product_code || it.product_code,
        brand: it.product?.brand || it.brand,
        quantity: it.quantity,
        condition_new: it.condition_new,
        project: it.project?._id,
        project_name: it.project?.project_name,
        warehouse_return: it.warehouse_return?._id,
        warehouse_name: it.warehouse_return?.warehouse_name,
        shelf_return: it.shelf_return?._id,
        shelf_name: it.shelf_return?.shelf_name,
        proof_image: it.proof_image || null
      }))
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

  // 1) Final "Dikembalikan"
  const finalMap = await buildReturnedMap(loan_number); // Map<circItemId, {returned,lost}>

  // 2) Reservasi dari semua Draft yang masih ada
  const draftAgg = await ReturnLoan.aggregate([
    { $match: { loan_number, status: 'Draft' } },
    { $unwind: '$returned_items' },
    {
      $group: {
        _id: '$returned_items._id',
        qty_draft: { $sum: '$returned_items.quantity' }
      }
    }
  ]);
  const draftMap = new Map(
    draftAgg.map((r) => [String(r._id), Number(r.qty_draft) || 0])
  );

  // 3) Susun item + remaining (qty - usedFinal - usedDraft)
  let totalBorrowed = 0;
  let totalUsedFinal = 0;
  let totalReservedDraft = 0;

  const items = (circulation.borrowed_items || [])
    .map((it) => {
      const qty = Number(it.quantity) || 0;
      totalBorrowed += qty;

      const fin = finalMap.get(String(it._id)) || { returned: 0, lost: 0 };
      const usedFinal = (Number(fin.returned) || 0) + (Number(fin.lost) || 0);
      const usedDraft = draftMap.get(String(it._id)) || 0;

      totalUsedFinal += usedFinal;
      totalReservedDraft += usedDraft;

      const remaining = Math.max(qty - usedFinal - usedDraft, 0);

      return {
        _id: it._id,
        inventory: it.inventory,
        product: it.product,
        product_code: it.product_code,
        brand: it.brand,
        quantity: remaining,
        used_final: usedFinal,
        reserved_draft: usedDraft,
        remaining,
        item_status: it.item_status,
        project: it.project?._id || it.project,
        project_name: it.project?.project_name || null
      };
    })
    .filter((row) => row.remaining > 0);

  res.status(200).json({
    loan_number: loan.loan_number,
    borrower: loan.borrower,
    position: loan.position || loan.borrower?.position || null,
    inventory_manager: loan.inventory_manager,
    // ringkasan progress
    // progress: {
    //   total_borrowed: totalBorrowed,
    //   used_final: totalUsedFinal,
    //   reserved_draft: totalReservedDraft,
    //   available_for_new_batch: Math.max(
    //     totalBorrowed - totalUsedFinal - totalReservedDraft,
    //     0
    //   )
    // },
    // progress_label: `${totalUsedFinal}+${totalReservedDraft}/${totalBorrowed}`,
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

const getAvailableLoanNumbers = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const search = (req.query.search || '').trim();

  const filter = {
    approval: 'Disetujui',
    circulation_status: { $in: ['Aktif', 'Pending'] }
  };

  if (req.user?.role === 'karyawan') {
    const myId = await getEmployeeId(req);
    filter.borrower = myId;
  }

  if (search) {
    filter.loan_number = { $regex: search, $options: 'i' };
  }

  const loans = await Loan.find(filter)
    .select('loan_number borrower createdAt')
    .populate('borrower', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (!loans.length) {
    return res.status(200).json({ success: true, loans: [] });
  }

  const loanNumbers = loans.map((l) => l.loan_number);
  const circs = await LoanCirculation.find({
    loan_number: { $in: loanNumbers }
  })
    .select('loan_number borrowed_items')
    .lean();

  const circMap = new Map(circs.map((c) => [c.loan_number, c]));

  const result = [];
  for (const ln of loans) {
    const circ = circMap.get(ln.loan_number);
    if (!circ || !Array.isArray(circ.borrowed_items)) continue;

    const retMap = await buildReturnedMap(ln.loan_number);

    let remainingItems = 0;
    let remainingQty = 0;
    let totalQty = 0;

    for (const b of circ.borrowed_items) {
      const qty = Number(b.quantity) || 0;
      totalQty += qty;

      const u = retMap.get(String(b._id)) || { returned: 0, lost: 0 };
      const used = (Number(u.returned) || 0) + (Number(u.lost) || 0);

      const remain = Math.max(qty - used, 0);
      if (remain > 0) {
        remainingItems += 1;
        remainingQty += remain;
      }
    }

    if (remainingItems > 0) {
      result.push({
        loan_id: ln._id,
        loan_number: ln.loan_number,
        borrower_name: ln.borrower?.name || null,
        remaining_items: remainingItems,
        remaining_quantity: remainingQty,
        total_quantity: totalQty
      });
    }
  }

  res.status(200).json({ success: true, loans: result });
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
  getShelvesByWarehouse,
  getAvailableLoanNumbers
};
