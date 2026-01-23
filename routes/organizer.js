const express = require('express');
const router = express.Router();
const Organizer = require('../models/organizer');
const Participant = require('../models/participant');
const Exclusion = require('../models/exclusion');
const Assignment = require('../models/assignment');
const DrawService = require('../services/draw');
const MailerService = require('../services/mailer');

/**
 * Authentication middleware - requires logged in organizer
 */
function requireAuth(req, res, next) {
  if (req.session.organizer) {
    return next();
  }
  res.redirect('/organizer/login');
}

/**
 * Helper to get current organizer ID
 */
function getOrganizerId(req) {
  return req.session.organizer ? req.session.organizer.id : null;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ==================== AUTHENTICATION ====================

/**
 * Registration form
 */
router.get('/register', (req, res) => {
  if (req.session.organizer) {
    return res.redirect('/organizer/dashboard');
  }
  res.render('organizer/register', {
    title: 'Creer un compte organisateur',
    error: null,
    formData: {}
  });
});

/**
 * Handle registration
 */
router.post('/register', async (req, res) => {
  const { email, password, password_confirm, first_name, last_name, group_name } = req.body;

  // Validation
  const errors = [];

  if (!first_name || first_name.trim().length < 2) {
    errors.push('Le prenom doit contenir au moins 2 caracteres.');
  }

  if (!last_name || last_name.trim().length < 2) {
    errors.push('Le nom doit contenir au moins 2 caracteres.');
  }

  if (!email || !isValidEmail(email)) {
    errors.push('Veuillez entrer une adresse email valide.');
  }

  if (!group_name || group_name.trim().length < 2) {
    errors.push('Le nom du groupe doit contenir au moins 2 caracteres.');
  }

  if (!password || password.length < 6) {
    errors.push('Le mot de passe doit contenir au moins 6 caracteres.');
  }

  if (password !== password_confirm) {
    errors.push('Les mots de passe ne correspondent pas.');
  }

  if (errors.length === 0 && Organizer.emailExists(email)) {
    errors.push('Cette adresse email est deja utilisee.');
  }

  if (errors.length > 0) {
    return res.render('organizer/register', {
      title: 'Creer un compte organisateur',
      error: errors.join(' '),
      formData: req.body
    });
  }

  try {
    const result = await Organizer.create({
      email,
      password,
      first_name,
      last_name,
      group_name
    });

    // Auto-login after registration
    req.session.organizer = {
      id: result.id,
      email: email.toLowerCase().trim(),
      firstName: first_name.trim(),
      lastName: last_name.trim(),
      groupName: group_name.trim(),
      groupCode: result.groupCode
    };

    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
      }
      res.redirect('/organizer/dashboard');
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.render('organizer/register', {
      title: 'Creer un compte organisateur',
      error: 'Une erreur est survenue lors de l\'inscription. Veuillez reessayer.',
      formData: req.body
    });
  }
});

/**
 * Login form
 */
router.get('/login', (req, res) => {
  if (req.session.organizer) {
    return res.redirect('/organizer/dashboard');
  }
  res.render('organizer/login', {
    title: 'Connexion Organisateur',
    error: null
  });
});

/**
 * Handle login
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const organizer = await Organizer.verifyPassword(email, password);

    if (organizer) {
      req.session.organizer = {
        id: organizer.id,
        email: organizer.email,
        firstName: organizer.first_name,
        lastName: organizer.last_name,
        groupName: organizer.group_name,
        groupCode: organizer.group_code
      };
      return req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
        }
        res.redirect('/organizer/dashboard');
      });
    }

    res.render('organizer/login', {
      title: 'Connexion Organisateur',
      error: 'Email ou mot de passe incorrect'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.render('organizer/login', {
      title: 'Connexion Organisateur',
      error: 'Une erreur est survenue'
    });
  }
});

/**
 * Logout
 */
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ==================== DASHBOARD ====================

/**
 * Dashboard - list participants
 */
