const express = require('express');
const router = express.Router();
const Participant = require('../models/participant');

/**
 * Home page
 */
router.get('/', (req, res) => {
  const participantCount = Participant.count();
  res.render('index', {
    title: 'Secret Santa',
    participantCount
  });
});

/**
 * Registration form
 */
router.get('/register', (req, res) => {
  res.render('register', {
    title: 'Inscription',
    error: null,
    formData: {}
  });
});

/**
 * Handle registration
 */
router.post('/register', (req, res) => {
  const { first_name, last_name, email, wish1, wish2, wish3 } = req.body;

  // Validation
  const errors = [];

  if (!first_name || first_name.trim().length < 2) {
    errors.push('Le prénom doit contenir au moins 2 caractères.');
  }

  if (!last_name || last_name.trim().length < 2) {
    errors.push('Le nom doit contenir au moins 2 caractères.');
  }

  if (!email || !isValidEmail(email)) {
    errors.push('Veuillez entrer une adresse email valide.');
  }

  if (errors.length === 0 && Participant.emailExists(email)) {
    errors.push('Cette adresse email est déjà inscrite.');
  }

  if (errors.length > 0) {
    return res.render('register', {
      title: 'Inscription',
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
      wish3
    });

    res.redirect('/success');
  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', {
      title: 'Inscription',
      error: 'Une erreur est survenue lors de l\'inscription. Veuillez réessayer.',
      formData: req.body
    });
  }
});

/**
 * Success page after registration
 */
router.get('/success', (req, res) => {
  res.render('success', {
    title: 'Inscription réussie'
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
