const DEFAULT_MAX_KEYS = 10_000;
const attempts = new Map();

const readPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_KEYS = readPositiveInteger(process.env.AUTH_RATE_LIMIT_MAX_KEYS, DEFAULT_MAX_KEYS);

const removeExpiredEntries = (now = Date.now()) => {
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
};

const cleanupTimer = setInterval(removeExpiredEntries, 60_000);
cleanupTimer.unref?.();

const getClientKey = (req, policyName) => {
  const address = req.ip || req.socket?.remoteAddress || 'unknown';
  return `${policyName}:${address}`;
};

export const createAuthRateLimiter = ({
  policyName,
  maxAttempts,
  windowMs,
  message,
  skipSuccessfulRequests = false,
}) => {
  const configuredMax = readPositiveInteger(
    process.env[`AUTH_RATE_LIMIT_${policyName.toUpperCase()}_MAX`],
    maxAttempts
  );
  const configuredWindowMs = readPositiveInteger(
    process.env[`AUTH_RATE_LIMIT_${policyName.toUpperCase()}_WINDOW_MS`],
    windowMs
  );

  return (req, res, next) => {
    const now = Date.now();
    const key = getClientKey(req, policyName);
    let entry = attempts.get(key);

    if (!entry || entry.resetAt <= now) {
      if (attempts.size >= MAX_KEYS) removeExpiredEntries(now);
      if (attempts.size >= MAX_KEYS) attempts.delete(attempts.keys().next().value);

      entry = { count: 0, resetAt: now + configuredWindowMs };
      attempts.set(key, entry);
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('RateLimit-Policy', `${configuredMax};w=${Math.ceil(configuredWindowMs / 1000)}`);
    res.setHeader('RateLimit-Limit', configuredMax);
    res.setHeader('RateLimit-Remaining', Math.max(0, configuredMax - entry.count));
    res.setHeader('RateLimit-Reset', retryAfterSeconds);

    if (entry.count >= configuredMax) {
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(429).json({
        code: 'RATE_LIMITED',
        message,
        retryAfterSeconds,
      });
    }

    entry.count += 1;
    res.setHeader('RateLimit-Remaining', Math.max(0, configuredMax - entry.count));

    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400) {
          entry.count = Math.max(0, entry.count - 1);
        }
      });
    }

    return next();
  };
};

export const loginRateLimiter = createAuthRateLimiter({
  policyName: 'login',
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  message: 'Too many failed login attempts. Please try again later.',
  skipSuccessfulRequests: true,
});

export const registrationOtpRateLimiter = createAuthRateLimiter({
  policyName: 'registration_otp',
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
  message: 'Too many failed verification attempts. Please try again later.',
  skipSuccessfulRequests: true,
});

export const passwordResetRequestRateLimiter = createAuthRateLimiter({
  policyName: 'password_reset_request',
  maxAttempts: 3,
  windowMs: 60 * 60 * 1000,
  message: 'Too many password reset requests. Please try again later.',
});

export const passwordResetOtpRateLimiter = createAuthRateLimiter({
  policyName: 'password_reset_otp',
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
  message: 'Too many failed verification attempts. Please try again later.',
  skipSuccessfulRequests: true,
});

export const clearAuthRateLimitStore = () => attempts.clear();
