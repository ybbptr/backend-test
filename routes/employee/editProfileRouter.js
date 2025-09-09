const express = require('express');
const {
  getMyProfile,
  updateMyProfile,
  downloadMyDocs
} = require('../../controller/employee/editProfileController');
const validate = require('../../middleware/validations/validate');
const {
  employeeUpdateValidation
} = require('../../middleware/validations/validateEmployee');

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

const Router = express.Router();

Router.get('/me', getMyProfile);

Router.put(
  '/update/me',
  uploadEmployeeFiles.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'asuransi', maxCount: 1 },
    { name: 'mcu', maxCount: 1 },
    { name: 'keterangan_sehat', maxCount: 1 },
    { name: 'kelakuan_baik', maxCount: 1 },
    { name: 'vaksinasi', maxCount: 1 }
  ]),
  validate(employeeUpdateValidation),
  updateMyProfile
);

Router.get('/me/download', downloadMyDocs);

module.exports = Router;
