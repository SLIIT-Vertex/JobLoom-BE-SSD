import { jest } from '@jest/globals';

// Mock factories
const mockUserModel = {
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
};

const mockSmsService = {
  sendOtp: jest.fn().mockResolvedValue({ success: true }),
  sendSms: jest.fn().mockResolvedValue({ success: true }),
};

// Use simple objects/functions for jsonwebtoken mock to ensure ESM compatibility
const mockedJwt = {
  sign: () => 'mocktoken',
  verify: () => ({ id: 'userid' }),
};

const mockEnvConfig = {
  jwtSecret: 'testsecret',
  jwtExpiresIn: '1h',
};

// Module-level mocks
jest.unstable_mockModule('../../src/modules/users/user.model.js', () => ({
  default: mockUserModel,
}));

jest.unstable_mockModule('../../src/services/sms.service.js', () => mockSmsService);

jest.unstable_mockModule('../../src/config/env.config.js', () => ({
  default: mockEnvConfig,
}));

jest.unstable_mockModule('jsonwebtoken', () => ({
  default: mockedJwt,
  sign: mockedJwt.sign,
}));

// Import service AFTER mocks are registered
const { registerUser, verifyRegistration, forgotPassword, loginUser, getUserProfile } =
  await import('../../src/modules/users/user.service.js');

/** Build a findById(...).select(fieldString) chain resolving to `user` */
const mockFindByIdSelect = (user) => {
  const select = jest.fn().mockResolvedValue(user);
  mockUserModel.findById.mockReturnValue({ select });
  return select;
};

describe('User Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    test('should register a user and send OTP', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '94712345678',
        password: 'password123',
        role: 'job_seeker',
        location: { village: 'A', district: 'B', province: 'C' },
        isVerified: true,
        isActive: false,
        passwordResetOtp: 'attacker-controlled',
      };

      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue({
        ...userData,
        _id: 'userid123',
        isVerified: false,
      });

      const result = await registerUser(userData);

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: userData.email });
      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          password: userData.password,
          phone: userData.phone,
          role: userData.role,
          location: userData.location,
          isVerified: false,
          isActive: true,
        })
      );
      expect(mockUserModel.create.mock.calls[0][0]).not.toHaveProperty('passwordResetOtp');
      expect(mockSmsService.sendOtp).toHaveBeenCalledWith(userData.phone, expect.any(String));
      expect(result).toHaveProperty('_id', 'userid123');
      expect(result.isVerified).toBe(false);
    });

    test('should throw error if user exists', async () => {
      mockUserModel.findOne.mockResolvedValue({ _id: 'existing' });

      await expect(registerUser({ email: 'john@example.com', role: 'job_seeker' })).rejects.toThrow(
        'User already exists'
      );
    });

    test('should reject privileged roles', async () => {
      await expect(
        registerUser({
          email: 'attack@example.com',
          phone: '94712345670',
          role: 'admin',
        })
      ).rejects.toThrow('Invalid role for public registration');

      expect(mockUserModel.findOne).not.toHaveBeenCalled();
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyRegistration', () => {
    test('should verify user and return token', async () => {
      const mockUser = {
        _id: 'userid123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '94712345678',
        isVerified: false,
        save: jest.fn().mockResolvedValue(true),
      };

      mockUserModel.findOne.mockResolvedValue(mockUser);

      const result = await verifyRegistration('94712345678', '123456');

      expect(mockUser.isVerified).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
      expect(result).toHaveProperty('token', 'mocktoken');
    });

    test('should throw error for invalid OTP', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(verifyRegistration('94712345678', 'wrong')).rejects.toThrow(
        'Invalid or expired OTP'
      );
    });
  });

  describe('forgotPassword', () => {
    test('should send OTP for forgot password', async () => {
      const mockUser = {
        phone: '94712345678',
        save: jest.fn().mockResolvedValue(true),
      };

      mockUserModel.findOne.mockResolvedValue(mockUser);

      const result = await forgotPassword('94712345678');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ phone: '94712345678' });
      expect(mockUser.passwordResetOtp).toBeDefined();
      expect(mockSmsService.sendOtp).toHaveBeenCalledWith('94712345678', expect.any(String));
      expect(result.message).toBe('OTP sent to your phone');
    });
  });

  describe('loginUser', () => {
    test('should login user and return token', async () => {
      const mockUser = {
        _id: 'userid123',
        email: 'john@example.com',
        comparePassword: jest.fn().mockResolvedValue(true),
      };

      mockUserModel.findOne.mockResolvedValue(mockUser);

      const result = await loginUser('john@example.com', 'password123');

      expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
      expect(result).toHaveProperty('token', 'mocktoken');
    });

    test('should throw error for invalid credentials', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(loginUser('wrong@test.com', 'pass')).rejects.toThrow(
        'Invalid email or password'
      );
    });
  });

  // V4 — Profile IDOR / Sensitive Data Exposure (fix regression tests)

  describe('getUserProfile', () => {
    const ownerId = 'user-owner-id';
    const otherId = 'user-other-id';

    test('should select "-password" only when requester is the profile owner', async () => {
      const select = mockFindByIdSelect({ _id: ownerId, firstName: 'Owner' });

      await getUserProfile(ownerId, { _id: ownerId, role: 'job_seeker' });

      expect(mockUserModel.findById).toHaveBeenCalledWith(ownerId);
      expect(select).toHaveBeenCalledWith('-password');
    });

    test('should select "-password" only when requester is an admin', async () => {
      const select = mockFindByIdSelect({ _id: otherId, firstName: 'Victim' });

      await getUserProfile(otherId, { _id: 'admin-id', role: 'admin' });

      expect(select).toHaveBeenCalledWith('-password');
    });

    test('SECURITY: should select only public-safe fields when requester is a different, non-admin user', async () => {
      const select = mockFindByIdSelect({ _id: otherId, firstName: 'Victim' });

      await getUserProfile(otherId, { _id: 'attacker-id', role: 'job_seeker' });

      const fieldArg = select.mock.calls[0][0];
      expect(fieldArg).not.toBe('-password');
      expect(fieldArg).not.toContain('passwordResetOtp');
      expect(fieldArg).not.toContain('verificationOtp');
      expect(fieldArg).not.toContain('phone');
      expect(fieldArg).not.toContain('location');
    });

    test('SECURITY: should select only public-safe fields when no requester is supplied (unauthenticated)', async () => {
      const select = mockFindByIdSelect({ _id: otherId, firstName: 'Victim' });

      await getUserProfile(otherId);

      const fieldArg = select.mock.calls[0][0];
      expect(fieldArg).not.toBe('-password');
      expect(fieldArg).not.toContain('passwordResetOtp');
    });

    test('should throw error when user is not found', async () => {
      mockFindByIdSelect(null);

      await expect(getUserProfile(otherId, { _id: ownerId, role: 'job_seeker' })).rejects.toThrow(
        'User not found'
      );
    });
  });
});
