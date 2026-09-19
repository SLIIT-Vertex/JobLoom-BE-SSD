# 👤 User Management Module — Complete Documentation

> **Module Path:** `src/modules/users/`
> **Base Route:** `/api/users`
> **Version:** 1.0.0

---

## 📑 Table of Contents

1. [Overview](#overview)
2. [Module Architecture](#module-architecture)
3. [File Structure](#file-structure)
4. [Technologies & Dependencies](#technologies--dependencies)
5. [Data Model / Schema](#data-model--schema)
6. [API Endpoints](#api-endpoints)
7. [Service Layer — Business Logic](#service-layer--business-logic)
8. [Validation Rules](#validation-rules)
9. [Middleware Pipeline](#middleware-pipeline)
10. [Authentication Flow](#authentication-flow)
11. [OTP & Password Reset Flow](#otp--password-reset-flow)
12. [File Upload Handling](#file-upload-handling)
13. [Error Handling](#error-handling)
14. [Testing](#testing)
15. [Future Enhancements](#future-enhancements)

---

## Overview

The **User Management Module** handles all aspects of the user lifecycle on the JobLoom platform — from registration and OTP verification to authentication, profile management, and account deletion. It supports three distinct user roles: **Job Seekers**, **Employers**, and **Admins**.

### Key Capabilities

| Feature                | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| **Registration**       | Create a new account with OTP-based phone verification           |
| **OTP Verification**   | Verify phone number via 6-digit SMS OTP on registration          |
| **Authentication**     | Email/password login returning a JWT token                       |
| **Logout**             | Revoke the current JWT session until its signed expiry           |
| **Forgot Password**    | Request a password reset OTP via SMS                             |
| **Password Reset**     | Verify OTP then set a new password using a secure reset token    |
| **Profile Management** | View and update personal details, skills, and experience         |
| **File Uploads**       | Upload profile image and multiple CV documents                   |
| **Soft Delete**        | Deactivate accounts (`isActive: false`) instead of hard deletion |
| **Role-Based Access**  | `job_seeker`, `employer`, and `admin` roles                      |

---

## Module Architecture

The module follows a **layered MVC architecture**:

```
HTTP Request
     │
     ▼
┌──────────────────────────────────────────────────────┐
│                   user.routes.js                     │  ← Route definitions + middleware chain
│   registerValidation → loginValidation → controller  │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│                 user.controller.js                   │  ← HTTP handlers, req/res only
│         Extracts params → calls service              │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│                  user.service.js                     │  ← Business logic, OTP generation, token
│       Coordinates DB queries, SMS sending, rules     │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│                   user.model.js                      │  ← Mongoose schema, hooks, methods
│      Schema, virtuals, bcrypt hash, comparePassword  │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
                   MongoDB
```

---

## File Structure

```
src/modules/users/
├── revoked-token.model.js      ← Revoked JWT identifiers with TTL cleanup
├── token-revocation.service.js ← Revoke/check JWT identifiers
├── user.routes.js       ← Express router
├── user.controller.js   ← Request handlers
├── user.service.js      ← Business logic
├── user.model.js        ← Mongoose schema + model
├── user.validation.js   ← express-validator rules (4 validators)
└── README.md            ← This file
```

### Related Files

```
tests/
├── unit/
│   └── user.service.test.js          ← Unit tests (Jest)
├── integration/
│   └── user.routes.test.js           ← Integration tests (Supertest)
└── performance/
    └── user.load.js                  ← Load tests (k6)

src/middleware/
├── auth/
│   └── authMiddleware.js             ← JWT protect middleware
├── uploads/
│   └── fileUpload.js                 ← Multer file upload config

src/services/
└── sms.service.js                    ← SMS OTP sender

src/utils/
└── jwt.utils.js                      ← JWT helper utilities

uploads/
├── profiles/                         ← Uploaded profile images
└── cvs/                              ← Uploaded CV files
```

---

## Technologies & Dependencies

### Core Technologies

| Technology     | Version | Purpose                                 |
| -------------- | ------- | --------------------------------------- |
| **Node.js**    | ≥18.x   | Runtime environment                     |
| **Express.js** | ^4.x    | HTTP framework and routing              |
| **MongoDB**    | ≥6.x    | Primary database (NoSQL)                |
| **Mongoose**   | ^8.x    | MongoDB ODM — schema, validation, hooks |

### Key Libraries

| Library             | Purpose                        | Used In              |
| ------------------- | ------------------------------ | -------------------- |
| `bcrypt`            | Password hashing & comparison  | `user.model.js`      |
| `jsonwebtoken`      | JWT generation & verification  | `user.service.js`    |
| `express-validator` | Request validation             | `user.validation.js` |
| `multer`            | Multipart file upload handling | `fileUpload.js`      |
| `crypto`            | Secure reset token generation  | `user.service.js`    |
| `mongoose`          | Schema, queries, hooks         | `user.model.js`      |

### MongoDB Features Used

| Feature              | How Used                                                |
| -------------------- | ------------------------------------------------------- |
| **Unique index**     | `email` field enforces unique user emails               |
| **Pre-save hook**    | Automatic password hashing on create or password change |
| **Instance methods** | `comparePassword()` for login verification              |
| **Virtuals**         | `fullName` computed from `firstName + lastName`         |
| **Timestamps**       | `createdAt` and `updatedAt` auto-managed                |
| **Soft delete**      | `isActive: false` instead of removing documents         |
| **TTL index**        | Removes revoked JWT identifiers after token expiry      |

### Middleware Used

| Middleware | File                       | Purpose                                                |
| ---------- | -------------------------- | ------------------------------------------------------ |
| `protect`  | `auth/authMiddleware.js`   | JWT authentication — verifies Bearer token             |
| `upload`   | `uploads/fileUpload.js`    | Handles multipart/form-data for profile image and CVs  |
| `validate` | `validation.middleware.js` | Runs express-validator results, returns 400 on failure |

---

## Data Model / Schema

### Schema Fields

```javascript
const userSchema = new Schema({
  firstName, // String, required, trimmed
  lastName, // String, required, trimmed
  email, // String, required, unique, lowercase
  password, // String, required (stored as bcrypt hash)
  role, // Enum: job_seeker | employer | admin (default: job_seeker)
  phone, // String, required
  location: {
    village, // String, required
    district, // String, required
    province, // String, required
  },
  profileImage, // String (file path, default: '')
  cvs: [
    {
      name, // String, required
      url, // String, required (file path)
      isPrimary, // Boolean (default: false)
      createdAt, // Date (default: now)
    },
  ],
  skills, // [String] (default: [])
  experience: [
    {
      title, // String
      company, // String
      duration, // String
      description, // String
    },
  ],
  isVerified, // Boolean (default: false)
  isActive, // Boolean (default: true) — soft delete flag
  verificationOtp, // String (null after verified)
  verificationOtpExpires, // Date (null after verified)
  passwordResetOtp, // String (null after reset)
  passwordResetOtpExpires, // Date (null after reset)
  createdAt, // Date (auto by timestamps)
  updatedAt, // Date (auto by timestamps)
});
```

### User Roles

| Role         | Description                                       |
| ------------ | ------------------------------------------------- |
| `job_seeker` | Browse jobs, apply, manage profile and CVs        |
| `employer`   | Post and manage job listings, view applicants     |
| `admin`      | Platform administration (reserved for future use) |

### Virtual Fields

| Virtual    | Description                              |
| ---------- | ---------------------------------------- |
| `fullName` | Computed as `firstName + ' ' + lastName` |

### Model Hooks & Methods

| Hook / Method       | Trigger / Usage                                           |
| ------------------- | --------------------------------------------------------- |
| `pre('save')`       | Hashes password with bcrypt (salt rounds: 10) if modified |
| `comparePassword()` | Instance method — compares plain text to bcrypt hash      |

---

## API Endpoints

### Summary Table

| Method   | Route                              | Access  | Description                        |
| -------- | ---------------------------------- | ------- | ---------------------------------- |
| `POST`   | `/api/users/register`              | Public  | Register a new user account        |
| `POST`   | `/api/users/verify-registration`   | Public  | Verify registration OTP            |
| `POST`   | `/api/users/login`                 | Public  | Login and receive JWT token        |
| `POST`   | `/api/users/logout`                | Private | Revoke the current JWT session     |
| `POST`   | `/api/users/forgot-password`       | Public  | Request password reset OTP via SMS |
| `POST`   | `/api/users/verify-password-reset` | Public  | Verify password reset OTP          |
| `POST`   | `/api/users/reset-password`        | Public  | Reset password using reset token   |
| `GET`    | `/api/users/me`                    | Private | Get current authenticated user     |
| `GET`    | `/api/users/profile/:id`           | Private | Get user profile by ID             |
| `PUT`    | `/api/users/profile`               | Private | Update profile, image, and CVs     |
| `DELETE` | `/api/users/account`               | Private | Soft delete own account            |

---

### `POST /api/users/register` — Register User

**Access:** Public | **Auth:** None required

**Request Body:**

```json
{
  "firstName": "Kamal",
  "lastName": "Perera",
  "email": "kamal@example.com",
  "password": "secure123",
  "role": "job_seeker",
  "phone": "+94771234567",
  "location": {
    "village": "Horana",
    "district": "Kalutara",
    "province": "Western"
  }
}
```

**What Happens:**

1. Checks if email already exists — returns 400 if duplicate
2. Generates a 6-digit OTP (valid for **10 minutes**)
3. Creates user in DB with `isVerified: false`
4. Sends OTP to phone via SMS service
5. Returns user details (no token yet — user must verify first)

**Response:**

```json
{
  "_id": "64abc...",
  "firstName": "Kamal",
  "lastName": "Perera",
  "email": "kamal@example.com",
  "role": "job_seeker",
  "isVerified": false
}
```

> ⚠️ **Note:** If SMS sending fails, registration still succeeds. User can request a new OTP.

---

### `POST /api/users/verify-registration` — Verify Registration OTP

**Access:** Public | **Auth:** None required

**Request Body:**

```json
{
  "phone": "+94771234567",
  "otp": "482931"
}
```

**What Happens:**

1. Looks up user by `phone` + matching `verificationOtp` + non-expired `verificationOtpExpires`
2. Sets `isVerified: true`, clears OTP fields
3. Returns user details with a valid **JWT token** (user is now logged in)

**Response:**

```json
{
  "_id": "64abc...",
  "firstName": "Kamal",
  "lastName": "Perera",
  "email": "kamal@example.com",
  "role": "job_seeker",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### `POST /api/users/login` — Login

**Access:** Public | **Auth:** None required

**Request Body:**

```json
{
  "email": "kamal@example.com",
  "password": "secure123"
}
```

**What Happens:**

1. Finds user by email
2. Compares password using `user.comparePassword()` (bcrypt)
3. Returns user details with a JWT token on success
4. Returns `401 Unauthorized` on invalid credentials

**Response:**

```json
{
  "_id": "64abc...",
  "firstName": "Kamal",
  "lastName": "Perera",
  "email": "kamal@example.com",
  "role": "job_seeker",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### `POST /api/users/forgot-password` — Forgot Password

**Access:** Public | **Auth:** None required

**Request Body:**

```json
{
  "phone": "+94771234567"
}
```

**What Happens:**

1. Finds user by phone number
2. Generates a new 6-digit OTP (valid for **10 minutes**)
3. Saves OTP to `passwordResetOtp` + `passwordResetOtpExpires`
4. Sends OTP via SMS

**Response:**

```json
{
  "message": "OTP sent to your phone"
}
```

---

### `POST /api/users/verify-password-reset` — Verify Reset OTP

**Access:** Public | **Auth:** None required

**Request Body:**

```json
{
  "phone": "+94771234567",
  "otp": "739281"
}
```

**What Happens:**

1. Validates phone + OTP + expiry
2. Generates a secure **reset token** (`crypto.randomBytes(20)`)
3. Stores reset token in `passwordResetOtp` field (reused)
4. Returns the token to include in the next step

**Response:**

```json
{
  "message": "OTP verified",
  "resetToken": "a3f21b9c..."
}
```

---

### `POST /api/users/reset-password` — Reset Password

**Access:** Public | **Auth:** None required

**Request Body:**

```json
{
  "phone": "+94771234567",
  "resetToken": "a3f21b9c...",
  "password": "newSecure456"
}
```

**What Happens:**

1. Looks up user by phone + matching reset token + valid expiry
2. Sets new password (pre-save hook will hash it automatically)
3. Clears `passwordResetOtp` and `passwordResetOtpExpires`

**Response:**

```json
{
  "message": "Password reset successful"
}
```

---

### `GET /api/users/me` — Get Current User

**Access:** Private | **Auth:** Bearer JWT token

Returns the full profile of the currently authenticated user (excludes `password`).

---

### `GET /api/users/profile/:id` — Get User Profile by ID

**Access:** Private | **Auth:** Bearer JWT token

Fetches a user profile by MongoDB ObjectId. Returns `404` if not found.

---

### `PUT /api/users/profile` — Update Profile

**Access:** Private | **Auth:** Bearer JWT token

**Content-Type:** `multipart/form-data` (supports file uploads)

**Updatable Fields:**

| Field          | Type           | Description                           |
| -------------- | -------------- | ------------------------------------- |
| `firstName`    | string         | First name                            |
| `lastName`     | string         | Last name                             |
| `phone`        | string         | Phone number                          |
| `location`     | JSON string    | `{ village, district, province }`     |
| `skills`       | JSON string    | Array of skill strings                |
| `experience`   | JSON string    | Array of experience objects           |
| `password`     | string         | New password (will be hashed on save) |
| `profileImage` | file           | Upload a new profile image            |
| `cv`           | file (up to 5) | Upload one or more CV files           |
| `primaryCvId`  | string         | Set a specific CV as primary          |
| `deleteCvId`   | string         | Remove a specific CV by ID            |

> ⚠️ **Note:** `skills`, `experience`, and `location` must be sent as **JSON strings** when using `multipart/form-data`. The controller parses them automatically.

**Response:** Returns updated user object with a refreshed JWT token.

---

### `DELETE /api/users/account` — Delete Account (Soft Delete)

**Access:** Private | **Auth:** Bearer JWT token

**Request Body:**

```json
{
  "password": "secure123"
}
```

**What Happens:**

1. Verifies password using `comparePassword()`
2. Sets `isActive: false` — account is deactivated, not permanently removed
3. Returns `{ message: 'User removed' }`

---

## Service Layer — Business Logic

### Functions

| Function              | Parameters                         | Returns                          | Description                                      |
| --------------------- | ---------------------------------- | -------------------------------- | ------------------------------------------------ |
| `registerUser`        | `(userData)`                       | `Promise<Object>`                | Creates user, sends verification OTP via SMS     |
| `verifyRegistration`  | `(phone, otp)`                     | `Promise<{user, token}>`         | Validates OTP, marks user verified, returns JWT  |
| `loginUser`           | `(email, password)`                | `Promise<{user, token}>`         | Verifies credentials, returns JWT                |
| `forgotPassword`      | `(phone)`                          | `Promise<Object>`                | Generates reset OTP and sends via SMS            |
| `verifyPasswordReset` | `(phone, otp)`                     | `Promise<{message, resetToken}>` | Validates OTP, returns secure reset token        |
| `resetPassword`       | `(phone, resetToken, newPassword)` | `Promise<Object>`                | Validates token, sets new hashed password        |
| `getUserProfile`      | `(id)`                             | `Promise<User>`                  | Fetches user by ID (excl. password)              |
| `updateUserProfile`   | `(user, updates)`                  | `Promise<Object>`                | Updates fields, manages CV upload/delete/primary |
| `deleteUser`          | `(id, password)`                   | `Promise<Object>`                | Password-confirmed soft delete                   |

### JWT Token Generation

```javascript
const generateToken = (id) => {
  return jwt.sign({ id }, envConfig.jwtSecret, {
    expiresIn: envConfig.jwtExpiresIn,
  });
};
```

Tokens are generated and returned on: **verify-registration**, **login**, and **update profile**.

---

## Validation Rules

Built with **express-validator**.

### Register Validation (`registerValidation`)

| Field               | Rules                                                   |
| ------------------- | ------------------------------------------------------- |
| `firstName`         | Required, not empty                                     |
| `lastName`          | Required, not empty                                     |
| `email`             | Required, valid email format                            |
| `password`          | Required, minimum 6 characters                          |
| `role`              | Required, must be `job_seeker` \| `employer` \| `admin` |
| `phone`             | Required, not empty                                     |
| `location.village`  | Required, not empty                                     |
| `location.district` | Required, not empty                                     |
| `location.province` | Required, not empty                                     |

### Login Validation (`loginValidation`)

| Field      | Rules                        |
| ---------- | ---------------------------- |
| `email`    | Required, valid email format |
| `password` | Required, not empty          |

### Update Profile Validation (`updateProfileValidation`)

| Field       | Rules                                     |
| ----------- | ----------------------------------------- |
| `firstName` | Optional — if provided, must not be empty |
| `lastName`  | Optional — if provided, must not be empty |
| `phone`     | Optional — if provided, must not be empty |

### Change Password Validation (`changePasswordValidation`)

| Field             | Rules                          |
| ----------------- | ------------------------------ |
| `currentPassword` | Required, not empty            |
| `newPassword`     | Required, minimum 6 characters |

---

## Middleware Pipeline

### Public Route Example

```
POST /api/users/register
  └── registerValidation   → express-validator rules for register body
  └── registerUser         → controller handler
```

### Protected Route Example

```
GET /api/users/me
  └── protect              → verify JWT token → attach req.user
  └── getMyProfile         → controller handler
```

### File Upload Route Example

```
PUT /api/users/profile
  └── protect              → verify JWT token → attach req.user
  └── upload.fields(...)   → multer handles cv (max 5) + profileImage (max 1)
  └── updateProfileValidation → optional field validation
  └── updateUserProfile    → controller handler
```

---

## Authentication Flow

### Initial Registration & Login Flow

```
User submits registration form
         │
         ▼
POST /api/users/register
  ├── Validate fields (registerValidation)
  ├── Check email uniqueness
  ├── Generate 6-digit OTP (expires in 10 min)
  ├── Create user (isVerified: false)
  └── Send OTP via SMS
         │
         ▼
POST /api/users/verify-registration
  ├── Look up user by phone + OTP + expiry
  ├── Set isVerified: true, clear OTP fields
  └── Return JWT token  ← User is now authenticated
         │
         ▼
POST /api/users/login (for returning users)
  ├── Find user by email
  ├── Compare password with bcrypt
  └── Return JWT token
```

### Protected Request Flow

```
Client sends: Authorization: Bearer <token>
         │
         ▼
protect middleware
  ├── Verify token signature with jwtSecret
  ├── Validate payload { userId, jti, exp }
  ├── Reject jti while it exists in the revocation collection
  ├── Find user by id in DB
  └── Attach user to req.user
         │
         ▼
Controller receives req.user (full user document)
```

### Logout and revocation

`POST /api/users/logout` stores only the current token's random `jti` and
expiry—not the raw JWT. Authentication checks this collection before accepting
the token. The expiry query ignores stale records immediately, and MongoDB's TTL
index deletes them automatically. Persistent storage is required so revocation
continues to work across server restarts and multiple backend instances.

---

## OTP & Password Reset Flow

```
User forgets password
         │
         ▼
POST /api/users/forgot-password  { phone }
  ├── Find user by phone
  ├── Generate 6-digit OTP (expires in 10 min)
  ├── Save to passwordResetOtp + passwordResetOtpExpires
  └── Send OTP via SMS
         │
         ▼
POST /api/users/verify-password-reset  { phone, otp }
  ├── Validate phone + OTP + expiry
  ├── Generate secure resetToken (crypto.randomBytes(20))
  ├── Save resetToken to passwordResetOtp field
  └── Return resetToken to client
         │
         ▼
POST /api/users/reset-password  { phone, resetToken, password }
  ├── Validate phone + resetToken + expiry
  ├── Set new password (pre-save hook hashes it)
  ├── Clear passwordResetOtp + passwordResetOtpExpires
  └── Return success message
```

> ⚠️ **Note:** The `passwordResetOtp` field is reused to store both the numeric OTP and the hex reset token across the two steps.

---

## File Upload Handling

File uploads are managed by **Multer** via `src/middleware/uploads/fileUpload.js`.

### Supported Upload Fields

| Field name     | Max files | Destination         | Description        |
| -------------- | --------- | ------------------- | ------------------ |
| `profileImage` | 1         | `uploads/profiles/` | User profile photo |
| `cv`           | 5         | `uploads/cvs/`      | CV / resume files  |

### CV Management in `updateUserProfile`

| Action               | How to trigger                    | Behaviour                                                                 |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| **Upload new CV(s)** | Include `cv` file(s) in form data | Appended to `cvs` array; first uploaded CV set as primary if no CVs exist |
| **Set primary CV**   | Include `primaryCvId` in body     | Sets `isPrimary: true` on matching CV, `false` on all others              |
| **Delete a CV**      | Include `deleteCvId` in body      | Filters CV out of `cvs` array                                             |

---

## Error Handling

| Scenario                        | HTTP Status | Response                                        |
| ------------------------------- | ----------- | ----------------------------------------------- |
| Email already registered        | `400`       | `{ message: 'User already exists' }`            |
| Invalid email or password       | `401`       | `{ message: 'Invalid email or password' }`      |
| Invalid or expired OTP          | `400`       | `{ message: 'Invalid or expired OTP' }`         |
| Invalid or expired reset token  | `400`       | `{ message: 'Invalid or expired reset token' }` |
| User not found                  | `404`       | `{ message: 'User not found' }`                 |
| Missing required fields         | `400`       | `{ message: '<field> is required' }`            |
| Wrong password on delete        | `400`       | `{ message: 'Invalid password' }`               |
| Validation errors               | `400`       | `{ errors: [ { msg, path } ] }`                 |
| Unauthorized (no/invalid token) | `401`       | `{ message: 'Not authorized, token failed' }`   |

---

## Testing

### Unit Tests — `tests/unit/user.service.test.js`

Covers the service layer in isolation using mocked DB and dependencies.

| Test Group            | What is Tested                                           |
| --------------------- | -------------------------------------------------------- |
| `registerUser`        | Duplicate email rejection, OTP generation, user creation |
| `verifyRegistration`  | Valid OTP flow, expired OTP rejection                    |
| `loginUser`           | Correct credentials, wrong password                      |
| `forgotPassword`      | Unknown phone rejection, OTP send                        |
| `verifyPasswordReset` | Valid OTP, invalid OTP, reset token generation           |
| `resetPassword`       | Valid token, expired token                               |
| `getUserProfile`      | Found user, not found error                              |
| `updateUserProfile`   | Field updates, CV upload, set primary, delete CV         |
| `deleteUser`          | Password-confirmed soft delete, wrong password           |

### Integration Tests — `tests/integration/user.routes.test.js`

Tests the full HTTP stack using **Supertest** against an in-memory or test MongoDB instance.

### Run Tests

```bash
# All tests
npm test

# User tests only
npx jest user

# With coverage
npm run test:coverage
```

---

## Future Enhancements

| Enhancement                    | Description                                            |
| ------------------------------ | ------------------------------------------------------ |
| **Email verification**         | Optional email-based OTP alongside phone OTP           |
| **Refresh tokens**             | Long-lived refresh token + short-lived access token    |
| **Admin user management**      | Admin endpoints to list, suspend, or delete users      |
| **Profile completeness score** | Percentage metric indicating how complete a profile is |
| **Social login**               | OAuth2 via Google / Facebook                           |
| **OTP resend endpoint**        | Dedicated route to resend verification or reset OTP    |
| **Account reactivation**       | Allow soft-deleted users to reactivate their account   |
| **Two-factor authentication**  | Optional 2FA for employer and admin accounts           |
