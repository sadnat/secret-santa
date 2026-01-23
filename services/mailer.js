const nodemailer = require('nodemailer');
const Assignment = require('../models/assignment');
const Organizer = require('../models/organizer');

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
        rejectUnauthorized: false
      },
      debug: true,
      logger: true
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
  generateEmailContent(giver, receiver, groupName) {
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
  generateTextContent(giver, receiver, groupName) {
    const wishes = [receiver.wish1, receiver.wish2, receiver.wish3].filter(Boolean);
    const wishesText = wishes.length > 0
      ? `\nSes idees de cadeaux :\n${wishes.map(w => `- ${w}`).join('\n')}\n`
      : '\nCette personne n\'a pas indique de souhaits particuliers.\n';

    const groupInfo = groupName ? `\nGroupe : ${groupName}\n` : '';

    return `
Secret Santa
${groupInfo}
Bonjour ${giver.first_name} !

Le tirage au sort a ete effectue et tu dois offrir un cadeau a :

${receiver.first_name} ${receiver.last_name}
${wishesText}
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
  async sendEmail(assignment, groupName) {
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
        groupName
      ),
      html: this.generateEmailContent(
        { first_name: assignment.giver_first_name },
        assignment.receiver,
        groupName
      )
    };

    await transporter.sendMail(mailOptions);
    Assignment.markEmailSent(assignment.id);
  },

  /**
   * Send all pending emails for a specific organizer
   * @param {number} organizerId - The organizer's ID
   */
  async sendAllEmails(organizerId) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'SMTP non configure. Verifiez les variables d\'environnement.'
      };
    }

    // Get organizer info for group name
    const organizer = Organizer.findById(organizerId);
    const groupName = organizer ? organizer.group_name : null;

    const assignments = Assignment.findAllDecryptedByOrganizer(organizerId);
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
        await this.sendEmail(assignment, groupName);
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
