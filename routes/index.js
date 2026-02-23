const express = require('express');
const router = express.Router();
const Participant = require('../models/participant');
const Group = require('../models/group');
const Assignment = require('../models/assignment');

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
    const participantId = Participant.create({
      first_name,
      last_name,
      email,
      wish1,
      wish2,
      wish3,
      group_id: group.id
    });

    const participant = Participant.findById(participantId);
    res.redirect(`/success?group=${encodeURIComponent(group.name)}&token=${participant.edit_token}`);
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
  const editToken = req.query.token || null;

  res.render('success', {
    title: 'Inscription reussie',
    groupName,
    editToken
  });
});

// ==================== PARTICIPANT SELF-SERVICE ====================

/**
 * View/edit wishes via secure token link
 */
router.get('/participant/:token', (req, res) => {
  const { token } = req.params;
  const participant = Participant.findByEditToken(token);

  if (!participant) {
    return res.render('error', {
      title: 'Lien invalide',
      message: 'Ce lien n\'est pas valide ou a expire.',
      error: {}
    });
  }

  // Look up this participant's assignment (if draw has been done)
  let myRecipient = null;
  try {
    const assignment = Assignment.getForGiver(participant.id);
    if (assignment && assignment.receiver_id) {
      myRecipient = Participant.findById(assignment.receiver_id);
    }
  } catch (e) {
    // Draw may not exist yet, that's fine
    console.error('Error looking up assignment:', e.message);
  }

  res.render('participant/edit-wishes', {
    title: 'Mon Secret Santa',
    participant,
    token,
    myRecipient,
    error: null
  });
});

/**
 * Handle wish update via secure token
 */
router.post('/participant/:token', (req, res) => {
  const { token } = req.params;
  const participant = Participant.findByEditToken(token);

  if (!participant) {
    return res.render('error', {
      title: 'Lien invalide',
      message: 'Ce lien n\'est pas valide ou a expire.',
      error: {}
    });
  }

  const { wish1, wish2, wish3 } = req.body;

  try {
    Participant.updateWishes(participant.id, { wish1, wish2, wish3 });
    req.flash('success', 'Vos souhaits ont ete mis a jour !');
    res.redirect(`/participant/${token}`);
  } catch (error) {
    console.error('Update wishes error:', error);
    req.flash('error', 'Erreur lors de la mise a jour de vos souhaits.');
    res.redirect(`/participant/${token}`);
  }
});

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = router;
