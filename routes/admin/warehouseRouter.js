const express = require('express');
const Router = express.Router();
const { checkDuplicate } = require('../../middleware/checkDuplicate');
const Warehouse = require('../../model/warehouseModel');
const { imageUploader } = require('../../utils/fileUploader');
const {
  addWarehouse,
  getWarehouses,
  removeWarehouse,
  updateWarehouse,
  getWarehouse
} = require('../../controller/admin/warehouseController');
const validate = require('../../middleware/validations/validate');
const {
  createWarehouseSchema,
  updateWarehouseSchema
} = require('../../middleware/validations/validateWarehouse');
const throwError = require('../../middleware/errorHandler');

Router.get('/all-warehouse', getWarehouses);

Router.post(
  '/add-warehouse',
  imageUploader.single('warehouse_image'),
  (req, res, next) => {
    if (req.body.shelves) {
      try {
        req.body.shelves = JSON.parse(req.body.shelves);
      } catch (err) {
        return throwError('Format shelves harus berupa JSON valid', 400);
      }
    }
    next();
  },
  validate(createWarehouseSchema),
  checkDuplicate(Warehouse, { warehouse_code: 'Kode gudang' }),
  addWarehouse
);

Router.put(
  '/update/:id',
  imageUploader.single('warehouse_image'),
  (req, res, next) => {
    if (req.body.shelves) {
      try {
        req.body.shelves = JSON.parse(req.body.shelves);
      } catch (err) {
        return throwError('Format shelves harus berupa JSON valid', 400);
      }
    }
    next();
  },
  validate(updateWarehouseSchema),
  checkDuplicate(Warehouse, { warehouse_code: 'Kode gudang' }),
  updateWarehouse
);

Router.delete('/remove/:id', removeWarehouse);

Router.get('/:id', getWarehouse);

module.exports = Router;
