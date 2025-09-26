const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const throwError = require('../utils/throwError');

const Loan = require('../model/loanModel');
const Inventory = require('../model/inventoryModel');
const Employee = require('../model/employeeModel');
const Product = require('../model/productModel');
const Warehouse = require('../model/warehouseModel');
const RAP = require('../model/rapModel');

const LoanCirculation = require('../model/loanCirculationModel');
const ReturnLoan = require('../model/returnLoanModel');

const { resolveActor } = require('../utils/actor');
const { applyAdjustment } = require('../utils/stockAdjustment');

/* ========================= Helpers ========================= */

const ensureObjectId = (id, label = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(id))
    throwError(`${label} tidak valid`, 400);
};

const hasKey = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);

function parseBorrowedItems(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throwError('borrowed_items bukan JSON valid', 400);
    }
  }
  if (!Array.isArray(parsed) && typeof parsed === 'object')
    parsed = Object.values(parsed);
  if (!Array.isArray(parsed))
    throwError('borrowed_items harus berupa array', 400);
  return parsed;
}

async function hasApprovedReturn(loan_number, session) {
  const q = ReturnLoan.findOne({ loan_number, status: 'Dikembalikan' }).select(
    '_id'
  );
  const x = session ? await q.session(session) : await q;
  return !!x;
}

function computeCirculationStatus(approval) {
  if (approval === 'Disetujui') return 'Aktif';
  if (approval === 'Ditolak') return 'Ditolak';
  return 'Pending';
}

