const express = require('express');
const {
  addProduct,
  getProducts,
  getProduct,
  updateProduct,
  removeProduct
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
  addProduct
);

Router.get('/all-products', getProducts);
Router.get('/:id', getProduct);
Router.put(
  '/:id',
  setUploadFolder('images/products'),
  upload.single('imageUrl'),
  validate(validateProduct),
  updateProduct
);
Router.delete('/:id', removeProduct);

module.exports = Router;
