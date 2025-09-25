const User = require('../../model/userModel');
const Employee = require('../../model/employeeModel');
const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');

const getAllUsers = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throwError('Anda tidak memiliki akses untuk data ini', 403);
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { email, name, phone, search, sort } = req.query;

  const filter = { role: { $ne: 'admin' } };

  if (email) filter.email = { $regex: email, $options: 'i' };
  if (name) filter.name = { $regex: name, $options: 'i' };
  if (phone) filter.phone = { $regex: phone, $options: 'i' };

  if (search) {
    filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  // default sort by newest
  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const users = await User.find(filter)
    .select('email name phone createdAt')
    .skip(skip)
    .limit(limit)
    .sort(sortOption);

  const total = await User.countDocuments(filter);

  res.status(200).json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    users
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throwError('Anda tidak memiliki akses untuk menghapus user', 403);
  }

  const { id } = req.params;
  const user = await User.findById(id);

  if (!user) {
    throwError('User tidak ditemukan', 404);
  }

  await Employee.updateMany({ user: user._id }, { $set: { user: null } });
  await user.deleteOne();

  res.status(200).json({
    message: 'User berhasil dihapus dan role karyawan di hapus'
  });
});

module.exports = {
  deleteUser,
  getAllUsers
};
