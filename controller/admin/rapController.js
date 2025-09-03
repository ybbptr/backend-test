const RAP = require('../../model/rapModel');
const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');

const addRAP = asyncHandler(async (req, res) => {
  const { project_name, nilai_pekerjaan, nomor_kontrak } = req.body || {};

  if (!project_name || !nilai_pekerjaan || !nomor_kontrak)
    throwError('Field ini harus diisi!', 400);

  const rap = await RAP.create({
    project_name,
    nilai_pekerjaan,
    nomor_kontrak
  });

  res.status(201).json(rap);
});

const getAllRAP = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { project_name, nomor_kontrak, client, search, sort } = req.query;

  const filter = {};
  if (project_name)
    filter.project_name = { $regex: project_name, $options: 'i' };
  if (nomor_kontrak)
    filter.nomor_kontrak = { $regex: nomor_kontrak, $options: 'i' };
  if (client) filter.client = client;
  if (search) {
    filter.$or = [
      { project_name: { $regex: search, $options: 'i' } },
      { nomor_kontrak: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const totalItems = await RAP.countDocuments(filter);
  const raps = await RAP.find(filter)
    .populate('client', 'name address npwp phone')
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    sort: sortOption,
    data: raps
  });
});

const getRAP = asyncHandler(async (req, res) => {
  const rap = await RAP.findById(req.params.id).populate(
    'client',
    'name address npwp phone'
  );
  if (!rap) throwError('RAP tidak ditemukan!', 404);

  res.status(200).json(rap);
});

const updateRAP = asyncHandler(async (req, res) => {
  const { project_name, nilai_pekerjaan, nomor_kontrak } = req.body || {};

  if (!rap) throwError('RAP tidak ditemukan!', 404);

  res.status(200).json(rap);
});

const removeRAP = asyncHandler(async (req, res) => {
  const rap = await RAP.findById(req.params.id);
  if (!rap) throwError('RAP tidak ditemukan!', 404);

  await rap.deleteOne();
  res.status(200).json({ message: 'RAP berhasil dihapus.' });
});

module.exports = {
  addRAP,
  getAllRAP,
  getRAP,
  updateRAP,
  removeRAP
};
