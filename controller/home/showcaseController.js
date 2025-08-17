const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Showcase = require('../../model/showcaseModel');

const addShowcase = asyncHandler(async (req, res) => {
  const { project_name, location, imgUrl, date_start, date_end } =
    req.body || {};

  if (!project_name || !location)
    throwError('Field project_name dan location harus diisi', 400);

  const showcase = await Showcase.create({
    project_name,
    location,
    imgUrl,
    date_start,
    date_end
  });

  res.status(201).json(showcase);
});

const getShowcases = asyncHandler(async (req, res) => {
  const showcases = await Showcase.find();
  res.status(200).json(showcases);
});

const getShowcase = asyncHandler(async (req, res) => {
  const showcase = await Showcase.findById(req.params.id);
  if (!showcase) throwError('Showcase tidak ditemukan!', 400);

  res.status(200).json(showcase);
});

const removeShowcase = asyncHandler(async (req, res) => {
  const showcase = await Showcase.findById(req.params.id);
  if (!showcase) throwError('Showcase tidak ditemukan!', 400);

  await showcase.deleteOne();
  res.status(200).json({ message: 'Showcase berhasil dihapus.' });
});

const updateShowcase = asyncHandler(async (req, res) => {
  const { project_name, location, imgUrl, date_start, date_end } =
    req.body || {};

  const showcase = await Showcase.findById(req.params.id);
  if (!showcase) throwError('Showcase tidak ditemukan!', 404);

  showcase.project_name = project_name || showcase.project_name;
  showcase.location = location || showcase.location;
  showcase.imgUrl = imgUrl || showcase.imgUrl;
  showcase.date_start = date_start || showcase.date_start;
  showcase.date_end = date_end || showcase.date_end;

  await showcase.save();
  res.status(200).json(showcase);
});

module.exports = {
  addShowcase,
  getShowcases,
  getShowcase,
  removeShowcase,
  updateShowcase
};
