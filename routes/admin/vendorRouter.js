const express = require('express');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const validateVendor = require('../../middleware/validations/validateVendor');
const {
  addVendor,
  getVendor,
  getVendors,
  removeVendor,
  updateVendor
} = require('../../controller/admin/vendorController');

Router.post('/add-vendor', validate(validateVendor), addVendor).get(
  '/all-vendor',
  getVendors
);
Router.get('/:id', getVendor)
  .put('/update/:id', validate(validateVendor), updateVendor)
  .delete('/remove/:id', removeVendor);

module.exports = Router;
