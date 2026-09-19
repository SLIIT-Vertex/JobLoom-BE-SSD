import { body } from 'express-validator';
import { PUBLIC_REGISTRATION_ROLES } from './user.constants.js';

export const registerValidation = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('role').isIn(PUBLIC_REGISTRATION_ROLES).withMessage('Role must be job_seeker or employer'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('location.village').notEmpty().withMessage('Village is required'),
  body('location.district').notEmpty().withMessage('District is required'),
  body('location.province').notEmpty().withMessage('Province is required'),
];

export const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const updateProfileValidation = [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().notEmpty().withMessage('Phone number cannot be empty'),
];

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),
];
