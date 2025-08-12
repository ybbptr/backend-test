const express = require('express');
const Router = express.Router();
const {
  addWarehouse,
  getWarehouses,
  removeWarehouse,
  updateWarehouse,
  getWarehouse
} = require('../../controller/admin/warehouseController');
const validate = require('../../middleware/validations/validate');
const validateWarehouse = require('../../middleware/validations/validateWarehouse');

Router.post('/add-warehouse', validate(validateWarehouse), addWarehouse).get(
  '/all-warehouse',
  getWarehouses
);

Router.put('/:id', validate(validateWarehouse), updateWarehouse)
  .delete('/:id', removeWarehouse)
  .get('/:id', getWarehouse);

module.exports = Router;
