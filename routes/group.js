const express = require('express');
const router = express.Router({ mergeParams: true }); // Important to access groupId from parent router if mounted there, but I'll mount it differently.
// Actually better to mount at /organizer/groups/:groupId
// So params.groupId will be available.

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
    return res.redirect('/organizer/dashboard?error=' + encodeURIComponent('Groupe non trouve ou acces refuse.'));
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
    return res.redirect(`/organizer/groups/${req.group.id}?error=` + encodeURIComponent('Ce groupe est archive. Aucune modification possible.'));
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
    smtpConfigured,
    message: req.query.message,
    error: req.query.error
  });
});

/**
 * Delete participant
 */
router.post('/participants/:id/delete', requireNotArchived, (req, res) => {
  const { id } = req.params;
  
  try {
    if (Assignment.drawExistsByGroup(req.group.id)) {
      return res.redirect(`/organizer/groups/${req.group.id}?error=` + encodeURIComponent('Impossible de supprimer un participant apres le tirage.'));
    }

    Participant.delete(id, req.group.id);
    res.redirect(`/organizer/groups/${req.group.id}?message=` + encodeURIComponent('Participant supprime.'));
  } catch (error) {
    console.error('Delete participant error:', error);
    res.redirect(`/organizer/groups/${req.group.id}?error=` + encodeURIComponent('Erreur lors de la suppression.'));
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
    drawExists,
    message: req.query.message,
    error: req.query.error
  });
});

router.post('/exclusions/add', requireNotArchived, (req, res) => {
  const { giver_id, receiver_id } = req.body;

  if (Assignment.drawExistsByGroup(req.group.id)) {
    return res.redirect(`/organizer/groups/${req.group.id}/exclusions?error=` + encodeURIComponent('Impossible de modifier les exclusions apres le tirage.'));
  }

  if (giver_id === receiver_id) {
    return res.redirect(`/organizer/groups/${req.group.id}/exclusions?error=` + encodeURIComponent('Une personne ne peut pas s\'exclure elle-meme.'));
  }

  const giver = Participant.findByIdAndGroup(giver_id, req.group.id);
  const receiver = Participant.findByIdAndGroup(receiver_id, req.group.id);

  if (!giver || !receiver) {
    return res.redirect(`/organizer/groups/${req.group.id}/exclusions?error=` + encodeURIComponent('Participants non valides.'));
  }

  try {
    Exclusion.create(parseInt(giver_id), parseInt(receiver_id));
    res.redirect(`/organizer/groups/${req.group.id}/exclusions?message=` + encodeURIComponent('Regle d\'exclusion ajoutee.'));
  } catch (error) {
    console.error('Add exclusion error:', error);
    res.redirect(`/organizer/groups/${req.group.id}/exclusions?error=` + encodeURIComponent('Erreur lors de l\'ajout.'));
  }
});

router.post('/exclusions/:id/delete', requireNotArchived, (req, res) => {
  const { id } = req.params;

  if (Assignment.drawExistsByGroup(req.group.id)) {
    return res.redirect(`/organizer/groups/${req.group.id}/exclusions?error=` + encodeURIComponent('Impossible de modifier les exclusions apres le tirage.'));
  }

  try {
    Exclusion.deleteByGroup(id, req.group.id);
    res.redirect(`/organizer/groups/${req.group.id}/exclusions?message=` + encodeURIComponent('Regle d\'exclusion supprimee.'));
  } catch (error) {
    console.error('Delete exclusion error:', error);
    res.redirect(`/organizer/groups/${req.group.id}/exclusions?error=` + encodeURIComponent('Erreur lors de la suppression.'));
  }
});

// ==================== DRAW ====================

router.get('/draw', (req, res) => {
  const participantCount = Participant.countByGroup(req.group.id);
  const drawExists = Assignment.drawExistsByGroup(req.group.id);
  const assignments = drawExists ? Assignment.findAllForGroup(req.group.id) : [];
  const canDraw = DrawService.canPerformDraw(req.group.id); // Need to update DrawService!
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
    smtpConfigured,
    message: req.query.message,
    error: req.query.error
  });
});

