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

Node.js/Express application for organizing Secret Santa gift exchanges with participant registration, exclusion rules, random draw, and email notifications.

### Core Components

- **app.js** - Express server entry point, middleware setup, route mounting
- **config/database.js** - SQLite initialization via better-sqlite3, creates tables on startup
- **models/** - Data access layer (Participant, Exclusion, Assignment CRUD operations)
- **routes/** - HTTP handlers split into public (`/`) and admin (`/admin`) routes
- **services/** - Business logic:
  - `draw.js` - Hamiltonian cycle algorithm respecting exclusion rules
  - `mailer.js` - Nodemailer SMTP integration for sending results
- **views/** - EJS templates using layout pattern with `<%- include('layout', { body }) %>`

### Security Model

Assignments are encrypted with AES (crypto-js) using `ENCRYPTION_KEY`. Admin can see that a draw was made and email status, but cannot see who gives to whom. Decryption only happens when sending emails.

### Database

SQLite stored in `data/santa.db` with tables: `participants`, `exclusions`, `assignments`, `config`.

## Environment Variables

Copy `.env.example` to `.env`. Key variables:
- `ADMIN_PASSWORD` - Admin login password
- `ENCRYPTION_KEY` - 32-char key for assignment encryption
- `SMTP_*` - Mail server configuration (SMTP_FROM must match authenticated user on strict servers)
