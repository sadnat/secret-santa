const express = require('express');
const router = express.Router();
const Participant = require('../models/participant');
const Group = require('../models/group');

/**
 * Home page
 */
router.get('/', (req, res) => {
  res.render('index', {
    title: 'Secret Santa'
  });
});

/**
 * Page to enter a group code
 */
router.get('/join', (req, res) => {
  res.render('join-code', {
    title: 'Rejoindre un groupe',
    error: null
  });
});

/**
 * Handle code submission - redirect to /join/:code
 */
router.post('/join', (req, res) => {
  const { code } = req.body;

  if (!code || code.trim().length === 0) {
    return res.render('join-code', {
      title: 'Rejoindre un groupe',
      error: 'Veuillez entrer un code.'
    });
  }

  res.redirect(`/join/${code.trim().toUpperCase()}`);
});

/**
 * Registration form via invitation link
 */
router.get('/join/:code', (req, res) => {
  const { code } = req.params;
  const group = Group.findByCode(code);

  if (!group) {
    return res.render('error', {
      title: 'Code invalide',
      message: 'Ce code d\'invitation n\'existe pas ou n\'est plus valide.',
      error: {}
    });
  }

  if (group.archived_at) {
    return res.render('error', {
      title: 'Groupe archive',
      message: 'Ce groupe est archive et n\'accepte plus de nouvelles inscriptions.',
      error: {}
    });
  }

  res.render('register', {
    title: 'Inscription',
    group,
    groupCode: code,
    error: null,
    formData: {}
  });
});

/**
 * Handle registration via invitation link
 */
router.post('/join/:code', (req, res) => {
  const { code } = req.params;
  const group = Group.findByCode(code);

  if (!group) {
    return res.render('error', {
      title: 'Code invalide',
      message: 'Ce code d\'invitation n\'existe pas ou n\'est plus valide.',
      error: {}
    });
  }

  if (group.archived_at) {
    return res.render('error', {
      title: 'Groupe archive',
      message: 'Ce groupe est archive et n\'accepte plus de nouvelles inscriptions.',
      error: {}
    });
  }

  const { first_name, last_name, email, wish1, wish2, wish3 } = req.body;

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

  if (errors.length === 0 && Participant.emailExistsForGroup(email, group.id)) {
    errors.push('Cette adresse email est deja inscrite dans ce groupe.');
  }

  if (errors.length > 0) {
    return res.render('register', {
      title: 'Inscription',
      group,
      groupCode: code,
      error: errors.join(' '),
      formData: req.body
    });
  }

  try {
    Participant.create({
      first_name,
      last_name,
      email,
      wish1,
      wish2,
      wish3,
      group_id: group.id
    });

    res.redirect(`/success?group=${encodeURIComponent(group.name)}`);
  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', {
      title: 'Inscription',
      group,
      groupCode: code,
      error: 'Une erreur est survenue lors de l\'inscription. Veuillez reessayer.',
      formData: req.body
    });
  }
});

/**
 * Success page after registration
 */
router.get('/success', (req, res) => {
  const groupName = req.query.group || null;

  res.render('success', {
    title: 'Inscription reussie',
    groupName
  });
});

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = router;
