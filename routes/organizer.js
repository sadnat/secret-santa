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

// ==================== PASSWORD RESET ====================

/**
 * Forgot password form
 */
router.get('/forgot-password', (req, res) => {
  if (req.session.organizer) {
    return res.redirect('/organizer/dashboard');
  }
  res.render('organizer/forgot-password', {
    title: 'Mot de passe oublie',
    error: null
  });
});

/**
 * Handle forgot password - send reset email
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.render('organizer/forgot-password', {
      title: 'Mot de passe oublie',
      error: 'Veuillez entrer une adresse email valide.'
    });
  }

  try {
    // Always show success message to prevent email enumeration
    const token = Organizer.setResetToken(email);

    if (token) {
      await MailerService.sendPasswordResetEmail(email.toLowerCase().trim(), token);
    }

    // Same message regardless of whether email exists
    req.flash('success', 'Si cette adresse email est associee a un compte, un email de reinitialisation a ete envoye. Verifiez votre boite de reception.');
    res.redirect('/organizer/login');
  } catch (error) {
    console.error('Forgot password error:', error);
    req.flash('error', 'Une erreur est survenue. Veuillez reessayer.');
    res.redirect('/organizer/forgot-password');
  }
});

/**
 * Reset password form (via token link)
 */
router.get('/reset-password/:token', (req, res) => {
  const { token } = req.params;
  const organizer = Organizer.findByResetToken(token);

  if (!organizer) {
    req.flash('error', 'Lien de reinitialisation invalide ou expire. Veuillez faire une nouvelle demande.');
    return res.redirect('/organizer/forgot-password');
  }

  res.render('organizer/reset-password', {
    title: 'Nouveau mot de passe',
    token,
    error: null
  });
});

/**
 * Handle reset password
 */
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password, password_confirm } = req.body;

  const organizer = Organizer.findByResetToken(token);

  if (!organizer) {
    req.flash('error', 'Lien de reinitialisation invalide ou expire. Veuillez faire une nouvelle demande.');
    return res.redirect('/organizer/forgot-password');
  }

  // Validation
  const errors = [];

  if (!password || password.length < 8) {
    errors.push('Le mot de passe doit contenir au moins 8 caracteres.');
  }

  if (password && password.length > 72) {
    errors.push('Le mot de passe ne doit pas depasser 72 caracteres.');
  }

  if (password !== password_confirm) {
    errors.push('Les mots de passe ne correspondent pas.');
  }

  if (errors.length > 0) {
    return res.render('organizer/reset-password', {
      title: 'Nouveau mot de passe',
      token,
      error: errors.join(' ')
    });
  }

  try {
    await Organizer.updatePassword(organizer.id, password);
    req.flash('success', 'Mot de passe modifie avec succes ! Vous pouvez maintenant vous connecter.');
    res.redirect('/organizer/login');
  } catch (error) {
    console.error('Reset password error:', error);
    req.flash('error', 'Une erreur est survenue. Veuillez reessayer.');
    res.redirect(`/organizer/reset-password/${token}`);
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
    groups
  });
});

/**
 * Create new group
 */
router.post('/groups/create', requireAuth, (req, res) => {
  const { group_name } = req.body;
  const organizerId = getOrganizerId(req);

  if (!group_name || group_name.trim().length < 2) {
    req.flash('error', 'Le nom du groupe doit contenir au moins 2 caracteres.');
    return res.redirect('/organizer/dashboard');
  }

  try {
    Group.create(organizerId, group_name);
    req.flash('success', 'Groupe cree avec succes.');
    res.redirect('/organizer/dashboard');
  } catch (error) {
    console.error('Create group error:', error);
    req.flash('error', 'Erreur lors de la creation du groupe.');
    res.redirect('/organizer/dashboard');
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
      req.flash('error', 'Groupe non trouve.');
      return res.redirect('/organizer/dashboard');
    }

    Group.delete(id);
    req.flash('success', 'Groupe supprime avec succes.');
    res.redirect('/organizer/dashboard');
  } catch (error) {
    console.error('Delete group error:', error);
    req.flash('error', 'Erreur lors de la suppression du groupe.');
    res.redirect('/organizer/dashboard');
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
    fullOrganizer: organizer
  });
});

/**
 * Update profile (first name, last name)
 */
