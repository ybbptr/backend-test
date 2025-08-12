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
// const upload = require('../../utils/pdfUploader');

Router.post('/add-employee', addEmployee)
  .get('/email-employees', getAllUserEmails)
  .get('/employees', getEmployee);
Router.get(':id', getEmployees);
Router.delete('/remove/:id', removeEmployee);
Router.put('/update/:id', updateEmployee);

module.exports = Router;
