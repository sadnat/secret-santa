const express = require('express');
const router = express.Router();
const Organizer = require('../models/organizer');
const Group = require('../models/group');
const Participant = require('../models/participant');
const AdminLog = require('../models/admin-log');

const ITEMS_PER_PAGE = 20;

/**
 * Helper: log an admin action
 */
function logAction(req, action, targetType, targetId, details) {
  try {
    AdminLog.create({
      adminId: req.session.organizer.id,
      adminEmail: req.session.organizer.email,
      action,
      targetType,
      targetId,
      details
    });
  } catch (e) {
    console.error('Failed to log admin action:', e.message);
  }
}

/**
 * Middleware: Require admin access
 */
function requireAdmin(req, res, next) {
  if (!req.session.organizer) {
    return res.redirect('/organizer/login');
  }
  if (!req.session.organizer.isAdmin) {
    return res.status(403).render('error', { 
      message: 'Acces refuse. Vous devez etre administrateur.',
      organizer: req.session.organizer
    });
  }
  next();
}

// Apply requireAdmin to all routes
router.use(requireAdmin);

/**
 * GET /admin - Dashboard
 */
router.get('/', (req, res) => {
  const organizerCount = Organizer.countAll();
  const groupCount = Group.countAll();
  const participantCount = Participant.countAll();
  const pendingDrawCount = Group.countPendingDraw();
  
  res.render('admin/dashboard', {
    organizerCount,
    groupCount,
    participantCount,
    pendingDrawCount
  });
});

/**
 * GET /admin/users - List all users (organizers)
 */
router.get('/users', (req, res) => {
  const search = req.query.q || '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const users = Organizer.findAll({ search, page, limit: ITEMS_PER_PAGE });
  const totalCount = Organizer.countAll(search);
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  
  res.render('admin/users', {
    users,
    search,
    page,
    totalPages,
    totalCount
  });
});

/**
 * POST /admin/users/:id/toggle-admin - Toggle admin status
 */
router.post('/users/:id/toggle-admin', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  
  // Prevent self-demotion
  if (userId === req.session.organizer.id) {
    req.flash('error', 'Vous ne pouvez pas modifier votre propre statut admin.');
    return res.redirect('/admin/users');
  }
  
  const user = Organizer.findById(userId);
  if (!user) {
    req.flash('error', 'Utilisateur non trouve.');
    return res.redirect('/admin/users');
  }
  
  const newStatus = !Organizer.isAdmin(userId);
  Organizer.setAdmin(userId, newStatus);
  
  const action = newStatus ? 'promote_admin' : 'demote_admin';
  logAction(req, action, 'organizer', userId, `${user.first_name} ${user.last_name} (${user.email})`);

  const message = newStatus 
    ? `${user.first_name} ${user.last_name} est maintenant administrateur.`
    : `${user.first_name} ${user.last_name} n'est plus administrateur.`;
  
  req.flash('success', message);
  res.redirect('/admin/users');
});

/**
 * POST /admin/users/:id/delete - Delete a user
 */
router.post('/users/:id/delete', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  
  // Prevent self-deletion
  if (userId === req.session.organizer.id) {
    req.flash('error', 'Vous ne pouvez pas supprimer votre propre compte.');
    return res.redirect('/admin/users');
  }
  
  const user = Organizer.findById(userId);
  if (!user) {
    req.flash('error', 'Utilisateur non trouve.');
    return res.redirect('/admin/users');
  }
  
  Organizer.delete(userId);
  logAction(req, 'delete_user', 'organizer', userId, `${user.first_name} ${user.last_name} (${user.email})`);
  
  req.flash('success', `Utilisateur ${user.first_name} ${user.last_name} supprime.`);
  res.redirect('/admin/users');
});

/**
 * GET /admin/groups - List all groups
 */
router.get('/groups', (req, res) => {
  const search = req.query.q || '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const groups = Group.findAllWithOrganizer({ search, page, limit: ITEMS_PER_PAGE });
  const totalCount = Group.countAll(search);
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  
  res.render('admin/groups', {
    groups,
    search,
    page,
    totalPages,
    totalCount
  });
});

/**
 * POST /admin/groups/:id/delete - Delete a group
 */
router.post('/groups/:id/delete', (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  
  const group = Group.findById(groupId);
  if (!group) {
    req.flash('error', 'Groupe non trouve.');
    return res.redirect('/admin/groups');
  }
  
  Group.delete(groupId);
  logAction(req, 'delete_group', 'group', groupId, `"${group.name}" (code: ${group.code})`);
  
  req.flash('success', `Groupe "${group.name}" supprime.`);
  res.redirect('/admin/groups');
});

/**
 * GET /admin/logs - View admin activity logs
 */
router.get('/logs', (req, res) => {
  const search = req.query.q || '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 30;

  const logs = AdminLog.findAll({ search, page, limit });
  const totalCount = AdminLog.countAll(search);
  const totalPages = Math.ceil(totalCount / limit);

  res.render('admin/logs', {
    logs,
    search,
    page,
    totalPages,
    totalCount
  });
});

module.exports = router;
