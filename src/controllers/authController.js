const { register, login, refresh, logout, logoutAll, getProfile } = require('../services/authService');

/**
 * Handle user registration.
 * POST /api/v1/auth/register
 */
async function registerHandler(req, res, next) {
  try {
    const { name, email, password, phone } = req.body;
    const result = await register({ name, email, password, phone });
    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handle user login.
 * POST /api/v1/auth/login
 */
async function loginHandler(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await login({ email, password });
    res.status(200).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handle token refresh.
 * POST /api/v1/auth/refresh
 */
async function refreshHandler(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const tokens = await refresh({ token: refreshToken });
    res.status(200).json({
      success: true,
      data: tokens
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handle user logout (single device).
 * POST /api/v1/auth/logout
 */
async function logoutHandler(req, res, next) {
  try {
    const { refreshToken } = req.body;
    await logout({ token: refreshToken });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * Handle logout from all devices.
 * POST /api/v1/auth/logout-all
 * Requires authentication
 */
async function logoutAllHandler(req, res, next) {
  try {
    const userId = req.user.sub;
    await logoutAll(userId);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * Get current user profile.
 * GET /api/v1/auth/me
 * Requires authentication
 */
async function meHandler(req, res, next) {
  try {
    const userId = req.user.sub;
    const user = await getProfile(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }
    res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  logoutAllHandler,
  meHandler
};
