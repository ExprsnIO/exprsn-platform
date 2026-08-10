/**
 * Development Authentication Middleware
 *
 * Provides a temporary user context for development purposes.
 * In production, this should be replaced with proper CA token validation.
 */

const DEV_USER = {
  id: '00000000-0000-0000-0000-000000000001', // Valid UUID for dev user
  email: 'developer@exprsn.local',
  username: 'developer',
  role: 'admin'
};

/**
 * Bypass authentication in development mode
 * Sets a dummy user object on req.user
 */
function devAuthBypass(req, res, next) {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (isDevelopment) {
    // Set dummy user for development
    req.user = DEV_USER;
    console.log('[DevAuth] Development mode - using dummy user:', DEV_USER.id);
  }

  next();
}

module.exports = {
  devAuthBypass,
  DEV_USER
};
