const express = require('express');
const Product = require('../../model/productModel');
const { checkDuplicate } = require('../../middleware/checkDuplicate');
const {
  // Master Product
  addProduct,
  getProducts,
  getProduct,
  updateProduct,
  removeProduct,
  getAllWarehouse,
  getShelvesByWarehouse
} = require('../../controller/admin/productController');

const validate = require('../../middleware/validations/validate');
const {
  createProductSchema,
  updateProductSchema
} = require('../../middleware/validations/validateProduct');

const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const isImage = /jpeg|jpg|png/.test(file.mimetype.toLowerCase());
  const isPdf = /pdf/.test(file.mimetype.toLowerCase());

  if (isImage || isPdf) cb(null, true);
  else cb(new Error('File harus berupa jpg, jpeg, png, atau pdf'));
};

const uploadProductFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

const Router = express.Router();

Router.post(
  '/add-product',
  uploadProductFiles.fields([
    { name: 'product_image', maxCount: 1 },
    { name: 'invoice', maxCount: 1 }
  ]),
  validate(createProductSchema),
  checkDuplicate(Product, { product_code: 'Kode barang' }),
  addProduct
);

// Ambil semua produk (plus total stok agregat)
Router.get('/all-product', getProducts);

// Ambil daftar gudang (support FE form)
Router.get('/all-warehouse', getAllWarehouse);

// Ambil lemari berdasarkan gudang
Router.get('/warehouses/:id/shelves', getShelvesByWarehouse);

// Ambil detail produk + breakdown stok
Router.get('/:id', getProduct);

// Update metadata produk
Router.put(
  '/update/:id',
  uploadProductFiles.fields([
    { name: 'product_image', maxCount: 1 },
    { name: 'invoice', maxCount: 1 }
  ]),
  validate(updateProductSchema),
  checkDuplicate(Product, { product_code: 'Kode barang' }),
  updateProduct
);

// Hapus produk
Router.delete('/remove/:id', removeProduct);

module.exports = Router;
