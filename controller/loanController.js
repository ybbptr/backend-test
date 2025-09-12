const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const throwError = require('../utils/throwError');
// const generateLoanPdf = require('../../utils/generateLoanPdf');
const { getFileUrl } = require('../utils/wasabi');
const Loan = require('../model/loanModel');
const Employee = require('../model/employeeModel');
const Product = require('../model/productModel');
const Inventory = require('../model/inventoryModel');
const RAP = require('../model/rapModel');
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
    !Array.isArray(borrowed_items) ||
    borrowed_items.length === 0
  ) {
    throwError('Field wajib belum diisi lengkap', 400);
  }

  const normalizedApproval = req.user?.role === 'admin' ? approval : 'Diproses';

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const processedItems = [];

    for (const it of borrowed_items) {
      const { inventory: inventoryId, quantity, project } = it;

      if (!inventoryId || !quantity || !project) {
        throwError('Data barang yang dipinjam tidak lengkap', 400);
      }

      const inv = await Inventory.findById(inventoryId)
        .populate('product', 'product_code brand')
        .populate('warehouse', 'warehouse_name')
        .populate('shelf', 'shelf_name')
        .session(session);

      if (!inv) throwError('Inventory tidak ditemukan', 404);
      if (normalizedApproval === 'Disetujui') {
        if (inv.on_hand < quantity) {
          throwError(
            `Stok tidak cukup untuk ${inv.product.brand} di gudang ${inv.warehouse.warehouse_name}`,
            400
          );
        }
        if (inv.condition !== 'Baik') {
          throwError(
            `Barang di kondisi ${inv.condition}, tidak bisa dipinjam`,
            400
          );
        }

        // update stok
        inv.on_hand -= quantity;
        inv.on_loan += quantity;
        inv.last_out_at = new Date();
        await inv.save({ session });
      }

      processedItems.push({
        inventory: inv._id,
        product: inv.product._id,
        product_code: inv.product.product_code,
        brand: inv.product.brand,
        quantity,
        project,
        condition_at_borrow: inv.condition,
        warehouse_from: inv.warehouse._id,
        shelf_from: inv.shelf._id
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
          borrowed_items: processedItems,
          approval: normalizedApproval,
          circulation_status:
            normalizedApproval === 'Disetujui' ? 'Aktif' : 'Pending'
        }
      ],
      { session }
    );

    // Buat circulation jika disetujui
    if (normalizedApproval === 'Disetujui') {
      const borrowedItemsCirculation = processedItems.map((it) => ({
        inventory: it.inventory,
        product: it.product,
        product_code: it.product_code,
        brand: it.brand,
        quantity: it.quantity,
        project: it.project,
        condition: it.condition_at_borrow,
        warehouse_from: it.warehouse_from,
        shelf_from: it.shelf_from,
        item_status: 'Dipinjam'
      }));

      await loanCirculationModel.create(
        [
          {
            loan_number: loan[0].loan_number,
            borrower: loan[0].borrower,
            phone: loan[0].phone,
            inventory_manager: loan[0].inventory_manager,
            loan_date_circulation: loan[0].pickup_date,
            borrowed_items: borrowedItemsCirculation
          }
        ],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(loan[0]);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
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
    .populate([{ path: 'borrower', select: 'name' }])
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
  const loan_item = await Loan.findById(req.params.id).populate([
    { path: 'borrower', select: 'name' },
    { path: 'borrowed_items.product', select: 'brand product_code' },
    { path: 'borrowed_items.project', select: 'project_name' },
    { path: 'borrowed_items.inventory', populate: ['warehouse', 'shelf'] }
  ]);

  if (!loan_item) throwError('Pengajuan alat tidak terdaftar!', 404);

  res.status(200).json(loan_item);
});

const removeLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan_item = await Loan.findById(req.params.id).session(session);
    if (!loan_item) throwError('Pengajuan tidak terdaftar!', 404);

    if (loan_item.approval === 'Disetujui') {
      throwError(
        'Pengajuan yang sudah disetujui tidak dapat dihapus. Lakukan pengembalian alat.',
        400
      );
    }

    await loanCirculationModel
      .deleteOne({ loan_number: loan_item.loan_number })
      .session(session);

    await loan_item.deleteOne({ session });

    await session.commitTransaction();
    res.status(200).json({ message: 'Pengajuan berhasil dihapus.' });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const updateLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { approval, borrowed_items, ...otherFields } = req.body;

    const loan_item = await Loan.findById(req.params.id)
      .populate('borrowed_items.inventory')
      .session(session);
    if (!loan_item) throwError('Pengajuan tidak terdaftar!', 404);

    // Restriksi role
    if (req.user?.role === 'karyawan' && approval !== undefined) {
      throwError('Karyawan tidak diperbolehkan mengubah status', 403);
    }

    let processedItems = loan_item.borrowed_items;

    /* ===== Rebuild borrowed_items kalau dikirim dari FE ===== */
    if (borrowed_items) {
      processedItems = [];

      for (const it of borrowed_items) {
        const inv = await Inventory.findById(it.inventory)
          .populate('product', 'product_code brand')
          .populate('warehouse')
          .populate('shelf')
          .session(session);

        if (!inv) throwError('Inventory tidak ditemukan', 404);

        processedItems.push({
          inventory: inv._id,
          product: inv.product._id,
          product_code: inv.product.product_code,
          brand: inv.product.brand,
          quantity: it.quantity,
          project: it.project,
          condition_at_borrow: inv.condition,
          warehouse_from: inv.warehouse._id,
          shelf_from: inv.shelf._id
        });
      }
    }

    /* ===== Kondisi Approval ===== */

    // 1. Belum Disetujui → Disetujui
    if (loan_item.approval !== 'Disetujui' && approval === 'Disetujui') {
      loan_item.circulation_status = 'Aktif';

      for (const it of processedItems) {
        const inv = await Inventory.findById(it.inventory).session(session);
        if (!inv) throwError('Inventory tidak ditemukan', 404);

        if (inv.on_hand < it.quantity)
          throwError(`Stok tidak cukup di ${inv._id}`, 400);

        if (inv.condition !== 'Baik')
          throwError(
            `Barang dengan kondisi ${inv.condition} tidak dapat dipinjam`,
            400
          );

        inv.on_hand -= it.quantity;
        inv.on_loan += it.quantity;
        await inv.save({ session });
      }

      // Buat circulation
      await loanCirculationModel.create(
        [
          {
            loan_number: loan_item.loan_number,
            borrower: loan_item.borrower,
            phone: loan_item.phone,
            inventory_manager: loan_item.inventory_manager,
            loan_date_circulation: loan_item.pickup_date,
            borrowed_items: processedItems.map((it) => ({
              inventory: it.inventory,
              product: it.product,
              product_code: it.product_code,
              brand: it.brand,
              quantity: it.quantity,
              project: it.project,
              condition: it.condition_at_borrow,
              warehouse_from: it.warehouse_from,
              shelf_from: it.shelf_from,
              item_status: 'Dipinjam'
            }))
          }
        ],
        { session }
      );
    }

    // 2. Disetujui → Ditolak/Diproses
    if (loan_item.approval === 'Disetujui' && approval !== 'Disetujui') {
      loan_item.circulation_status = 'Pending';

      for (const it of loan_item.borrowed_items) {
        const inv = await Inventory.findById(it.inventory).session(session);
        if (!inv) continue;

        inv.on_hand += it.quantity;
        inv.on_loan -= it.quantity;
        await inv.save({ session });
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
          (it) => it.inventory.toString() === newItem.inventory.toString()
        );
        if (!oldItem) continue;

        const diff = newItem.quantity - oldItem.quantity;
        const inv = await Inventory.findById(newItem.inventory).session(
          session
        );
        if (!inv) continue;

        if (diff > 0) {
          if (inv.on_hand < diff) throwError('Stok tidak mencukupi', 400);
          inv.on_hand -= diff;
          inv.on_loan += diff;
        } else if (diff < 0) {
          inv.on_hand += Math.abs(diff);
          inv.on_loan -= Math.abs(diff);
        }

        await inv.save({ session });
      }

      // Update circulation
      await loanCirculationModel.findOneAndUpdate(
        { loan_number: loan_item.loan_number },
        {
          borrowed_items: processedItems.map((it) => ({
            inventory: it.inventory,
            product: it.product,
            product_code: it.product_code,
            brand: it.brand,
            quantity: it.quantity,
            project: it.project,
            condition: it.condition_at_borrow,
            warehouse_from: it.warehouse_from,
            shelf_from: it.shelf_from,
            item_status: 'Dipinjam'
          }))
        },
        { session }
      );
    }

    /* ===== Update field utama ===== */
    Object.assign(loan_item, otherFields);
    if (approval !== undefined) loan_item.approval = approval;
    if (borrowed_items) loan_item.borrowed_items = processedItems;

    await loan_item.save({ session });

    await session.commitTransaction();
    res.status(200).json(loan_item);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const getAllEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.find().select(
    'name nik address phone position'
  );

  res.json(employee);
});

