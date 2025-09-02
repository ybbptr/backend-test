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
const {
  validateEmployeeCreate,
  validateEmployeeUpdate
} = require('../../middleware/validations/validateEmployee');
const { checkDuplicate } = require('../../middleware/checkDuplicate');
const Employee = require('../../model/employeeModel');

const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const exist = /jpeg|jpg|png|pdf|docx/.test(file.mimetype.toLowerCase());
  if (exist) {
    cb(null, true);
  } else {
    cb(new Error('File harus berupa jpg, jpeg, png, docx atau pdf'));
  }
};

const uploadEmployeeFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

Router.post(
  '/add-employee',
  uploadEmployeeFiles.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'asuransi', maxCount: 1 },
    { name: 'mcu', maxCount: 1 },
    { name: 'keterangan_sehat', maxCount: 1 },
    { name: 'kelakuan_baik', maxCount: 1 },
    { name: 'vaksinasi', maxCount: 1 }
  ]),
  validate(validateEmployeeCreate),
  checkDuplicate(Employee, { nik: 'NIK' }),
  addEmployee
);

Router.get('/email-employees', getAllUserEmails);
Router.get('/all-employee', getEmployees);

Router.get('/:id', getEmployee);
Router.delete('/remove/:id', removeEmployee);
Router.put(
  '/update/:id',
  uploadEmployeeFiles.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'asuransi', maxCount: 1 },
    { name: 'mcu', maxCount: 1 },
    { name: 'keterangan_sehat', maxCount: 1 },
    { name: 'kelakuan_baik', maxCount: 1 },
    { name: 'vaksinasi', maxCount: 1 }
  ]),
  validate(validateEmployeeUpdate),
  updateEmployee
);

module.exports = Router;
