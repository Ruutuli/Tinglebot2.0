// ------------------- Import multer for file handling -------------------
const multer = require('multer');

// ------------------- Set up in-memory storage for file uploads -------------------
const storage = multer.memoryStorage();

// ------------------- Configure multer for file uploads -------------------
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // limit file size to 5MB
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/; // allowed file types
    const mimetype = filetypes.test(file.mimetype); // check mimetype
    const extname = filetypes.test(file.originalname.toLowerCase()); // check extension

    if (mimetype && extname) {
      return cb(null, true); // valid file
    }
    cb('Error: File upload only supports the following filetypes - ' + filetypes); // invalid file
  },
});

// ------------------- Export the upload configuration -------------------
module.exports = upload;
