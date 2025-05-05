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

// const multer = require('multer');
// const path = require('path');

// const imgUploader = (folderName) => {
//   const destPath = path.join('public/assets/images', folderName);

//   const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//       cb(null, destPath);
//     },
//     filename: (req, file, cb) => {
//       cb(null, Date.now() + '-' + file.originalname);
//     }
//   });

//   const upload = multer({
//     storage: storage,
//     limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
//     fileFilter: (req, file, cb) => {
//       const fileTypes = /jpeg|jpg|png/;
//       const mimeType = fileTypes.test(file.mimetype);
//       const extname = fileTypes.test(
//         path.extname(file.originalname).toLowerCase()
//       );

//       if (mimeType && extname) {
//         return cb(null, true);
//       } else {
//         cb(new Error('Gambar hanya boleh dalam format jpg, jpeg, png!'));
//       }
//     }
//   });

//   return upload;
// };

// module.exports = imgUploader;
