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
const upload = require('../../utils/imgUploader');
const setUploadFolder = (folder) => (req, res, next) => {
  req.folder = folder;
  next();
};
const validate = require('../../middleware/validations/validate');
const validateProduct = require('../../middleware/validations/validateProduct');

Router.post(
  '/add-product',
  setUploadFolder('images/products'),
  upload.single('imageUrl'),
  validate(validateProduct),
  checkDuplicate(Product, { product_code: 'Kode barang' }),
  addProduct
);

Router.get('/all-product', getProducts)
  .get('/all-warehouse', getAllWarehouse)
  .get('/shelves', getShelvesByWarehouse);

Router.get('/:id', getProduct);
Router.put(
  '/update/:id',
  setUploadFolder('images/products'),
  upload.single('imageUrl'),
  validate(validateProduct),
  checkDuplicate(Product, { product_code: 'Kode barang' }),
  updateProduct
);
Router.delete('/remove/:id', removeProduct);

module.exports = Router;
