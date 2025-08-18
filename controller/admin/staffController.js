const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Staff = require('../../model/staffModel');

const addStaff = asyncHandler(async (req, res) => {
  const { staff_name, position, description, imgUrl, gif } = req.body || {};

  if (!staff_name || !position) throwError('Field ini harus diisi', 400);

  const staff = await Staff.create({
    staff_name,
    position,
    description,
    imgUrl,
    gif
  });

  res.status(201).json(staff);
});

const getStaffs = asyncHandler(async (req, res) => {
  const staff = await Staff.find();

  res.status(200).json(staff);
});

const getStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findById(req.params.id);

  if (!staff) throwError('Staff tidak terdaftar!', 400);

  res.status(200).json(staff);
});

const removeStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findById(req.params.id);
  if (!staff) throwError('Staff tidak terdaftar!', 400);

  await staff.deleteOne();
  res.status(200).json({ message: 'Staff berhasil dihapus.' });
});

const updateStaff = asyncHandler(async (req, res) => {
  const { staff_name, position, description, imgUrl, gif } = req.body || {};

  const staff = await Staff.findById(req.params.id);
  if (!staff) throwError('Staff berhasil dihapus', 404);

  staff.staff_name = staff_name || staff.staff_name;
  staff.description = description || staff.description;
  staff.position = position || staff.position;
  staff.imgUrl = imgUrl || staff.imgUrl;
  staff.gif = gif || staff.gif;

  await staff.save();
  res.status(200).json(staff);
});

module.exports = {
  addStaff,
  getStaffs,
  getStaff,
  removeStaff,
  updateStaff
};
