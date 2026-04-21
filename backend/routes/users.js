const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate, checkSwipeLimit } = require('../middleware/auth');

// Get profiles to discover (with zone filter)
router.get('/discover', authenticate, async (req, res) => {
  try {
    const { city, zone, age_min, age_max, gender, budget_max } = req.query;
    const userId = req.user.id;

    // Already seen / swiped users
    const seenResult = await query(
      'SELECT swiped_id FROM swipes WHERE swiper_id = $1', [userId]
    );
    const seenIds = seenResult.rows.map(r => r.swiped_id);
    seenIds.push(userId); // exclude self

    let conditions = ['u.id != ALL($1)', 'u.name IS NOT NULL'];
    let params = [seenIds];
    let paramIndex = 2;

    if (city) {
      conditions.push(`LOWER(u.city) LIKE LOWER($${paramIndex})`);
      params.push(`%${city}%`);
      paramIndex++;
    }
    if (age_min) {
      conditions.push(`u.age >= $${paramIndex}`);
      params.push(parseInt(age_min));
      paramIndex++;
    }
    if (age_max) {
      conditions.push(`u.age <= $${paramIndex}`);
      params.push(parseInt(age_max));
      paramIndex++;
    }
    if (gender && gender !== 'any') {
      conditions.push(`u.gender = $${paramIndex}`);
      params.push(gender);
      paramIndex++;
    }
    if (budget_max) {
      conditions.push(`(rp.budget_max IS NULL OR rp.budget_max <= $${paramIndex})`);
      params.push(parseInt(budget_max));
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT u.id, u.name, u.age, u.gender, u.bio, u.city, u.neighborhood,
              u.profession, u.hobbies, u.languages, u.is_smoker, u.has_pets, u.avatar_url,
              u.cleanliness, u.cooking, u.schedule, u.personality, u.is_verified,
              rp.budget_min, rp.budget_max, rp.preferred_zones, rp.stay_duration, rp.room_type,
              (SELECT url FROM user_photos WHERE user_id = u.id AND is_main = TRUE LIMIT 1) as main_photo,
              (SELECT json_agg(url) FROM user_photos WHERE user_id = u.id LIMIT 5) as photos
       FROM users u
       LEFT JOIN room_preferences rp ON rp.user_id = u.id
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT 20`,
      params
    );

    // Get current user swipe status
    const swipeStatus = await query(
      'SELECT daily_swipes_count, daily_swipes_reset_at, subscription_status, subscription_expires_at FROM users WHERE id = $1',
      [userId]
    );
    const su = swipeStatus.rows[0];
    const today = new Date().toISOString().split('T')[0];
    const resetAt = su.daily_swipes_reset_at ? su.daily_swipes_reset_at.toISOString().split('T')[0] : null;
    const swipesUsed = resetAt === today ? su.daily_swipes_count : 0;
    const isPremium = su.subscription_status === 'premium' && su.subscription_expires_at && new Date(su.subscription_expires_at) > new Date();

    res.json({
      profiles: result.rows,
      meta: {
        swipes_today: swipesUsed,
        swipes_remaining: isPremium ? 'unlimited' : Math.max(0, 5 - swipesUsed),
        is_premium: isPremium,
        free_limit: 5
      }
    });
  } catch (error) {
    console.error('Discover error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Swipe on a profile
router.post('/swipe', authenticate, checkSwipeLimit, async (req, res) => {
  try {
    const { target_id, direction } = req.body;
    const userId = req.user.id;

    if (!target_id || !['like', 'pass'].includes(direction)) {
      return res.status(400).json({ error: 'target_id and direction (like/pass) required' });
    }

    // Check target exists
    const targetCheck = await query('SELECT id FROM users WHERE id = $1', [target_id]);
    if (targetCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Record swipe (upsert)
    await query(
      'INSERT INTO swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, $3) ON CONFLICT (swiper_id, swiped_id) DO UPDATE SET direction = $3',
      [userId, target_id, direction]
    );

    // Increment daily swipe count
    const today = new Date().toISOString().split('T')[0];
    await query(
      `UPDATE users SET 
       daily_swipes_count = CASE WHEN daily_swipes_reset_at = $1 THEN daily_swipes_count + 1 ELSE 1 END,
       daily_swipes_reset_at = $1
       WHERE id = $2`,
      [today, userId]
    );

    let matched = false;
    let matchId = null;
    let conversationId = null;

    // Check for mutual like
    if (direction === 'like') {
      console.log(`[Match] Checking mutual like: target=${target_id} → user=${userId}`);
      const mutualCheck = await query(
        'SELECT id FROM swipes WHERE swiper_id = $1 AND swiped_id = $2 AND direction = $3',
        [target_id, userId, 'like']
      );
      console.log(`[Match] Mutual check result: ${mutualCheck.rows.length} rows`);

      if (mutualCheck.rows.length > 0) {
        // Create match (ensure consistent ordering)
        const [u1, u2] = [userId, target_id].sort();
        console.log(`[Match] Creating match: u1=${u1}, u2=${u2}`);
        const matchResult = await query(
          `INSERT INTO matches (user1_id, user2_id) VALUES ($1, $2)
           ON CONFLICT (user1_id, user2_id) DO UPDATE SET created_at = NOW()
           RETURNING id`,
          [u1, u2]
        );
        matchId = matchResult.rows[0].id;
        console.log(`[Match] Match created: id=${matchId}`);

        // Create conversation
        try {
          const existConv = await query('SELECT id FROM conversations WHERE match_id = $1', [matchId]);
          if (existConv.rows.length > 0) {
            conversationId = existConv.rows[0].id;
          } else {
            const convResult = await query(
              'INSERT INTO conversations (match_id) VALUES ($1) RETURNING id',
              [matchId]
            );
            conversationId = convResult.rows[0].id;
          }
          console.log(`[Match] Conversation: id=${conversationId}`);
        } catch (convErr) {
          console.error('[Match] Conversation creation error:', convErr);
          // Match is still valid even if conversation fails
        }
        matched = true;
      }
    }

    // Get updated swipe info
    const updatedUser = await query(
      'SELECT daily_swipes_count, subscription_status, subscription_expires_at FROM users WHERE id = $1', [userId]
    );
    const uu = updatedUser.rows[0];
    const isPremium = uu.subscription_status === 'premium' && uu.subscription_expires_at && new Date(uu.subscription_expires_at) > new Date();

    res.json({
      matched,
      match_id: matchId,
      conversation_id: conversationId,
      swipes_today: uu.daily_swipes_count,
      swipes_remaining: isPremium ? 'unlimited' : Math.max(0, 5 - uu.daily_swipes_count)
    });
  } catch (error) {
    console.error('Swipe error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get matches list
router.get('/matches', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT m.id as match_id, m.created_at as matched_at,
              c.id as conversation_id,
              CASE WHEN m.user1_id = $1 THEN u2.id ELSE u1.id END as other_user_id,
              CASE WHEN m.user1_id = $1 THEN COALESCE(u2.name, 'Usuario') ELSE COALESCE(u1.name, 'Usuario') END as other_user_name,
              CASE WHEN m.user1_id = $1 THEN u2.avatar_url ELSE u1.avatar_url END as other_user_avatar,
              CASE WHEN m.user1_id = $1 THEN COALESCE(u2.city, '') ELSE COALESCE(u1.city, '') END as other_user_city,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND is_read = FALSE) as unread_count
       FROM matches m
       JOIN users u1 ON u1.id = m.user1_id
       JOIN users u2 ON u2.id = m.user2_id
       LEFT JOIN conversations c ON c.match_id = m.id
       WHERE m.user1_id = $1 OR m.user2_id = $1
       ORDER BY m.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Matches error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single user profile
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.age, u.gender, u.bio, u.city, u.neighborhood,
              u.profession, u.hobbies, u.languages, u.is_smoker, u.has_pets, u.avatar_url,
              u.cleanliness, u.cooking, u.schedule, u.personality, u.is_verified,
              u.created_at,
              rp.budget_min, rp.budget_max, rp.preferred_zones, rp.stay_duration, rp.room_type,
              (SELECT json_agg(url ORDER BY is_main DESC) FROM user_photos WHERE user_id = u.id) as photos
       FROM users u
       LEFT JOIN room_preferences rp ON rp.user_id = u.id
       WHERE u.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete account
router.delete('/me', authenticate, async (req, res) => {
  try {
    await query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /me]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
