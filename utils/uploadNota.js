const multer = require('multer');
const throwError = require('../utils/throwError');

// pakai memoryStorage biar langsung bisa dikirim ke Wasabi
const storage = multer.memoryStorage();

// setup multer
const uploadNota = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5MB per file
  fileFilter: (req, file, cb) => {
    // nota boleh gambar atau pdf
    if (
      !(
        file.mimetype.startsWith('image/') ||
        file.mimetype === 'application/pdf'
      )
    ) {
      return cb(
        throwError('File nota hanya boleh berupa gambar atau PDF!', 400)
      );
    }
    cb(null, true);
  }
}).any(); // handle semua field

// rapikan jadi { nota_1: [file], nota_2: [file], ... }
function filterNotaFiles(req, res, next) {
  if (req.files && Array.isArray(req.files)) {
    const grouped = {};
    for (const f of req.files) {
      if (f.fieldname.startsWith('nota_')) {
        if (!grouped[f.fieldname]) grouped[f.fieldname] = [];
        grouped[f.fieldname].push(f);
      }
    }
    req.files = grouped;
  }
  next();
}

module.exports = { uploadNota, filterNotaFiles };