router.post('/draw/perform', requireNotArchived, (req, res) => {
  if (Assignment.drawExistsByGroup(req.group.id)) {
    return res.redirect(`/organizer/groups/${req.group.id}/draw?error=` + encodeURIComponent('Un tirage a deja ete effectue.'));
  }

  // Need to update DrawService to accept groupId
  const result = DrawService.performDraw(req.group.id);

  if (result.success) {
    res.redirect(`/organizer/groups/${req.group.id}/draw?message=` + encodeURIComponent(result.message));
  } else {
    res.redirect(`/organizer/groups/${req.group.id}/draw?error=` + encodeURIComponent(result.message));
  }
});

router.post('/draw/reset', requireNotArchived, (req, res) => {
  try {
    Assignment.clearAllByGroup(req.group.id);
    res.redirect(`/organizer/groups/${req.group.id}/draw?message=` + encodeURIComponent('Tirage reinitialise.'));
  } catch (error) {
    console.error('Reset draw error:', error);
    res.redirect(`/organizer/groups/${req.group.id}/draw?error=` + encodeURIComponent('Erreur lors de la reinitialisation.'));
  }
});

router.post('/draw/send-emails', requireNotArchived, async (req, res) => {
  if (!Assignment.drawExistsByGroup(req.group.id)) {
    return res.redirect(`/organizer/groups/${req.group.id}/draw?error=` + encodeURIComponent('Aucun tirage effectue.'));
  }

  try {
    // Need to update MailerService to accept groupId
    const result = await MailerService.sendAllEmails(req.group.id);

    if (result.success) {
      res.redirect(`/organizer/groups/${req.group.id}/draw?message=` + encodeURIComponent(result.message));
    } else {
      res.redirect(`/organizer/groups/${req.group.id}/draw?error=` + encodeURIComponent(result.message));
    }
  } catch (error) {
    console.error('Send emails error:', error);
    res.redirect(`/organizer/groups/${req.group.id}/draw?error=` + encodeURIComponent('Erreur lors de l\'envoi des emails.'));
  }
});

// ==================== SETTINGS (Group) ====================

router.get('/settings', (req, res) => {
  res.render('group/settings', {
    title: 'Parametres du groupe',
    message: req.query.message,
    error: req.query.error
  });
});

router.post('/settings/regenerate-code', requireNotArchived, (req, res) => {
  try {
    Group.updateCode(req.group.id);
    res.redirect(`/organizer/groups/${req.group.id}/settings?message=` + encodeURIComponent('Code d\'invitation regenere.'));
  } catch (error) {
    console.error('Regenerate code error:', error);
    res.redirect(`/organizer/groups/${req.group.id}/settings?error=` + encodeURIComponent('Erreur lors de la regeneration.'));
  }
});

router.post('/settings/archive', (req, res) => {
  try {
    Group.archive(req.group.id);
    res.redirect(`/organizer/groups/${req.group.id}/settings?message=` + encodeURIComponent('Groupe archive avec succes.'));
  } catch (error) {
    console.error('Archive error:', error);
    res.redirect(`/organizer/groups/${req.group.id}/settings?error=` + encodeURIComponent('Erreur lors de l\'archivage.'));
  }
});

router.post('/settings/unarchive', (req, res) => {
  try {
    Group.unarchive(req.group.id);
    res.redirect(`/organizer/groups/${req.group.id}/settings?message=` + encodeURIComponent('Groupe desarchive avec succes.'));
  } catch (error) {
    console.error('Unarchive error:', error);
    res.redirect(`/organizer/groups/${req.group.id}/settings?error=` + encodeURIComponent('Erreur lors du desarchivage.'));
  }
});

module.exports = router;
