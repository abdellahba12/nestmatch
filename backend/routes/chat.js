const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

// Get messages in a conversation
router.get('/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify user is part of the conversation
    const accessCheck = await query(
      `SELECT c.id FROM conversations c
       JOIN matches m ON m.id = c.match_id
       WHERE c.id = $1 AND (m.user1_id = $2 OR m.user2_id = $2)`,
      [conversationId, userId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const { before, limit = 50 } = req.query;
    let msgQuery;
    let params;

    if (before) {
      msgQuery = `SELECT m.id, m.content, m.created_at, m.is_read, m.sender_id,
                  u.name as sender_name, u.avatar_url as sender_avatar
                  FROM messages m
                  JOIN users u ON u.id = m.sender_id
                  WHERE m.conversation_id = $1 AND m.created_at < $2
                  ORDER BY m.created_at DESC LIMIT $3`;
      params = [conversationId, before, parseInt(limit)];
    } else {
      msgQuery = `SELECT m.id, m.content, m.created_at, m.is_read, m.sender_id,
                  u.name as sender_name, u.avatar_url as sender_avatar
                  FROM messages m
                  JOIN users u ON u.id = m.sender_id
                  WHERE m.conversation_id = $1
                  ORDER BY m.created_at DESC LIMIT $2`;
      params = [conversationId, parseInt(limit)];
    }

    const result = await query(msgQuery, params);
    const messages = result.rows.reverse(); // oldest first

    // Mark unread messages as read
    await query(
      `UPDATE messages SET is_read = TRUE
       WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE`,
      [conversationId, userId]
    );

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a message (REST fallback)
router.post('/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Message content required' });
    }

    // Verify access
    const accessCheck = await query(
      `SELECT c.id FROM conversations c
       JOIN matches m ON m.id = c.match_id
       WHERE c.id = $1 AND (m.user1_id = $2 OR m.user2_id = $2)`,
      [conversationId, userId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at, sender_id, is_read`,
      [conversationId, userId, content.trim()]
    );

    const message = result.rows[0];
    message.sender_name = req.user.name;

    // Emit via WebSocket if available (handled in server.js)
    if (global.io) {
      global.io.to(`conv_${conversationId}`).emit('new_message', message);
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
