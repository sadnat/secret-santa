const express = require('express');
const router = express.Router();
const Organizer = require('../models/organizer');
const Group = require('../models/group');

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
  
  res.render('admin/dashboard', {
    organizerCount,
    groupCount
  });
});

/**
 * GET /admin/users - List all users (organizers)
 */
router.get('/users', (req, res) => {
  const users = Organizer.findAll();
  
  res.render('admin/users', { users });
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
  
  req.flash('success', `Utilisateur ${user.first_name} ${user.last_name} supprime.`);
  res.redirect('/admin/users');
});

/**
 * GET /admin/groups - List all groups
 */
router.get('/groups', (req, res) => {
  const groups = Group.findAllWithOrganizer();
  
  res.render('admin/groups', { groups });
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
  
  req.flash('success', `Groupe "${group.name}" supprime.`);
  res.redirect('/admin/groups');
});

module.exports = router;
