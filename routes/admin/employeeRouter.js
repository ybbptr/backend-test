const express = require('express');
const {
  getAllUserEmails,
  addEmployee,
  getEmployee,
  getEmployees,
  removeEmployee,
  updateEmployee
} = require('../../controller/admin/employeeController');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const validateEmployee = require('../../middleware/validations/validateEmployee');
const checkNikDuplicate = require('../../middleware/checkDuplicateNik');
// const upload = require('../../utils/pdfUploader');

Router.post(
  '/add-employee',
  validate(validateEmployee),
  checkNikDuplicate,
  addEmployee
)
  .get('/email-employees', getAllUserEmails)
  .get('/all-employee', getEmployees);
Router.get('/:id', getEmployee);
Router.delete('/remove/:id', removeEmployee);
Router.put(
  '/update/:id',
  validate(validateEmployee),
  checkNikDuplicate,
  updateEmployee
);

module.exports = Router;
