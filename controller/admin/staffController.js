const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Staff = require('../../model/staffModel');
const { uploadBuffer, deleteFile, getFileUrl } = require('../../utils/wasabi');
const path = require('path');
const formatDate = require('../../utils/formatDate');

const addStaff = asyncHandler(async (req, res) => {
  const { staff_name, position, description } = req.body || {};

  if (!staff_name || !position) throwError('Field ini harus diisi', 400);

  let imgMeta = null;
  let gifMeta = null;

  if (req.files?.img) {
    const file = req.files.img[0];
    const ext = path.extname(file.originalname);
    const key = `Staff/${staff_name}/img_${formatDate()}${ext}`;

    await uploadBuffer(key, file.buffer, { contentType: file.mimetype });

    imgMeta = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  if (req.files?.gif) {
    const file = req.files.gif[0];
    const ext = path.extname(file.originalname);
    const key = `staff/${staff_name}/gif_${formatDate()}${ext}`;

    await uploadBuffer(key, file.buffer, { contentType: file.mimetype });

    gifMeta = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  const staff = await Staff.create({
    staff_name,
    position,
    description,
    img: imgMeta,
    gif: gifMeta
  });

  res.status(201).json({
    message: 'Staff berhasil ditambahkan',
    data: staff
  });
});

const getStaffs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { staff_name, position, search, sort } = req.query;

  const filter = {};
  if (staff_name) filter.staff_name = { $regex: staff_name, $options: 'i' };
  if (position) filter.position = { $regex: position, $options: 'i' };
  if (search) {
    filter.$or = [
      { staff_name: { $regex: search, $options: 'i' } },
      { position: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const staffs = await Staff.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  const totalItems = await Staff.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  const staffsWithUrl = await Promise.all(
    staffs.map(async (s) => {
      let imgUrl = null;
      let gifUrl = null;

      if (s.img?.key) imgUrl = await getFileUrl(s.img.key, 86400);
      if (s.gif?.key) gifUrl = await getFileUrl(s.gif.key, 86400);

      return { ...s, imgUrl, gifUrl };
    })
  );

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages,
    sort: sortOption,
    data: staffsWithUrl
  });
});

const getStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findById(req.params.id);
  if (!staff) throwError('Staff tidak terdaftar!', 400);

  let imgUrl = null;
  let gifUrl = null;
  if (staff.img?.key) imgUrl = await getFileUrl(staff.img.key, 86400);
  if (staff.gif?.key) gifUrl = await getFileUrl(staff.gif.key, 86400);

  res.status(200).json({
    ...staff.toObject(),
    imgUrl,
    gifUrl
  });
});

const removeStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findById(req.params.id);
  if (!staff) throwError('Staff tidak terdaftar!', 400);

  if (staff.img?.key) await deleteFile(staff.img.key);
  if (staff.gif?.key) await deleteFile(staff.gif.key);

  await staff.deleteOne();
  res.status(200).json({ message: 'Staff berhasil dihapus.' });
});

const updateStaff = asyncHandler(async (req, res) => {
  const { staff_name, position, description } = req.body || {};

  const staff = await Staff.findById(req.params.id);
  if (!staff) throwError('Staff tidak ditemukan!', 404);

  if (staff_name) staff.staff_name = staff_name;
  if (position) staff.position = position;
  if (description) staff.description = description;

  if (req.files?.img) {
    const file = req.files.img[0];
    const ext = path.extname(file.originalname);

    if (staff.img?.key) await deleteFile(staff.img.key);

    const key = `staff/${staff.staff_name}/img_${formatDate()}${ext}`;
    await uploadBuffer(key, file.buffer, { contentType: file.mimetype });

    staff.img = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  // update gif
  if (req.files?.gif) {
    const file = req.files.gif[0];
    const ext = path.extname(file.originalname);

    if (staff.gif?.key) await deleteFile(staff.gif.key);

    const key = `Staff/${staff.staff_name}/gif_${formatDate()}${ext}`;
    await uploadBuffer(key, file.buffer, { contentType: file.mimetype });

    staff.gif = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  await staff.save();
  res.status(200).json({
    message: 'Staff berhasil diperbarui',
    data: staff
  });
});

module.exports = {
  addStaff,
  getStaffs,
  getStaff,
  removeStaff,
  updateStaff
};
