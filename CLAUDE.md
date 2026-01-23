# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start

# Docker
docker compose up -d          # Start
docker compose down           # Stop
docker compose build          # Rebuild after code changes
docker compose logs -f        # View logs
```

## Architecture

Node.js/Express application for organizing Secret Santa gift exchanges with multi-organizer support. Each organizer manages their own group with participant registration, exclusion rules, random draw, and email notifications.

### Core Components

- **app.js** - Express server entry point, middleware setup, route mounting
- **config/database.js** - SQLite initialization via better-sqlite3, creates tables on startup, handles migrations
- **models/** - Data access layer:
  - `organizer.js` - Organizer CRUD with bcrypt password hashing
  - `participant.js` - Participant CRUD filtered by organizer
  - `exclusion.js` - Exclusion rules filtered by organizer
  - `assignment.js` - Encrypted assignments filtered by organizer
- **routes/** - HTTP handlers:
  - `index.js` - Public routes (`/`, `/join`, `/join/:code`, `/success`)
  - `organizer.js` - Organizer routes (`/organizer/*` - auth, dashboard, settings, exclusions, draw)
- **services/** - Business logic:
  - `draw.js` - Hamiltonian cycle algorithm respecting exclusion rules (per organizer)
  - `mailer.js` - Nodemailer SMTP integration with group name in emails
- **views/** - EJS templates:
  - `views/` - Public pages (index, register, success, join-code, error)
  - `views/organizer/` - Organizer pages (login, register, dashboard, settings, exclusions, draw)
  - `views/layout.ejs` - Shared layout with dynamic navigation

### Multi-Organizer System

- Each organizer creates an account with email/password (bcrypt hashed)
- Organizer creates a group with a unique 8-character invite code
- Participants join via URL `https://santa.twibox.fr/join/CODE` or by entering code manually
- Same email can participate in multiple groups (unique per organizer)
- Data isolation: organizers only see their own participants, exclusions, and assignments
- Session stores organizer info: `req.session.organizer = { id, email, firstName, lastName, groupName, groupCode }`

### Security Model

- Organizer passwords hashed with bcrypt (10 rounds)
- Assignments encrypted with AES (crypto-js) using `ENCRYPTION_KEY`
- Organizers can see draw status and email status, but cannot see who gives to whom
- Decryption only happens when sending emails

### Database

SQLite stored in `data/santa.db` with tables:

- `organizers` - id, email, password_hash, first_name, last_name, group_name, group_code, created_at
- `participants` - id, first_name, last_name, email, wish1-3, organizer_id, created_at
- `exclusions` - id, giver_id, receiver_id (references participants)
- `assignments` - id, giver_id, receiver_hash, encrypted_receiver, email_sent, created_at
- `config` - key, value

Unique constraint on `(organizer_id, email)` in participants table.

Migration: On startup, if existing participants table lacks `organizer_id`, creates default organizer and assigns all participants to it.

## Environment Variables

Copy `.env.example` to `.env`. Key variables:
- `SESSION_SECRET` - Secret for session cookies
- `ENCRYPTION_KEY` - 32-char key for assignment encryption
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP port (587 or 465)
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `SMTP_FROM` - From address (must match authenticated user on strict servers)

## URL Structure

- `/` - Public home page
- `/join` - Enter invite code manually
- `/join/:code` - Register as participant with invite code
- `/success` - Registration confirmation
- `/organizer/register` - Create organizer account
- `/organizer/login` - Organizer login
- `/organizer/logout` - Logout
- `/organizer/dashboard` - Manage participants
- `/organizer/settings` - View/regenerate invite code
- `/organizer/exclusions` - Manage exclusion rules
- `/organizer/draw` - Perform draw and send emails
