const express = require('express');
const {
  getAllUserEmails,
  addEmployee
} = require('../../controller/admin/employeeController');
const Router = express.Router();
const upload = require('../../utils/pdfUploader');

Router.post('/', upload.single('imageUrl'), addEmployee);
Router.get('/get-email', getAllUserEmails);

module.exports = Router;
