const express = require('express');
const router = express.Router();
const Participant = require('../models/participant');
const Exclusion = require('../models/exclusion');
const Assignment = require('../models/assignment');
const DrawService = require('../services/draw');
const MailerService = require('../services/mailer');

/**
 * Authentication middleware
 */
function requireAuth(req, res, next) {
  if (req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
}

/**
 * Login page
 */
router.get('/login', (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect('/admin');
  }
  res.render('admin/login', {
    title: 'Connexion Admin',
    error: null
  });
});

/**
 * Handle login
 */
router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

  if (password === adminPassword) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }

  res.render('admin/login', {
    title: 'Connexion Admin',
    error: 'Mot de passe incorrect'
  });
});

/**
 * Logout
 */
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

/**
 * Admin dashboard
 */
router.get('/', requireAuth, (req, res) => {
  const participants = Participant.findAll();
  const drawExists = Assignment.drawExists();
  const pendingEmails = Assignment.countPendingEmails();
  const sentEmails = Assignment.countSentEmails();
  const smtpConfigured = MailerService.isConfigured();

  res.render('admin/dashboard', {
    title: 'Tableau de bord',
    participants,
    drawExists,
    pendingEmails,
    sentEmails,
    smtpConfigured,
    message: req.query.message,
    error: req.query.error
  });
});

/**
 * Delete participant
 */
router.post('/participants/:id/delete', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    // Check if draw exists
    if (Assignment.drawExists()) {
      return res.redirect('/admin?error=' + encodeURIComponent('Impossible de supprimer un participant après le tirage.'));
    }

    Participant.delete(id);
    res.redirect('/admin?message=' + encodeURIComponent('Participant supprimé.'));
  } catch (error) {
    console.error('Delete participant error:', error);
    res.redirect('/admin?error=' + encodeURIComponent('Erreur lors de la suppression.'));
  }
});

/**
 * Exclusions management page
 */
router.get('/exclusions', requireAuth, (req, res) => {
  const participants = Participant.findAll();
  const exclusions = Exclusion.findAll();
  const drawExists = Assignment.drawExists();

  res.render('admin/exclusions', {
    title: 'Règles d\'exclusion',
    participants,
    exclusions,
    drawExists,
    message: req.query.message,
    error: req.query.error
  });
});

/**
 * Add exclusion rule
 */
router.post('/exclusions/add', requireAuth, (req, res) => {
  const { giver_id, receiver_id } = req.body;

  if (Assignment.drawExists()) {
    return res.redirect('/admin/exclusions?error=' + encodeURIComponent('Impossible de modifier les exclusions après le tirage.'));
  }

  if (giver_id === receiver_id) {
    return res.redirect('/admin/exclusions?error=' + encodeURIComponent('Une personne ne peut pas s\'exclure elle-même.'));
  }

  try {
    Exclusion.create(parseInt(giver_id), parseInt(receiver_id));
    res.redirect('/admin/exclusions?message=' + encodeURIComponent('Règle d\'exclusion ajoutée.'));
  } catch (error) {
    console.error('Add exclusion error:', error);
    res.redirect('/admin/exclusions?error=' + encodeURIComponent('Erreur lors de l\'ajout.'));
  }
});

/**
 * Delete exclusion rule
 */
router.post('/exclusions/:id/delete', requireAuth, (req, res) => {
  const { id } = req.params;

  if (Assignment.drawExists()) {
    return res.redirect('/admin/exclusions?error=' + encodeURIComponent('Impossible de modifier les exclusions après le tirage.'));
  }

  try {
    Exclusion.delete(id);
    res.redirect('/admin/exclusions?message=' + encodeURIComponent('Règle d\'exclusion supprimée.'));
  } catch (error) {
    console.error('Delete exclusion error:', error);
    res.redirect('/admin/exclusions?error=' + encodeURIComponent('Erreur lors de la suppression.'));
  }
});

/**
 * Draw page
 */
router.get('/draw', requireAuth, (req, res) => {
  const participantCount = Participant.count();
  const drawExists = Assignment.drawExists();
  const assignments = drawExists ? Assignment.findAllForAdmin() : [];
  const canDraw = DrawService.canPerformDraw();
  const pendingEmails = Assignment.countPendingEmails();
  const sentEmails = Assignment.countSentEmails();
  const smtpConfigured = MailerService.isConfigured();

  res.render('admin/draw', {
    title: 'Tirage au sort',
    participantCount,
    drawExists,
    assignments,
    canDraw,
    pendingEmails,
    sentEmails,
    smtpConfigured,
    message: req.query.message,
    error: req.query.error
  });
});

/**
 * Perform draw
 */
router.post('/draw/perform', requireAuth, (req, res) => {
  if (Assignment.drawExists()) {
    return res.redirect('/admin/draw?error=' + encodeURIComponent('Un tirage a déjà été effectué.'));
  }

  const result = DrawService.performDraw();

  if (result.success) {
    res.redirect('/admin/draw?message=' + encodeURIComponent(result.message));
  } else {
    res.redirect('/admin/draw?error=' + encodeURIComponent(result.message));
  }
});

/**
 * Reset draw (clear all assignments)
 */
router.post('/draw/reset', requireAuth, (req, res) => {
  try {
    Assignment.clearAll();
    res.redirect('/admin/draw?message=' + encodeURIComponent('Tirage réinitialisé.'));
  } catch (error) {
    console.error('Reset draw error:', error);
    res.redirect('/admin/draw?error=' + encodeURIComponent('Erreur lors de la réinitialisation.'));
  }
});

/**
 * Send all emails
 */
router.post('/draw/send-emails', requireAuth, async (req, res) => {
  if (!Assignment.drawExists()) {
    return res.redirect('/admin/draw?error=' + encodeURIComponent('Aucun tirage effectué.'));
  }

  try {
    const result = await MailerService.sendAllEmails();

    if (result.success) {
      res.redirect('/admin/draw?message=' + encodeURIComponent(result.message));
    } else {
      res.redirect('/admin/draw?error=' + encodeURIComponent(result.message));
    }
  } catch (error) {
    console.error('Send emails error:', error);
    res.redirect('/admin/draw?error=' + encodeURIComponent('Erreur lors de l\'envoi des emails.'));
  }
});

/**
 * Test SMTP connection
 */
router.post('/test-smtp', requireAuth, async (req, res) => {
  const result = await MailerService.testConnection();
  res.json(result);
});

module.exports = router;
