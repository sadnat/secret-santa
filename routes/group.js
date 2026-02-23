const express = require('express');
const router = express.Router({ mergeParams: true });

const Participant = require('../models/participant');
const Exclusion = require('../models/exclusion');
const Assignment = require('../models/assignment');
const Group = require('../models/group');
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
 * Middleware to check group access and load group
 */
function requireGroupAccess(req, res, next) {
  const { groupId } = req.params;
  const organizerId = req.session.organizer.id;
  
  const group = Group.findByIdAndOrganizer(groupId, organizerId);
  
  if (!group) {
    req.flash('error', 'Groupe non trouve ou acces refuse.');
    return res.redirect('/organizer/dashboard');
  }
  
  req.group = group;
  res.locals.group = group;
  next();
}

/**
 * Middleware to check if group is archived
 */
function requireNotArchived(req, res, next) {
  if (req.group.archived_at) {
    req.flash('error', 'Ce groupe est archive. Aucune modification possible.');
    return res.redirect(`/organizer/groups/${req.group.id}`);
  }
  next();
}

// Apply middleware to all routes
router.use(requireAuth);
router.use(requireGroupAccess);

// ==================== DASHBOARD (Participants) ====================

/**
 * Group Dashboard - list participants
 */
router.get('/', (req, res) => {
  const participants = Participant.findAllByGroup(req.group.id);
  const drawExists = Assignment.drawExistsByGroup(req.group.id);
  const pendingEmails = Assignment.countPendingEmailsByGroup(req.group.id);
  const sentEmails = Assignment.countSentEmailsByGroup(req.group.id);
  const smtpConfigured = MailerService.isConfigured();

  res.render('group/dashboard', {
    title: req.group.name,
    participants,
    drawExists,
    pendingEmails,
    sentEmails,
    smtpConfigured
  });
});

/**
 * Add participant manually (organizer action)
 */
router.post('/participants/add', requireNotArchived, (req, res) => {
  const { first_name, last_name, email, wish1, wish2, wish3 } = req.body;

  if (Assignment.drawExistsByGroup(req.group.id)) {
    req.flash('error', 'Impossible d\'ajouter un participant apres le tirage.');
    return res.redirect(`/organizer/groups/${req.group.id}`);
  }

  // Validation
  const errors = [];

  if (!first_name || first_name.trim().length < 2) {
    errors.push('Le prenom doit contenir au moins 2 caracteres.');
  }
  if (!last_name || last_name.trim().length < 2) {
    errors.push('Le nom doit contenir au moins 2 caracteres.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Veuillez entrer une adresse email valide.');
  }
  if (errors.length === 0 && Participant.emailExistsForGroup(email, req.group.id)) {
    errors.push('Cette adresse email est deja inscrite dans ce groupe.');
  }

  if (errors.length > 0) {
    req.flash('error', errors.join(' '));
    return res.redirect(`/organizer/groups/${req.group.id}`);
  }

  try {
    Participant.create({
      first_name,
      last_name,
      email,
      wish1: wish1 || null,
      wish2: wish2 || null,
      wish3: wish3 || null,
      group_id: req.group.id
    });

    req.flash('success', `${first_name.trim()} ${last_name.trim()} a ete ajoute au groupe.`);
    res.redirect(`/organizer/groups/${req.group.id}`);
  } catch (error) {
    console.error('Add participant error:', error);
    req.flash('error', 'Erreur lors de l\'ajout du participant.');
    res.redirect(`/organizer/groups/${req.group.id}`);
  }
});

/**
 * Delete participant
 */
router.post('/participants/:id/delete', requireNotArchived, (req, res) => {
  const { id } = req.params;
  
  try {
    if (Assignment.drawExistsByGroup(req.group.id)) {
      req.flash('error', 'Impossible de supprimer un participant apres le tirage.');
      return res.redirect(`/organizer/groups/${req.group.id}`);
    }

    Participant.delete(id, req.group.id);
    req.flash('success', 'Participant supprime.');
    res.redirect(`/organizer/groups/${req.group.id}`);
  } catch (error) {
    console.error('Delete participant error:', error);
    req.flash('error', 'Erreur lors de la suppression.');
    res.redirect(`/organizer/groups/${req.group.id}`);
  }
});

