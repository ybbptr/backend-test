const multer = require('multer');

const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('Hanya file PDF yang diizinkan!'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // Max 2MB
  }
});

module.exports = upload;
