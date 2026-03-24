require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const jwt = require('jsonwebtoken');
const { query, pool } = require('./db');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// WebSocket setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  }
});
global.io = io;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for single-file frontend
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Stripe webhook needs raw body BEFORE express.json()
const paymentsRouter = require('./routes/payments');
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentsRouter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/conversations', require('./routes/chat'));
app.use('/api/payments', paymentsRouter);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// Serve static frontend
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
});

// WebSocket auth + chat
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId}`);

  // Join personal room for notifications
  socket.join(`user_${socket.userId}`);

  // Join a conversation room
  socket.on('join_conversation', async (conversationId) => {
    try {
      // Verify access
      const check = await query(
        `SELECT c.id FROM conversations c
         JOIN matches m ON m.id = c.match_id
         WHERE c.id = $1 AND (m.user1_id = $2 OR m.user2_id = $2)`,
        [conversationId, socket.userId]
      );

      if (check.rows.length > 0) {
        socket.join(`conv_${conversationId}`);
        socket.emit('joined_conversation', { conversationId });
      } else {
        socket.emit('error', { message: 'Access denied to conversation' });
      }
    } catch (err) {
      socket.emit('error', { message: 'Server error' });
    }
  });

  // Send a message via WebSocket
  socket.on('send_message', async (data) => {
    const { conversation_id, content } = data;
    if (!content || !conversation_id) return;

    try {
      // Verify access
      const check = await query(
        `SELECT c.id FROM conversations c
         JOIN matches m ON m.id = c.match_id
         WHERE c.id = $1 AND (m.user1_id = $2 OR m.user2_id = $2)`,
        [conversation_id, socket.userId]
      );

      if (check.rows.length === 0) {
        return socket.emit('error', { message: 'Access denied' });
      }

      const result = await query(
        `INSERT INTO messages (conversation_id, sender_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, content, created_at, sender_id, is_read`,
        [conversation_id, socket.userId, content.trim()]
      );

      const message = result.rows[0];

      // Get sender info
      const userResult = await query('SELECT name, avatar_url FROM users WHERE id = $1', [socket.userId]);
      message.sender_name = userResult.rows[0].name;
      message.sender_avatar = userResult.rows[0].avatar_url;

      // Broadcast to conversation room
      io.to(`conv_${conversation_id}`).emit('new_message', message);

      // Notify match partner (push notification-style)
      const matchResult = await query(
        `SELECT m.user1_id, m.user2_id FROM conversations c
         JOIN matches m ON m.id = c.match_id WHERE c.id = $1`,
        [conversation_id]
      );

      if (matchResult.rows.length > 0) {
        const match = matchResult.rows[0];
        const partnerId = match.user1_id === socket.userId ? match.user2_id : match.user1_id;
        io.to(`user_${partnerId}`).emit('message_notification', {
          conversation_id,
          sender_name: message.sender_name,
          preview: content.substring(0, 50)
        });
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
      socket.emit('error', { message: 'Could not send message' });
    }
  });

  socket.on('typing', (data) => {
    const { conversation_id } = data;
    socket.to(`conv_${conversation_id}`).emit('user_typing', {
      user_id: socket.userId,
      conversation_id
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
});

// Initialize DB schema on startup
const initDB = async () => {
  try {
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schemaSQL);
    console.log('✅ Database schema initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
};

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await initDB();
  console.log(`🚀 NestMatch server running on port ${PORT}`);
});

module.exports = { app, server };
