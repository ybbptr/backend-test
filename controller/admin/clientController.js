const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Client = require('../../model/clientModel');
const RAP = require('../../model/rapModel');
const mongoose = require('mongoose');

const addClient = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    email,
    npwp,
    bank_account_number,
    emergency_contact_number
  } = req.body || {};

  if (
    !name ||
    !address ||
    !email ||
    !npwp ||
    !bank_account_number ||
    !emergency_contact_number
  )
    throwError('Field ini harus diisi', 400);

  const client = await Client.create({
    name,
    address,
    npwp,
    email,
    bank_account_number,
    emergency_contact_number
  });

  res.status(201).json(client);
});

const getClients = asyncHandler(async (req, res) => {
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

  const totalItems = await Client.countDocuments(filter);
  const data = await Client.find(filter)
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

const getClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) throwError('Client tidak terdaftar!', 400);

  res.status(200).json(client);
});

const removeClient = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const client = await Client.findById(req.params.id).session(session);
    if (!client) throwError('Client tidak terdaftar!', 400);

    await RAP.updateMany(
      { client: client._id },
      { $set: { client: null } },
      { session }
    );

    await client.deleteOne({ session });

    await session.commitTransaction();

    res.status(200).json({ message: 'Client berhasil dihapus.' });
  } catch (err) {
    await session.abortTransaction();
    throwError(err.message || 'Gagal menghapus client', 400);
  } finally {
    session.endSession();
  }
});

const updateClient = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    npwp,
    email,
    bank_account_number,
    emergency_contact_number
  } = req.body || {};

  const client = await Client.findById(req.params.id);
  if (!client) throwError('Client berhasil dihapus', 404);

  client.name = name || client.name;
  client.address = address || client.address;
  client.npwp = npwp || client.npwp;
  client.email = email || client.email;
  client.bank_account_number =
    bank_account_number || client.bank_account_number;
  client.emergency_contact_number =
    emergency_contact_number || client.emergency_contact_number;

  await client.save();
  res.status(200).json(client);
});

module.exports = {
  addClient,
  getClients,
  getClient,
  removeClient,
  updateClient
};
