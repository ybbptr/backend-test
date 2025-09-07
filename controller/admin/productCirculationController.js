const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const productCirculationModel = require('../../model/productCirculationModel');
const { getFileUrl } = require('../../utils/wasabi');

async function attachImageUrl(circ) {
  const doc = circ.toObject ? circ.toObject() : circ;

  if (doc.product_image?.key) {
    doc.product_image_url = await getFileUrl(doc.product_image.key);
  } else {
    doc.product_image_url = null;
  }

  return doc;
}

const getProductCirculations = asyncHandler(async (req, res) => {
  let circulations = await productCirculationModel
    .find()
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_from', 'shelf_name shelf_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('product', 'product_name product_code')
    .lean();

  circulations = await Promise.all(circulations.map((c) => attachImageUrl(c)));

  res.status(200).json(circulations);
});

const getProductCirculation = asyncHandler(async (req, res) => {
  let circulation = await productCirculationModel
    .findById(req.params.id)
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_from', 'shelf_name shelf_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('product', 'product_name product_code')
    .lean();

  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  circulation = await attachImageUrl(circulation);

  res.status(200).json(circulation);
});

const removeProductCirculation = asyncHandler(async (req, res) => {
  const circulation = await productCirculationModel.findById(req.params.id);
  if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

  await circulation.deleteOne();
  res.status(200).json({ message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getProductCirculations,
  getProductCirculation,
  removeProductCirculation
};
