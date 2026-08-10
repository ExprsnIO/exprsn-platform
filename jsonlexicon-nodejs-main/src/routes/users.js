/**
 * Users Routes
 */

const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rate-limit');
const validation = require('../middleware/validation');

// Public routes (no auth required)
router.post(
  '/register',
  rateLimit.publicRateLimit,
  validation.validateUserRegistration,
  usersController.register
);

router.post(
  '/login',
  rateLimit.loginRateLimit,
  validation.validateUserLogin,
  usersController.login
);

// Protected routes (auth required)
router.use(auth.requireAuth);

router.post('/logout', usersController.logout);

router.get('/me', usersController.getProfile);

router.patch(
  '/me',
  rateLimit.authenticatedRateLimit,
  usersController.updateProfile
);

router.post(
  '/me/password',
  rateLimit.strictRateLimit,
  usersController.changePassword
);

// Admin routes
router.get(
  '/',
  auth.requireRoles('admin'),
  validation.validatePagination,
  usersController.listUsers
);

router.get(
  '/:id',
  auth.requireRoles('admin'),
  validation.validateUuidParam('id'),
  usersController.getUserById
);

router.post(
  '/:id/suspend',
  auth.requireRoles('admin'),
  validation.validateUuidParam('id'),
  usersController.suspendUser
);

router.post(
  '/:id/reactivate',
  auth.requireRoles('admin'),
  validation.validateUuidParam('id'),
  usersController.reactivateUser
);

module.exports = router;
