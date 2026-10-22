const multer = require('multer');
const path = require('path');

// Memory storage so our StorageProvider can handle destination (local disk or S3 buffer)
const storage = multer.memoryStorage();

const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 25;

const upload = multer({
  storage: storage,
  limits: {
    fileSize: maxFileSizeMB * 1024 * 1024 // e.g. 25MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, documents, zip, logs, pdf, and spreadsheets (xlsx, xls, csv)
    const allowedExtensions = /jpeg|jpg|png|gif|svg|pdf|doc|docx|txt|json|zip|tar|gz|xlsx|xls|csv/;
    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    
    if (extname) {
      return cb(null, true);
    }
    cb(new Error(`File format is not supported. Allowed formats: images, pdf, documents, zip, txt, xlsx, xls, csv.`));
  }
});

// Dedicated task attachment upload with strict 200KB limit
const taskAttachmentUpload = multer({
  storage: storage,
  limits: {
    fileSize: 200 * 1024 // 200 KB limit per user requirement
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = /jpeg|jpg|png|gif|svg|pdf|doc|docx|txt|json|zip|tar|gz|xlsx|xls|csv/;
    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    
    if (extname) {
      return cb(null, true);
    }
    cb(new Error(`File format is not supported. Allowed formats: images, pdf, documents, zip, txt, xlsx, xls, csv.`));
  }
});

upload.taskAttachmentUpload = taskAttachmentUpload;

module.exports = upload;
