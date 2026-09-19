/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User registration, authentication, and profile management
 */

// Schemas

/**
 * @swagger
 * components:
 *   schemas:
 *     UserProfile:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: '675c9d4c8e9a1b2c3d4e5f60'
 *         firstName:
 *           type: string
 *           example: Kamal
 *         lastName:
 *           type: string
 *           example: Perera
 *         email:
 *           type: string
 *           format: email
 *           example: kamal@example.com
 *         role:
 *           type: string
 *           enum: [job_seeker, employer, admin]
 *           example: job_seeker
 *         phone:
 *           type: string
 *           example: '+94771234567'
 *         location:
 *           type: object
 *           properties:
 *             village:
 *               type: string
 *               example: Horana
 *             district:
 *               type: string
 *               example: Kalutara
 *             province:
 *               type: string
 *               example: Western
 *         profileImage:
 *           type: string
 *           example: 'uploads/profiles/profileImage-1706000000000.jpg'
 *         cvs:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               _id:
 *                 type: string
 *                 example: '64abc123'
 *               name:
 *                 type: string
 *                 example: My_Resume.pdf
 *               url:
 *                 type: string
 *                 example: 'uploads/cvs/cv-1706000000000.pdf'
 *               isPrimary:
 *                 type: boolean
 *                 example: true
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *         skills:
 *           type: array
 *           items:
 *             type: string
 *           example: ['farming', 'harvesting', 'irrigation']
 *         experience:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Farm Supervisor
 *               company:
 *                 type: string
 *                 example: 'Green Fields Ltd'
 *               duration:
 *                 type: string
 *                 example: '2 years'
 *               description:
 *                 type: string
 *                 example: 'Managed paddy cultivation operations'
 *         isVerified:
 *           type: boolean
 *           example: true
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     AuthResponse:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: '675c9d4c8e9a1b2c3d4e5f60'
 *         firstName:
 *           type: string
 *           example: Kamal
 *         lastName:
 *           type: string
 *           example: Perera
 *         email:
 *           type: string
 *           format: email
 *           example: kamal@example.com
 *         role:
 *           type: string
 *           enum: [job_seeker, employer, admin]
 *           example: job_seeker
 *         token:
 *           type: string
 *           example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 */

// Public endpoints

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     tags: [Users]
 *     summary: Register a new user
 *     description: |
 *       Creates a new user account and sends a **6-digit OTP** to the provided phone number via SMS.
 *
 *       The account is created with `isVerified: false`. The user must call
 *       `/api/users/verify-registration` with the OTP to activate the account and receive a JWT token.
 *
 *       > **Note:** If SMS delivery fails, registration still succeeds. The user can retry OTP delivery.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *               - role
 *               - phone
 *               - location
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Kamal
 *               lastName:
 *                 type: string
 *                 example: Perera
 *               email:
 *                 type: string
 *                 format: email
 *                 example: kamal@example.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: secure123
 *               role:
 *                 type: string
 *                 enum: [job_seeker, employer]
 *                 example: job_seeker
 *               phone:
 *                 type: string
 *                 example: '+94771234567'
 *               location:
 *                 type: object
 *                 required:
 *                   - village
 *                   - district
 *                   - province
 *                 properties:
 *                   village:
 *                     type: string
 *                     example: Horana
 *                   district:
 *                     type: string
 *                     example: Kalutara
 *                   province:
 *                     type: string
 *                     example: Western
 *     responses:
 *       201:
 *         description: User registered successfully. OTP sent to phone.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: '675c9d4c8e9a1b2c3d4e5f60'
 *                 firstName:
 *                   type: string
 *                   example: Kamal
 *                 lastName:
 *                   type: string
 *                   example: Perera
 *                 email:
 *                   type: string
 *                   example: kamal@example.com
 *                 role:
 *                   type: string
 *                   example: job_seeker
 *                 isVerified:
 *                   type: boolean
 *                   example: false
 *       400:
 *         description: Validation error or email already registered
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           msg:
 *                             type: string
 *                           path:
 *                             type: string
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: User already exists
 */

/**
 * @swagger
 * /api/users/verify-registration:
 *   post:
 *     tags: [Users]
 *     summary: Verify registration OTP
 *     description: |
 *       Validates the 6-digit OTP sent to the user's phone during registration.
 *
 *       On success:
 *       - Sets `isVerified: true`
 *       - Clears OTP fields
 *       - Returns a **JWT token** (user is now authenticated)
 *
 *       OTPs expire after **10 minutes**.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *             properties:
 *               phone:
 *                 type: string
 *                 example: '+94771234567'
 *               otp:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *                 example: '482931'
 *     responses:
 *       200:
 *         description: OTP verified. User account activated and JWT token returned.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid or expired OTP / missing fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid or expired OTP
 */

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     tags: [Users]
 *     summary: Login and get JWT token
 *     description: |
 *       Authenticates a user with email and password using bcrypt comparison.
 *
 *       Returns a **JWT Bearer token** to include in the `Authorization` header for protected routes:
 *       ```
 *       Authorization: Bearer <token>
 *       ```
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: kamal@example.com
 *               password:
 *                 type: string
 *                 example: secure123
 *     responses:
 *       200:
 *         description: Login successful. JWT token returned.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid email or password
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                       path:
 *                         type: string
 */

/**
 * @swagger
 * /api/users/forgot-password:
 *   post:
 *     tags: [Users]
 *     summary: Request password reset OTP
 *     description: |
 *       Sends a **6-digit OTP** to the user's registered phone number for password reset.
 *
 *       OTP expires after **10 minutes**. Use the OTP in `/api/users/verify-password-reset`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: '+94771234567'
 *     responses:
 *       200:
 *         description: OTP sent to phone
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP sent to your phone
 *       400:
 *         description: Phone number not found or missing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User not found with this phone number
 */

