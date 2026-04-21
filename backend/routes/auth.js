const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendVerificationCode: sendCodeEmail, sendWelcomeEmail } = require('../utils/mailer');

// Multer config for identity verification (memory storage → base64)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// ── Send verification code ──
router.post('/send-code', async (req, res) => {
  try {
    const { contact, method } = req.body;
    if (!contact) return res.status(400).json({ error: 'Contact is required' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query('DELETE FROM verification_codes WHERE contact = $1', [contact]);
    await query(
      'INSERT INTO verification_codes (contact, code, method, expires_at) VALUES ($1, $2, $3, $4)',
      [contact, code, method || 'email', expiresAt]
    );

    if (method === 'email') {
      try {
        await sendCodeEmail(contact, code);
      } catch (emailErr) {
        console.error('Email send error:', emailErr.message);
        if (!process.env.SMTP_USER) {
          console.log(`[DEV] Verification code for ${contact}: ${code}`);
        } else {
          return res.status(500).json({ error: 'Failed to send verification email' });
        }
      }
    } else {
      console.log(`[SMS] Verification code for ${contact}: ${code}`);
    }

    res.json({ message: 'Code sent', method });
  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({ error: 'Server error sending verification code' });
  }
});

// ── Verify code ──
router.post('/verify-code', async (req, res) => {
  try {
    const { contact, code, method } = req.body;
    if (!contact || !code) return res.status(400).json({ error: 'Contact and code are required' });

    const result = await query(
      `SELECT * FROM verification_codes
       WHERE contact = $1 AND code = $2 AND method = $3 AND verified = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [contact, code, method || 'email']
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    await query('UPDATE verification_codes SET verified = true WHERE id = $1', [result.rows[0].id]);
    res.json({ verified: true });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ error: 'Server error verifying code' });
  }
});

// ── Register (simplified: email/phone + password only) ──
router.post('/register', async (req, res) => {
  try {
    const { email, phone, password, verified, reg_method } = req.body;

    const contact = email || phone;
    if (!contact || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check duplicates
    if (email) {
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });
    }
    if (phone) {
      const existing = await query('SELECT id FROM users WHERE phone = $1', [phone]);
      if (existing.rows.length > 0) return res.status(409).json({ error: 'Phone already registered' });
    }

    const hash = await bcrypt.hash(password, 12);
    // Default name from email or phone
    const defaultName = email ? email.split('@')[0] : phone;

    const userResult = await query(
      `INSERT INTO users (email, phone, password_hash, name, is_verified)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, phone, name, subscription_status`,
      [email || null, phone || null, hash, defaultName, verified || false]
    );

    const user = userResult.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    // Send welcome email (async)
    if (email) {
      sendWelcomeEmail(email, defaultName).catch(err => {
        console.error('Welcome email error:', err.message);
      });
    }

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, phone: user.phone, name: user.name }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ── Google OAuth2 (server-side redirect flow) ──
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  if (!clientId) {
    return res.status(500).send('GOOGLE_CLIENT_ID not configured');
  }

  const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&prompt=select_account`;

  console.log('[Google] Redirecting to Google, callback:', redirectUri);
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
  try {
    const { code } = req.query;
    if (!code) return res.redirect('/?error=google_no_code');

    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();
    console.log('[Google] Token exchange status:', tokenRes.status);

    if (!tokens.access_token) {
      console.error('[Google] Token error:', tokens);
      return res.redirect('/?error=google_token_fail');
    }

    // Get user info
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const profile = await userInfoRes.json();
    console.log('[Google] User:', profile.email, profile.name);

    const { email, name, picture } = profile;
    if (!email) return res.redirect('/?error=google_no_email');

    // Find or create user
    let userResult = await query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      const randomPass = require('crypto').randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(randomPass, 12);

      userResult = await query(
        `INSERT INTO users (email, password_hash, name, avatar_url, is_verified)
         VALUES ($1, $2, $3, $4, true)
         RETURNING *`,
        [email, hash, name || email.split('@')[0], picture || null]
      );

      sendWelcomeEmail(email, name || email.split('@')[0]).catch(err => {
        console.error('Welcome email error:', err.message);
      });
    }

    const user = userResult.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    // Redirect to frontend with token
    res.redirect(`/?token=${token}`);
  } catch (error) {
    console.error('Google callback error:', error);
    res.redirect('/?error=google_server_error');
  }
});

// ── Login ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email/phone and password required' });
    }

    const result = await query('SELECT * FROM users WHERE email = $1 OR phone = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user.id, email: user.email, phone: user.phone, name: user.name,
        city: user.city, subscription_status: user.subscription_status, avatar_url: user.avatar_url
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ── Get own profile ──
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.phone, u.name, u.age, u.gender, u.bio, u.city, u.neighborhood,
              u.profession, u.hobbies, u.languages, u.is_smoker, u.has_pets,
              u.avatar_url, u.is_verified, u.verification_status,
              u.cleanliness, u.cooking, u.schedule, u.personality,
              u.subscription_status, u.subscription_expires_at,
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

// ── Update profile ──
router.put('/me', authenticate, async (req, res) => {
  try {
    const {
      name, age, gender, bio, city, neighborhood, profession,
      hobbies, languages, is_smoker, has_pets, avatar_url,
      cleanliness, cooking, schedule, personality,
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
       cleanliness = COALESCE($14, cleanliness), cooking = COALESCE($15, cooking),
       schedule = COALESCE($16, schedule), personality = COALESCE($17, personality),
       updated_at = NOW()
       WHERE id = $13`,
      [name, age, gender, bio, city, neighborhood, profession,
       hobbies, languages, is_smoker, has_pets, avatar_url, req.user.id,
       cleanliness, cooking, schedule, personality]
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
    } else if (budget_min || budget_max || preferred_zones) {
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

// ── Submit identity verification (DNI + Selfie) ──
router.post('/verify-identity', authenticate, upload.fields([
  { name: 'dni', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]), async (req, res) => {
  try {
    const dniFile = req.files?.dni?.[0];
    const selfieFile = req.files?.selfie?.[0];

    if (!dniFile || !selfieFile) {
      return res.status(400).json({ error: 'Both DNI photo and selfie are required' });
    }

    const dniBase64 = `data:${dniFile.mimetype};base64,${dniFile.buffer.toString('base64')}`;
    const selfieBase64 = `data:${selfieFile.mimetype};base64,${selfieFile.buffer.toString('base64')}`;

    await query('DELETE FROM verification_documents WHERE user_id = $1', [req.user.id]);
    await query(
      `INSERT INTO verification_documents (user_id, dni_data, selfie_data, status)
       VALUES ($1, $2, $3, 'pending')`,
      [req.user.id, dniBase64, selfieBase64]
    );
    await query(
      `UPDATE users SET verification_status = 'pending', updated_at = NOW() WHERE id = $1`,
      [req.user.id]
    );

    res.json({ message: 'Verification documents submitted', status: 'pending' });
  } catch (error) {
    console.error('Verify identity error:', error);
    res.status(500).json({ error: 'Server error uploading verification documents' });
  }
});

// ── Get verification status ──
router.get('/verification-status', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT verification_status, is_verified FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0] || { verification_status: 'none', is_verified: false });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Upload profile photo ──
router.post('/upload-photo', authenticate, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo provided' });

    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
    const isMain = req.body.is_main === 'true';

    if (isMain) {
      // Update avatar_url on user
      await query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [dataUrl, req.user.id]);
      // Mark existing photos as not main
      await query('UPDATE user_photos SET is_main = false WHERE user_id = $1', [req.user.id]);
    }

    await query(
      'INSERT INTO user_photos (user_id, url, is_main) VALUES ($1, $2, $3)',
      [req.user.id, dataUrl, isMain]
    );

    res.json({ url: dataUrl });
  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