router.post('/settings/profile', requireAuth, (req, res) => {
  const organizerId = getOrganizerId(req);
  const { first_name, last_name } = req.body;

  const errors = [];
  if (!first_name || first_name.trim().length < 2) {
    errors.push('Le prenom doit contenir au moins 2 caracteres.');
  }
  if (!last_name || last_name.trim().length < 2) {
    errors.push('Le nom doit contenir au moins 2 caracteres.');
  }

  if (errors.length > 0) {
    req.flash('error', errors.join(' '));
    return res.redirect('/organizer/settings');
  }

  try {
    Organizer.update(organizerId, { first_name, last_name });

    // Update session data
    req.session.organizer.firstName = first_name.trim();
    req.session.organizer.lastName = last_name.trim();

    req.flash('success', 'Profil mis a jour.');
    res.redirect('/organizer/settings');
  } catch (error) {
    console.error('Update profile error:', error);
    req.flash('error', 'Erreur lors de la mise a jour du profil.');
    res.redirect('/organizer/settings');
  }
});

/**
 * Update email (requires re-verification)
 */
router.post('/settings/email', requireAuth, async (req, res) => {
  const organizerId = getOrganizerId(req);
  const { email, password } = req.body;

  if (!email || !isValidEmail(email)) {
    req.flash('error', 'Veuillez entrer une adresse email valide.');
    return res.redirect('/organizer/settings');
  }

  // Verify current password
  const isValid = await Organizer.verifyPasswordById(organizerId, password);
  if (!isValid) {
    req.flash('error', 'Mot de passe incorrect.');
    return res.redirect('/organizer/settings');
  }

  // Check if email is already used by another account
  if (Organizer.emailExistsForOther(email, organizerId)) {
    req.flash('error', 'Cette adresse email est deja utilisee par un autre compte.');
    return res.redirect('/organizer/settings');
  }

  try {
    const verificationToken = Organizer.updateEmail(organizerId, email);

    // Send verification email to new address
    await MailerService.sendVerificationEmail(email.toLowerCase().trim(), verificationToken);

    // Update session
    req.session.organizer.email = email.toLowerCase().trim();

    // Destroy session so user must re-login after verifying
    req.session.destroy(() => {
      res.redirect('/organizer/login');
    });
  } catch (error) {
    console.error('Update email error:', error);
    req.flash('error', 'Erreur lors de la mise a jour de l\'email.');
    res.redirect('/organizer/settings');
  }
});

/**
 * Update password
 */
router.post('/settings/password', requireAuth, async (req, res) => {
  const organizerId = getOrganizerId(req);
  const { current_password, new_password, new_password_confirm } = req.body;

  // Verify current password
  const isValid = await Organizer.verifyPasswordById(organizerId, current_password);
  if (!isValid) {
    req.flash('error', 'Mot de passe actuel incorrect.');
    return res.redirect('/organizer/settings');
  }

  // Validate new password
  const errors = [];
  if (!new_password || new_password.length < 8) {
    errors.push('Le nouveau mot de passe doit contenir au moins 8 caracteres.');
  }
  if (new_password && new_password.length > 72) {
    errors.push('Le nouveau mot de passe ne doit pas depasser 72 caracteres.');
  }
  if (new_password !== new_password_confirm) {
    errors.push('Les nouveaux mots de passe ne correspondent pas.');
  }

  if (errors.length > 0) {
    req.flash('error', errors.join(' '));
    return res.redirect('/organizer/settings');
  }

  try {
    await Organizer.updatePassword(organizerId, new_password);
    req.flash('success', 'Mot de passe modifie avec succes.');
    res.redirect('/organizer/settings');
  } catch (error) {
    console.error('Update password error:', error);
    req.flash('error', 'Erreur lors de la modification du mot de passe.');
    res.redirect('/organizer/settings');
  }
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
    groupCount: groups.length
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
      req.flash('error', 'Mot de passe incorrect.');
      return res.redirect('/organizer/settings/delete');
    }

    // Delete all data
    Organizer.delete(organizerId);

    // Destroy session and redirect
    req.session.destroy(() => {
      res.redirect('/');
    });
  } catch (error) {
    console.error('Delete account error:', error);
    req.flash('error', 'Erreur lors de la suppression.');
    res.redirect('/organizer/settings/delete');
  }
});

module.exports = router;
