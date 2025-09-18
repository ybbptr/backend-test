const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Vendor = require('../../model/vendorModel');

const addVendor = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    npwp,
    phone,
    bank_account_number,
    emergency_contact_number
  } = req.body || {};

  if (
    !name ||
    !address ||
    !phone ||
    !npwp ||
    !bank_account_number ||
    !emergency_contact_number
  )
    throwError('Field ini harus diisi', 400);

  const vendor = await Vendor.create({
    name,
    address,
    npwp,
    phone,
    bank_account_number,
    emergency_contact_number
  });

  res.status(201).json(vendor);
});

const getVendors = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = req.query.search || '';
  const filter = search
    ? {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  const totalItems = await Vendor.countDocuments(filter);
  const data = await Vendor.find(filter)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data
  });
});

const getVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throwError('Vendor tidak terdaftar!', 400);

  res.status(200).json(vendor);
});

const removeVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throwError('Vendor tidak terdaftar!', 400);

  await Vendor.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Vendor berhasil dihapus.' });
});

const updateVendor = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    npwp,
    phone,
    bank_account_number,
    emergency_contact_number
  } = req.body || {};

  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throwError('Vendor berhasil dihapus', 404);

  vendor.name = name || vendor.name;
  vendor.address = address || vendor.address;
  vendor.npwp = npwp || vendor.npwp;
  vendor.phone = phone || vendor.phone;
  vendor.bank_account_number =
    bank_account_number || vendor.bank_account_number;
  vendor.emergency_contact_number =
    emergency_contact_number || vendor.emergency_contact_number;

  await vendor.save();
  res.status(200).json(vendor);
});

module.exports = {
  addVendor,
  getVendors,
  getVendor,
  removeVendor,
  updateVendor
};
