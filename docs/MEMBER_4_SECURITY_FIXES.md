# Member 4 Security Fixes

## Scope

Member 4 addressed three authentication vulnerabilities in the JobLoom backend:

1. Missing rate limiting on login and OTP endpoints.
2. Predictable OTP generation with `Math.random()`.
3. A known fallback secret used to sign and verify JWTs.

## Branch and commit history

The branches form an ordered stack. Merge them in the order below so that each pull request contains one focused security change.

| Order | Branch                             | Commit                 | Purpose                                                              |
| ----- | ---------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| 1     | `security/fix-auth-rate-limiting`  | `b2e60a5`              | Limit repeated login, OTP verification, and password-reset attempts. |
| 2     | `security/fix-weak-otp-generation` | `edf4dc5`              | Replace `Math.random()` OTPs with `crypto.randomInt()`.              |
| 3     | `security/fix-jwt-fallback-secret` | `2338029`              | Remove JWT fallbacks and require a strong configured secret.         |
| 4     | `security/member4-security-report` | This document's commit | Preserve report and demonstration evidence.                          |

## Finding 1: Missing authentication rate limiting

### Classification and risk

- CWE-307: Improper Restriction of Excessive Authentication Attempts
- OWASP Top 10: A07 Identification and Authentication Failures
- Suggested severity: High

The login, registration OTP, forgot-password, and password-reset OTP routes previously accepted unlimited requests. An attacker could automate password or OTP guessing and could abuse the password-reset SMS workflow.

### Remediation

`src/middleware/auth-rate-limit.middleware.js` now applies bounded, fixed-window policies per client IP:

| Endpoint                                | Limit |     Window | Successful requests |
| --------------------------------------- | ----: | ---------: | ------------------- |
| `POST /api/users/login`                 |     5 | 15 minutes | Not counted         |
| `POST /api/users/verify-registration`   |     5 | 10 minutes | Not counted         |
| `POST /api/users/forgot-password`       |     3 | 60 minutes | Counted             |
| `POST /api/users/verify-password-reset` |     5 | 10 minutes | Not counted         |

Blocked requests return HTTP `429`, a stable `RATE_LIMITED` error code, `Retry-After`, and rate-limit headers. Environment variables in `.env.example` allow the limits to be tuned. The store is capped at 10,000 keys and periodically removes expired entries to avoid unbounded memory growth.

### Evidence

- Unit tests: `tests/unit/auth-rate-limit.middleware.test.js`
- Integration test: `should rate limit repeated failed login attempts` in `tests/integration/user.routes.test.js`
- Demonstration: send five invalid login requests from one client. The sixth request returns HTTP `429` rather than reaching password verification.

## Finding 2: Weak OTP generation

### Classification and risk

- CWE-338: Use of Cryptographically Weak Pseudo-Random Number Generator
- OWASP Top 10: A02 Cryptographic Failures
- Suggested severity: High when combined with the previously unlimited verification attempts

Registration and password-reset OTPs were generated with `Math.random()`. It is not a cryptographically secure random source, so it should not be used for authentication secrets.

### Remediation

`src/utils/otp.utils.js` generates a uniformly distributed six-digit OTP with Node's `crypto.randomInt(100000, 1000000)`. Both OTP creation paths use this shared utility. The password-reset continuation token continues to use the cryptographically secure `crypto.randomBytes()` API.

### Evidence

- Unit tests: `tests/unit/otp.utils.test.js`
- Service regression tests: `tests/unit/user.service.test.js`
- Static check: `rg "Math\\.random" src` returns no matches.

## Finding 3: Known JWT fallback secret

### Classification and risk

- CWE-798: Use of Hard-coded Credentials
- OWASP Top 10: A02 Cryptographic Failures and A05 Security Misconfiguration
- Suggested severity: Critical

JWT signing and verification used public fallback strings when `JWT_SECRET` was absent. An attacker who knew the source code could sign a token containing an arbitrary user ID and role, including an administrator role.

### Remediation

- JWT generation and verification now read only `envConfig.jwtSecret`.
- `MONGODB_URI` and `JWT_SECRET` are required during non-test startup.
- A JWT secret must contain at least 32 characters and must not equal a known project placeholder.
- `.env.example`, `.env.production.example`, and `.env.staging.example` use an explicit replacement marker.
- The production and staging examples now use the correct `JWT_EXPIRES_IN` key.

Generate a deployment secret outside the repository, for example:

```bash
openssl rand -hex 32
```

Store the generated value in the deployment secret manager. Do not commit the real value.

### Evidence

- Unit tests: `tests/unit/security-config.test.js`
- Negative startup test: starting with a blank `JWT_SECRET` fails with `Missing or invalid required environment variables: JWT_SECRET`.
- Token regression test: a token signed with the configured secret can still be generated and verified with the required issuer, audience, ID, and expiry claims.

## Verification commands

```bash
npm run lint
npx cross-env NODE_OPTIONS=--experimental-vm-modules jest --runInBand tests/unit/auth-rate-limit.middleware.test.js
npx cross-env NODE_OPTIONS=--experimental-vm-modules jest --runInBand tests/unit/otp.utils.test.js tests/unit/user.service.test.js
npx cross-env NODE_OPTIONS=--experimental-vm-modules jest --runInBand tests/unit/security-config.test.js
npm run test:integration -- --runTestsByPath tests/integration/user.routes.test.js
```

## Deployment note

The current rate-limit store is local to one Node.js process, which is appropriate for the present single-instance deployment and local demonstration. A horizontally scaled deployment should replace it with a shared store such as Redis so all instances enforce the same counters.
