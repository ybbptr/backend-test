const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const User = require('../../model/userModel');
const Employee = require('../../model/employeeModel');
const Loan = require('../../model/loanModel');
const mongoose = require('mongoose');

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

  if (!user || !name || !nik || !employment_type || !position)
    throwError('Field ini harus diisi', 400);

  const employee = await Employee.create({
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
  });

  res.status(201).json({ employee });
});

const getEmployees = asyncHandler(async (req, res) => {
  const employees = await Employee.find().populate('user', 'email').exec();
  res.status(200).json(employees);
});

const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
    .populate('user', 'email')
    .exec();
  if (!employee) throwError('Data karyawan tidak ada!', 400);

  res.status(200).json(employee);
});

const removeEmployee = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throwError('Data karyawan tidak ada!', 400);

    await Loan.updateMany(
      { employee: employee._id },
      { $set: { employee: null } },
      { session }
    );

    await employee.deleteOne({ session });

    await session.commitTransaction();
    res.status(200).json({ message: 'Data karyawan berhasil dihapus.' });
  } catch (err) {
    await session.abortTransaction();
    throwError('Gagal menghapus karyawan', 400);
  } finally {
    session.endSession();
  }
});

const updateEmployee = asyncHandler(async (req, res) => {
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
  } = req.body;

  const employee = await Employee.findById(req.params.id);
  if (!employee) throwError('Karyawan tidak ditemukan!', 404);

  employee.user = user || employee.user;
  employee.name = name || employee.name;
  employee.nik = nik || employee.nik;
  employee.age = age || employee.age;
  employee.employment_type = employment_type || employee.employment_type;
  employee.religion = religion || employee.religion;
  employee.height = height || employee.height;
  employee.weight = weight || employee.weight;
  employee.number_of_children =
    number_of_children || employee.number_of_children;
  employee.place_of_birth = place_of_birth || employee.place_of_birth;
  employee.date_of_birth = date_of_birth || employee.date_of_birth;
  employee.status = status || employee.status;
  employee.bank_account_number =
    bank_account_number || employee.bank_account_number;
  employee.emergency_contact_number =
    emergency_contact_number || employee.emergency_contact_number;
  employee.position = position || employee.position;
  employee.blood_type = blood_type || employee.blood_type;
  employee.start_date = start_date || employee.start_date;
  employee.end_date = end_date || employee.end_date;

  await employee.save();
  res.status(200).json(employee);
});

const getAllUserEmails = asyncHandler(async (req, res) => {
  const users = await User.find().select('email');

  res.json(users);
});

module.exports = {
  getAllUserEmails,
  addEmployee,
  getEmployee,
  getEmployees,
  removeEmployee,
  updateEmployee
};