// ==================== EXCLUSIONS ====================

router.get('/exclusions', (req, res) => {
  const participants = Participant.findAllByGroup(req.group.id);
  const exclusions = Exclusion.findAllByGroup(req.group.id);
  const drawExists = Assignment.drawExistsByGroup(req.group.id);

  res.render('group/exclusions', {
    title: 'Regles d\'exclusion',
    participants,
    exclusions,
    drawExists
  });
});

router.post('/exclusions/add', requireNotArchived, (req, res) => {
  const { giver_id, receiver_id } = req.body;

  if (Assignment.drawExistsByGroup(req.group.id)) {
    req.flash('error', 'Impossible de modifier les exclusions apres le tirage.');
    return res.redirect(`/organizer/groups/${req.group.id}/exclusions`);
  }

  if (giver_id === receiver_id) {
    req.flash('error', 'Une personne ne peut pas s\'exclure elle-meme.');
    return res.redirect(`/organizer/groups/${req.group.id}/exclusions`);
  }

  const giver = Participant.findByIdAndGroup(giver_id, req.group.id);
  const receiver = Participant.findByIdAndGroup(receiver_id, req.group.id);

  if (!giver || !receiver) {
    req.flash('error', 'Participants non valides.');
    return res.redirect(`/organizer/groups/${req.group.id}/exclusions`);
  }

  try {
    Exclusion.create(parseInt(giver_id), parseInt(receiver_id));
    req.flash('success', 'Regle d\'exclusion ajoutee.');
    res.redirect(`/organizer/groups/${req.group.id}/exclusions`);
  } catch (error) {
    console.error('Add exclusion error:', error);
    req.flash('error', 'Erreur lors de l\'ajout.');
    res.redirect(`/organizer/groups/${req.group.id}/exclusions`);
  }
});

router.post('/exclusions/:id/delete', requireNotArchived, (req, res) => {
  const { id } = req.params;

  if (Assignment.drawExistsByGroup(req.group.id)) {
    req.flash('error', 'Impossible de modifier les exclusions apres le tirage.');
    return res.redirect(`/organizer/groups/${req.group.id}/exclusions`);
  }

  try {
    Exclusion.deleteByGroup(id, req.group.id);
    req.flash('success', 'Regle d\'exclusion supprimee.');
    res.redirect(`/organizer/groups/${req.group.id}/exclusions`);
  } catch (error) {
    console.error('Delete exclusion error:', error);
    req.flash('error', 'Erreur lors de la suppression.');
    res.redirect(`/organizer/groups/${req.group.id}/exclusions`);
  }
});

// ==================== DRAW ====================

router.get('/draw', (req, res) => {
  const participantCount = Participant.countByGroup(req.group.id);
  const drawExists = Assignment.drawExistsByGroup(req.group.id);
  const assignments = drawExists ? Assignment.findAllForGroup(req.group.id) : [];
  const canDraw = DrawService.canPerformDraw(req.group.id);
  const pendingEmails = Assignment.countPendingEmailsByGroup(req.group.id);
  const sentEmails = Assignment.countSentEmailsByGroup(req.group.id);
  const smtpConfigured = MailerService.isConfigured();

  res.render('group/draw', {
    title: 'Tirage au sort',
    participantCount,
    drawExists,
    assignments,
    canDraw,
    pendingEmails,
    sentEmails,
    smtpConfigured
  });
});

router.post('/draw/perform', requireNotArchived, (req, res) => {
  if (Assignment.drawExistsByGroup(req.group.id)) {
    req.flash('error', 'Un tirage a deja ete effectue.');
    return res.redirect(`/organizer/groups/${req.group.id}/draw`);
  }

  const result = DrawService.performDraw(req.group.id);

  if (result.success) {
    req.flash('success', result.message);
  } else {
    req.flash('error', result.message);
  }
  res.redirect(`/organizer/groups/${req.group.id}/draw`);
});