router.get('/dashboard', requireAuth, (req, res) => {
  const organizerId = getOrganizerId(req);
  const participants = Participant.findAllByOrganizer(organizerId);
  const drawExists = Assignment.drawExistsByOrganizer(organizerId);
  const pendingEmails = Assignment.countPendingEmailsByOrganizer(organizerId);
  const sentEmails = Assignment.countSentEmailsByOrganizer(organizerId);
  const smtpConfigured = MailerService.isConfigured();

  res.render('organizer/dashboard', {
    title: 'Tableau de bord',
    organizer: req.session.organizer,
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
  const organizerId = getOrganizerId(req);

  try {
    // Check if draw exists
    if (Assignment.drawExistsByOrganizer(organizerId)) {
      return res.redirect('/organizer/dashboard?error=' + encodeURIComponent('Impossible de supprimer un participant apres le tirage.'));
    }

    // Verify participant belongs to this organizer
    const participant = Participant.findByIdAndOrganizer(id, organizerId);
    if (!participant) {
      return res.redirect('/organizer/dashboard?error=' + encodeURIComponent('Participant non trouve.'));
    }

    Participant.delete(id, organizerId);
    res.redirect('/organizer/dashboard?message=' + encodeURIComponent('Participant supprime.'));
  } catch (error) {
    console.error('Delete participant error:', error);
    res.redirect('/organizer/dashboard?error=' + encodeURIComponent('Erreur lors de la suppression.'));
  }
});

// ==================== EXCLUSIONS ====================

/**
 * Exclusions management page
 */
router.get('/exclusions', requireAuth, (req, res) => {
  const organizerId = getOrganizerId(req);
  const participants = Participant.findAllByOrganizer(organizerId);
  const exclusions = Exclusion.findAllByOrganizer(organizerId);
  const drawExists = Assignment.drawExistsByOrganizer(organizerId);

  res.render('organizer/exclusions', {
    title: 'Regles d\'exclusion',
    organizer: req.session.organizer,
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
  const organizerId = getOrganizerId(req);

  if (Assignment.drawExistsByOrganizer(organizerId)) {
    return res.redirect('/organizer/exclusions?error=' + encodeURIComponent('Impossible de modifier les exclusions apres le tirage.'));
  }

  if (giver_id === receiver_id) {
    return res.redirect('/organizer/exclusions?error=' + encodeURIComponent('Une personne ne peut pas s\'exclure elle-meme.'));
  }

  // Verify both participants belong to this organizer
  const giver = Participant.findByIdAndOrganizer(giver_id, organizerId);
  const receiver = Participant.findByIdAndOrganizer(receiver_id, organizerId);

  if (!giver || !receiver) {
    return res.redirect('/organizer/exclusions?error=' + encodeURIComponent('Participants non valides.'));
  }

  try {
    Exclusion.create(parseInt(giver_id), parseInt(receiver_id));
    res.redirect('/organizer/exclusions?message=' + encodeURIComponent('Regle d\'exclusion ajoutee.'));
  } catch (error) {
    console.error('Add exclusion error:', error);
    res.redirect('/organizer/exclusions?error=' + encodeURIComponent('Erreur lors de l\'ajout.'));
  }
});

/**
 * Delete exclusion rule
 */
router.post('/exclusions/:id/delete', requireAuth, (req, res) => {
  const { id } = req.params;
  const organizerId = getOrganizerId(req);

  if (Assignment.drawExistsByOrganizer(organizerId)) {
    return res.redirect('/organizer/exclusions?error=' + encodeURIComponent('Impossible de modifier les exclusions apres le tirage.'));
  }

  try {
    Exclusion.deleteByOrganizer(id, organizerId);
    res.redirect('/organizer/exclusions?message=' + encodeURIComponent('Regle d\'exclusion supprimee.'));
  } catch (error) {
    console.error('Delete exclusion error:', error);
    res.redirect('/organizer/exclusions?error=' + encodeURIComponent('Erreur lors de la suppression.'));
  }
});

// ==================== DRAW ====================

/**
 * Draw page
 */
router.get('/draw', requireAuth, (req, res) => {
  const organizerId = getOrganizerId(req);
  const participantCount = Participant.countByOrganizer(organizerId);
  const drawExists = Assignment.drawExistsByOrganizer(organizerId);
  const assignments = drawExists ? Assignment.findAllForOrganizer(organizerId) : [];
  const canDraw = DrawService.canPerformDraw(organizerId);
  const pendingEmails = Assignment.countPendingEmailsByOrganizer(organizerId);
  const sentEmails = Assignment.countSentEmailsByOrganizer(organizerId);
  const smtpConfigured = MailerService.isConfigured();

  res.render('organizer/draw', {
    title: 'Tirage au sort',
    organizer: req.session.organizer,
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
  const organizerId = getOrganizerId(req);

  if (Assignment.drawExistsByOrganizer(organizerId)) {
    return res.redirect('/organizer/draw?error=' + encodeURIComponent('Un tirage a deja ete effectue.'));
  }

  const result = DrawService.performDraw(organizerId);

  if (result.success) {
    res.redirect('/organizer/draw?message=' + encodeURIComponent(result.message));
  } else {
    res.redirect('/organizer/draw?error=' + encodeURIComponent(result.message));
  }
});

/**
 * Reset draw (clear all assignments)
 */
router.post('/draw/reset', requireAuth, (req, res) => {
  const organizerId = getOrganizerId(req);

  try {
    Assignment.clearAllByOrganizer(organizerId);
    res.redirect('/organizer/draw?message=' + encodeURIComponent('Tirage reinitialise.'));
  } catch (error) {
    console.error('Reset draw error:', error);
    res.redirect('/organizer/draw?error=' + encodeURIComponent('Erreur lors de la reinitialisation.'));
  }
});

/**
 * Send all emails
 */
router.post('/draw/send-emails', requireAuth, async (req, res) => {
  const organizerId = getOrganizerId(req);

  if (!Assignment.drawExistsByOrganizer(organizerId)) {
    return res.redirect('/organizer/draw?error=' + encodeURIComponent('Aucun tirage effectue.'));
  }

  try {
    const result = await MailerService.sendAllEmails(organizerId);

    if (result.success) {
      res.redirect('/organizer/draw?message=' + encodeURIComponent(result.message));
    } else {
      res.redirect('/organizer/draw?error=' + encodeURIComponent(result.message));
    }
  } catch (error) {
    console.error('Send emails error:', error);
    res.redirect('/organizer/draw?error=' + encodeURIComponent('Erreur lors de l\'envoi des emails.'));
  }
});

/**
 * Test SMTP connection
 */
router.post('/test-smtp', requireAuth, async (req, res) => {
  const result = await MailerService.testConnection();
  res.json(result);
});

// ==================== SETTINGS ====================

/**
 * Settings page
 */
router.get('/settings', requireAuth, (req, res) => {
  const organizer = Organizer.findById(getOrganizerId(req));

  res.render('organizer/settings', {
    title: 'Parametres',
    organizer: req.session.organizer,
    fullOrganizer: organizer,
    message: req.query.message,
    error: req.query.error
  });
});

/**
 * Regenerate group code
 */
router.post('/settings/regenerate-code', requireAuth, (req, res) => {
  const organizerId = getOrganizerId(req);

  try {
    const newCode = Organizer.updateGroupCode(organizerId);

    // Update session
    req.session.organizer.groupCode = newCode;

    res.redirect('/organizer/settings?message=' + encodeURIComponent('Code d\'invitation regenere.'));
  } catch (error) {
    console.error('Regenerate code error:', error);
    res.redirect('/organizer/settings?error=' + encodeURIComponent('Erreur lors de la regeneration.'));
  }
});

module.exports = router;