const getAllProduct = asyncHandler(async (req, res) => {
  const data = await Product.find().select('brand product_code');
  res.json({ success: true, data });
});

const getAllWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.find().select('warehouse_name');

  res.json(warehouse);
});

const getAllProject = asyncHandler(async (req, res) => {
  const project = await RAP.find().select('project_name');

  res.json(project);
});

const getShelves = asyncHandler(async (req, res) => {
  const { warehouse } = req.query;
  if (!warehouse) throwError('ID gudang tidak valid', 400);

  const shelves = await Shelf.find({ warehouse }).select('shelf_name');

  res.json(shelves);
});

// const getAvailableInventoriesByProduct = asyncHandler(async (req, res) => {
//   const { id } = req.params;
//   if (!mongoose.Types.ObjectId.isValid(id)) {
//     throwError('ID produk tidak valid', 400);
//   }

//   const inventories = await Inventory.find({
//     product: id,
//     on_hand: { $gt: 0 }
//   })
//     .populate('warehouse', 'warehouse_name')
//     .populate('shelf', 'shelf_name')
//     .lean();

//   res.json({
//     success: true,
//     data: inventories.map((inv) => ({
//       inventory_id: inv._id,
//       warehouse: inv.warehouse.warehouse_name,
//       shelf: inv.shelf.shelf_name,
//       condition: inv.condition,
//       stock: inv.on_hand
//     }))
//   });
// });

const getWarehousesByProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throwError('ID produk tidak valid', 400);
  }

  const inventories = await Inventory.find({
    product: productId,
    on_hand: { $gt: 0 }
  })
    .populate('warehouse', 'warehouse_name warehouse_code')
    .lean();

  // group by warehouse
  const grouped = {};
  inventories.forEach((inv) => {
    const wId = inv.warehouse._id.toString();
    if (!grouped[wId]) {
      grouped[wId] = {
        warehouse_id: inv.warehouse._id,
        warehouse_name: inv.warehouse.warehouse_name,
        warehouse_code: inv.warehouse.warehouse_code,
        total_stock: 0
      };
    }
    grouped[wId].total_stock += inv.on_hand;
  });

  res.json({
    success: true,
    data: Object.values(grouped)
  });
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
    on_hand: { $gt: 0 }
  })
    .populate('shelf', 'shelf_name shelf_code')
    .lean();

  res.json({
    success: true,
    data: inventories.map((inv) => ({
      shelf_id: inv.shelf._id,
      shelf_name: inv.shelf.shelf_name,
      shelf_code: inv.shelf.shelf_code,
      condition: inv.condition,
      stock: inv.on_hand
    }))
  });
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
  getLoansByEmployee,
  getAllProject,
  getWarehousesByProduct,
  getShelvesByProductAndWarehouse
};
