const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  try {
    const {
      email, password, name, age, gender, bio, city, neighborhood,
      profession, hobbies, languages, is_smoker, has_pets,
      budget_min, budget_max, preferred_zones, move_in_date,
      stay_duration, room_type, looking_for_gender, age_min, age_max,
      accepts_smokers, accepts_pets
    } = req.body;

    // Validate required fields
    if (!email || !password || !name || !age || !city) {
      return res.status(400).json({ error: 'Missing required fields: email, password, name, age, city' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);

    const userResult = await query(
      `INSERT INTO users (email, password_hash, name, age, gender, bio, city, neighborhood, profession, hobbies, languages, is_smoker, has_pets)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, email, name, city, subscription_status`,
      [email, hash, name, age, gender || null, bio || null, city, neighborhood || null,
       profession || null, hobbies || [], languages || [], is_smoker || false, has_pets || false]
    );

    const user = userResult.rows[0];

    // Insert room preferences if provided
    if (budget_min || budget_max || preferred_zones) {
      await query(
        `INSERT INTO room_preferences (user_id, budget_min, budget_max, preferred_zones, move_in_date, stay_duration, room_type, looking_for_gender, age_min, age_max, accepts_smokers, accepts_pets)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [user.id, budget_min || null, budget_max || null, preferred_zones || [],
         move_in_date || null, stay_duration || 'medium', room_type || 'private',
         looking_for_gender || 'any', age_min || 18, age_max || 65,
         accepts_smokers !== undefined ? accepts_smokers : true,
         accepts_pets !== undefined ? accepts_pets : true]
      );
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, city: user.city } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        city: user.city,
        subscription_status: user.subscription_status,
        avatar_url: user.avatar_url
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get own profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.age, u.gender, u.bio, u.city, u.neighborhood,
              u.profession, u.hobbies, u.languages, u.is_smoker, u.has_pets,
              u.avatar_url, u.subscription_status, u.subscription_expires_at,
              u.daily_swipes_count, u.daily_swipes_reset_at, u.created_at,
              rp.budget_min, rp.budget_max, rp.preferred_zones, rp.move_in_date,
              rp.stay_duration, rp.room_type, rp.looking_for_gender, rp.age_min, rp.age_max,
              rp.accepts_smokers, rp.accepts_pets
       FROM users u
       LEFT JOIN room_preferences rp ON rp.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const photosResult = await query('SELECT url, is_main FROM user_photos WHERE user_id = $1 ORDER BY is_main DESC', [req.user.id]);

    const user = result.rows[0];
    user.photos = photosResult.rows;

    // Calculate daily swipe status
    const today = new Date().toISOString().split('T')[0];
    const resetAt = user.daily_swipes_reset_at ? user.daily_swipes_reset_at.toISOString().split('T')[0] : null;
    const swipesUsed = resetAt === today ? user.daily_swipes_count : 0;
    const isPremium = user.subscription_status === 'premium' && user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date();

    user.swipes_today = swipesUsed;
    user.swipes_remaining = isPremium ? 'unlimited' : Math.max(0, 5 - swipesUsed);
    user.is_premium = isPremium;

    res.json(user);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile
router.put('/me', authenticate, async (req, res) => {
  try {
    const {
      name, age, gender, bio, city, neighborhood, profession,
      hobbies, languages, is_smoker, has_pets, avatar_url,
      budget_min, budget_max, preferred_zones, move_in_date,
      stay_duration, room_type, looking_for_gender, age_min, age_max,
      accepts_smokers, accepts_pets
    } = req.body;

    await query(
      `UPDATE users SET name = COALESCE($1, name), age = COALESCE($2, age), gender = COALESCE($3, gender),
       bio = COALESCE($4, bio), city = COALESCE($5, city), neighborhood = COALESCE($6, neighborhood),
       profession = COALESCE($7, profession), hobbies = COALESCE($8, hobbies),
       languages = COALESCE($9, languages), is_smoker = COALESCE($10, is_smoker),
       has_pets = COALESCE($11, has_pets), avatar_url = COALESCE($12, avatar_url),
       updated_at = NOW()
       WHERE id = $13`,
      [name, age, gender, bio, city, neighborhood, profession,
       hobbies, languages, is_smoker, has_pets, avatar_url, req.user.id]
    );

    // Upsert room preferences
    const prefCheck = await query('SELECT id FROM room_preferences WHERE user_id = $1', [req.user.id]);
    if (prefCheck.rows.length > 0) {
      await query(
        `UPDATE room_preferences SET budget_min = COALESCE($1, budget_min), budget_max = COALESCE($2, budget_max),
         preferred_zones = COALESCE($3, preferred_zones), move_in_date = COALESCE($4, move_in_date),
         stay_duration = COALESCE($5, stay_duration), room_type = COALESCE($6, room_type),
         looking_for_gender = COALESCE($7, looking_for_gender), age_min = COALESCE($8, age_min),
         age_max = COALESCE($9, age_max), accepts_smokers = COALESCE($10, accepts_smokers),
         accepts_pets = COALESCE($11, accepts_pets), updated_at = NOW()
         WHERE user_id = $12`,
        [budget_min, budget_max, preferred_zones, move_in_date, stay_duration, room_type,
         looking_for_gender, age_min, age_max, accepts_smokers, accepts_pets, req.user.id]
      );
    } else {
      await query(
        `INSERT INTO room_preferences (user_id, budget_min, budget_max, preferred_zones, move_in_date, stay_duration, room_type, looking_for_gender, age_min, age_max, accepts_smokers, accepts_pets)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [req.user.id, budget_min, budget_max, preferred_zones || [], move_in_date,
         stay_duration || 'medium', room_type || 'private', looking_for_gender || 'any',
         age_min || 18, age_max || 65, accepts_smokers !== undefined ? accepts_smokers : true,
         accepts_pets !== undefined ? accepts_pets : true]
      );
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
