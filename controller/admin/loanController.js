const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const throwError = require('../../utils/throwError');
const generateLoanPdf = require('../../utils/generateLoanPdf');
const Loan = require('../../model/loanModel');
const Employee = require('../../model/employeeModel');
const Product = require('../../model/productModel');
const Warehouse = require('../../model/warehouseModel');
const Shelf = require('../../model/shelfModel');
const loanCirculationModel = require('../../model/loanCirculationModel');

const addLoan = asyncHandler(async (req, res) => {
  const {
    borrower,
    nik,
    address,
    phone,
    warehouse,
    shelf,
    borrowed_items,
    approval
  } = req.body || {};

  if (
    !borrower ||
    !nik ||
    !address ||
    !phone ||
    !warehouse ||
    !shelf ||
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
          nik,
          address,
          phone,
          warehouse,
          shelf,
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
      { path: 'warehouse', select: 'warehouse_name' },
      { path: 'shelf', select: 'shelf_name' },
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
    { path: 'warehouse', select: 'warehouse_name' },
    { path: 'shelf', select: 'shelf_name' },
    {
      path: 'borrowed_items.product',
      select: 'brand product_code quantity condition'
    },
    { path: 'borrowed_items.project', select: 'project_name' }
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
      borrower,
      approval,
      nik,
      address,
      warehouse,
      shelf,
      phone,
      borrowed_items
    } = req.body || {};

    const loan_item = await Loan.findById(req.params.id).session(session);
    if (!loan_item) throwError('Pengajuan tidak terdaftar!', 404);

    // ====== Kondisi stok ======
    // 1. Dari belum Disetujui → Disetujui
    if (loan_item.approval !== 'Disetujui' && approval === 'Disetujui') {
      for (const it of borrowed_items) {
        const product = await Product.findById(it.product).session(session);
        if (!product) throwError('Produk tidak ditemukan', 404);

        if (product.quantity < it.quantity)
          throwError('Stok tidak mencukupi', 400);
        if (product.condition === 'Rusak')
          throwError('Barang rusak, tidak dapat dipinjam', 400);

        product.quantity -= it.quantity;
        await product.save({ session });
      }

      // buat sirkulasi baru
      // const circulationPayload = borrowed_items.map((it) => ({
      //   loan_id: loan_item._id,
      //   product: it.product,
      //   product_name: it.product_code,
      //   loan_quantity: it.quantity,
      //   warehouse_from: it.warehouse_from || null,
      //   warehouse_to: it.warehouse_to || null
      // }));
      // await loanCirculationModel.create(circulationPayload, { session });
    }

    if (loan_item.approval === 'Disetujui' && approval !== 'Disetujui') {
      for (const it of loan_item.borrowed_items) {
        const product = await Product.findById(it.product).session(session);
        if (!product) throwError('Produk tidak ditemukan', 404);

        product.quantity += it.quantity;
        await product.save({ session });
      }

      // await loanCirculationModel
      //   .deleteMany({ loan_id: loan_item._id })
      //   .session(session);
    }

    // 3. Sama-sama Disetujui, tapi jumlah berubah
    if (loan_item.approval === 'Disetujui' && approval === 'Disetujui') {
      for (let i = 0; i < borrowed_items.length; i++) {
        const newItem = borrowed_items[i];
        const oldItem = loan_item.borrowed_items[i];

        const product = await Product.findById(newItem.product).session(
          session
        );
        if (!product) throwError('Produk tidak ditemukan', 404);

        const diff = newItem.quantity - oldItem.quantity;
        if (diff > 0) {
          if (product.quantity < diff) throwError('Stok tidak mencukupi', 400);
          product.quantity -= diff;
        } else if (diff < 0) {
          product.quantity += Math.abs(diff);
        }

        await product.save({ session });

        // await loanCirculationModel.findOneAndUpdate(
        //   { loan_id: loan_item._id, product: newItem.product },
        //   {
        //     loan_quantity: newItem.quantity,
        //     product_name: newItem.product_code
        //   },
        //   { session }
        // );
      }
    }

    loan_item.borrower = borrower || loan_item.borrower;
    loan_item.nik = nik || loan_item.nik;
    loan_item.address = address || loan_item.address;
    loan_item.phone = phone || loan_item.phone;
    loan_item.warehouse = warehouse || loan_item.warehouse;
    loan_item.shelf = shelf || loan_item.shelf;
    loan_item.approval = approval || loan_item.approval;
    if (borrowed_items) loan_item.borrowed_items = borrowed_items;

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

const getAllWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.find().select('warehouse_name');

  res.json(warehouse);
});

const getShelves = asyncHandler(async (req, res) => {
  const { warehouse } = req.query;
  if (!warehouse) throwError('ID gudang tidak valid', 400);

  const shelves = await Shelf.find({ warehouse }).select('shelf_name');

  res.json(shelves);
});

const getLoanPdf = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id)
    .populate('borrower', 'name nik phone address')
    .populate(
      'borrowed_items.product',
      'product_name product_code brand product_image'
    )
    .populate('borrowed_items.project', 'project_name')
    .lean();

  if (!loan) throwError('Data peminjaman tidak ditemukan', 404);

  loan.borrowed_items = await Promise.all(
    loan.borrowed_items.map(async (it) => ({
      ...it,
      product_image_url: it.product?.product_image?.key
        ? await getFileUrl(it.product.product_image.key, 300) // expired 5 menit
        : null
    }))
  );

  const pdfBuffer = await generateLoanPdf(loan);

  if (req.query.download) {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="loan-${loan.loan_number}.pdf"`
    );
  } else {
    res.setHeader(
      'Content-Disposition',
      `inline; filename="loan-${loan.loan_number}.pdf"`
    );
  }

  res.send(pdfBuffer);
});

module.exports = {
  addLoan,
  getLoans,
  getLoan,
  removeLoan,
  updateLoan,
  getAllEmployee,
  getAllProduct,
  getAllWarehouse,
  getShelves,
  getLoanPdf
};
