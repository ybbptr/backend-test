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
  validate(validateProduct),
  upload.single('imageUrl'),
  addProduct
);

Router.get('/all-products', getProducts);
Router.get('/:id', getProduct)
  .put(
    '/:id',
    setUploadFolder('images/products'),
    upload.single('imageUrl'),
    validate(validateProduct),
    updateProduct
  )
  .delete('/:id', removeProduct);

module.exports = Router;
