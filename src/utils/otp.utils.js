import { randomInt } from 'node:crypto';

const MINIMUM_SIX_DIGIT_OTP = 100_000;
const MAXIMUM_SIX_DIGIT_OTP_EXCLUSIVE = 1_000_000;

export const generateOtp = (secureRandomInt = randomInt) =>
  secureRandomInt(MINIMUM_SIX_DIGIT_OTP, MAXIMUM_SIX_DIGIT_OTP_EXCLUSIVE).toString();

export default generateOtp;