const createLoan = asyncHandler(async (req, res) => {
  const {
    loan_date,
    pickup_date,
    borrower,
    nik,
    address,
    position,
    phone,
    inventory_manager,
    warehouse_to
  } = req.body || {};

  const items = parseBorrowedItems(req.body.borrowed_items);

  if (
    !loan_date ||
    !pickup_date ||
    !borrower ||
    !nik ||
    !address ||
    !position ||
    !phone ||
    !inventory_manager ||
    !warehouse_to ||
    items.length === 0
  ) {
    throwError('Field wajib belum lengkap', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const processed = [];
    for (const it of items) {
      if (!it.inventory || !it.quantity)
        throwError('Barang & stok yang ingin dipinjam wajib diisi', 400);

      const inv = await Inventory.findById(it.inventory)
        .populate('product', 'product_code brand')
        .populate('warehouse', 'warehouse_name warehouse_code')
        .populate('shelf', 'shelf_name shelf_code')
        .session(session);
      if (!inv) throwError('Barang tidak ditemukan', 404);

      processed.push({
        inventory: inv._id,
        product: inv.product?._id,
        product_code: inv.product?.product_code,
        brand: inv.product?.brand,
        quantity: Number(it.quantity),
        project: it.project || null,
        condition_at_borrow: inv.condition,
        warehouse_from: inv.warehouse?._id,
        shelf_from: inv.shelf?._id
      });
    }

    const [loan] = await Loan.create(
      [
        {
          borrower,
          nik,
          address,
          phone,
          position,
          loan_date,
          pickup_date,
          inventory_manager,
          warehouse_to,
          borrowed_items: processed,
          approval: 'Diproses',
          circulation_status: computeCirculationStatus('Diproses'),
          loan_locked: false,
          note: null
        }
      ],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json(loan);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const updateLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const updates = req.body || {};

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findById(id).session(session);
    if (!loan) throwError('Data pengajuan alat tidak ditemukan', 404);

    if (loan.loan_locked || loan.approval !== 'Diproses') {
      throwError('Tidak bisa edit: batch terkunci atau bukan Diproses', 400);
    }

    // meta fields
    const fields = [
      'loan_date',
      'pickup_date',
      'borrower',
      'nik',
      'address',
      'position',
      'phone',
      'inventory_manager',
      'warehouse_to',
      'note'
    ];
    for (const f of fields) {
      if (hasKey(updates, f)) loan[f] = updates[f];
    }

    // borrowed_items: bedakan "tidak dikirim" vs "dikirim tapi []"
    if (hasKey(updates, 'borrowed_items')) {
      const items = parseBorrowedItems(updates.borrowed_items);

      if (items.length === 0) {
        // FE sengaja kosongkan list
        loan.borrowed_items = [];
      } else {
        const rebuilt = [];
        for (const it of items) {
          const inv = await Inventory.findById(it.inventory)
            .populate('product', 'product_code brand')
            .populate('warehouse', 'warehouse_name warehouse_code')
            .populate('shelf', 'shelf_name shelf_code')
            .session(session);
          if (!inv) throwError('Barang tidak ditemukan', 404);

          rebuilt.push({
            inventory: inv._id,
            product: inv.product?._id,
            product_code: inv.product?.product_code,
            brand: inv.product?.brand,
            quantity: Number(it.quantity),
            project: it.project || null,
            condition_at_borrow: inv.condition,
            warehouse_from: inv.warehouse?._id,
            shelf_from: inv.shelf?._id
          });
        }
        loan.borrowed_items = rebuilt;
      }
    }

    await loan.save({ session });
    await session.commitTransaction();

    res.status(200).json(loan);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const approveLoan = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin')
    throwError('Hanya admin yang bisa menyetujui pengajuan ini', 403);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findById(req.params.id)
      .populate('borrowed_items.inventory')
      .session(session);
    if (!loan) throwError('Data pengajuan alat tidak ditemukan', 404);

    if (loan.approval === 'Disetujui') throwError('Sudah Disetujui', 400);
    if (loan.approval === 'Ditolak') throwError('Dokumen Ditolak', 400);

    // Validasi stok & kondisi baik
    for (const it of loan.borrowed_items || []) {
      const inv = await Inventory.findById(it.inventory).session(session);
      if (!inv) throwError('Barang tidak ditemukan', 404);
      if (inv.on_hand < it.quantity) {
        throwError(
          `Stok terkini tidak cukup untuk dipinjam, barang: ${it.product_code}`,
          400
        );
      }
      if (inv.condition !== 'Baik') {
        throwError(
          `Barang (${it.product_code}) dengan kondisi ${inv.condition}, tidak bisa dipinjam`,
          400
        );
      }
    }

    const actor = await resolveActor(req, session);
    for (const it of loan.borrowed_items || []) {
      const inv = await Inventory.findById(it.inventory).session(session);
      inv.on_hand -= it.quantity;
      inv.on_loan += it.quantity;
      inv.last_out_at = new Date();
      await inv.save({ session });

      await applyAdjustment(session, {
        inventoryId: inv._id,
        bucket: 'ON_HAND',
        delta: -it.quantity,
        reason_code: 'LOAN_OUT',
        reason_note: `Barang keluar di peminjaman ${loan.loan_number}`,
        actor,
        correlation: { loan_id: loan._id, loan_number: loan.loan_number }
      });
      await applyAdjustment(session, {
        inventoryId: inv._id,
        bucket: 'ON_LOAN',
        delta: +it.quantity,
        reason_code: 'LOAN_OUT',
        reason_note: `Barang dipinjam di peminjaman ${loan.loan_number}`,
        actor,
        correlation: { loan_id: loan._id, loan_number: loan.loan_number }
      });
    }

    // Snapshot sirkulasi
    const cirItems = loan.borrowed_items.map((it) => ({
      inventory: it.inventory,
      product: it.product,
      product_code: it.product_code,
      brand: it.brand,
      quantity: it.quantity,
      project: it.project,
      condition: it.condition_at_borrow,
      warehouse_from: it.warehouse_from,
      shelf_from: it.shelf_from,
      warehouse_to: loan.warehouse_to,
      item_status: 'Dipinjam',
      return_date_circulation: null
    }));

    await LoanCirculation.create(
      [
        {
          loan_number: loan.loan_number,
          borrower: loan.borrower,
          phone: loan.phone,
          inventory_manager: loan.inventory_manager,
          warehouse_to: loan.warehouse_to,
          shelf_to: null,
          loan_date_circulation: loan.pickup_date,
          borrowed_items: cirItems
        }
      ],
      { session }
    );

    // tidak lock di sini; lock terjadi setelah ReturnLoan final
    loan.approval = 'Disetujui';
    loan.circulation_status = computeCirculationStatus('Disetujui'); // Aktif
    await loan.save({ session });

    await session.commitTransaction();
    res.status(200).json({ message: 'Loan disetujui', id: loan._id });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const rejectLoan = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin')
    throwError('Hanya admin yang bisa tolak pengajuan ini', 403);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findById(req.params.id).session(session);
    if (!loan) throwError('Pengajuan alat tidak ditemukan', 404);
    if (loan.approval !== 'Diproses')
      throwError('Hanya dokumen Diproses yang bisa Ditolak', 400);

    const reason = (req.body?.note ?? req.body?.reason ?? '').toString().trim();
    if (!reason) throwError('Alasan penolakan wajib diisi', 400);

    loan.approval = 'Ditolak';
    loan.circulation_status = computeCirculationStatus('Ditolak');
    loan.loan_locked = false;
    loan.note = reason;
    await loan.save({ session });

    await LoanCirculation.deleteOne({ loan_number: loan.loan_number }).session(
      session
    );

    await session.commitTransaction();
    res
      .status(200)
      .json({ message: 'Pengajuan ditolak', id: loan._id, note: loan.note });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const reopenLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findById(req.params.id).session(session);
    if (!loan) throwError('Pengajuan alat tidak ditemukan', 404);

    const hasAnyReturn = await ReturnLoan.exists({
      loan_number: loan.loan_number
    }).session(session);
    if (hasAnyReturn) {
      throwError(
        'Tidak bisa buka ulang data: terdapat data pengembalian terkait (Draft/Dikembalikan).',
        409
      );
    }

    if (loan.approval === 'Diproses') {
      throwError('Dokumen sudah Diproses', 400);
    }

    // Reopen dari "Ditolak"
    if (loan.approval === 'Ditolak') {
      if (req.user?.role !== 'admin') {
        const me = await Employee.findOne({ user: req.user.id })
          .select('_id')
          .session(session);
        if (!me) throwError('Karyawan tidak ditemukan', 404);
        if (String(loan.borrower) !== String(me._id)) {
          throwError(
            'Tidak berhak membuka ulang pinjaman milik orang lain',
            403
          );
        }
      }

      loan.approval = 'Diproses';
      loan.circulation_status = computeCirculationStatus('Diproses'); // Pending
      loan.loan_locked = false;
      loan.note = null;
      await loan.save({ session });

      await session.commitTransaction();
      return res.status(200).json({
        message: 'Pengajuan peminjaman alat dibuka ulang (Diproses)',
        id: loan._id
      });
    }

    // Reopen dari "Disetujui" → ADMIN only
    if (req.user?.role !== 'admin') {
      throwError('Hanya admin yang bisa buka ulang data dari Disetujui', 403);
    }

    const actor = await resolveActor(req, session);

    // Rollback stok (membalik LOAN_OUT)
    for (const it of loan.borrowed_items || []) {
      const inv = await Inventory.findById(it.inventory).session(session);
      if (!inv) continue;

      // Guard biar tidak negatif
      if (inv.on_loan - it.quantity < 0) {
        throwError(
          `Buka ulang data gagal: stok terkini akan menjadi negatif`,
          400
        );
      }

      inv.on_hand += it.quantity;
      inv.on_loan -= it.quantity;
      inv.last_in_at = new Date();
      await inv.save({ session });

      await applyAdjustment(session, {
        inventoryId: inv._id,
        bucket: 'ON_HAND',
        delta: +it.quantity,
        reason_code: 'REVERT_LOAN_OUT',
        reason_note: `Buka ulang data peminjaman, ${loan.loan_number}`,
        actor,
        correlation: { loan_id: loan._id, loan_number: loan.loan_number }
      });
      await applyAdjustment(session, {
        inventoryId: inv._id,
        bucket: 'ON_LOAN',
        delta: -it.quantity,
        reason_code: 'REVERT_LOAN_OUT',
        reason_note: `Buka ulang data peminjaman, ${loan.loan_number}`,
        actor,
        correlation: { loan_id: loan._id, loan_number: loan.loan_number }
      });
    }

    // Hapus snapshot sirkulasi karena dibatalkan
    await LoanCirculation.deleteOne({ loan_number: loan.loan_number }).session(
      session
    );

    // Kembalikan status dokumen
    loan.approval = 'Diproses';
    loan.circulation_status = computeCirculationStatus('Diproses'); // Pending
    loan.loan_locked = false;
    await loan.save({ session });

    await session.commitTransaction();
    res.status(200).json({
      message: 'Loan dibuka ulang dari Disetujui (Diproses)',
      id: loan._id
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const deleteLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  ensureObjectId(id);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findById(id).session(session);
    if (!loan) throwError('Pengajuan alat tidak ditemukan', 404);

    if (loan.approval !== 'Diproses') {
      throwError('Hanya boleh menghapus dokumen yang masih Diproses', 400);
    }

    await LoanCirculation.deleteOne({ loan_number: loan.loan_number }).session(
      session
    );
    await loan.deleteOne({ session });

    await session.commitTransaction();
    res.status(200).json({ message: 'Pengajuan alat berhasil dihapus' });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const getLoans = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { borrower, project, approval, nik, search, sort } = req.query;

  const filter = {};
  if (borrower) filter.borrower = borrower;
  if (nik) filter.nik = { $regex: nik, $options: 'i' };
  if (approval) filter.approval = approval;
  if (project) filter['borrowed_items.project'] = project;

  if (search) {
    filter.$or = [
      { loan_number: { $regex: search, $options: 'i' } },
      { nik: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const loans = await Loan.find(filter)
    .populate([
      { path: 'borrower', select: 'name' },
      { path: 'warehouse_to', select: 'warehouse_name warehouse_code' },
      {
        path: 'borrowed_items',
        populate: [
          { path: 'product', select: 'brand product_code' },
          { path: 'project', select: 'project_name' },
          { path: 'warehouse_from', select: 'warehouse_name warehouse_code' },
          { path: 'shelf_from', select: 'shelf_name shelf_code' }
        ]
      }
    ])
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  const totalItems = await Loan.countDocuments(filter);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    sort: sortOption,
    data: loans
  });
});

const getLoan = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id)
    .populate('borrower', 'name')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate({
      path: 'borrowed_items',
      populate: [
        { path: 'product', select: 'brand product_code' },
        { path: 'project', select: 'project_name' },
        { path: 'warehouse_from', select: 'warehouse_name warehouse_code' },
        { path: 'shelf_from', select: 'shelf_name shelf_code' }
      ]
    })
    .lean();

  if (!loan) throwError('Pengajuan alat tidak terdaftar!', 404);

  // Ambil sirkulasi & peta pengembalian final
  const circulation = await LoanCirculation.findOne({
    loan_number: loan.loan_number
  })
    .select('borrowed_items')
    .lean();

  // Index-kan item sirkulasi by inventory (ubah jika perlu kunci lain)
  const circByInv = new Map(
    (circulation?.borrowed_items || []).map((ci) => [String(ci.inventory), ci])
  );

  const retMap = await buildReturnedMap(loan.loan_number);

  let totalBorrowed = 0;
  let totalUsed = 0;

  // Tambahkan used/remaining ke setiap item pinjaman (berdasarkan sirkulasi)
  loan.borrowed_items = (loan.borrowed_items || []).map((it) => {
    const qty = Number(it.quantity) || 0;
    totalBorrowed += qty;

    const circ = circByInv.get(String(it.inventory));
    const usage = circ ? retMap.get(String(circ._id)) : null;
    const used = (Number(usage?.returned) || 0) + (Number(usage?.lost) || 0);
    totalUsed += used;

    const remaining = Math.max(qty - used, 0);

    return {
      ...it,
      circulation_item_id: circ?._id || null,
      item_status: circ?.item_status || null,
      used,
      remaining
    };
  });

  res.status(200).json({
    ...loan,
    progress: { approved: totalUsed, total: totalBorrowed },
    progress_label: `${totalUsed}/${totalBorrowed}`
  });
});

const getLoansByEmployee = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const me = await Employee.findOne({ user: req.user.id })
    .select('_id name')
    .lean();
  if (!me) throwError('Karyawan tidak ditemukan', 404);

  const { approval, project, search, sort } = req.query;
  const filter = { borrower: me._id };
  if (approval) filter.approval = approval;
  if (project) filter['borrowed_items.project'] = project;
  if (search) {
    filter.$or = [
      { loan_number: { $regex: search, $options: 'i' } },
      { nik: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = String(sort).split(':');
    if (field) sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const [totalItems, loans] = await Promise.all([
    Loan.countDocuments(filter),
    Loan.find(filter)
      .populate('borrower', 'name')
      .populate('warehouse_to', 'warehouse_name')
      .populate({
        path: 'borrowed_items',
        populate: [
          { path: 'product', select: 'brand product_code' },
          { path: 'project', select: 'project_name' },
          { path: 'warehouse_from', select: 'warehouse_name warehouse_code' },
          { path: 'shelf_from', select: 'shelf_name shelf_code' }
        ]
      })
      .skip(skip)
      .limit(limit)
      .sort(sortOption)
      .lean()
  ]);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    sort: sortOption,
    data: loans
  });
});

const getWarehousesByProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throwError('ID produk tidak valid', 400);
  }

  const inventories = await Inventory.find({
    product: productId,
    condition: 'Baik',
    on_hand: { $gt: 0 }
  })
    .populate('warehouse', 'warehouse_name warehouse_code')
    .select('on_hand warehouse')
    .lean();

  // group by warehouse
  const grouped = {};
  inventories.forEach((inv) => {
    const w = inv.warehouse;
    if (!w) return;
    const key = String(w._id);
    if (!grouped[key]) {
      grouped[key] = {
        warehouse_id: w._id,
        warehouse_name: w.warehouse_name,
        warehouse_code: w.warehouse_code,
        total_stock: 0
      };
    }
    grouped[key].total_stock += Number(inv.on_hand) || 0;
  });

  res.json({ success: true, data: Object.values(grouped) });
});

