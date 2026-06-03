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

async function fetchUserWithPackages({ byLoginId, byUserId }) {
  const whereClause = byLoginId ? 'WHERE u.login_id = $1' : 'WHERE u.user_id = $1';
  const param = byLoginId ? byLoginId.toLowerCase().trim() : byUserId;
  const { rows } = await query(
    `SELECT u.user_id, u.name, u.role, u.login_id, u.email, u.phone, u.password_hash, u.active_flag,
            u.same_day_request_count,
            ARRAY_AGG(DISTINCT up.package_id) FILTER (WHERE up.package_id IS NOT NULL) AS package_ids,
            ARRAY_AGG(DISTINCT p.package_name) FILTER (WHERE p.package_name IS NOT NULL) AS package_names
     FROM users u
     LEFT JOIN user_packages up ON u.user_id = up.user_id
     LEFT JOIN packages p ON up.package_id = p.package_id
     ${whereClause}
     GROUP BY u.user_id`,
    [param]
  );
  return rows[0] || null;
}

function formatUser(u) {
  return {
    userId: u.user_id,
    name: u.name,
    role: u.role,
    loginId: u.login_id,
    email: u.email,
    phone: u.phone,
    packageIds: u.package_ids || [],
    packageNames: u.package_names || [],
    sameDayRequestCount: u.same_day_request_count,
  };
}

exports.login = asyncHandler(async (req, res) => {
  const { login_id, password } = req.body;
  if (!login_id || !password) throw new AppError('Login ID and password are required', 400);

  const user = await fetchUserWithPackages({ byLoginId: login_id });
  if (!user || !user.active_flag) throw new AppError('Invalid credentials', 401);

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new AppError('Invalid credentials', 401);

  const { accessToken, refreshToken } = generateTokens(user.user_id, user.role);
  await query(`UPDATE users SET updated_at = NOW() WHERE user_id = $1`, [user.user_id]);

  res.json({ accessToken, refreshToken, user: formatUser(user) });
});

exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('Refresh token required', 400);

  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  const { rows } = await query('SELECT user_id, role, active_flag FROM users WHERE user_id = $1', [decoded.userId]);
  if (!rows[0] || !rows[0].active_flag) throw new AppError('User not found', 401);

  res.json(generateTokens(rows[0].user_id, rows[0].role));
});

exports.logout = asyncHandler(async (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

exports.getMe = asyncHandler(async (req, res) => {
  const user = await fetchUserWithPackages({ byUserId: req.user.user_id });
  res.json(formatUser(user));
});
