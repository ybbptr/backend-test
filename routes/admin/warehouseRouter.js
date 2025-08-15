const express = require('express');
const Router = express.Router();
const { checkDuplicate } = require('../../middleware/checkDuplicate');
const Warehouse = require('../../model/warehouseModel');
const {
  addWarehouse,
  getWarehouses,
  removeWarehouse,
  updateWarehouse,
  getWarehouse
} = require('../../controller/admin/warehouseController');
const validate = require('../../middleware/validations/validate');
const validateWarehouse = require('../../middleware/validations/validateWarehouse');

Router.post(
  '/add-warehouse',
  validate(validateWarehouse),
  checkDuplicate(Warehouse, { warehouse_code: 'Kode gudang' }),
  addWarehouse
).get('/all-warehouse', getWarehouses);

Router.put('/update/:id', validate(validateWarehouse), updateWarehouse)
  .delete('/remove/:id', removeWarehouse)
  .get('/:id', getWarehouse);

module.exports = Router;