const getShelvesByProductAndWarehouse = asyncHandler(async (req, res) => {
  const { productId, warehouseId } = req.params;
  if (
    !mongoose.Types.ObjectId.isValid(productId) ||
    !mongoose.Types.ObjectId.isValid(warehouseId)
  ) {
    throwError('ID tidak valid', 400);
  }

  const inventories = await Inventory.find({
    product: productId,
    warehouse: warehouseId,
    condition: 'Baik',
    on_hand: { $gt: 0 }
  })
    .populate('shelf', 'shelf_name shelf_code')
    .select('on_hand shelf condition')
    .lean();

  res.json({
    success: true,
    data: inventories.map((inv) => ({
      inventory_id: inv._id,
      shelf_id: inv.shelf?._id || null,
      shelf_name: inv.shelf?.shelf_name || null,
      shelf_code: inv.shelf?.shelf_code || null,
      condition: inv.condition,
      stock: inv.on_hand
    }))
  });
});

const getAllProduct = asyncHandler(async (req, res) => {
  const search = (req.query.search || '').trim();
  const withStock = req.query.with_stock === 'true';

  if (!withStock) {
    const filter = search
      ? {
          $or: [
            { product_code: { $regex: search, $options: 'i' } },
            { brand: { $regex: search, $options: 'i' } },
            { product_name: { $regex: search, $options: 'i' } }
          ]
        }
      : {};
    const data = await Product.find(filter)
      .select('product_code brand product_name')
      .sort({ brand: 1, product_code: 1 })
      .lean();

    return res.json({ success: true, data });
  }

  // with_stock=true → hanya produk yang punya stok on_hand > 0 & condition 'Baik'
  const regex = search ? new RegExp(search, 'i') : null;
  const rows = await Inventory.aggregate([
    { $match: { condition: 'Baik', on_hand: { $gt: 0 } } },
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'p'
      }
    },
    { $unwind: '$p' },
    ...(regex
      ? [
          {
            $match: {
              $or: [
                { 'p.product_code': regex },
                { 'p.brand': regex },
                { 'p.product_name': regex }
              ]
            }
          }
        ]
      : []),
    {
      $group: {
        _id: '$p._id',
        product: { $first: '$p' },
        total_on_hand: { $sum: '$on_hand' }
      }
    },
    { $sort: { 'product.brand': 1, 'product.product_code': 1 } }
  ]);

  res.json({
    success: true,
    data: rows.map((r) => ({
      product_id: r._id,
      product_code: r.product.product_code,
      brand: r.product.brand,
      product_name: r.product.product_name,
      total_on_hand: r.total_on_hand
    }))
  });
});

