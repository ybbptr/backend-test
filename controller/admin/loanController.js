const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const throwError = require('../../utils/throwError');
const Loan = require('../../model/loanModel');
const Employee = require('../../model/employeeModel');
const Product = require('../../model/productModel');
const Warehouse = require('../../model/warehouseModel');
const loanCirculationModel = require('../../model/loanCirculationModel');

const addLoan = asyncHandler(async (req, res) => {
  const {
    loan_date,
    return_date,
    borrower,
    nik,
    address,
    phone,
    borrowed_items,
    approval
  } = req.body || {};

  if (
    !loan_date ||
    !return_date ||
    !borrower ||
    !nik ||
    !address ||
    !phone ||
    !Array.isArray(borrowed_items) ||
    borrowed_items.length === 0
  ) {
    throwError('Field wajib belum diisi lengkap', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const processedItems = [];

    for (const it of borrowed_items) {
      const { product, quantity, pickup_date, project } = it;

      if (!product || !quantity || !pickup_date) {
        throwError('Data barang yang dipinjam tidak lengkap', 400);
      }

      const item = await Product.findById(product).session(session);
      if (!item) throwError('Produk tidak ditemukan', 404);

      // ====== Approval = Disetujui ======
      if (approval === 'Disetujui') {
        if (item.quantity <= 0)
          throwError('Stok barang kosong, tidak dapat dipinjam', 400);
        if (item.quantity < quantity)
          throwError('Stok barang tidak mencukupi', 400);
        if (item.condition === 'Rusak')
          throwError('Barang rusak, tidak dapat dipinjam', 400);

        // Update stok
        item.quantity -= quantity;
        await item.save({ session });
      }

      processedItems.push({
        product: item._id,
        product_code: item.product_code,
        brand: item.brand,
        quantity,
        pickup_date,
        project: project || null,
        condition: item.condition
      });
    }

    const loan = await Loan.create(
      [
        {
          borrower,
          loan_date,
          return_date,
          nik,
          address,
          phone,
          borrowed_items: processedItems,
          approval
        }
      ],
      { session }
    );

    // // ====== Catat di Loan Circulation (opsional) ======
    // if (approval === 'Disetujui') {
    //   const circulationPayload = processedItems.map((it) => ({
    //     loan_id: loan[0]._id,
    //     product: it.product,
    //     product_name: it.product_code,
    //     loan_quantity: it.quantity,
    //     warehouse_from: it.warehouse, // kalau ada warehouse di Product
    //     warehouse_to: null // bisa diisi sesuai logika
    //   }));

    //   await LoanCirculation.create(circulationPayload, { session });
    // }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(loan[0]);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
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
      {
        path: 'borrowed_items.product',
        select: 'brand product_code quantity condition'
      },
      { path: 'borrowed_items.project', select: 'project_name' }
    ])
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  const totalItems = await Loan.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages,
    sort: sortOption,
    data: loans
  });
});

const getLoan = asyncHandler(async (req, res) => {
  const loan_item = await Loan.findById(req.params.id).populate([
    { path: 'borrower', select: 'name' },
    { path: 'product', select: 'brand product_code quantity condition' },
    { path: 'project', select: 'project_name' }
  ]);
  if (!loan_item) throwError('Pengajuan alat tidak terdaftar!', 400);

  res.status(200).json(loan_item);
});

const removeLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan_item = await Loan.findById(req.params.id).session(session);
    if (!loan_item) throwError('Pengajuan tidak terdaftar!', 400);

    if (loan_item.approval === 'Disetujui') {
      for (const it of loan_item.borrowed_items) {
        const product = await Product.findById(it.product).session(session);
        if (!product) throwError('Produk tidak ditemukan', 404);

        product.quantity += it.quantity;
        await product.save({ session });
      }
    }

    // await loanCirculationModel
    //   .deleteMany({ loan_id: loan_item._id })
    //   .session(session);

    await loan_item.deleteOne({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: 'Pengajuan dan sirkulasi terkait berhasil dihapus.'
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

const updateLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      loan_number,
      loan_date,
      return_date,
      employee,
      approval,
      warehouse,
      product,
      loan_quantity
    } = req.body || {};

    const loan_item = await Loan.findById(req.params.id).session(session);
    if (!loan_item) throwError('Pengajuan tidak terdaftar!', 404);

    const item = await Product.findById(product || loan_item.product).session(
      session
    );
    if (!item) throwError('Produk tidak ditemukan', 404);

    // ====== Kondisi update stok ======

    // 1. Dari belum disetujui → Disetujui
    if (loan_item.approval !== 'Disetujui' && approval === 'Disetujui') {
      if (item.quantity < loan_quantity) {
        throwError('Stok tidak mencukupi', 400);
      }
      if (item.condition === 'Rusak berat' || item.condition === 'Rusak berat')
        throwError('Barang rusak berat, tidak dapat dipinjam', 400);
      if (item.warehouse.toString() === warehouse.toString()) {
        throwError('Gudang asal dan tujuan tidak boleh sama', 400);
      }

      item.quantity -= loan_quantity;
      item.loan_quantity = loan_quantity;

      await item.save({ session });

      await loanCirculationModel.create(
        [
          {
            loan_id: loan_item._id,
            product: item._id,
            product_name: item.product_name,
            loan_quantity,
            warehouse_from: item.warehouse,
            warehouse_to: warehouse,
            imageUrl: item.imageUrl
          }
        ],
        { session }
      );
    }

    // 2. Dari Disetujui → Ditolak/Diproses (balikin stok)
    if (loan_item.approval === 'Disetujui' && approval !== 'Disetujui') {
      if (item.warehouse.toString() === warehouse.toString()) {
        throwError('Gudang asal dan tujuan tidak boleh sama', 400);
      }
      if (item.condition === 'Rusak berat' || item.condition === 'Rusak berat')
        throwError('Barang rusak berat, tidak dapat dipinjam', 400);

      item.quantity += loan_item.loan_quantity;
      item.loan_quantity = loan_quantity;

      await item.save({ session });

      await loanCirculationModel
        .deleteMany({ loan_id: loan_item._id })
        .session(session);
    }

    // 3. Sama-sama Disetujui, tapi jumlah berubah
    if (loan_item.approval === 'Disetujui' && approval === 'Disetujui') {
      if (item.warehouse.toString() === warehouse.toString()) {
        throwError('Gudang asal dan tujuan tidak boleh sama', 400);
      }
      if (item.condition === 'Rusak berat' || item.condition === 'Rusak berat')
        throwError('Barang rusak berat, tidak dapat dipinjam', 400);

      const diff = loan_quantity - loan_item.loan_quantity;
      if (diff > 0) {
        // Pinjam lebih banyak
        if (item.quantity < diff) {
          throwError('Stok tidak mencukupi', 400);
        }
        item.quantity -= diff;
      } else if (diff < 0) {
        // Balikin sebagian
        item.quantity += Math.abs(diff);
      }
      item.loan_quantity = loan_quantity;

      await item.save({ session });

      await loanCirculationModel.findOneAndUpdate(
        { loan_id: loan_item._id },
        {
          loan_quantity,
          imageUrl: item.imageUrl,
          product_name: item.product_name,
          warehouse_to: warehouse
        },
        { session }
      );
    }

    loan_item.loan_number = loan_number || loan_item.loan_number;
    loan_item.loan_date = loan_date || loan_item.loan_date;
    loan_item.return_date = return_date || loan_item.return_date;
    loan_item.employee = employee || loan_item.employee;
    loan_item.approval = approval || loan_item.approval;
    loan_item.warehouse = warehouse || loan_item.warehouse;
    loan_item.product = product || loan_item.product;
    loan_item.loan_quantity = loan_quantity || loan_item.loan_quantity;

    await loan_item.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json(loan_item);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

const getAllEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.find().select('name nik address phone');

  res.json(employee);
});

const getAllProduct = asyncHandler(async (req, res) => {
  const product = await Product.find().select('product_code brand condition');

  res.json(product);
});

module.exports = {
  addLoan,
  getLoans,
  getLoan,
  removeLoan,
  updateLoan,
  getAllEmployee,
  getAllProduct
};
