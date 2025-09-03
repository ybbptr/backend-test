const RAP = require('../../model/rapModel');
const asyncHandler = require('express-async-handler');
const Client = require('../../model/clientModel');
const throwError = require('../../utils/throwError');
const { uploadBuffer, getFileUrl, deleteFile } = require('../../utils/wasabi');
const path = require('path');
const formatDate = require('../../utils/formatDate');

const addRAP = asyncHandler(async (req, res) => {
  const {
    project_name,
    nilai_pekerjaan,
    nomor_kontrak,
    nilai_pekerjaan_addendum,
    nomor_kontrak_addendum,
    nilai_fix_pekerjaan,
    name,
    address,
    npwp,
    phone,
    persiapan_pekerjaan,
    operasional_lapangan,
    operasional_tenaga_ahli,
    sewa_alat,
    operasional_lab,
    pajak,
    biaya_lain_lain
  } = req.body || {};

  if (
    !project_name ||
    !nilai_pekerjaan ||
    !nomor_kontrak ||
    !name ||
    !address ||
    !npwp ||
    !phone
  )
    throwError('Field ini wajib diisi!', 400);

  let kontrakFileMeta = null;
  if (req.file) {
    const file = req.file;
    const ext = path.extname(file.originalname);
    const key = `rap/${project_name}/kontrak_${formatDate()}${ext}`;

    await uploadBuffer(key, file.buffer);

    kontrakFileMeta = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  const rap = await RAP.create({
    project_name,
    kontrak_file,
    nilai_pekerjaan,
    nomor_kontrak,
    nilai_pekerjaan_addendum,
    nomor_kontrak_addendum,
    nilai_fix_pekerjaan,
    name,
    address,
    npwp,
    phone,
    persiapan_pekerjaan,
    operasional_lapangan,
    operasional_tenaga_ahli,
    sewa_alat,
    operasional_lab,
    pajak,
    biaya_lain_lain,
    kontrak_file: kontrakFileMeta
  });

  res.status(201).json({ rap });
});

const getAllRAP = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { project_name, nomor_kontrak, name, search, sort } = req.query;

  const filter = {};
  if (project_name)
    filter.project_name = { $regex: project_name, $options: 'i' };
  if (nomor_kontrak)
    filter.nomor_kontrak = { $regex: nomor_kontrak, $options: 'i' };
  if (name) filter.name = name;
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
    .populate('client', 'name address npwp emergency_contact_number')
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
    'name address npwp emergency_contact_number'
  );
  if (!rap) throwError('RAP tidak ditemukan!', 404);

  let kontrakUrl = null;
  if (rap.kontrak_file?.key) {
    kontrakUrl = await getFileUrl(rap.kontrak_file.key); // signed URL
  }

  res.status(200).json({
    ...rap.toObject(),
    kontrak_pdf_url: kontrakUrl
  });
});

const updateRAP = asyncHandler(async (req, res) => {
  const {
    project_name,
    nilai_pekerjaan,
    nomor_kontrak,
    nilai_pekerjaan_addendum,
    nomor_kontrak_addendum,
    nilai_fix_pekerjaan,
    name,
    address,
    npwp,
    phone,
    persiapan_pekerjaan,
    operasional_lapangan,
    operasional_tenaga_ahli,
    sewa_alat,
    operasional_lab,
    pajak,
    biaya_lain_lain
  } = req.body || {};

  const rap = await RAP.findById(req.params.id);
  if (!rap) throwError('RAP tidak ditemukan!', 404);

  if (req.file) {
    const file = req.file;
    const ext = path.extname(file.originalname);
    const key = `rap/${rap.project_name}/kontrak_${formatDate()}${ext}`;

    if (rap.kontrak_file?.key) {
      await deleteFile(rap.kontrak_file.key);
    }

    await uploadBuffer(key, file.buffer);

    rap.kontrak_file = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  rap.project_name = project_name ?? rap.project_name;
  rap.address = address ?? rap.address;
  rap.name = name ?? rap.name;
  rap.phone = phone ?? rap.phone;
  rap.npwp = npwp ?? rap.npwp;
  rap.nilai_pekerjaan = nilai_pekerjaan ?? rap.nilai_pekerjaan;
  rap.nomor_kontrak = nomor_kontrak ?? rap.nomor_kontrak;
  rap.nilai_pekerjaan_addendum =
    nilai_pekerjaan_addendum ?? rap.nilai_pekerjaan_addendum;
  rap.nomor_kontrak_addendum =
    nomor_kontrak_addendum ?? rap.nomor_kontrak_addendum;
  rap.nilai_fix_pekerjaan = nilai_fix_pekerjaan ?? rap.nilai_fix_pekerjaan;

  rap.persiapan_pekerjaan = persiapan_pekerjaan ?? rap.persiapan_pekerjaan;
  rap.operasional_lapangan = operasional_lapangan ?? rap.operasional_lapangan;
  rap.operasional_tenaga_ahli =
    operasional_tenaga_ahli ?? rap.operasional_tenaga_ahli;
  rap.sewa_alat = sewa_alat ?? rap.sewa_alat;
  rap.operasional_lab = operasional_lab ?? rap.operasional_lab;
  rap.pajak = pajak ?? rap.pajak;
  rap.biaya_lain_lain = biaya_lain_lain ?? rap.biaya_lain_lain;

  await rap.save();

  res.status(200).json({ rap });
});

const removeRAP = asyncHandler(async (req, res) => {
  const rap = await RAP.findById(req.params.id);
  if (!rap) throwError('Data RAP tidak ditemukan!', 404);

  await rap.deleteOne();
  res.status(200).json({ message: 'Data berhasil dihapus.' });
});

const getAllClient = asyncHandler(async (req, res) => {
  const client = await Client.find().select('name');

  res.json(client);
});

module.exports = {
  addRAP,
  getAllRAP,
  getRAP,
  updateRAP,
  removeRAP,
  getAllClient
};
