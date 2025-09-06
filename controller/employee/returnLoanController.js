const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const path = require('path');
const throwError = require('../../utils/throwError');
const Loan = require('../../model/loanModel');
const Product = require('../../model/productModel');
const Employee = require('../../model/employeeModel');
const loanCirculationModel = require('../../model/loanCirculationModel');
const ReturnLoan = require('../../model/returnLoanModel');
const { uploadBuffer } = require('../../utils/wasabi');
const formatDate = require('../../utils/formatDate');

const createReturnLoan = asyncHandler(async (req, res) => {
  const {
    loan_number,
    borrower,
    position,
    report_date,
    return_date,
    inventory_manager
  } = req.body || {};

  let returned_items = [];
  if (req.body.returned_items) {
    returned_items = JSON.parse(req.body.returned_items);
  }

  if (!loan_number || returned_items.length === 0) {
    throwError('Nomor peminjaman dan daftar barang wajib diisi!', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loan_number }).session(session);
    if (!loan) throwError('Peminjaman tidak ditemukan!', 404);
    if (loan.circulation_status !== 'Aktif') {
      throwError('Peminjaman tidak aktif atau sudah selesai!', 400);
    }

    const circulation = await loanCirculationModel
      .findOne({ loan_number })
      .session(session);
    if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

    // === Proses setiap barang yang dikembalikan ===
    for (let i = 0; i < returned_items.length; i++) {
      const ret = returned_items[i];

      // ✅ pastikan FE kirim juga _id circulation item
      if (!ret._id) throwError('ID item circulation wajib diisi', 400);

      const product = await Product.findById(ret.product).session(session);
      if (!product) throwError('Produk tidak ditemukan', 404);

      // update stok
      product.quantity += ret.quantity;
      product.loan_quantity -= ret.quantity;
      product.warehouse = ret.warehouse_return || product.warehouse;
      product.shelf = ret.shelf_return || product.shelf;
      product.condition = ret.condition_new || product.condition;
      await product.save({ session });

      // upload bukti
      const file = req.files?.[`bukti_${i + 1}`]?.[0];
      if (file) {
        const ext = path.extname(file.originalname);
        const key = `bukti_pengembalian_barang/${loan_number}/bukti_pengembalian_${formatDate()}${ext}`;

        await uploadBuffer(file.buffer, key, file.mimetype);

        ret.proof_image = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }

      // ✅ update circulation pakai _id item
      const circItem = circulation.borrowed_items.id(ret._id);
      if (circItem) {
        circItem.item_status = 'Dikembalikan';
        circItem.return_date_circulation = return_date || new Date();
      }
    }

    await circulation.save({ session });

    // simpan laporan pengembalian
    const returnLoan = await ReturnLoan.create(
      [
        {
          loan_number,
          borrower,
          position,
          report_date,
          return_date,
          inventory_manager,
          returned_items
        }
      ],
      { session }
    );

    // cek apakah semua barang sudah kembali
    const allReturned = circulation.borrowed_items.every(
      (it) => it.item_status === 'Dikembalikan'
    );
    if (allReturned) {
      loan.circulation_status = 'Selesai';
      await loan.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(returnLoan[0]);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

const getReturnLoans = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const employee = await Employee.findOne({ user: req.user.id }).select('name');
  if (!employee) throwError('Karyawan tidak ditemukan', 404);

  const filter = { borrower: employee._id };

  const totalItems = await ReturnLoan.countDocuments(filter);

  let data = await ReturnLoan.find(filter)
    .populate('inventory_manager', 'name')
    .populate('returned_items.product', 'product_code brand')
    .populate('returned_items.warehouse_return', 'warehouse_name')
    .populate('returned_items.shelf_return', 'shelf_name')
    .populate('returned_items.project', 'project_name')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  for (const rl of data) {
    rl.returned_items = await Promise.all(
      rl.returned_items.map(async (item) => {
        let proof_url = null;
        if (item.proof_image?.key) {
          proof_url = await getFileUrl(item.proof_image.key);
        }
        return { ...item, proof_url };
      })
    );
  }

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data
  });
});

/* ========================= GET ONE (khusus karyawan login) ========================= */
const getReturnLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  if (!req.user?.name) throwError('User login tidak valid', 401);

  const returnLoan = await ReturnLoan.findOne({ id: id })
    .populate('inventory_manager', 'name')
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
        proof_url = await getFileUrl(item.proof_image.key, 60 * 5);
      }
      return { ...item, proof_url };
    })
  );

  res.status(200).json(returnLoan);
});

const getReturnForm = asyncHandler(async (req, res) => {
  const { loan_number } = req.params;

  const loan = await Loan.findOne({ loan_number })
    .populate('borrower', 'name position')
    .populate('inventory_manager', 'name')
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
    borrower: loan.borrower?.name || loan.borrower,
    position: loan.position || loan.borrower?.position || null,
    inventory_manager: loan.inventory_manager?.name || loan.inventory_manager,
    items: circulation.borrowed_items.map((it) => ({
      _id: it._id,
      product: it.product,
      product_code: it.product_code,
      brand: it.brand,
      quantity: it.quantity,
      item_status: it.item_status,
      project: it.project?._id || null,
      project_name: it.project?.project_name || null
    }))
  });
});

module.exports = { createReturnLoan };
