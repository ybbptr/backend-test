const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const { uploadBuffer, getFileUrl, deleteFile } = require('../../utils/wasabi');
const path = require('path');
const formatDate = require('../../utils/formatDate');
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
    phone,
    address,
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

  if (!user || !name || !nik || !employment_type || !position) {
    throwError('Field ini harus diisi', 400);
  }

  // 1. buat employee dulu biar dapat _id
  let employee = new Employee({
    user,
    name,
    nik,
    age,
    phone,
    address,
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
  await employee.save();

  // 2. handle upload dokumen
  let documents = {};
  if (req.files) {
    for (const field of [
      'ktp',
      'asuransi',
      'mcu',
      'keterangan_sehat',
      'kelakuan_baik',
      'vaksinasi'
    ]) {
      if (req.files[field]) {
        const file = req.files[field][0];
        const ext = path.extname(file.originalname);
        const key = `karyawan/${employee._id}/${field}_${formatDate()}${ext}`;

        await uploadBuffer(key, file.buffer);

        documents[field] = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }
    }
  }

  // 3. update employee dengan documents
  employee.documents = documents;
  await employee.save();

  // 4. update role user jadi Karyawan
  await User.findByIdAndUpdate(user, { role: 'Karyawan' });

  res.status(201).json({
    message: 'Employee berhasil ditambahkan',
    data: employee
  });
});

const getEmployees = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { name, nik, employment_type, position, search, sort } = req.query;

  const filter = {};
  if (name) filter.name = { $regex: name, $options: 'i' };
  if (nik) filter.nik = { $regex: nik, $options: 'i' };
  if (employment_type) filter.employment_type = employment_type;
  if (position) filter.position = position;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { nik: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const employees = await Employee.find(filter)
    .populate('user', 'email')
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  const totalItems = await Employee.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  const employeesWithUrl = await Promise.all(
    employees.map(async (emp) => {
      const docsWithUrl = {};
      for (const [key, value] of Object.entries(emp.documents || {})) {
        if (value && value.key) {
          docsWithUrl[key] = {
            ...value,
            url: await getFileUrl(value.key)
          };
        }
      }
      return { ...emp, documents: docsWithUrl };
    })
  );

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages,
    sort: sortOption,
    data: employeesWithUrl
  });
});

const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
    .populate('user', 'email')
    .exec();

  if (!employee) throwError('Data karyawan tidak ada!', 400);

  const docsWithUrl = {};
  for (const [key, value] of Object.entries(employee.documents || {})) {
    if (value && value.key) {
      docsWithUrl[key] = {
        ...(value.toObject?.() || value),
        url: getFileUrl(value.key)
      };
    }
  }

  res.status(200).json({
    ...employee.toObject(),
    documents: docsWithUrl
  });
});

const removeEmployee = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throwError('Data karyawan tidak ada!', 400);

    if (employee.user) {
      await User.findByIdAndUpdate(
        employee.user,
        { role: 'User' },
        { session }
      );
    }

    if (employee.documents) {
      for (const [key, value] of Object.entries(employee.documents)) {
        if (value && value.key) {
          await deleteFile(value.key);
        }
      }
    }

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
    console.error(err);
    throwError('Gagal menghapus karyawan', 400);
  } finally {
    session.endSession();
  }
});

const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) throwError('Karyawan tidak ditemukan!', 404);

  const prevUserId = employee.user.toString();

  const fields = [
    'user',
    'name',
    'nik',
    'age',
    'phone',
    'address',
    'employment_type',
    'religion',
    'height',
    'weight',
    'number_of_children',
    'place_of_birth',
    'date_of_birth',
    'status',
    'bank_account_number',
    'emergency_contact_number',
    'position',
    'blood_type',
    'start_date',
    'end_date'
  ];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      employee[field] = req.body[field];
    }
  }

  // handle dokumen update
  if (req.files) {
    for (const field of [
      'ktp',
      'asuransi',
      'mcu',
      'keterangan_sehat',
      'kelakuan_baik',
      'vaksinasi'
    ]) {
      if (req.files[field]) {
        const file = req.files[field][0];
        const ext = path.extname(file.originalname);

        // hapus file lama
        if (employee.documents?.[field]?.key) {
          await deleteFile(employee.documents[field].key);
        }

        const key = `karyawan/${employee._id}/${field}_${formatDate()}${ext}`;
        await uploadBuffer(key, file.buffer);

        employee.documents[field] = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }
    }
  }

  await employee.save();

  // kalau user diganti → update role
  if (req.body.user && req.body.user !== prevUserId) {
    await User.findByIdAndUpdate(prevUserId, { role: 'User' });
    await User.findByIdAndUpdate(req.body.user, { role: 'Karyawan' });
  }

  res.status(200).json({
    message: 'Data karyawan berhasil diperbarui',
    data: employee
  });
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
