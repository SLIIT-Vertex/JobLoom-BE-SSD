import mongoose from 'mongoose';

// JWTs cannot be deleted after issuance, so logged-out jtis are retained only
// until their signed expiry. MongoDB's TTL index removes obsolete records.
const revokedTokenSchema = new mongoose.Schema(
  {
    jti: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { versionKey: false }
);

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RevokedToken = mongoose.model('RevokedToken', revokedTokenSchema);

export default RevokedToken;