/**
 * @swagger
 * /api/users/verify-password-reset:
 *   post:
 *     tags: [Users]
 *     summary: Verify password reset OTP
 *     description: |
 *       Validates the OTP received via SMS. On success, returns a **secure reset token**
 *       (`crypto.randomBytes(20)`) required to call `/api/users/reset-password`.
 *
 *       OTPs expire after **10 minutes**.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *             properties:
 *               phone:
 *                 type: string
 *                 example: '+94771234567'
 *               otp:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *                 example: '739281'
 *     responses:
 *       200:
 *         description: OTP verified. Reset token returned.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP verified
 *                 resetToken:
 *                   type: string
 *                   example: a3f21b9c4d8e2f1a0b7c6d5e
 *       400:
 *         description: Invalid or expired OTP
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid or expired OTP
 */

/**
 * @swagger
 * /api/users/reset-password:
 *   post:
 *     tags: [Users]
 *     summary: Reset password using reset token
 *     description: |
 *       Sets a new password using the `resetToken` returned from `/api/users/verify-password-reset`.
 *
 *       The new password is automatically hashed by bcrypt via a Mongoose pre-save hook.
 *       Clears the reset token fields after success.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - resetToken
 *               - password
 *             properties:
 *               phone:
 *                 type: string
 *                 example: '+94771234567'
 *               resetToken:
 *                 type: string
 *                 example: a3f21b9c4d8e2f1a0b7c6d5e
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: newSecure456
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successful
 *       400:
 *         description: Invalid or expired reset token / missing fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid or expired reset token
 */

// Protected endpoints

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current authenticated user
 *     description: |
 *       Returns the full profile of the currently authenticated user.
 *       Password is always excluded from the response.
 *
 *       Requires a valid **JWT Bearer token** in the `Authorization` header.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Not authorized, token failed
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User not found
 */

/**
 * @swagger
 * /api/users/profile/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user profile by ID
 *     description: |
 *       Fetches a user's public profile by their MongoDB ObjectId.
 *       Password is always excluded from the response.
 *
 *       Requires a valid **JWT Bearer token** in the `Authorization` header.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID (MongoDB ObjectId)
 *         example: '675c9d4c8e9a1b2c3d4e5f60'
 *     responses:
 *       200:
 *         description: User profile returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Not authorized, token failed
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User not found
 */

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     tags: [Users]
 *     summary: Update user profile
 *     description: |
 *       Updates the authenticated user's profile details.
 *
 *       **Content-Type:** `multipart/form-data` (required when uploading files)
 *
 *       **File fields:**
 *       - `profileImage` — single image file (jpg, jpeg, png) — max 5MB
 *       - `cv` — up to 5 PDF/DOC/DOCX files — max 5MB each
 *
 *       **JSON string fields** (when using `multipart/form-data`, send these as JSON strings):
 *       - `skills` — e.g. `'["farming","harvesting"]'`
 *       - `experience` — e.g. `'[{"title":"Supervisor","company":"GreenCo","duration":"2 years"}]'`
 *       - `location` — e.g. `'{"village":"Horana","district":"Kalutara","province":"Western"}'`
 *
 *       **CV management:**
 *       - Send `primaryCvId` to promote a CV to primary
 *       - Send `deleteCvId` to remove a CV from the list
 *
 *       Returns updated user object with a **refreshed JWT token**.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Kamal
 *               lastName:
 *                 type: string
 *                 example: Perera
 *               phone:
 *                 type: string
 *                 example: '+94771234567'
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 description: Provide to change password
 *                 example: newPassword123
 *               location:
 *                 type: string
 *                 description: JSON string of location object
 *                 example: '{"village":"Horana","district":"Kalutara","province":"Western"}'
 *               skills:
 *                 type: string
 *                 description: JSON string of skills array
 *                 example: '["farming","harvesting","irrigation"]'
 *               experience:
 *                 type: string
 *                 description: JSON string of experience array
 *                 example: '[{"title":"Farm Supervisor","company":"GreenCo","duration":"2 years","description":"Managed operations"}]'
 *               primaryCvId:
 *                 type: string
 *                 description: Set the CV with this ID as primary
 *                 example: '64abc123def456'
 *               deleteCvId:
 *                 type: string
 *                 description: Delete the CV with this ID
 *                 example: '64abc123def789'
 *               profileImage:
 *                 type: string
 *                 format: binary
 *                 description: Profile photo (jpg, jpeg, png — max 5MB)
 *               cv:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: CV files (pdf, doc, docx — max 5MB each, up to 5 files)
 *     responses:
 *       200:
 *         description: Profile updated successfully. Returns updated user with new JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error or invalid update
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: First name cannot be empty
 *       401:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Not authorized, token failed
 */

/**
 * @swagger
 * /api/users/account:
 *   delete:
 *     tags: [Users]
 *     summary: Delete own account (soft delete)
 *     description: |
 *       Deactivates the authenticated user's account by setting `isActive: false`.
 *
 *       **This is a soft delete** — the data is retained in the database but the account
 *       becomes inaccessible. Requires the user's current **password** as confirmation.
 *
 *       Requires a valid **JWT Bearer token** in the `Authorization` header.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 example: secure123
 *                 description: Current account password required to confirm deletion
 *     responses:
 *       200:
 *         description: Account deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User removed
 *       400:
 *         description: Wrong password or missing field
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid password
 *       401:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Not authorized, token failed
 */
