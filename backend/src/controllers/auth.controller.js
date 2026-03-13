// src/controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
};

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await query(
    `SELECT u.user_id, u.name, u.role, u.email, u.phone, u.password_hash, u.active_flag,
            u.same_day_request_count,
            ARRAY_AGG(DISTINCT up.package_id) FILTER (WHERE up.package_id IS NOT NULL) AS package_ids,
            ARRAY_AGG(DISTINCT p.package_name) FILTER (WHERE p.package_name IS NOT NULL) AS package_names
     FROM users u
     LEFT JOIN user_packages up ON u.user_id = up.user_id
     LEFT JOIN packages p ON up.package_id = p.package_id
     WHERE u.email = $1
     GROUP BY u.user_id`,
    [email.toLowerCase()]
  );

  const user = rows[0];
  if (!user || !user.active_flag) {
    throw new AppError('Invalid credentials', 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new AppError('Invalid credentials', 401);

  const { accessToken, refreshToken } = generateTokens(user.user_id, user.role);

  // Store refresh token
  await query(
    `UPDATE users SET updated_at = NOW() WHERE user_id = $1`,
    [user.user_id]
  );

  res.json({
    accessToken,
    refreshToken,
    user: {
      userId: user.user_id,
      name: user.name,
      role: user.role,
      email: user.email,
      phone: user.phone,
      packageIds: user.package_ids || [],
      packageNames: user.package_names || [],
      sameDayRequestCount: user.same_day_request_count,
    },
  });
});

exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('Refresh token required', 400);

  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  const { rows } = await query('SELECT user_id, role, active_flag FROM users WHERE user_id = $1', [decoded.userId]);
  if (!rows[0] || !rows[0].active_flag) throw new AppError('User not found', 401);

  const tokens = generateTokens(rows[0].user_id, rows[0].role);
  res.json(tokens);
});

exports.logout = asyncHandler(async (req, res) => {
  // Stateless JWT — client discards token
  res.json({ message: 'Logged out successfully' });
});

exports.getMe = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.user_id, u.name, u.role, u.email, u.phone, u.same_day_request_count,
            ARRAY_AGG(DISTINCT up.package_id) FILTER (WHERE up.package_id IS NOT NULL) AS package_ids,
            ARRAY_AGG(DISTINCT p.package_name) FILTER (WHERE p.package_name IS NOT NULL) AS package_names
     FROM users u
     LEFT JOIN user_packages up ON u.user_id = up.user_id
     LEFT JOIN packages p ON up.package_id = p.package_id
     WHERE u.user_id = $1
     GROUP BY u.user_id`,
    [req.user.user_id]
  );
  const u = rows[0];
  res.json({
    userId: u.user_id, name: u.name, role: u.role, email: u.email,
    phone: u.phone, packageIds: u.package_ids || [],
    packageNames: u.package_names || [],
    sameDayRequestCount: u.same_day_request_count,
  });
});
