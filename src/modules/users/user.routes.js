import express from 'express';
import {
  registerUser,
  verifyRegistration,
  loginUser,
  logoutUser,
  getUserProfile,
  getMyProfile,
  updateUserProfile,
  deleteUser,
  forgotPassword,
  verifyPasswordReset,
  resetPassword,
} from './user.controller.js';
import { protect } from '../../middleware/auth/authMiddleware.js';
import { registerValidation, loginValidation, updateProfileValidation } from './user.validation.js';
import upload from '../../middleware/uploads/fileUpload.js';
import {
  loginRateLimiter,
  passwordResetOtpRateLimiter,
  passwordResetRequestRateLimiter,
  registrationOtpRateLimiter,
} from '../../middleware/auth-rate-limit.middleware.js';

const router = express.Router();

router.post('/register', registerValidation, registerUser);
router.post('/verify-registration', registrationOtpRateLimiter, verifyRegistration);
router.post('/login', loginRateLimiter, loginValidation, loginUser);
router.post('/logout', protect, logoutUser);
router.post('/forgot-password', passwordResetRequestRateLimiter, forgotPassword);
router.post('/verify-password-reset', passwordResetOtpRateLimiter, verifyPasswordReset);
router.post('/reset-password', resetPassword);

// Protected routes
// Note: protect middleware attaches user to req.user

router.get('/me', protect, getMyProfile);
router.get('/profile/:id', protect, getUserProfile);
router.put(
  '/profile',
  protect,
  upload.fields([
    { name: 'cv', maxCount: 5 },
    { name: 'profileImage', maxCount: 1 },
  ]),
  updateProfileValidation,
  updateUserProfile
);
router.delete('/account', protect, deleteUser);

export default router;