const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user.id })
    .select('name nik phone address position')
    .lean();
  if (!employee) throwError('Data karyawan tidak ditemukan', 404);
  res.status(200).json(employee);
});

const getAllWarehouse = asyncHandler(async (_req, res) => {
  const warehouse = await Warehouse.find()
    .select('warehouse_name warehouse_code')
    .sort({ warehouse_name: 1 })
    .lean();
  res.json(warehouse);
});

const getAllProject = asyncHandler(async (_req, res) => {
  const project = await RAP.find()
    .select('project_name')
    .sort({ project_name: 1 })
    .lean();
  res.json(project);
});

const getAllEmployee = asyncHandler(async (_req, res) => {
  const employee = await Employee.find()
    .select('name nik phone address position')
    .lean();
  if (!employee) throwError('Karyawan tidak ada', 404);
  res.status(200).json(employee);
});

module.exports = {
  // Draft
  createLoan,
  updateLoan,
  deleteLoan,

  // Status
  approveLoan,
  rejectLoan,
  reopenLoan,

  // Read
  getLoans,
  getLoan,
  getLoansByEmployee,

  // FE helpers
  getWarehousesByProduct,
  getShelvesByProductAndWarehouse,
  getAllProduct,
  getEmployee,
  getAllWarehouse,
  getAllProject,
  getAllEmployee
};
