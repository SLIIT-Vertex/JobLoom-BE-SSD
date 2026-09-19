import RevokedToken from './revoked-token.model.js';

export const revokeToken = async ({ jti, exp }) => {
  const expiresAt = new Date(exp * 1000);

  await RevokedToken.updateOne({ jti }, { $setOnInsert: { jti, expiresAt } }, { upsert: true });
};

export const isTokenRevoked = async (jti) => {
  return Boolean(
    await RevokedToken.exists({
      jti,
      expiresAt: { $gt: new Date() },
    })
  );
};
