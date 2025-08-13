const Employee = require('../model/employeeModel');
const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');

const checkNikDuplicate = asyncHandler(async (req, res, next) => {
  const nik = req.body.nik;
  const query = { nik };
  if (req.params.id) {
    query._id = { $ne: req.params.id };
  }

  const exists = await Employee.findOne(query);
  if (exists) {
    throwError('NIK sudah terdaftar', 400, 'nik');
  }

  next();
});

module.exports = checkNikDuplicate;
