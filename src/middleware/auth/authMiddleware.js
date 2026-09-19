import { verifyToken } from '../../utils/jwt.utils.js';
import User from '../../modules/users/user.model.js';
import { isTokenRevoked } from '../../modules/users/token-revocation.service.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = verifyToken(token);

      if (await isTokenRevoked(decoded.jti)) {
        return res.status(401).json({ message: 'Not authorized, token revoked' });
      }

      req.user = await User.findById(decoded.userId).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      req.auth = decoded;

      return next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  return res.status(401).json({ message: 'Not authorized, no token' });
};
