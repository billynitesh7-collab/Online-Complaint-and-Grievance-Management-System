const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

// Ensure destination uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Whitelist of allowed extensions and MIME types
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

// Magic bytes for file signature validation
const MAGIC_NUMBERS = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    cb(null, randomName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(mime)) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        'Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.'
      )
    );
  }
};

const maxFileSize = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5) * 1024 * 1024;

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSize,
    files: 3,
  },
}).array('attachments', 3);

/**
 * Middleware wrapping Multer with standardized JSON error responses
 */
const uploadMiddleware = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          status: 'error',
          message: `File size exceeds the maximum limit of ${process.env.MAX_FILE_SIZE_MB || 5} MB.`,
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          status: 'error',
          message: err.message || 'Maximum 3 attachments allowed.',
        });
      }
      return res.status(400).json({
        status: 'error',
        message: err.message,
      });
    } else if (err) {
      return res.status(400).json({
        status: 'error',
        message: err.message || 'Failed to process file upload.',
      });
    }

    // Secondary validation: verify file signatures (magic bytes)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const isValidSignature = await checkMagicBytes(file.path);
        if (!isValidSignature) {
          // Remove all files uploaded during this failed request
          for (const f of req.files) {
            try {
              if (fs.existsSync(f.path)) {
                await fs.promises.unlink(f.path);
              }
            } catch (unlinkErr) {
              console.error('Failed to unlink invalid file:', unlinkErr);
            }
          }
          return res.status(400).json({
            status: 'error',
            message: `File "${file.originalname}" has invalid content and does not match the allowed PDF, JPG, or PNG signature.`,
          });
        }
      }
    }

    next();
  });
};

/**
 * Checks file magic bytes from disk
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function checkMagicBytes(filePath) {
  let fileHandle;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await fileHandle.read(buffer, 0, 8, 0);
    if (bytesRead < 4) return false;

    // Check PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return true;
    }
    // Check PNG
    if (
      bytesRead >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return true;
    }
    // Check JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return true;
    }

    return false;
  } catch (err) {
    console.error('Error reading magic bytes:', err);
    return false;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

module.exports = {
  uploadMiddleware,
  UPLOAD_DIR,
};
