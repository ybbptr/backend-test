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
const throwError = require('../../middleware/errorHandler');
const validateWarehouse = require('../../middleware/validations/validateWarehouse');
const multer = require('multer');
const upload = multer();

Router.get('/all-warehouse', getWarehouses);
Router.post(
  '/add-warehouse',
  upload.none(),
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
  validate(validateWarehouse),
  checkDuplicate(Warehouse, { warehouse_code: 'Kode gudang' }),
  addWarehouse
);

Router.put('/update/:id', validate(validateWarehouse), updateWarehouse)
  .delete('/remove/:id', removeWarehouse)
  .get('/:id', getWarehouse);

module.exports = Router;
