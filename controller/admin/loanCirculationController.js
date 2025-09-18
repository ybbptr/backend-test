const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const loanCirculationModel = require('../../model/loanCirculationModel');
const { getFileUrl } = require('../../utils/wasabi');

/* ================= Helper ================= */
async function attachImageUrls(circulation) {
  // bisa dari doc mongoose atau plain object
  const doc = circulation.toObject ? circulation.toObject() : circulation;

  if (doc.borrowed_items?.length > 0) {
    doc.borrowed_items = await Promise.all(
      doc.borrowed_items.map(async (item) => {
        let imageUrl = null;

        // jika product_image berupa { key } atau string
        if (item.product_image) {
          if (typeof item.product_image === 'string') {
            // kalau sudah URL langsung
            imageUrl = item.product_image;
          } else if (item.product_image.key) {
            // generate presigned URL dari Wasabi
            imageUrl = await getFileUrl(item.product_image.key); // 5 menit
          }
        }

        return {
          ...item,
          product_image_url: imageUrl
        };
      })
    );
  }

  return doc;
}

/* ================= Controller ================= */
const getLoanCirculations = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter = search
    ? {
        $or: [
          { loan_number: { $regex: search, $options: 'i' } },
          { inventory_manager: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  if (req.query.borrower) {
    filter.borrower = req.query.borrower;
  }
  if (req.query.project) {
    filter['borrowed_items.project'] = req.query.project;
  }

  const totalItems = await loanCirculationModel.countDocuments(filter);
  const data = await loanCirculationModel
    .find(filter)
    .populate('borrowed_items.warehouse_from', 'warehouse_name warehouse_code')
    .populate('borrowed_items.shelf_from', 'shelf_name')
    .populate('borrowed_items.project', 'project_name')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_to', 'shelf_name')
    .populate('borrower', 'name')
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

const getLoanCirculation = asyncHandler(async (req, res) => {
  const loanCirculation = await loanCirculationModel
    .findById(req.params.id)
    .populate('borrowed_items.warehouse_from', 'warehouse_name warehouse_code')
    .populate('borrowed_items.shelf_from', 'shelf_name')
    .populate('borrowed_items.project', 'project_name')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_to', 'shelf_name')
    .populate('borrower', 'name')
    .lean();

  if (!loanCirculation) throwError('Sirkulasi tidak terdaftar!', 400);

  const withUrl = await attachImageUrls(loanCirculation);

  res.status(200).json(withUrl);
});

const refreshLoanCirculationUrls = asyncHandler(async (req, res) => {
  const loanCirculation = await loanCirculationModel
    .findById(req.params.id)
    .lean();

  if (!loanCirculation) throwError('Sirkulasi tidak terdaftar!', 400);

  const withUrl = await attachImageUrls(loanCirculation);

  res.status(200).json({
    loan_number: loanCirculation.loan_number,
    borrowed_items: withUrl.borrowed_items.map((it) => ({
      product_code: it.product_code,
      brand: it.brand,
      product_image_url: it.product_image_url
    }))
  });
});

const removeLoanCirculation = asyncHandler(async (req, res) => {
  const loanCirculation = await loanCirculationModel.findById(req.params.id);
  if (!loanCirculation) throwError('Sirkulasi tidak terdaftar!', 400);

  await loanCirculation.deleteOne();

  res.status(200).json({ message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getLoanCirculations,
  getLoanCirculation,
  removeLoanCirculation,
  refreshLoanCirculationUrls
};
