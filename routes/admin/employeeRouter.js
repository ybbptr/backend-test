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
const checkDuplicate = require('../../middleware/checkDuplicate');
const Employee = require('../../model/employeeModel');
// const upload = require('../../utils/pdfUploader');

Router.post(
  '/add-employee',
  validate(validateEmployee),
  checkDuplicate(Employee, { nik: 'NIK' }),
  addEmployee
)
  .get('/email-employees', getAllUserEmails)
  .get('/all-employee', getEmployees);
Router.get('/:id', getEmployee);
Router.delete('/remove/:id', removeEmployee);
Router.put(
  '/update/:id',
  validate(validateEmployee),
  checkDuplicate(Employee, { nik: 'NIK' }),
  updateEmployee
);

module.exports = Router;
