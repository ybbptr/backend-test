const express = require('express');
const Product = require('../../model/productModel');
const { checkDuplicate } = require('../../middleware/checkDuplicate');
const {
  addProduct,
  getProducts,
  getProduct,
  updateProduct,
  removeProduct,
  getAllWarehouse
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

Router.get('/all-products', getProducts).get('all-warehouse', getAllWarehouse);
Router.get('/:id', getProduct);
Router.put(
  '/:id',
  setUploadFolder('images/products'),
  upload.single('imageUrl'),
  validate(validateProduct),
  checkDuplicate(Product, { product_code: 'Kode barang' }),
  updateProduct
);
Router.delete('/:id', removeProduct);

module.exports = Router;
