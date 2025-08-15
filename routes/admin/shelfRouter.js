const express = require('express');
const Router = express.Router();
const checkDuplicate = require('../../middleware/checkDuplicate');
const Shelf = require('../../model/shelfModel');
const validate = require('../../middleware/validations/validate');
const validateShelf = require('../../middleware/validations/validateShelf');
const {
  addShelf,
  getShelf,
  getShelfs,
  removeShelf,
  updateShelf,
  getAllWarehouse
} = require('../../controller/admin/shelfController');

Router.post(
  '/add-shelf',
  validate(validateShelf),
  checkDuplicate(Shelf, { shelf_code: 'Kode lemari' }),
  addShelf
)
  .get('/all-shelf', getShelfs)
  .get('/all-warehouse', getAllWarehouse);

Router.get('/:id', getShelf)
  .put(
    '/update/:id',
    validate(validateShelf),
    checkDuplicate(Shelf, { shelf_code: 'Kode lemari' }),
    updateShelf
  )
  .delete('/remove/:id', removeShelf);

module.exports = Router;
