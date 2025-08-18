const express = require('express');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const validateStaff = require('../../middleware/validations/validateStaff');
const {
  addStaff,
  getStaff,
  getStaffs,
  removeStaff,
  updateStaff
} = require('../../controller/admin/staffController');

Router.post('/add-staff', validate(validateStaff), addStaff).get(
  '/all-staff',
  getStaffs
);
Router.get('/:id', getStaff)
  .put('/update/:id', validate(validateStaff), updateStaff)
  .delete('/remove/:id', removeStaff);

module.exports = Router;
