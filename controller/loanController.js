const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const throwError = require('../utils/throwError');
// const generateLoanPdf = require('../../utils/generateLoanPdf');
const { getFileUrl } = require('../utils/wasabi');
const Loan = require('../model/loanModel');
const Employee = require('../model/employeeModel');
const Product = require('../model/productModel');
const Warehouse = require('../model/warehouseModel');
const Shelf = require('../model/shelfModel');
const loanCirculationModel = require('../model/loanCirculationModel');

const addLoan = asyncHandler(async (req, res) => {
  const {
    loan_date,
    pickup_date,
    borrower,
    nik,
    address,
    position,
    phone,
    inventory_manager,
    warehouse,
    shelf,
    borrowed_items,
    approval
  } = req.body || {};

  if (
    !loan_date ||
    !pickup_date ||
    !borrower ||
    !nik ||
    !address ||
    !position ||
    !inventory_manager ||
    !phone ||
    !warehouse ||
    !shelf ||
    !Array.isArray(borrowed_items) ||
    borrowed_items.length === 0
  ) {
    throwError('Field wajib belum diisi lengkap', 400);
  }

  // ✅ Normalisasi approval: hanya admin yang bisa setujuin langsung
  const normalizedApproval = req.user?.role === 'admin' ? approval : 'Diproses';

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const processedItems = [];
    const stockMap = new Map();

    for (const it of borrowed_items) {
      const { product, quantity, project } = it;

      if (!product || !quantity || !project) {
        throwError('Data barang yang dipinjam tidak lengkap', 400);
      }

      const item = await Product.findById(product).session(session);
      if (!item) throwError('Produk tidak ditemukan', 404);

      // ✅ tidak boleh pilih gudang sama
      if (warehouse.toString() === item.warehouse.toString()) {
        throwError(
          'Gudang tujuan tidak boleh sama dengan gudang asal barang',
          400
        );
      }

      // ✅ cek stok dengan stockMap
      const availableStock = stockMap.has(item._id.toString())
        ? stockMap.get(item._id.toString())
        : item.quantity;

      if (normalizedApproval === 'Disetujui') {
        if (availableStock < quantity)
          throwError(`Stok tidak mencukupi untuk ${item.brand}`, 400);
        if (
          item.condition === 'Rusak' ||
          item.condition === 'Maintenance' ||
          item.condition === 'Hilang'
        )
          throwError(
            'Barang rusak/maintenance/hilang, tidak dapat dipinjam',
            400
          );

        stockMap.set(item._id.toString(), availableStock - quantity);

        item.quantity = stockMap.get(item._id.toString());
        item.loan_quantity = (item.loan_quantity || 0) + quantity;
        await item.save({ session });
      }

      processedItems.push({
        product: item._id,
        product_code: item.product_code,
        brand: item.brand,
        quantity,
        project,
        condition: item.condition
      });
    }

    const loan = await Loan.create(
      [
        {
          borrower,
          loan_date,
          pickup_date,
          nik,
          address,
          position,
          inventory_manager,
          phone,
          warehouse,
          shelf,
          borrowed_items: processedItems,
          approval: normalizedApproval,
          circulation_status:
            normalizedApproval === 'Disetujui' ? 'Aktif' : 'Pending'
        }
      ],
      { session }
    );

    // ✅ buat circulation jika disetujui oleh admin
    if (normalizedApproval === 'Disetujui') {
      const borrowedItemsCirculation = [];

      for (const it of processedItems) {
        const product = await Product.findById(it.product).lean();
        borrowedItemsCirculation.push({
          product: product._id,
          product_code: product.product_code,
          brand: product.brand,
          quantity: it.quantity,
          project: it.project,
          condition: product.condition,
          product_image: product.product_image || null,
          warehouse_from: product?.warehouse || null,
          shelf_from: product?.shelf || null,
          item_status: 'Dipinjam' // ✅ default dipinjam
        });
      }

      await loanCirculationModel.create(
        [
          {
            loan_number: loan[0].loan_number,
            borrower: loan[0].borrower,
            phone: loan[0].phone,
            inventory_manager: loan[0].inventory_manager,
            warehouse_to: loan[0].warehouse,
            shelf_to: loan[0].shelf,
            loan_date_circulation: loan[0].pickup_date, // ✅ ambil dari pickup_date
            borrowed_items: borrowedItemsCirculation
          }
        ],
        { session }
      );
    }

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
      throwError(
        'Pengajuan yang sudah disetujui tidak dapat dihapus. Silakan lakukan pengembalian alat.',
        400
      );
    }

    await loanCirculationModel
      .deleteOne({ loan_number: loan_item.loan_number })
      .session(session);

    await loan_item.deleteOne({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: 'Pengajuan berhasil dihapus.'
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
      loan_date,
      pickup_date,
      borrower,
      approval,
      nik,
      address,
      position,
      inventory_manager,
      warehouse,
      shelf,
      phone,
      borrowed_items
    } = req.body || {};

    const loan_item = await Loan.findById(req.params.id).session(session);
    if (!loan_item) throwError('Pengajuan tidak terdaftar!', 404);

    // ✅ restriksi role karyawan (tidak boleh ubah status)
    if (req.user?.role === 'karyawan' && approval !== undefined) {
      throwError('Karyawan tidak diperbolehkan mengubah status', 403);
    }

    // build ulang items jika ada perubahan
    let processedItems = loan_item.borrowed_items;
    if (borrowed_items) {
      processedItems = [];
      const stockMap = new Map();

      for (const it of borrowed_items) {
        const product = await Product.findById(it.product).session(session);
        if (!product) throwError('Produk tidak ditemukan', 404);

        // ✅ gudang asal ≠ tujuan
        if (
          (warehouse || loan_item.warehouse).toString() ===
          product.warehouse.toString()
        ) {
          throwError(
            'Gudang tujuan tidak boleh sama dengan gudang asal barang',
            400
          );
        }

        const availableStock = stockMap.has(product._id.toString())
          ? stockMap.get(product._id.toString())
          : product.quantity;

        stockMap.set(product._id.toString(), availableStock); // simpan sementara

        processedItems.push({
          product: product._id,
          product_code: product.product_code,
          brand: product.brand,
          quantity: it.quantity,
          project: it.project || null,
          condition: product.condition
        });
      }
    }

    /* ===== Kondisi Approval ===== */

    // 1. Belum → Disetujui
    if (loan_item.approval !== 'Disetujui' && approval === 'Disetujui') {
      loan_item.circulation_status = 'Aktif';
      const stockMap = new Map();
      for (const it of processedItems) {
        const product = await Product.findById(it.product).session(session);
        if (!product) throwError('Produk tidak ditemukan', 404);

        const availableStock = stockMap.has(product._id.toString())
          ? stockMap.get(product._id.toString())
          : product.quantity;

        if (availableStock < it.quantity)
          throwError('Stok tidak mencukupi', 400);
        if (
          product.condition === 'Rusak' ||
          product.condition === 'Maintenance' ||
          item.condition === 'Hilang'
        )
          throwError(
            'Barang rusak/maintenance/hilang, tidak dapat dipinjam',
            400
          );

        stockMap.set(product._id.toString(), availableStock - it.quantity);

        product.quantity = stockMap.get(product._id.toString());
        product.loan_quantity = (product.loan_quantity || 0) + it.quantity;
        await product.save({ session });
      }

      // buat circulation baru
      const borrowedItemsCirculation = [];
      for (const it of processedItems) {
        const product = await Product.findById(it.product).lean();
        borrowedItemsCirculation.push({
          product: product._id,
          product_code: product.product_code,
          brand: product.brand,
          quantity: it.quantity,
          project: it.project,
          condition: product.condition,
          product_image: product.product_image || null,
          warehouse_from: product?.warehouse || null,
          shelf_from: product?.shelf || null,
          item_status: 'Dipinjam'
        });
      }

      await loanCirculationModel.create(
        [
          {
            loan_number: loan_item.loan_number,
            borrower: loan_item.borrower,
            phone: loan_item.phone,
            inventory_manager: loan_item.inventory_manager,
            warehouse_to: warehouse || loan_item.warehouse,
            shelf_to: shelf || loan_item.shelf,
            borrowed_items: borrowedItemsCirculation
          }
        ],
        { session }
      );
    }

    // 2. Disetujui → Ditolak / Diproses
    if (loan_item.approval === 'Disetujui' && approval !== 'Disetujui') {
      loan_item.circulation_status = 'Pending';
      for (const it of loan_item.borrowed_items) {
        const product = await Product.findById(it.product).session(session);
        if (!product) throwError('Produk tidak ditemukan', 404);

        product.quantity += it.quantity;
        product.loan_quantity -= it.quantity;
        await product.save({ session });
      }

      await loanCirculationModel
        .deleteOne({ loan_number: loan_item.loan_number })
        .session(session);
    }

    // 3. Sama-sama Disetujui → cek selisih jumlah
    if (loan_item.approval === 'Disetujui' && approval === 'Disetujui') {
      loan_item.circulation_status = 'Aktif';
      for (const newItem of processedItems) {
        const oldItem = loan_item.borrowed_items.find(
          (it) => it.product.toString() === newItem.product.toString()
        );
        if (!oldItem) throwError('Barang lama tidak ditemukan di loan', 400);

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

        product.loan_quantity = (product.loan_quantity || 0) + diff;
        await product.save({ session });
      }

      // update circulation
      const borrowedItemsCirculation = [];
      for (const it of processedItems) {
        const product = await Product.findById(it.product).lean();
        borrowedItemsCirculation.push({
          product: product._id,
          product_code: product.product_code,
          brand: product.brand,
          quantity: it.quantity,
          project: it.project,
          condition: product.condition,
          product_image: product.product_image || null,
          warehouse_from: product?.warehouse || null,
          shelf_from: product?.shelf || null,
          item_status: 'Dipinjam'
        });
      }

      await loanCirculationModel.findOneAndUpdate(
        { loan_number: loan_item.loan_number },
        {
          borrower: borrower || loan_item.borrower,
          phone: phone || loan_item.phone,
          inventory_manager: inventory_manager || loan_item.inventory_manager,
          warehouse_to: warehouse || loan_item.warehouse,
          shelf_to: shelf || loan_item.shelf,
          loan_date_circulation: loan_item[0].pickup_date,
          borrowed_items: borrowedItemsCirculation
        },
        { session }
      );
    }

    /* ===== Update field utama ===== */
    if (loan_date !== undefined) loan_item.loan_date = loan_date;
    if (pickup_date !== undefined) loan_item.pickup_date = pickup_date;
    if (borrower !== undefined) loan_item.borrower = borrower;
    if (nik !== undefined) loan_item.nik = nik;
    if (address !== undefined) loan_item.address = address;
    if (position !== undefined) loan_item.position = position;
    if (inventory_manager !== undefined)
      loan_item.inventory_manager = inventory_manager;
    if (phone !== undefined) loan_item.phone = phone;
    if (warehouse !== undefined) loan_item.warehouse = warehouse;
    if (shelf !== undefined) loan_item.shelf = shelf;
    if (approval !== undefined) loan_item.approval = approval;
    if (borrowed_items) loan_item.borrowed_items = processedItems;

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
  const employee = await Employee.find().select(
    'name nik address phone position'
  );

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

const getLoansByEmployee = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const employee = await Employee.findOne({ user: req.user.id }).select('name');
  if (!employee) throwError('Karyawan tidak ditemukan', 404);

  const { approval, project, search, sort } = req.query;
  const filter = { borrower: employee._id };

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

  const [totalItems, loans] = await Promise.all([
    Loan.countDocuments(filter),
    Loan.find(filter)
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

const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user.id }).select(
    'name nik phone address position'
  );

  if (!employee) throwError('Data karyawan tidak ditemukan', 404);

  res.status(200).json(employee);
});

const getLoanPdf = asyncHandler(async (req, res) => {
  // const loan = await Loan.findById(req.params.id)
  //   .populate('borrower', 'name nik phone address position')
  //   .populate(
  //     'borrowed_items.product',
  //     'product_name product_code brand product_image'
  //   )
  //   .populate('borrowed_items.project', 'project_name')
  //   .lean();
  // if (!loan) throwError('Data peminjaman tidak ditemukan', 404);
  // loan.borrowed_items = await Promise.all(
  //   loan.borrowed_items.map(async (it) => ({
  //     ...it,
  //     product_image_url: it.product?.product_image?.key
  //       ? await getFileUrl(it.product.product_image.key, 300) // expired 5 menit
  //       : null
  //   }))
  // );
  // // const pdfBuffer = await generateLoanPdf(loan);
  // if (req.query.download) {
  //   res.setHeader(
  //     'Content-Disposition',
  //     `attachment; filename="loan-${loan.loan_number}.pdf"`
  //   );
  // } else {
  //   res.setHeader(
  //     'Content-Disposition',
  //     `inline; filename="loan-${loan.loan_number}.pdf"`
  //   );
  // }
  // res.send(pdfBuffer);
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
  getLoanPdf,
  getEmployee,
  getLoansByEmployee
};
