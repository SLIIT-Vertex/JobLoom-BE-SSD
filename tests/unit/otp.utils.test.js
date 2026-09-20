import { describe, test, expect, jest } from '@jest/globals';
import { generateOtp } from '../../src/utils/otp.utils.js';

describe('OTP utility', () => {
  test('uses a cryptographically secure integer source with six-digit bounds', () => {
    const secureRandomInt = jest.fn().mockReturnValue(654321);

    expect(generateOtp(secureRandomInt)).toBe('654321');
    expect(secureRandomInt).toHaveBeenCalledWith(100_000, 1_000_000);
  });

  test('always generates a six-digit string', () => {
    for (let sample = 0; sample < 100; sample += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });
});
