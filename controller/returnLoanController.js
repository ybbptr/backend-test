const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const path = require('path');
const throwError = require('../utils/throwError');
const Loan = require('../model/loanModel');
const Product = require('../model/productModel');
const Inventory = require('../model/inventoryModel');
const Employee = require('../model/employeeModel');
const Warehouse = require('../model/warehouseModel');
const Shelf = require('../model/shelfModel');
const loanCirculationModel = require('../model/loanCirculationModel');
const productCirculationModel = require('../model/productCirculationModel');
const ReturnLoan = require('../model/returnLoanModel');
const { uploadBuffer, deleteFile, getFileUrl } = require('../utils/wasabi');
const formatDate = require('../utils/formatDate');

function parseReturnedItems(raw) {
  if (!raw) return [];

  let parsed = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throwError('Format returned_items bukan JSON valid', 400);
    }
  }

  if (!Array.isArray(parsed) && typeof parsed === 'object') {
    parsed = Object.values(parsed);
  }

  if (!Array.isArray(parsed)) {
    throwError('returned_items harus berupa array', 400);
  }

  return parsed;
}

const createReturnLoan = asyncHandler(async (req, res) => {
  const {
    loan_number,
    borrower,
    position,
    report_date,
    return_date,
    inventory_manager
  } = req.body || {};
  const returned_items = parseReturnedItems(req.body.returned_items);

  if (!loan_number || returned_items.length === 0) {
    throwError('Nomor peminjaman dan daftar barang wajib diisi!', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loan_number })
      .populate('borrower', 'name') // supaya ada nama peminjam
      .session(session);
    if (!loan) throwError('Peminjaman tidak ditemukan!', 404);

    const circulation = await loanCirculationModel
      .findOne({ loan_number })
      .session(session);
    if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

    const [returnLoan] = await ReturnLoan.create(
      [
        {
          loan_number,
          borrower,
          position,
          report_date,
          return_date,
          inventory_manager,
          returned_items: []
        }
      ],
      { session }
    );

    for (let i = 0; i < returned_items.length; i++) {
      const ret = returned_items[i];

      const inv = await Inventory.findById(ret.inventory)
        .populate('product', 'product_code brand product_image')
        .session(session);
      if (!inv) throwError('Inventory tidak ditemukan', 404);

      const circItem = circulation.borrowed_items.id(ret._id);
      if (!circItem) throwError('Item tidak ditemukan di sirkulasi', 404);

      // ✅ Validasi jumlah
      const alreadyReturned = returnLoan.returned_items
        .filter((it) => it.inventory.toString() === ret.inventory.toString())
        .reduce((acc, it) => acc + it.quantity, 0);

      const availableToReturn = circItem.quantity - alreadyReturned;
      if (ret.quantity > availableToReturn) {
        throwError(
          `Jumlah pengembalian (${ret.quantity}) melebihi sisa (${availableToReturn})`,
          400
        );
      }

      // ✅ Barang hilang
      if (ret.condition_new === 'Hilang') {
        inv.on_loan -= ret.quantity;
        await inv.save({ session });

        circItem.item_status = 'Hilang';
        circItem.condition = ret.condition_new;
        circItem.return_date_circulation = return_date || new Date();
      } else {
        // ✅ Barang kembali fisik
        inv.on_hand += ret.quantity;
        inv.on_loan -= ret.quantity;
        inv.condition = ret.condition_new || inv.condition;
        inv.warehouse = ret.warehouse_return || inv.warehouse;
        inv.shelf = ret.shelf_return || inv.shelf;
        await inv.save({ session });

        // upload bukti kalau ada
        const file = req.files?.[`bukti_${i + 1}`]?.[0];
        if (file) {
          const ext = path.extname(file.originalname);
          const key = `bukti_pengembalian_barang/${loan_number}/bukti_${
            i + 1
          }_${formatDate()}${ext}`;
          await uploadBuffer(key, file.buffer);
          ret.proof_image = {
            key,
            contentType: file.mimetype,
            size: file.size,
            uploadedAt: new Date()
          };
        }

        circItem.item_status = 'Dikembalikan';
        circItem.condition = ret.condition_new;
        circItem.return_date_circulation = return_date || new Date();

        // ✅ Catat perpindahan barang ke ProductCirculation
        await productCirculationModel.create(
          [
            {
              inventory: inv._id,
              product: inv.product._id,
              product_code: inv.product.product_code,
              product_name: inv.product.brand,
              product_image: inv.product.product_image,
              warehouse_from: circItem.warehouse_from,
              shelf_from: circItem.shelf_from,
              warehouse_to: ret.warehouse_return,
              shelf_to: ret.shelf_return,
              moved_by: loan.borrower._id,
              moved_by_name: loan.borrower.name,
              return_loan_id: returnLoan._id
            }
          ],
          { session }
        );
      }

      // push item yang dikembalikan
      returnLoan.returned_items.push({
        ...ret,
        product: inv.product._id,
        product_code: inv.product.product_code,
        brand: inv.product.brand
      });
    }

    await returnLoan.save({ session });
    await circulation.save({ session });

    // ✅ cek kalau semua item sudah kembali
    const allReturned = circulation.borrowed_items.every((it) =>
      ['Dikembalikan', 'Hilang'].includes(it.item_status)
    );
    if (allReturned) {
      loan.circulation_status = 'Selesai';
      await loan.save({ session });
    }

    await session.commitTransaction();
    res.status(201).json(returnLoan);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= READ ================= */
const getAllReturnLoan = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  let filter = {};
  if (req.user.role === 'karyawan') {
    const employee = await Employee.findOne({ user: req.user.id }).select(
      'name'
    );
    if (!employee) throwError('Karyawan tidak ditemukan', 404);
    filter = { borrower: employee._id };
  }

  const totalItems = await ReturnLoan.countDocuments(filter);
  const data = await ReturnLoan.find(filter)
    .populate('borrower', 'name')
    .populate('returned_items.product', 'product_code brand')
    .populate('returned_items.warehouse_return', 'warehouse_name')
    .populate('returned_items.shelf_return', 'shelf_name')
    .populate('returned_items.project', 'project_name')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

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
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const returnLoan = await ReturnLoan.findById(id)
    .populate('borrower', 'name')
    .populate('returned_items.product', 'product_code brand')
    .populate('returned_items.warehouse_return', 'warehouse_name')
    .populate('returned_items.shelf_return', 'shelf_name')
    .populate('returned_items.project', 'project_name')
    .lean();

  if (!returnLoan) throwError('Data pengembalian tidak ditemukan', 404);

  returnLoan.returned_items = await Promise.all(
    returnLoan.returned_items.map(async (item) => {
      let proof_url = null;
      if (item.proof_image?.key) {
        proof_url = await getFileUrl(item.proof_image.key);
      }
      return { ...item, proof_url };
    })
  );

  res.status(200).json(returnLoan);
});

