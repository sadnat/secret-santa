# AGENTS.md

This file provides detailed instructions for coding agents working in the Secret Santa repository.
Refer to `CLAUDE.md` for high-level architecture and environment setup.

## 1. Build, Lint, and Test Commands

### Running the Application
- **Development Mode:** `npm run dev`
  - Starts the application using `node --watch app.js`.
  - Automatically restarts on file changes.
  - Access at `http://localhost:3000`.
- **Production Mode:** `npm start`
  - Starts the application using `node app.js`.

### Testing
**Status:** No automated testing framework (Jest, Mocha, etc.) is currently configured.
**Protocol:**
- **Manual Verification:** All changes must be manually verified.
- **Procedure:**
  1. Start the server (`npm run dev`).
  2. Manually test the affected routes in a browser or using `curl`.
  3. Verify database state via `sqlite3 data/santa.db` if necessary.
- **Future:** If adding tests, prefer `jest` or `mocha` + `chai`. Create a `test` directory and add a `test` script to `package.json`.

### Linting & Formatting
**Status:** No automated linter (ESLint) or formatter (Prettier) is configured.
**Protocol:**
- **Follow Existing Style:** Mimic the coding style of existing files exactly.
- **Verification:** Review your code against surrounding code before submitting.

---

## 2. Code Style Guidelines

### General Principles
- **Language:** JavaScript (Node.js).
- **Module System:** CommonJS (`require` / `module.exports`).
- **Indentation:** 2 spaces.
- **Semicolons:** Always use semicolons.
- **Quotes:** Use single quotes `'` for strings, backticks `` ` `` for template literals. Avoid double quotes `"` unless necessary (e.g., in HTML/EJS attributes).

### File Structure & Organization
- **Models:** Located in `models/`.
  - Use plain objects with methods (e.g., `const Organizer = { method() { ... } }`).
  - Do not use ES6 classes for models unless migrating.
  - Separate database logic from business logic where possible, but models currently handle SQL queries directly.
- **Routes:** Located in `routes/`.
  - Use `express.Router()`.
  - Group routes logically (e.g., `organizer.js` for `/organizer/*`).
- **Views:** Located in `views/`.
  - Use EJS templates.
  - Logic in views should be minimal.
  - Use partials for reusable components (e.g., `views/layout.ejs`).

### Naming Conventions
- **Variables & Functions:** `camelCase` (e.g., `generateGroupCode`, `isValidEmail`).
- **Files:** `kebab-case` or `snake_case` (existing is mixed/lowercase: `app.js`, `organizer.js`). Stick to lowercase.
- **Database Tables:** `snake_case` (e.g., `organizers`, `participants`).
- **Database Columns:** `snake_case` (e.g., `first_name`, `group_code`).
- **HTML/CSS Classes:** `kebab-case` (e.g., `btn-primary`).

### Database Interactions (SQLite)
- **Library:** `better-sqlite3`.
- **Prepared Statements:** ALWAYS use prepared statements for variable interpolation to prevent SQL injection.
  - **Correct:** `db.prepare('SELECT * FROM users WHERE id = ?').get(id)`
  - **Incorrect:** `db.prepare('SELECT * FROM users WHERE id = ' + id).get()`
- **Synchronous:** `better-sqlite3` is synchronous. Do not use `await` with `stmt.run()` or `stmt.get()`.
- **Transactions:** Use transactions for multi-step operations (though currently not heavily used, it's best practice).

### Asynchronous Patterns
- **Async/Await:** Use `async/await` for asynchronous operations (e.g., password hashing with `bcrypt`, sending emails).
- **Routes:** Mark route handlers as `async` if they use await.
- **Error Handling in Async Routes:** Use `try...catch` blocks.
  ```javascript
  router.post('/path', async (req, res) => {
    try {
      await someAsyncOperation();
      res.redirect('/success');
    } catch (error) {
      console.error('Error description:', error);
      res.render('error-view', { error: 'User friendly message' });
    }
  });
  ```

### Error Handling
- **Logging:** Use `console.error` for server-side errors.
- **User Feedback:**
  - Pass error messages to views via render context: `res.render('view', { error: 'Message' })`.
  - Use query parameters for redirects: `res.redirect('/path?error=' + encodeURIComponent('Message'))`.
- **Middleware:** Use the central error handler in `app.js` for unhandled exceptions.

### Views (EJS)
- **Escaping:** Always use `<%= var %>` for outputting user-provided content to prevent XSS.
- **Unescaped:** Only use `<%- var %>` for trusted HTML content (e.g., including partials).
- **Locals:** `req.session.organizer` is available as `organizer` in all views via middleware.

### Dependencies & Environment
- **Secrets:** Never hardcode secrets. Use `process.env` and `.env` file.
- **bcrypt:** Use for password hashing (10 rounds).
- **crypto-js:** Use for assignment encryption.
- **nodemailer:** Use for sending emails.

## 3. Cursor / Copilot Rules
*No specific .cursorrules or .github/copilot-instructions.md found.*

## 4. Documentation
- **Comments:** Use JSDoc-style comments `/** ... */` for functions and complex logic blocks.
- **Why vs What:** Focus comments on *why* code exists or *why* a specific approach was chosen, rather than simply restating the code.

## 5. Deployment
- **Docker:** Use `docker-compose up -d` for containerized deployment.
- **Production:** ensure `NODE_ENV=production` is set.
