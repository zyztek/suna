
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');

// Initialize Sentry error monitoring
Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://your-dsn@sentry.io/your-project',
  tracing: true,
  environment: process.env.NODE_ENV || 'development'
});

const app = express();

// Middleware
app.use(Sentry.Handlers.requestHandler());
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/knowledge-base-saas';
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  Sentry.captureException(err);
});

// Routes
const authRoutes = require('./routes/auth');
const knowledgeBaseRoutes = require('./routes/knowledge-base');
const userRoutes = require('./routes/users');
const recommendationRoutes = require('./routes/recommendations');

app.use('/api/auth', authRoutes);
app.use('/api/knowledge-base', knowledgeBaseRoutes);
app.use('/api/users', userRoutes);
app.use('/api/recommendations', recommendationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use(Sentry.Handlers.errorHandler());

app.use((err, req, res, next) => {
  console.error('Error:', err);
  Sentry.captureException(err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
