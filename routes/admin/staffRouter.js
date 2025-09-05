const express = require('express');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const validateToken = require('../../middleware/validations/validateTokenHandler');
const {
  createStaffSchema,
  updateStaffSchema
} = require('../../middleware/validations/validateStaff');
const {
  addStaff,
  getStaff,
  getStaffs,
  removeStaff,
  updateStaff
} = require('../../controller/admin/staffController');

const multer = require('multer');
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const exist = /jpeg|jpg|png|gif/.test(file.mimetype.toLowerCase());
  if (exist) cb(null, true);
  else cb(new Error('File harus berupa jpg, jpeg, png, atau gif'));
};

const uploadStaffFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

Router.post(
  '/add-staff',
  validateToken,
  uploadStaffFiles.fields([
    { name: 'img', maxCount: 1 },
    { name: 'gif', maxCount: 1 }
  ]),
  validate(createStaffSchema),
  addStaff
);

Router.get('/all-staff', getStaffs);

Router.put(
  '/update/:id',
  validateToken,
  uploadStaffFiles.fields([
    { name: 'img', maxCount: 1 },
    { name: 'gif', maxCount: 1 }
  ]),
  validate(updateStaffSchema),
  updateStaff
);

Router.get('/:id', getStaff);
validateToken, Router.delete('/remove/:id', validateToken, removeStaff);

module.exports = Router;
