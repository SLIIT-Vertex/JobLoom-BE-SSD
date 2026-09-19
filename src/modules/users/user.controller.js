import fs from 'fs';
import userService from './user.service.js';
import { validationResult } from 'express-validator';
import { uploadToCloudinary } from '../../services/upload.service.js';

/**
 * @desc    Register a new user
 * @route   POST /api/users/register
 * @access  Public
 */
export const registerUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await userService.registerUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Verify user registration OTP
 * @route   POST /api/users/verify-registration
 * @access  Public
 */
export const verifyRegistration = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required' });
    }
    const result = await userService.verifyRegistration(phone, otp);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Forgot password - Send OTP
 * @route   POST /api/users/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }
    const result = await userService.forgotPassword(phone);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Verify password reset OTP
 * @route   POST /api/users/verify-password-reset
 * @access  Public
 */
export const verifyPasswordReset = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required' });
    }
    const result = await userService.verifyPasswordReset(phone, otp);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Reset password
 * @route   POST /api/users/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res) => {
  try {
    const { phone, resetToken, password } = req.body;
    if (!phone || !resetToken || !password) {
      return res.status(400).json({ message: 'Phone, resetToken, and password are required' });
    }
    const result = await userService.resetPassword(phone, resetToken, password);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Auth user & get token
 * @route   POST /api/users/login
 * @access  Public
 */
export const loginUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, password } = req.body;
    const user = await userService.loginUser(email, password);
    res.json(user);
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

/**
 * @desc    Revoke the current authenticated JWT
 * @route   POST /api/users/logout
 * @access  Private
 */
export const logoutUser = async (req, res) => {
  const result = await userService.logoutUser(req.auth);
  res.json(result);
};

/**
 * @desc    Get user profile
 * @route   GET /api/users/profile/:id
 * @access  Private
 */
export const getUserProfile = async (req, res) => {
  try {
    const user = await userService.getUserProfile(req.params.id);
    // Ensure user can only access their own profile unless admin?
    // The requirement says "Get user profile by ID", protected route.
    // Usually /profile or /me returns own profile, but this is /profile/:id.
    // The requirement also says "Role-based data filtering" but detailed requirement for /profile/:id is sketchy.
    // However, there is GET /api/users/me for current authenticated user.
    // I will implement /me separately or alias it.

    res.json(user);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/users/me
 * @access  Private
 */
export const getMyProfile = async (req, res) => {
  try {
    const user = await userService.getUserProfile(req.user._id);
    res.json(user);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
export const updateUserProfile = async (req, res) => {
  // Handle file uploads if present
  const updates = { ...req.body };
  if (req.files) {
    // Upload CVs
    if (req.files.cv) {
      const uploadedCVs = [];

      for (const file of req.files.cv) {
        try {
          const result = await uploadToCloudinary(file.path, 'jobloom/cvs', file.mimetype);

          uploadedCVs.push({
            name: file.originalname || 'CV',
            url: result.url,
          });
        } finally {
          try {
            fs.unlinkSync(file.path);
          } catch {
            // ignore
          }
        }
      }

      updates.newCVs = uploadedCVs;
    }

    // Upload Profile Image
    if (req.files.profileImage) {
      const file = req.files.profileImage[0];

      try {
        const result = await uploadToCloudinary(file.path, 'jobloom/profile_images', file.mimetype);

        updates.profileImage = result.url;
      } finally {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
      }
    }
  }

  // Parse JSON strings if they are sent as strings (common with formdata)
  if (typeof updates.skills === 'string') {
    try {
      updates.skills = JSON.parse(updates.skills);
    } catch {
      // Ignore parse error, use as is or handle
    }
  }

  if (typeof updates.experience === 'string') {
    try {
      updates.experience = JSON.parse(updates.experience);
    } catch {
      // Ignore parse error
    }
  }

  if (typeof updates.location === 'string') {
    try {
      updates.location = JSON.parse(updates.location);
    } catch {
      // Ignore parse error
    }
  }

  try {
    const updatedUser = await userService.updateUserProfile(req.user, updates);
    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Delete user account
 * @route   DELETE /api/users/account
 * @access  Private
 */
export const deleteUser = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Password is required to delete account' });
    }
    await userService.deleteUser(req.user._id, password);
    res.json({ message: 'User removed' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export default {
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
};
