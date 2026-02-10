const express = require('express');
const router = express.Router();
const Organizer = require('../models/organizer');
const Group = require('../models/group');
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

  if (!password || password.length < 8) {
    errors.push('Le mot de passe doit contenir au moins 8 caracteres.');
  }

  if (password && password.length > 72) {
    errors.push('Le mot de passe ne doit pas depasser 72 caracteres.');
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
    // 1. Create Organizer
    const { id, verificationToken } = await Organizer.create({
      email,
      password,
      first_name,
      last_name,
      group_name // Passed for legacy column compatibility
    });

    // 2. Create Initial Group
    Group.create(id, group_name);

    // 3. Send Verification Email
    const emailResult = await MailerService.sendVerificationEmail(email, verificationToken);

    if (emailResult.success) {
      res.render('organizer/login', {
        title: 'Vérification Email',
        error: null,
        message: 'Compte créé ! Un email de vérification a été envoyé. Veuillez cliquer sur le lien reçu pour activer votre compte.'
      });
    } else {
      // If email sending fails (e.g. no SMTP), verify manually or show error?
      // For now, show error but account exists.
      res.render('organizer/login', {
        title: 'Connexion Organisateur',
        error: 'Compte créé mais échec de l\'envoi de l\'email de vérification : ' + emailResult.message + '. Contactez l\'administrateur.'
      });
    }

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
 * Verify Email Route
 */
router.get('/verify/:token', (req, res) => {
  const { token } = req.params;
  const success = Organizer.verifyEmail(token);
  
  if (success) {
    res.render('organizer/login', {
      title: 'Connexion',
      message: 'Email vérifié avec succès ! Vous pouvez maintenant vous connecter.',
      error: null
    });
  } else {
    res.render('organizer/login', {
      title: 'Connexion',
      error: 'Lien de vérification invalide ou expiré.'
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
      if (!organizer.is_verified) {
        return res.render('organizer/login', {
          title: 'Connexion Organisateur',
          error: 'Veuillez vérifier votre adresse email avant de vous connecter.'
        });
      }

      // Auto-promote admin if ADMIN_EMAIL matches
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail && organizer.email === adminEmail.toLowerCase().trim() && organizer.is_admin !== 1) {
        Organizer.setAdmin(organizer.id, true);
        organizer.is_admin = 1;
      }

      req.session.organizer = {
        id: organizer.id,
        email: organizer.email,
        firstName: organizer.first_name,
        lastName: organizer.last_name,
        isAdmin: organizer.is_admin === 1
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
 * Logout (POST to prevent CSRF via img/link)
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// ==================== DASHBOARD (Group List) ====================

/**
 * Dashboard - list groups
 */
router.get('/dashboard', requireAuth, (req, res) => {
  const organizerId = getOrganizerId(req);
  const groups = Group.findAllByOrganizer(organizerId);

  res.render('organizer/dashboard', {
    title: 'Mes Groupes',
    organizer: req.session.organizer,
    groups,
    message: req.query.message,
    error: req.query.error
  });
});

/**
 * Create new group
 */
router.post('/groups/create', requireAuth, (req, res) => {
  const { group_name } = req.body;
  const organizerId = getOrganizerId(req);

  if (!group_name || group_name.trim().length < 2) {
    return res.redirect('/organizer/dashboard?error=' + encodeURIComponent('Le nom du groupe doit contenir au moins 2 caracteres.'));
  }

  try {
    Group.create(organizerId, group_name);
    res.redirect('/organizer/dashboard?message=' + encodeURIComponent('Groupe cree avec succes.'));
  } catch (error) {
    console.error('Create group error:', error);
    res.redirect('/organizer/dashboard?error=' + encodeURIComponent('Erreur lors de la creation du groupe.'));
  }
});

/**
 * Delete group
 */
router.post('/groups/:id/delete', requireAuth, (req, res) => {
  const { id } = req.params;
  const organizerId = getOrganizerId(req);

  try {
    // Verify group belongs to this organizer
    const group = Group.findByIdAndOrganizer(id, organizerId);
    if (!group) {
      return res.redirect('/organizer/dashboard?error=' + encodeURIComponent('Groupe non trouve.'));
    }

    Group.delete(id);
    res.redirect('/organizer/dashboard?message=' + encodeURIComponent('Groupe supprime avec succes.'));
  } catch (error) {
    console.error('Delete group error:', error);
    res.redirect('/organizer/dashboard?error=' + encodeURIComponent('Erreur lors de la suppression du groupe.'));
  }
});

// ==================== ACCOUNT SETTINGS ====================

/**
 * Settings page
 */
router.get('/settings', requireAuth, (req, res) => {
  const organizer = Organizer.findById(getOrganizerId(req));

  res.render('organizer/settings', {
    title: 'Parametres du compte',
    organizer: req.session.organizer,
    fullOrganizer: organizer,
    message: req.query.message,
    error: req.query.error
  });
});

/**
 * Delete account page
 */
router.get('/settings/delete', requireAuth, (req, res) => {
  const organizerId = getOrganizerId(req);
  const groups = Group.findAllByOrganizer(organizerId);
  
  res.render('organizer/delete', {
    title: 'Supprimer le compte',
    organizer: req.session.organizer,
    groupCount: groups.length,
    error: req.query.error
  });
});

/**
 * Delete account
 */
router.post('/settings/delete', requireAuth, async (req, res) => {
  const organizerId = getOrganizerId(req);
  const { password } = req.body;

  try {
    // Verify password
    const isValid = await Organizer.verifyPasswordById(organizerId, password);
    if (!isValid) {
      return res.redirect('/organizer/settings/delete?error=' + encodeURIComponent('Mot de passe incorrect.'));
    }

    // Delete all data
    Organizer.delete(organizerId);

    // Destroy session
    req.session.destroy();

    res.redirect('/?message=' + encodeURIComponent('Compte supprime avec succes.'));
  } catch (error) {
    console.error('Delete account error:', error);
    res.redirect('/organizer/settings/delete?error=' + encodeURIComponent('Erreur lors de la suppression.'));
  }
});

module.exports = router;
