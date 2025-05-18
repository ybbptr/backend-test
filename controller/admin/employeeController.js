const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Employee = require('../../model/employeeModel');
const User = require('../../model/userModel');
const cloudinary = require('cloudinary');

const addEmployee = asyncHandler(async (req, res) => {
  const {
    user,
    name,
    nik,
    age,
    employment_type,
    religion,
    height,
    weight,
    number_of_children,
    place_of_birth,
    date_of_birth,
    status,
    bank_account_number,
    emergency_contact_number,
    position,
    blood_type,
    start_date,
    end_date
  } = req.body || {};
});

const getAllUserEmails = asyncHandler(async (req, res) => {
  const users = await User.find({}, 'email');
  res.json(users);
});

module.exports = {
  getAllUserEmails,
  addEmployee
};
