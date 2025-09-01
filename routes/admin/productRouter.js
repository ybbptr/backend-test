const express = require('express');
const Product = require('../../model/productModel');
const { checkDuplicate } = require('../../middleware/checkDuplicate');
const {
  addProduct,
  getProducts,
  getProduct,
  updateProduct,
  removeProduct,
  getAllWarehouse,
  getShelvesByWarehouse
} = require('../../controller/admin/productController');

const Router = express.Router();
const { imageUploader, pdfUploader } = require('../../utils/fileUploader');
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

  if (isImage || isPdf) {
    cb(null, true);
  } else {
    cb(new Error('File harus berupa jpg, jpeg, png, atau pdf'));
  }
};

const uploadProductFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

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

Router.get('/all-product', getProducts)
  .get('/all-warehouse', getAllWarehouse)
  .get('/shelves', getShelvesByWarehouse);

Router.get('/:id', getProduct);
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
Router.delete('/remove/:id', removeProduct);

module.exports = Router;
