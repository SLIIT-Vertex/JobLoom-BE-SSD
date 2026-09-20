import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const REQUIRED_ENV_VARS = Object.freeze(['MONGODB_URI', 'JWT_SECRET']);
const MINIMUM_JWT_SECRET_LENGTH = 32;
const KNOWN_INSECURE_JWT_SECRETS = new Set([
  'your_jwt_secret',
  'your-super-secret-jwt-key-change-in-production',
  'staging_jwt_secret_change_me_in_production',
  'your_very_strong_jwt_secret_here_min_32_chars',
  '<replace-with-a-unique-random-secret>',
]);

const isInvalidJwtSecret = (value) =>
  typeof value !== 'string' ||
  value.trim().length < MINIMUM_JWT_SECRET_LENGTH ||
  KNOWN_INSECURE_JWT_SECRETS.has(value.trim());

export const validateRequiredEnvVars = (environment = process.env) => {
  const invalid = REQUIRED_ENV_VARS.filter((key) => {
    const value = environment[key];
    return key === 'JWT_SECRET' ? isInvalidJwtSecret(value) : !value?.trim();
  });

  if (invalid.length > 0) {
    throw new Error(
      `Missing or invalid required environment variables: ${invalid.join(', ')}\n` +
        'Please check your .env file.'
    );
  }
};

/**
 * Environment Configuration Service
 * Centralized configuration management with validation
 */
class EnvConfig {
  constructor() {
    // Skip validation in test environment - tests use mocks
    if (process.env.NODE_ENV !== 'test') {
      this.validateRequiredEnvVars();
    }
  }

  /**
   * Validate that all required environment variables are set
   */
  validateRequiredEnvVars() {
    validateRequiredEnvVars();
  }

  /**
   * Get environment (development, production, test)
   */
  get env() {
    return process.env.NODE_ENV || 'development';
  }

  /**
   * Check if running in development mode
   */
  get isDevelopment() {
    return this.env === 'development';
  }

  /**
   * Check if running in production mode
   */
  get isProduction() {
    return this.env === 'production';
  }

  /**
   * Check if running in test mode
   */
  get isTest() {
    return this.env === 'test';
  }

  /**
   * Get server port
   */
  get port() {
    return parseInt(process.env.PORT, 10) || 3000;
  }

  /**
   * Get MongoDB URI
   */
  get mongodbUri() {
    return process.env.MONGODB_URI;
  }

  /**
   * Get log level
   */
  get logLevel() {
    return process.env.LOG_LEVEL || 'info';
  }

  /**
   * Get JWT Secret
   */
  get jwtSecret() {
    if (isInvalidJwtSecret(process.env.JWT_SECRET)) {
      throw new Error(
        `JWT_SECRET must be at least ${MINIMUM_JWT_SECRET_LENGTH} characters and must not use a known placeholder`
      );
    }

    return process.env.JWT_SECRET;
  }

  /**
   * Get JWT Expiration
   */
  get jwtExpiresIn() {
    return process.env.JWT_EXPIRES_IN || '7d';
  }

  /**
   * Get Text.lk API Base URL
   */
  get textLkApiBaseUrl() {
    return process.env.TEXT_LK_API_BASE_URL || 'https://app.text.lk/api/v3';
  }

  /**
   * Get Text.lk API Token
   */
  get textLkApiToken() {
    return process.env.TEXT_LK_API_TOKEN;
  }

  /**
   * Get Text.lk Sender ID
   */
  get textLkSenderId() {
    return process.env.TEXT_LK_SENDER_ID || 'JobLoom';
  }

  /**
   * Cohere API key for job description generation
   */
  get cohereApiKey() {
    return process.env.COHERE_API_KEY;
  }

  /**
   * Cohere API base URL
   */
  get cohereApiBaseUrl() {
    return process.env.COHERE_API_BASE_URL || 'https://api.cohere.com/v2';
  }

  /**
   * Cohere model for job description generation
   */
  get cohereModel() {
    return process.env.COHERE_MODEL || 'command-r-plus';
  }

  /**
   * Public web app origin (no trailing slash required) — used in transactional emails
   */
  get frontendUrl() {
    return process.env.FRONTEND_URL || '';
  }

  /** Whether Nodemailer SMTP credentials are present */
  get isSmtpConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  get smtpHost() {
    return process.env.SMTP_HOST || '';
  }

  get smtpPort() {
    const p = parseInt(process.env.SMTP_PORT, 10);
    return Number.isFinite(p) && p > 0 ? p : 587;
  }

  get smtpUser() {
    return process.env.SMTP_USER || '';
  }

  get smtpPass() {
    return process.env.SMTP_PASS || '';
  }

  get smtpFromName() {
    return process.env.SMTP_FROM_NAME || 'JobLoom';
  }

  /**
   * Envelope From address. For Gmail (and most hosts), this must match the
   * authenticated SMTP_USER unless you use "Send mail as" / verified aliases.
   * Defaults to SMTP_USER when SMTP_FROM_EMAIL is unset.
   */
  get smtpFromEmail() {
    return process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@jobloom.lk';
  }

  /**
   * When set and NODE_ENV=test, transactional mail `to` is rewritten to this address (see email.service).
   */
  get smtpTestRedirectTo() {
    return (process.env.SMTP_TEST_RECIPIENT || '').trim();
  }

  /**
   * Get all configuration as an object
   */
  getAll() {
    return {
      env: this.env,
      isDevelopment: this.isDevelopment,
      isProduction: this.isProduction,
      isTest: this.isTest,
      port: this.port,
      mongodbUri: this.mongodbUri,
      logLevel: this.logLevel,
      textLkApiBaseUrl: this.textLkApiBaseUrl,
      textLkApiToken: this.textLkApiToken ? '***' : undefined,
      textLkSenderId: this.textLkSenderId,
      cohereApiKey: this.cohereApiKey ? '***' : undefined,
      cohereApiBaseUrl: this.cohereApiBaseUrl,
      cohereModel: this.cohereModel,
      frontendUrl: this.frontendUrl || undefined,
      isSmtpConfigured: this.isSmtpConfigured,
      smtpHost: this.smtpHost || undefined,
      smtpPort: this.smtpPort,
      smtpUser: this.smtpUser || undefined,
      smtpPass: this.smtpPass ? '***' : undefined,
      smtpFromName: this.smtpFromName,
      smtpFromEmail: this.smtpFromEmail,
    };
  }
}

// Export singleton instance
export default new EnvConfig();
