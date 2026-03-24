const jwt = require('jsonwebtoken');
const { query } = require('../db');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query('SELECT id, email, name, subscription_status, subscription_expires_at FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(error);
  }
};

const checkSwipeLimit = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userResult = await query(
      'SELECT daily_swipes_count, daily_swipes_reset_at, subscription_status, subscription_expires_at FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Reset daily count if new day
    const today = new Date().toISOString().split('T')[0];
    const resetAt = user.daily_swipes_reset_at ? user.daily_swipes_reset_at.toISOString().split('T')[0] : null;

    if (resetAt !== today) {
      await query(
        'UPDATE users SET daily_swipes_count = 0, daily_swipes_reset_at = $1 WHERE id = $2',
        [today, userId]
      );
      user.daily_swipes_count = 0;
    }

    const FREE_LIMIT = 5;
    const isPremium = user.subscription_status === 'premium' && 
      user.subscription_expires_at && 
      new Date(user.subscription_expires_at) > new Date();

    if (!isPremium && user.daily_swipes_count >= FREE_LIMIT) {
      return res.status(402).json({ 
        error: 'Daily limit reached',
        code: 'LIMIT_REACHED',
        message: 'Has alcanzado tu límite diario de 5 perfiles. Hazte Premium para ver más.',
        swipes_used: user.daily_swipes_count,
        limit: FREE_LIMIT
      });
    }

    req.swipeInfo = { count: user.daily_swipes_count, isPremium, limit: FREE_LIMIT };
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authenticate, checkSwipeLimit };
