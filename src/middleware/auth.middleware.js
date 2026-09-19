import { verifyToken } from '../utils/jwt.utils.js';
import HttpException from '../models/http-exception.js';
import { HTTP_STATUS } from '../config/server.config.js';
import { isTokenRevoked } from '../modules/users/token-revocation.service.js';

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user data to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new HttpException(HTTP_STATUS.UNAUTHORIZED, 'No authorization token provided');
    }

    // Check if token format is "Bearer <token>"
    if (!authHeader.startsWith('Bearer ')) {
      throw new HttpException(
        HTTP_STATUS.UNAUTHORIZED,
        'Invalid token format. Use: Bearer <token>'
      );
    }

    // Extract token
    const token = authHeader.substring(7);

    if (!token) {
      throw new HttpException(HTTP_STATUS.UNAUTHORIZED, 'Token is empty');
    }

    // Verify token
    const decoded = verifyToken(token);

    if (await isTokenRevoked(decoded.jti)) {
      throw new HttpException(HTTP_STATUS.UNAUTHORIZED, 'Token has been revoked');
    }

    // Attach user data to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
    req.auth = decoded;

    next();
  } catch (error) {
    if (error instanceof HttpException) {
      next(error);
    } else {
      // Token verification errors
      next(
        new HttpException(HTTP_STATUS.UNAUTHORIZED, error.message || 'Invalid or expired token')
      );
    }
  }
};

/**
 * Optional authentication middleware
 * Attaches user data if token is present, but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);

      if (await isTokenRevoked(decoded.jti)) {
        return next();
      }

      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };
      req.auth = decoded;
    }

    next();
  } catch (error) {
    console.error(error);
    // If token is invalid, just continue without user data
    next();
  }
};

export default authenticate;
