require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const flash = require('connect-flash');
const SqliteStore = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');

// ===== Validate required environment variables =====
const requiredEnvVars = ['SESSION_SECRET', 'ENCRYPTION_KEY'];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`FATAL: Environment variable ${varName} is required but not set.`);
    process.exit(1);
  }
}

const db = require('./config/database');
const indexRoutes = require('./routes/index');
const organizerRoutes = require('./routes/organizer');
const groupRoutes = require('./routes/group');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy (behind Nginx Proxy Manager)
app.set('trust proxy', 1);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== Security Headers (helmet) =====
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      scriptSrc: ['\'self\'', '\'unsafe-inline\''],  // inline scripts in EJS views
      styleSrc: ['\'self\'', '\'unsafe-inline\''],    // inline styles in EJS views
      imgSrc: ['\'self\'', 'data:'],
      connectSrc: ['\'self\''],
      fontSrc: ['\'self\''],
      objectSrc: ['\'none\''],
      frameAncestors: ['\'none\'']
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ===== Rate Limiting =====
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de requetes, veuillez reessayer plus tard.'
});
app.use(generalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de tentatives, veuillez reessayer dans 15 minutes.'
});

const emailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Veuillez patienter avant de renvoyer des emails.'
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(express.static(path.join(__dirname, 'public')));

// ===== Session configuration with persistent SQLite store =====
const sessionDb = new Database(path.join(__dirname, 'data', 'sessions.db'));

app.use(session({
  store: new SqliteStore({
    client: sessionDb,
    expired: {
      clear: true,
      intervalMs: 900000 // Clear expired sessions every 15 min
    }
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ===== Flash Messages =====
app.use(flash());

// ===== CSRF Protection =====
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET,
  getSessionIdentifier: () => '',
  cookieName: '__csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: false
  },
  getCsrfTokenFromRequest: (req) => req.body._csrf || req.headers['x-csrf-token']
});

// Apply CSRF protection to all non-GET requests
app.use(doubleCsrfProtection);

// Make session, CSRF token, flash messages, theme, and app URL available in views
app.use((req, res, next) => {
  res.locals.organizer = req.session.organizer || null;
  res.locals.csrfToken = generateCsrfToken(req, res);
  res.locals.appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  res.locals.flashSuccess = req.flash('success');
  res.locals.flashError = req.flash('error');
  res.locals.theme = db.getConfig('theme') || 'default';
  next();
});

// ===== Routes =====

// Apply auth rate limiter to login/register/password reset
app.use('/organizer/login', authLimiter);
app.use('/organizer/register', authLimiter);
app.use('/organizer/forgot-password', authLimiter);
app.use('/organizer/reset-password', authLimiter);
app.use('/join', authLimiter);
app.use('/participant', authLimiter);

// Apply email rate limiter
app.use('/organizer/groups/:groupId(\\d+)/draw/send-emails', emailLimiter);
app.use('/organizer/groups/:groupId(\\d+)/draw/resend', emailLimiter);

app.use('/admin', adminRoutes);
app.use('/organizer/groups/:groupId(\\d+)', groupRoutes);
app.use('/organizer', organizerRoutes);
app.use('/', indexRoutes);

// ===== Error Handlers =====

// CSRF token error handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN' || err.message === 'invalid csrf token') {
    return res.status(403).render('error', {
      message: 'Session invalide ou expiree. Veuillez rafraichir la page et reessayer.',
      error: {}
    });
  }
  next(err);
});

// General error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    message: 'Une erreur est survenue',
    error: {}  // Never expose error details to client
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    message: 'Page non trouvee',
    error: {}
  });
});

// Initialize database and start server
db.initialize();

app.listen(PORT, () => {
  console.log(`Secret Santa app running on http://localhost:${PORT}`);
});

module.exports = { app, authLimiter, emailLimiter };
