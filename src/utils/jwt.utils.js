import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import HttpException from '../models/http-exception.js';

/**
 * JWT Utility Functions
 * Handles token generation and verification for authentication
 */

/**
 * Generate JWT token
 * @param {Object} payload - User data to encode in token
 * @param {string} payload.userId - User ID
 * @param {string} payload.email - User email
 * @param {string} payload.role - User role (job_seeker, employer, admin)
 * @returns {string} JWT token
 */
export const generateToken = (payload) => {
  const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(payload, jwtSecret, {
    expiresIn,
    jwtid: randomUUID(),
    issuer: 'jobloom-api',
    audience: 'jobloom-client',
  });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export const verifyToken = (token) => {
  const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

  try {
    const decoded = jwt.verify(token, jwtSecret, {
      issuer: 'jobloom-api',
      audience: 'jobloom-client',
    });

    if (!decoded.userId || !decoded.jti || !decoded.exp) {
      throw new HttpException(401, 'Invalid token claims');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new HttpException(401, 'Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new HttpException(401, 'Invalid token');
    }
    throw error;
  }
};

/**
 * Decode JWT token without verification (for debugging)
 * @param {string} token - JWT token to decode
 * @returns {Object} Decoded token payload
 */
export const decodeToken = (token) => {
  return jwt.decode(token);
};

export default {
  generateToken,
  verifyToken,
  decodeToken,
};
