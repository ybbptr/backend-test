const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const LoanCirculation = require('../../model/loanCirculationModel');
const { getFileUrl } = require('../../utils/wasabi');

function pickImageMeta(item) {
  if (item?.product_image) return item.product_image;
  if (item?.product?.product_image) return item.product.product_image;
  return null;
}

async function resolveImageUrl(meta) {
  try {
    if (!meta) return null;
    if (typeof meta === 'string') return meta;
    if (meta.key) return await getFileUrl(meta.key);
    return null;
  } catch {
    return null;
  }
}

async function attachImageUrls(circulation) {
  const doc = circulation?.toObject ? circulation.toObject() : circulation;

  if (Array.isArray(doc.borrowed_items) && doc.borrowed_items.length) {
    doc.borrowed_items = await Promise.all(
      doc.borrowed_items.map(async (it) => {
        const meta = pickImageMeta(it);
        const product_image_url = await resolveImageUrl(meta);
        return { ...it, product_image_url };
      })
    );
  }
  return doc;
}

const getLoanCirculations = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { borrower, project, search, sort } = req.query;

  const filter = {};
  if (search) {
    filter.$or = [
      { loan_number: { $regex: search, $options: 'i' } },
      { inventory_manager: { $regex: search, $options: 'i' } }
    ];
  }
  if (borrower) filter.borrower = borrower;
  if (project) filter['borrowed_items.project'] = project;

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = String(sort).split(':');
    if (field) sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const totalItems = await LoanCirculation.countDocuments(filter);
  let rows = await LoanCirculation.find(filter)
    .populate('borrowed_items.warehouse_from', 'warehouse_name warehouse_code')
    .populate('borrowed_items.shelf_from', 'shelf_name shelf_code')
    .populate('borrowed_items.project', 'project_name')
    .populate('borrowed_items.product', 'product_code brand')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('borrower', 'name')
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    sort: sortOption,
    data: rows
  });
});

const getLoanCirculation = asyncHandler(async (req, res) => {
  const row = await LoanCirculation.findById(req.params.id)
    .populate('borrowed_items.warehouse_from', 'warehouse_name warehouse_code')
    .populate('borrowed_items.shelf_from', 'shelf_name shelf_code')
    .populate('borrowed_items.project', 'project_name')
    .populate('borrowed_items.product', 'product_code brand product_image')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('borrower', 'name')
    .lean();

  if (!row) throwError('Sirkulasi tidak terdaftar!', 404);

  const withUrl = await attachImageUrls(row);
  res.status(200).json(withUrl);
});

const refreshLoanCirculationUrls = asyncHandler(async (req, res) => {
  const row = await LoanCirculation.findById(req.params.id)
    .populate('borrowed_items.product', 'product_image product_code brand')
    .lean();
  if (!row) throwError('Sirkulasi tidak terdaftar!', 404);

  const withUrl = await attachImageUrls(row);

  res.status(200).json({
    loan_number: row.loan_number,
    borrowed_items: (withUrl.borrowed_items || []).map((it) => ({
      _id: it._id,
      product_code: it.product_code,
      brand: it.brand,
      product_image_url: it.product_image_url
    }))
  });
});

const removeLoanCirculation = asyncHandler(async (req, res) => {
  const row = await LoanCirculation.findById(req.params.id);
  if (!row) throwError('Sirkulasi tidak terdaftar!', 404);

  await row.deleteOne();
  res.status(200).json({ message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getLoanCirculations,
  getLoanCirculation,
  refreshLoanCirculationUrls,
  removeLoanCirculation
};
