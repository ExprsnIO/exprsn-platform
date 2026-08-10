/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Unified Admin Interface
 * Central management console for all Exprsn services
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

// Import routes
const servicesRouter = require('./routes/services');
const configRouter = require('./routes/config');
const processRouter = require('./routes/process');
const usersRouter = require('./routes/users');
const caRouter = require('./routes/ca');
const databaseRouter = require('./routes/database');
const redisRouter = require('./routes/redis');
const certificatesRouter = require('./routes/certificates');
const tokensRouter = require('./routes/tokens');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

const PORT = process.env.ADMIN_PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Make Socket.IO available globally
app.set('io', io);
global.adminIO = io;

// API Routes
app.use('/api/services', servicesRouter);
app.use('/api/config', configRouter);
app.use('/api/process', processRouter);
app.use('/api/users', usersRouter);
app.use('/api/ca', caRouter);
app.use('/api/database', databaseRouter);
app.use('/api/redis', redisRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/tokens', tokensRouter);

// Serve main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'exprsn-admin',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Exprsn Unified Admin Interface`);
  console.log(`${'═'.repeat(70)}\n`);
  console.log(`  🌐 Admin Console: http://localhost:${PORT}`);
  console.log(`  📊 Service Management: http://localhost:${PORT}/#/services`);
  console.log(`  ⚙️  Configuration: http://localhost:${PORT}/#/config`);
  console.log(`\n${'═'.repeat(70)}\n`);
});

module.exports = { app, server, io };
