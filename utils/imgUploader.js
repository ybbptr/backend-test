const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const folderName = req.folder;
    return {
      folder: folderName,
      allowed_formats: ['jpg', 'png', 'jpeg'],
      public_id: Date.now() + '-' + file.originalname
    };
  }
});

const fileFilter = (req, file, cb) => {
  const fileTypes = /jpeg|jpg|png/;
  const isValid = fileTypes.test(file.mimetype);
  if (isValid) {
    cb(null, true);
  } else {
    cb(new Error('Gambar hanya boleh dalam format jpg, jpeg, png!'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5mb
  fileFilter
});

module.exports = upload;
