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
  const success = req.query.success;
  const error = req.query.error;
  
  res.render('admin/users', { users, success, error });
});

/**
 * POST /admin/users/:id/toggle-admin - Toggle admin status
 */
router.post('/users/:id/toggle-admin', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  
  // Prevent self-demotion
  if (userId === req.session.organizer.id) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Vous ne pouvez pas modifier votre propre statut admin.'));
  }
  
  const user = Organizer.findById(userId);
  if (!user) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Utilisateur non trouve.'));
  }
  
  const newStatus = !Organizer.isAdmin(userId);
  Organizer.setAdmin(userId, newStatus);
  
  const message = newStatus 
    ? `${user.first_name} ${user.last_name} est maintenant administrateur.`
    : `${user.first_name} ${user.last_name} n'est plus administrateur.`;
  
  res.redirect('/admin/users?success=' + encodeURIComponent(message));
});

/**
 * POST /admin/users/:id/delete - Delete a user
 */
router.post('/users/:id/delete', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  
  // Prevent self-deletion
  if (userId === req.session.organizer.id) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Vous ne pouvez pas supprimer votre propre compte.'));
  }
  
  const user = Organizer.findById(userId);
  if (!user) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Utilisateur non trouve.'));
  }
  
  Organizer.deleteById(userId);
  
  res.redirect('/admin/users?success=' + encodeURIComponent(`Utilisateur ${user.first_name} ${user.last_name} supprime.`));
});

/**
 * GET /admin/groups - List all groups
 */
router.get('/groups', (req, res) => {
  const groups = Group.findAllWithOrganizer();
  const success = req.query.success;
  const error = req.query.error;
  
  res.render('admin/groups', { groups, success, error });
});

/**
 * POST /admin/groups/:id/delete - Delete a group
 */
router.post('/groups/:id/delete', (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  
  const group = Group.findById(groupId);
  if (!group) {
    return res.redirect('/admin/groups?error=' + encodeURIComponent('Groupe non trouve.'));
  }
  
  Group.delete(groupId);
  
  res.redirect('/admin/groups?success=' + encodeURIComponent(`Groupe "${group.name}" supprime.`));
});

module.exports = router;
