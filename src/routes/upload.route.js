import express from 'express';
import { URL } from 'url';
import multer from 'multer';
import path from 'path';
import { uploadBufferToCloudinary } from '../services/upload.service.js';
import HttpException from '../models/http-exception.js';
import cloudinary from '../config/cloudinary.js';
import { protect } from '../middleware/auth/authMiddleware.js';

const router = express.Router();

const checkFileType = (file, cb) => {
  const allowedExt = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();

  const allowedMime = [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  const ok = allowedExt.includes(ext) && allowedMime.includes(file.mimetype);
  if (ok) return cb(null, true);
  cb(new Error('Only JPG, JPEG, PNG, PDF, DOC, DOCX are allowed!'));
};

const cloudUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => checkFileType(file, cb),
});

const parseCloudinaryDeliveryFromUrl = (rawUrl) => {
  const parsed = new URL(rawUrl);
  const parts = parsed.pathname.split('/').filter(Boolean);

  // Expected patterns:
  // /<cloud_name>/<resource_type>/<delivery_type>/v<version>/<public_id>.<format>
  // /<cloud_name>/<resource_type>/<delivery_type>/<public_id>.<format>
  let idx = 0;
  if (
    parts[idx] &&
    (parts[idx] === process.env.CLOUDINARY_CLOUD_NAME || parts[idx] === process.env.CLOUD_NAME)
  ) {
    idx += 1;
  }

  const resource_type = parts[idx++] || 'image';
  const type = parts[idx++] || 'upload';
  if (parts[idx] && /^v\d+$/.test(parts[idx])) idx += 1;

  const remaining = parts.slice(idx).join('/');
  const lastDot = remaining.lastIndexOf('.');
  const public_id = lastDot > 0 ? remaining.slice(0, lastDot) : remaining;
  const format = lastDot > 0 ? remaining.slice(lastDot + 1) : '';

  return { public_id, format, resource_type, type };
};

// Generate a signed, short-lived download URL for Cloudinary assets.
// This is needed when Cloudinary Asset Access Control blocks direct `res.cloudinary.com/...` access.
router.get('/signed-url', protect, async (req, res) => {
  const { public_id, format, resource_type, type, url, attachment, expiresIn } = req.query;

  let resolved = {
    public_id: typeof public_id === 'string' ? public_id : '',
    format: typeof format === 'string' ? format : '',
    resource_type: typeof resource_type === 'string' ? resource_type : 'image',
    type: typeof type === 'string' ? type : 'upload',
  };

  if (
    (!resolved.public_id || !resolved.format) &&
    typeof url === 'string' &&
    url.startsWith('http')
  ) {
    try {
      const fromUrl = parseCloudinaryDeliveryFromUrl(url);
      resolved = {
        public_id: resolved.public_id || fromUrl.public_id,
        format: resolved.format || fromUrl.format,
        resource_type: resolved.resource_type || fromUrl.resource_type,
        type: resolved.type || fromUrl.type,
      };
    } catch {
      throw new HttpException(400, 'Invalid url');
    }
  }

  if (!resolved.public_id) throw new HttpException(400, 'Missing public_id');
  if (!resolved.format) throw new HttpException(400, 'Missing format');

  const requestedExpires = parseInt(expiresIn, 10);
  const expiresInSec = Number.isFinite(requestedExpires)
    ? Math.min(Math.max(requestedExpires, 30), 3600)
    : 300;

  const expires_at = Math.floor(Date.now() / 1000) + expiresInSec;
  const signedUrl = cloudinary.utils.private_download_url(resolved.public_id, resolved.format, {
    resource_type: resolved.resource_type,
    type: resolved.type,
    expires_at,
    attachment: attachment === 'true',
  });

  res.json({ url: signedUrl, expiresAt: expires_at });
});

router.post('/', protect, cloudUpload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const folder = req.body?.folder;
  try {
    const result = await uploadBufferToCloudinary(req.file.buffer, folder, req.file.mimetype);
    res.json(result);
  } catch (err) {
    const providerMessage = err?.error?.message || err?.message || String(err);
    const providerName = err?.error?.name;
    const providerHttpCode = err?.error?.http_code;

    const isTimeout =
      providerName === 'TimeoutError' ||
      (typeof providerMessage === 'string' && providerMessage.toLowerCase().includes('timeout'));

    throw new HttpException(
      isTimeout ? 504 : 502,
      isTimeout
        ? 'Upload failed: Cloudinary request timed out'
        : `Upload failed: ${providerMessage}`,
      {
        provider: 'cloudinary',
        providerName,
        providerHttpCode,
      }
    );
  }
});

export default router;
