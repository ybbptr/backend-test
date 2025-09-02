const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Showcase = require('../../model/showcaseModel');
const { uploadBuffer, deleteFile, getFileUrl } = require('../../utils/wasabi');
const path = require('path');
const formatDate = require('../../utils/formatDate');

const addShowcase = asyncHandler(async (req, res) => {
  const { project_name, location, date_start, date_end } = req.body || {};

  if (!project_name || !location)
    throwError('Field project_name dan location harus diisi', 400);

  let imgMeta = null;

  if (req.file) {
    const file = req.file;
    const ext = path.extname(file.originalname);
    const key = `showcase/${project_name}/img_${formatDate()}${ext}`;

    await uploadBuffer(key, file.buffer);

    imgMeta = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  const showcase = await Showcase.create({
    project_name,
    location,
    img: imgMeta,
    date_start,
    date_end
  });

  res.status(201).json({
    message: 'Showcase berhasil ditambahkan',
    data: showcase
  });
});

const getShowcases = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { project_name, location, search, sort } = req.query;

  const filter = {};
  if (project_name)
    filter.project_name = { $regex: project_name, $options: 'i' };
  if (location) filter.location = { $regex: location, $options: 'i' };
  if (search) {
    filter.$or = [
      { project_name: { $regex: search, $options: 'i' } },
      { location: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const showcases = await Showcase.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  const totalItems = await Showcase.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  const showcasesWithUrl = await Promise.all(
    showcases.map(async (s) => {
      let imgUrl = null;
      if (s.img?.key) imgUrl = await getFileUrl(s.img.key, 86400);

      return { ...s, imgUrl };
    })
  );

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages,
    sort: sortOption,
    data: showcasesWithUrl
  });
});

const getShowcase = asyncHandler(async (req, res) => {
  const showcase = await Showcase.findById(req.params.id);
  if (!showcase) throwError('Showcase tidak ditemukan!', 400);

  let imgUrl = null;
  if (showcase.img?.key) imgUrl = await getFileUrl(showcase.img.key, 86400);

  res.status(200).json({
    ...showcase.toObject(),
    imgUrl
  });
});

const updateShowcase = asyncHandler(async (req, res) => {
  const { project_name, location, date_start, date_end } = req.body || {};

  const showcase = await Showcase.findById(req.params.id);
  if (!showcase) throwError('Showcase tidak ditemukan!', 404);

  if (project_name) showcase.project_name = project_name;
  if (location) showcase.location = location;
  if (date_start) showcase.date_start = date_start;
  if (date_end) showcase.date_end = date_end;

  if (req.file) {
    const file = req.file;
    const ext = path.extname(file.originalname);

    if (showcase.img?.key) {
      await deleteFile(showcase.img.key);
    }

    const key = `showcase/${showcase.project_name}/img_${formatDate()}${ext}`;
    await uploadBuffer(key, file.buffer);

    showcase.img = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  await showcase.save();
  res.status(200).json({
    message: 'Showcase berhasil diperbarui',
    data: showcase
  });
});

const removeShowcase = asyncHandler(async (req, res) => {
  const showcase = await Showcase.findById(req.params.id);
  if (!showcase) throwError('Showcase tidak ditemukan!', 400);

  if (showcase.img?.key) {
    await deleteFile(showcase.img.key);
  }

  await showcase.deleteOne();
  res.status(200).json({ message: 'Showcase berhasil dihapus.' });
});

module.exports = {
  addShowcase,
  getShowcases,
  getShowcase,
  removeShowcase,
  updateShowcase
};