/* ================= UPDATE ================= */
const updateReturnLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const returned_items = parseReturnedItems(req.body.returned_items);
  if (returned_items.length === 0)
    throwError('Daftar barang wajib diisi!', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const returnLoan = await ReturnLoan.findById(id).session(session);
    if (!returnLoan) throwError('Data pengembalian tidak ditemukan', 404);

    const loan = await Loan.findOne({
      loan_number: returnLoan.loan_number
    }).session(session);
    if (loan?.circulation_status === 'Selesai') {
      throwError('Pengembalian sudah selesai, tidak dapat diedit lagi', 400);
    }

    const circulation = await loanCirculationModel
      .findOne({ loan_number: returnLoan.loan_number })
      .session(session);
    if (!circulation) throwError('Sirkulasi tidak ditemukan', 404);

    for (let i = 0; i < returned_items.length; i++) {
      const ret = returned_items[i];
      const oldItem = returnLoan.returned_items.id(ret._id);
      if (!oldItem) throwError('Barang tidak valid di return loan', 400);

      const inv = await Inventory.findById(oldItem.inventory).session(session);
      if (!inv) throwError('Inventory tidak ditemukan', 404);

      const circItem = circulation.borrowed_items.id(ret._id);
      if (!circItem) throwError('Item tidak ditemukan di sirkulasi', 404);

      oldItem.quantity = ret.quantity;
      if (ret.condition_new) oldItem.condition_new = ret.condition_new;
      if (ret.warehouse_return) oldItem.warehouse_return = ret.warehouse_return;
      if (ret.shelf_return) oldItem.shelf_return = ret.shelf_return;

      // update file jika ada
      const file = req.files?.[`bukti_${i + 1}`]?.[0];
      if (ret.condition_new === 'Hilang') {
        if (oldItem.proof_image?.key) await deleteFile(oldItem.proof_image.key);
        oldItem.proof_image = null;
        circItem.item_status = 'Hilang';
      } else if (file) {
        if (oldItem.proof_image?.key) await deleteFile(oldItem.proof_image.key);
        const ext = path.extname(file.originalname);
        const key = `bukti_pengembalian_barang/${
          returnLoan.loan_number
        }/bukti_${i + 1}_${formatDate()}${ext}`;
        await uploadBuffer(key, file.buffer);
        oldItem.proof_image = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
        circItem.item_status = 'Dikembalikan';
      }
    }

    await returnLoan.save({ session });
    await circulation.save({ session });
    await session.commitTransaction();

    res.status(200).json(returnLoan);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* ================= DELETE ================= */
const deleteReturnLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const returnLoan = await ReturnLoan.findById(id).session(session);
    if (!returnLoan) throwError('Data pengembalian tidak ditemukan', 404);

    const loan = await Loan.findOne({
      loan_number: returnLoan.loan_number
    }).session(session);
    const circulation = await loanCirculationModel
      .findOne({ loan_number: returnLoan.loan_number })
      .session(session);
    if (!loan || !circulation)
      throwError('Data peminjaman tidak ditemukan', 404);

    // rollback stok
    for (const item of returnLoan.returned_items) {
      const inv = await Inventory.findById(item.inventory).session(session);
      if (inv) {
        if (item.condition_new === 'Hilang') {
          inv.on_loan += item.quantity; // restore
        } else {
          inv.on_hand -= item.quantity;
          inv.on_loan += item.quantity;
        }
        await inv.save({ session });
      }

      const circItem = circulation.borrowed_items.id(item._id);
      if (circItem) {
        circItem.item_status = 'Dipinjam';
        circItem.return_date_circulation = null;
      }

      if (item.proof_image?.key) await deleteFile(item.proof_image.key);
    }

    await circulation.save({ session });
    await productCirculationModel
      .deleteMany({ return_loan_id: returnLoan._id })
      .session(session);
    await returnLoan.deleteOne({ session });

    loan.circulation_status = 'Aktif';
    await loan.save({ session });

    await session.commitTransaction();
    res
      .status(200)
      .json({ message: 'Pengembalian dihapus & stok di-rollback.' });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const getReturnForm = asyncHandler(async (req, res) => {
  const { loan_number } = req.params;

  const loan = await Loan.findOne({ loan_number })
    .populate('borrower', 'name position')
    .lean();

  if (!loan) throwError('Peminjaman tidak ditemukan!', 404);

  const circulation = await loanCirculationModel
    .findOne({ loan_number })
    .populate('borrowed_items.project', 'project_name')
    .select('borrowed_items')
    .lean();

  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);
  res.status(200).json({
    loan_number: loan.loan_number,
    borrower: loan.borrower,
    position: loan.position || loan.borrower?.position || null,
    inventory_manager: loan.inventory_manager,
    items: circulation.borrowed_items.map((it) => ({
      _id: it._id,
      inventory: it.inventory,
      product: it.product,
      product_code: it.product_code,
      brand: it.brand,
      quantity: it.quantity,
      item_status: it.item_status,
      project: it.project._id,
      project_name: it.project?.project_name
    }))
  });
});

const getAllEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.find().select('name');
  if (!employee) throwError('Karyawan tidak ada', 404);

  res.status(200).json(employee);
});

const getAllWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.find().select('warehouse_name');

  res.json(warehouse);
});

const getShelvesByWarehouse = asyncHandler(async (req, res) => {
  const { warehouse } = req.query;
  if (!warehouse) throwError('ID gudang tidak valid', 400);

  const shelves = await Shelf.find({ warehouse }).select('shelf_name');

  res.json(shelves);
});

const getMyLoanNumbers = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user.id }).select(
    '_id name'
  );
  if (!employee) throwError('Karyawan tidak ditemukan', 404);

  const loans = await Loan.find({
    borrower: employee._id,
    approval: 'Disetujui',
    circulation_status: 'Aktif'
  })
    .select('loan_number')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    borrower: employee.name,
    loan_numbers: loans.map((loan) => ({
      id: loan._id,
      loan_number: loan.loan_number
    }))
  });
});

module.exports = {
  createReturnLoan,
  deleteReturnLoan,
  getAllReturnLoan,
  getReturnLoan,
  getReturnForm,
  updateReturnLoan,
  getShelvesByWarehouse,
  getAllWarehouse,
  getAllEmployee,
  getMyLoanNumbers
};