router.post('/draw/reset', requireNotArchived, (req, res) => {
  try {
    Assignment.clearAllByGroup(req.group.id);
    req.flash('success', 'Tirage reinitialise.');
    res.redirect(`/organizer/groups/${req.group.id}/draw`);
  } catch (error) {
    console.error('Reset draw error:', error);
    req.flash('error', 'Erreur lors de la reinitialisation.');
    res.redirect(`/organizer/groups/${req.group.id}/draw`);
  }
});

router.post('/draw/send-emails', requireNotArchived, async (req, res) => {
  if (!Assignment.drawExistsByGroup(req.group.id)) {
    req.flash('error', 'Aucun tirage effectue.');
    return res.redirect(`/organizer/groups/${req.group.id}/draw`);
  }

  try {
    const result = await MailerService.sendAllEmails(req.group.id);

    if (result.success) {
      req.flash('success', result.message);
    } else {
      req.flash('error', result.message);
    }
    res.redirect(`/organizer/groups/${req.group.id}/draw`);
  } catch (error) {
    console.error('Send emails error:', error);
    req.flash('error', 'Erreur lors de l\'envoi des emails.');
    res.redirect(`/organizer/groups/${req.group.id}/draw`);
  }
});

// ==================== SETTINGS (Group) ====================

router.get('/settings', (req, res) => {
  res.render('group/settings', {
    title: 'Parametres du groupe'
  });
});

router.post('/settings/update', requireNotArchived, (req, res) => {
  const { name, budget, event_date } = req.body;

  if (!name || name.trim().length < 2) {
    req.flash('error', 'Le nom du groupe doit contenir au moins 2 caracteres.');
    return res.redirect(`/organizer/groups/${req.group.id}/settings`);
  }

  try {
    Group.update(req.group.id, { name, budget, event_date });

    // Update the group in res.locals for subsequent middleware
    req.group.name = name.trim();
    req.group.budget = budget ? budget.trim() : null;
    req.group.event_date = event_date || null;

    req.flash('success', 'Informations du groupe mises a jour.');
    res.redirect(`/organizer/groups/${req.group.id}/settings`);
  } catch (error) {
    console.error('Update group error:', error);
    req.flash('error', 'Erreur lors de la mise a jour.');
    res.redirect(`/organizer/groups/${req.group.id}/settings`);
  }
});

router.post('/settings/regenerate-code', requireNotArchived, (req, res) => {
  try {
    Group.updateCode(req.group.id);
    req.flash('success', 'Code d\'invitation regenere.');
    res.redirect(`/organizer/groups/${req.group.id}/settings`);
  } catch (error) {
    console.error('Regenerate code error:', error);
    req.flash('error', 'Erreur lors de la regeneration.');
    res.redirect(`/organizer/groups/${req.group.id}/settings`);
  }
});

router.post('/settings/archive', (req, res) => {
  try {
    Group.archive(req.group.id);
    req.flash('success', 'Groupe archive avec succes.');
    res.redirect(`/organizer/groups/${req.group.id}/settings`);
  } catch (error) {
    console.error('Archive error:', error);
    req.flash('error', 'Erreur lors de l\'archivage.');
    res.redirect(`/organizer/groups/${req.group.id}/settings`);
  }
});

router.post('/settings/unarchive', (req, res) => {
  try {
    Group.unarchive(req.group.id);
    req.flash('success', 'Groupe desarchive avec succes.');
    res.redirect(`/organizer/groups/${req.group.id}/settings`);
  } catch (error) {
    console.error('Unarchive error:', error);
    req.flash('error', 'Erreur lors du desarchivage.');
    res.redirect(`/organizer/groups/${req.group.id}/settings`);
  }
});

module.exports = router;
