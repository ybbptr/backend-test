const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const ProductCirculation = require('../../model/productCirculationModel');

const getProductCirculations = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const {
    product_code,
    warehouse_from,
    warehouse_to,
    moved_by_name,
    movement_type,
    search,
    sort
  } = req.query;

  const filter = {};
  if (product_code)
    filter.product_code = { $regex: product_code, $options: 'i' };
  if (warehouse_from) filter.warehouse_from = warehouse_from;
  if (warehouse_to) filter.warehouse_to = warehouse_to;
  if (moved_by_name)
    filter.moved_by_name = { $regex: moved_by_name, $options: 'i' };
  if (movement_type) filter.movement_type = movement_type;

  if (search) {
    filter.$or = [
      { product_code: { $regex: search, $options: 'i' } },
      { product_name: { $regex: search, $options: 'i' } },
      { moved_by_name: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = String(sort).split(':');
    if (field) sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const [totalItems, rows] = await Promise.all([
    ProductCirculation.countDocuments(filter),
    ProductCirculation.find(filter)
      .populate('warehouse_from', 'warehouse_name warehouse_code')
      .populate('warehouse_to', 'warehouse_name warehouse_code')
      .populate('shelf_from', 'shelf_name shelf_code')
      .populate('shelf_to', 'shelf_name shelf_code')
      .populate('product', 'product_name product_code')
      .populate('moved_by', 'name')
      .skip(skip)
      .limit(limit)
      .sort(sortOption)
      .lean()
  ]);

  const labelMovement = (code) => {
    switch (code) {
      case 'LOAN_OUT':
        return 'Peminjaman (barang keluar)';
      case 'RETURN_IN':
        return 'Pengembalian (barang masuk)';
      case 'TRANSFER':
        return 'Transfer antar gudang';
      case 'CONDITION_CHANGE':
        return 'Perubahan kondisi';
      case 'REOPEN_LOAN':
        return 'Buka ulang data peminjaman';
      default:
        return code || '-';
    }
  };

  const data = rows.map((r) => ({
    id: String(r._id), // <— penting buat get detail
    date: r.createdAt,
    movement: labelMovement(r.movement_type),
    product: {
      code: r.product?.product_code || r.product_code || null,
      name: r.product?.product_name || r.product_name || null
    },
    quantity: r.quantity,
    from: {
      warehouse: r.warehouse_from?.warehouse_name || null,
      warehouse_code: r.warehouse_from?.warehouse_code || null,
      shelf: r.shelf_from?.shelf_name || null,
      shelf_code: r.shelf_from?.shelf_code || null
    },
    to: {
      warehouse: r.warehouse_to?.warehouse_name || null,
      warehouse_code: r.warehouse_to?.warehouse_code || null,
      shelf: r.shelf_to?.shelf_name || null,
      shelf_code: r.shelf_to?.shelf_code || null
    },
    condition: {
      from: r.from_condition || r.condition || null,
      to: r.to_condition || null
    },
    document_number: r.loan_number || null,
    actor_name: r.moved_by_name || null,
    note: r.reason_note || null
  }));

  res.status(200).json({
    success: true,
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    sort: sortOption,
    data
  });
});

// GET /product-circulations/:id
const getProductCirculation = asyncHandler(async (req, res) => {
  const row = await ProductCirculation.findById(req.params.id)
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_from', 'shelf_name shelf_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('product', 'product_name product_code')
    .populate('moved_by', 'name')
    .lean();

  if (!row) throwError('Sirkulasi tidak ditemukan', 404);

  const labelMovement = (code) => {
    switch (code) {
      case 'LOAN_OUT':
        return 'Peminjaman (barang keluar)';
      case 'RETURN_IN':
        return 'Pengembalian (barang masuk)';
      case 'TRANSFER':
        return 'Transfer antar gudang';
      case 'CONDITION_CHANGE':
        return 'Perubahan kondisi';
      case 'REOPEN_LOAN':
        return 'Buka ulang data peminjaman';
      default:
        return code || '-';
    }
  };

  const data = {
    _id: row._id,
    date: row.createdAt,
    movement_code: row.movement_type,
    movement: labelMovement(row.movement_type),
    product: {
      code: row.product?.product_code || row.product_code || null,
      name: row.product?.product_name || row.product_name || null
    },
    qty: row.quantity,
    from: {
      warehouse: row.warehouse_from?.warehouse_name || null,
      warehouse_code: row.warehouse_from?.warehouse_code || null,
      shelf: row.shelf_from?.shelf_name || null,
      shelf_code: row.shelf_from?.shelf_code || null
    },
    to: {
      warehouse: row.warehouse_to?.warehouse_name || null,
      warehouse_code: row.warehouse_to?.warehouse_code || null,
      shelf: row.shelf_to?.shelf_name || null,
      shelf_code: row.shelf_to?.shelf_code || null
    },
    condition: {
      from: row.from_condition || row.condition || null,
      to: row.to_condition || null
    },
    document_number: row.loan_number || null,
    actor_name: row.moved_by_name || null,
    note: row.reason_note || null
  };

  res.status(200).json({ success: true, data });
});

// (opsional) DELETE /product-circulations/remove/:id
const removeProductCirculation = asyncHandler(async (req, res) => {
  const row = await ProductCirculation.findById(req.params.id);
  if (!row) throwError('Sirkulasi tidak ditemukan!', 404);
  await row.deleteOne();
  res
    .status(200)
    .json({ success: true, message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getProductCirculations,
  getProductCirculation,
  removeProductCirculation
};
