# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start

# Linting
npm run lint

# Docker
docker compose up -d          # Start
docker compose down           # Stop
docker compose build          # Rebuild after code changes
docker compose logs -f        # View logs
```

No automated test framework is configured. Changes must be verified manually by starting the server (`npm run dev`) and testing affected routes.

## Architecture

Node.js/Express application (French UI) for organizing Secret Santa gift exchanges. Supports multiple organizers, each managing multiple groups with participant registration, exclusion rules, random draw, and SMTP email notifications.

### Key Design Decisions

- **Multi-group model**: Organizers own multiple groups. Groups contain participants, exclusions, and assignments. Routes for group-specific actions are nested under `/organizer/groups/:groupId(\\d+)/` using `mergeParams: true`.
- **Data isolation**: Group-level middleware (`requireGroupAccess` in `routes/group.js`) verifies the logged-in organizer owns the group before any operation.
- **Admin system**: Organizers with `is_admin=1` access `/admin/*` routes. Admin is bootstrapped via `ADMIN_EMAIL` env var on startup. Admin can manage users, groups, themes, and view audit logs (`admin_logs` table).
- **Assignment secrecy**: Assignments are encrypted with AES (crypto-js) using `ENCRYPTION_KEY`. Organizers see draw status but never who gives to whom. Decryption only happens when sending emails.
- **Draw algorithm**: `services/draw.js` builds a Hamiltonian cycle via backtracking with random shuffling (up to 100 attempts), respecting exclusion rules.
- **Database**: SQLite via `better-sqlite3` (synchronous API — no `await` on queries). Schema migrations run inline in `config/database.js` on startup using `PRAGMA table_info` checks + `ALTER TABLE`.
- **CSRF**: Double-submit cookie pattern via `csrf-csrf`. Token available as `res.locals.csrfToken` in views; submit via hidden `_csrf` field.
- **Flash messages**: `connect-flash` — available in views as `flashSuccess` / `flashError`.
- **Theming**: Global theme stored in `config` table, exposed as `res.locals.theme` in all views.

### Route Structure

- `routes/index.js` — Public: home (`/`), join by code (`/join/:code`), participant registration, wish editing (`/participant/edit-wishes/:token`)
- `routes/organizer.js` — Auth: login, register, forgot/reset password, dashboard (lists organizer's groups), account settings, delete
- `routes/group.js` — Group management (mounted at `/organizer/groups/:groupId`): dashboard, participants, exclusions, draw, settings, archive
- `routes/admin.js` — Admin panel: users, groups, logs, theme config

### Models

Plain objects with methods (not classes). Each model wraps `better-sqlite3` prepared statements. Key models: `organizer.js`, `group.js`, `participant.js`, `exclusion.js`, `assignment.js`, `admin-log.js`.

### Database Tables

- `organizers` — id, email, password_hash, first_name, last_name, is_admin, is_verified, verification_token, reset_token, created_at
- `groups` — id, organizer_id, name, code (8-char hex), budget, event_date, archived_at, created_at
- `participants` — id, first_name, last_name, email, wish1-3, organizer_id, group_id, edit_token, created_at
- `exclusions` — id, giver_id, receiver_id (unique pair)
- `assignments` — id, giver_id, receiver_hash, encrypted_receiver, email_sent, created_at
- `config` — key/value store (theme, etc.)
- `admin_logs` — admin action audit trail

Unique constraints: `(organizer_id, email)` and `(group_id, email)` on participants.

## Code Style

ESLint is configured (`eslint.config.js`): single quotes, semicolons, 2-space indent. CommonJS modules (`require`/`module.exports`). EJS for views with `layout.ejs` as shared layout.

## Environment Variables

Copy `.env.example` to `.env`. Required: `SESSION_SECRET`, `ENCRYPTION_KEY`. Optional: `APP_URL`, `ADMIN_EMAIL`, `SMTP_HOST/PORT/USER/PASS/FROM`, `PORT`.
