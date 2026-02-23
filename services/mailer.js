const nodemailer = require('nodemailer');
const Assignment = require('../models/assignment');
const Group = require('../models/group');

/**
 * Email Service for Secret Santa
 */
const MailerService = {
  /**
   * Create transporter from environment variables
   */
  createTransporter() {
    const port = parseInt(process.env.SMTP_PORT) || 587;
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: true
      },
      debug: process.env.NODE_ENV !== 'production',
      logger: process.env.NODE_ENV !== 'production'
    });
  },

  /**
   * Check if SMTP is configured
   */
  isConfigured() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  },

  /**
   * Test SMTP connection
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, message: 'SMTP non configure' };
    }

    try {
      const transporter = this.createTransporter();
      await transporter.verify();
      return { success: true, message: 'Connexion SMTP reussie' };
    } catch (error) {
      return { success: false, message: `Erreur SMTP: ${error.message}` };
    }
  },

  /**
   * Generate email HTML content
   */
  generateEmailContent(giver, receiver, groupName, groupInfo_extra) {
    const wishes = [receiver.wish1, receiver.wish2, receiver.wish3].filter(Boolean);
    const wishesHtml = wishes.length > 0
      ? `
        <h3>Ses idees de cadeaux :</h3>
        <ul>
          ${wishes.map(w => `<li>${this.escapeHtml(w)}</li>`).join('')}
        </ul>
      `
      : '<p><em>Cette personne n\'a pas indique de souhaits particuliers.</em></p>';

    const groupInfo = groupName ? `<p style="color: #666; font-size: 0.9em;">Groupe : ${this.escapeHtml(groupName)}</p>` : '';
    const extraInfo = groupInfo_extra || {}; 
    const budgetHtml = extraInfo.budget ? `<p><strong>Budget sugere :</strong> ${this.escapeHtml(extraInfo.budget)}</p>` : '';
    const eventDateHtml = extraInfo.event_date ? `<p><strong>Date de l'evenement :</strong> ${new Date(extraInfo.event_date + 'T00:00:00').toLocaleDateString('fr-FR')}</p>` : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            background-color: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            color: #c41e3a;
            text-align: center;
          }
          h2 {
            color: #228b22;
          }
          h3 {
            color: #333;
          }
          .recipient-name {
            font-size: 1.5em;
            color: #c41e3a;
            font-weight: bold;
            text-align: center;
            padding: 20px;
            background-color: #fff8dc;
            border-radius: 8px;
            margin: 20px 0;
          }
          ul {
            list-style-type: none;
            padding: 0;
          }
          li {
            padding: 10px;
            background-color: #f0f8ff;
            margin: 5px 0;
            border-radius: 5px;
            border-left: 4px solid #228b22;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Secret Santa</h1>
          ${groupInfo}
          <h2>Bonjour ${this.escapeHtml(giver.first_name)} !</h2>
          <p>Le tirage au sort a ete effectue et tu dois offrir un cadeau a :</p>
          <div class="recipient-name">
            ${this.escapeHtml(receiver.first_name)} ${this.escapeHtml(receiver.last_name)}
          </div>
          ${wishesHtml}
          ${budgetHtml || eventDateHtml ? '<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">' : ''}
          ${budgetHtml}
          ${eventDateHtml}
          <p>N'oublie pas : c'est un secret !</p>
          <div class="footer">
            <p>Joyeuses fetes !</p>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Generate plain text email content
   */
  generateTextContent(giver, receiver, groupName, groupInfo_extra) {
    const wishes = [receiver.wish1, receiver.wish2, receiver.wish3].filter(Boolean);
    const wishesText = wishes.length > 0
      ? `\nSes idees de cadeaux :\n${wishes.map(w => `- ${w}`).join('\n')}\n`
      : '\nCette personne n\'a pas indique de souhaits particuliers.\n';

    const groupInfo = groupName ? `\nGroupe : ${groupName}\n` : '';
    const extraInfo = groupInfo_extra || {};
    const budgetText = extraInfo.budget ? `Budget sugere : ${extraInfo.budget}\n` : '';
    const eventDateText = extraInfo.event_date ? `Date de l'evenement : ${new Date(extraInfo.event_date + 'T00:00:00').toLocaleDateString('fr-FR')}\n` : '';

    return `
Secret Santa
${groupInfo}
Bonjour ${giver.first_name} !

Le tirage au sort a ete effectue et tu dois offrir un cadeau a :

${receiver.first_name} ${receiver.last_name}
${wishesText}
${budgetText}${eventDateText}
N'oublie pas : c'est un secret !

Joyeuses fetes !
    `.trim();
  },

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Send email to a single participant
   */
  async sendEmail(assignment, groupName, groupExtra) {
    const transporter = this.createTransporter();

    const subject = groupName
      ? `Secret Santa ${groupName} - Ton tirage au sort !`
      : 'Secret Santa - Ton tirage au sort !';

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: assignment.giver_email,
      subject: subject,
      text: this.generateTextContent(
        { first_name: assignment.giver_first_name },
        assignment.receiver,
        groupName,
        groupExtra
      ),
      html: this.generateEmailContent(
        { first_name: assignment.giver_first_name },
        assignment.receiver,
        groupName,
        groupExtra
      )
    };

    await transporter.sendMail(mailOptions);
    Assignment.markEmailSent(assignment.id);
  },

  /**
   * Send verification email to organizer
   */
  async sendVerificationEmail(email, token) {
    if (!this.isConfigured()) {
      console.error('SMTP not configured, skipping verification email');
      return { success: false, message: 'SMTP non configuré' };
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const link = `${baseUrl}/organizer/verify/${token}`;
    
    const transporter = this.createTransporter();
    
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Vérifiez votre compte Secret Santa',
        html: `
          <h1>Bienvenue !</h1>
          <p>Merci de vérifier votre adresse email pour activer votre compte organisateur.</p>
          <p><a href="${link}">Cliquez ici pour vérifier votre email</a></p>
          <p>Ou copiez ce lien : ${link}</p>
        `
      });
      return { success: true };
    } catch (error) {
      console.error('Email verification error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Send password reset email
   * @param {string} email - Recipient email
   * @param {string} token - Reset token
   * @returns {object} { success, message? }
   */
  async sendPasswordResetEmail(email, token) {
    if (!this.isConfigured()) {
      console.error('SMTP not configured, skipping password reset email');
      return { success: false, message: 'SMTP non configure' };
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const link = `${baseUrl}/organizer/reset-password/${token}`;

    const transporter = this.createTransporter();

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Secret Santa - Reinitialisation de votre mot de passe',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
              .container { background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { color: #c41e3a; text-align: center; }
              .btn { display: inline-block; background-color: #c41e3a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 0.9em; }
              .warning { color: #856404; background-color: #fff3cd; border: 1px solid #ffeeba; padding: 10px; border-radius: 5px; margin: 15px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Secret Santa</h1>
              <h2>Reinitialisation du mot de passe</h2>
              <p>Vous avez demande la reinitialisation de votre mot de passe.</p>
              <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
              <p style="text-align: center;"><a href="${link}" class="btn">Reinitialiser mon mot de passe</a></p>
              <p>Ou copiez ce lien dans votre navigateur :</p>
              <p style="word-break: break-all; color: #666;">${link}</p>
              <div class="warning">Ce lien est valide pendant 1 heure. Si vous n'avez pas demande cette reinitialisation, ignorez cet email.</div>
              <div class="footer">
                <p>Secret Santa - Joyeuses fetes !</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Reinitialisation du mot de passe Secret Santa\n\nVous avez demande la reinitialisation de votre mot de passe.\n\nCliquez sur ce lien pour choisir un nouveau mot de passe :\n${link}\n\nCe lien est valide pendant 1 heure.\nSi vous n'avez pas demande cette reinitialisation, ignorez cet email.`
      });
      return { success: true };
    } catch (error) {
      console.error('Password reset email error:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Send all pending emails for a specific group
   * @param {number} groupId - The group's ID
   */
  async sendAllEmails(groupId) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'SMTP non configure. Verifiez les variables d\'environnement.'
      };
    }

    // Get group info for group name, budget, and event date
    const group = Group.findById(groupId);
    const groupName = group ? group.name : null;
    const groupExtra = group ? { budget: group.budget, event_date: group.event_date } : {};

    const assignments = Assignment.findAllDecryptedByGroup(groupId);
    const pending = assignments.filter(a => !a.email_sent);

    if (pending.length === 0) {
      return {
        success: true,
        message: 'Tous les emails ont deja ete envoyes.',
        sent: 0
      };
    }

    const results = {
      success: true,
      sent: 0,
      failed: 0,
      errors: []
    };

    for (const assignment of pending) {
      try {
        console.log(`Sending email to ${assignment.giver_email}...`);
        await this.sendEmail(assignment, groupName, groupExtra);
        console.log(`Email sent successfully to ${assignment.giver_email}`);
        results.sent++;
      } catch (error) {
        console.error(`Failed to send email to ${assignment.giver_email}:`, error.message);
        results.failed++;
        results.errors.push({
          email: assignment.giver_email,
          error: error.message
        });
      }
    }

    if (results.failed > 0) {
      results.success = false;
      results.message = `${results.sent} emails envoyes, ${results.failed} echecs.`;
    } else {
      results.message = `${results.sent} emails envoyes avec succes.`;
    }

    return results;
  }
};

module.exports = MailerService;
