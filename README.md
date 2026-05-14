# SecureBank — ICT2216 Group 22

Baseline frontend and backend for the **SecureBank** secure internet-banking
project. Every backlog feature has a dedicated page and API route in this
baseline so each owner can branch off and start work immediately.

> **Lab P2 · Group 22 · SecureBankers**
> SE: Nicholas, Alvin, Nathaniel · IS: Emily, Yue Heng, Wen Hao, Elroy, Reagan

---

## 1. Tech stack (matches the project proposal)

| Layer    | Tools                                                                              |
|----------|------------------------------------------------------------------------------------|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · React Router · lucide-react          |
| Backend  | Node.js · Express · MySQL2 · bcrypt · express-session · helmet · express-rate-limit · express-validator |
| Database | MySQL 8 (schema from `Securebank.sql`)                                             |
| Dev tools| GitHub · npm · tunnel-ssh (dev-only helper for the cloud MySQL via SSH)            |

Packages reserved for **Backlog #14 — 2FA (Yue Heng)** and not yet installed:
`twilio`, `nodemailer`, `otplib` / `speakeasy`. Add them when you start that
ticket — the login flow already has a clean hook point right before
`req.session.regenerate(...)`.

---

## 2. Project layout

```
SecureBank/
├─ backend/                         Express API
│  ├─ src/
│  │  ├─ server.js                  App bootstrap (helmet, CORS, sessions, routes)
│  │  ├─ config/database.js         MySQL pool
│  │  ├─ middleware/                auth.js · rateLimiter.js · validation.js
│  │  ├─ routes/                    auth.js · users.js · admin.js
│  │  └─ utils/logger.js            Writes every action to the `logs` table
│  ├─ scripts/
│  │  ├─ seedPasswords.js           Replaces the placeholder bcrypt hashes in the SQL dump
│  │  └─ sshTunnel.js               Opens 127.0.0.1:3307 -> remote MySQL via SSH
│  ├─ .env.example                  Copy to .env and fill in your secrets (DO NOT COMMIT .env)
│  └─ package.json
├─ frontend/                        React + Vite
│  ├─ src/
│  │  ├─ pages/
│  │  │  ├─ Login.tsx · Register.tsx
│  │  │  ├─ Dashboard.tsx · Transactions.tsx · Recipients.tsx · Transfer.tsx · Profile.tsx
│  │  │  └─ admin/{AdminLogin,AdminUsers,AdminTransactions,AdminLogs}.tsx
│  │  ├─ components/                Sidebar · AppLayout · ProtectedRoute · Captcha
│  │  ├─ context/AuthContext.tsx    Session state, /api/auth/me bootstrap
│  │  ├─ utils/format.ts            Shared regex patterns + money/date formatters
│  │  └─ api/client.ts              Tiny fetch wrapper (credentials: 'include')
│  ├─ vite.config.ts                Proxies /api/* to the backend
│  └─ package.json
└─ database/
   └─ seed_admin_password.sql       Documentation only — run scripts/seedPasswords.js instead
```

---

## 3. Backlog → Page / API mapping

| #  | Backlog item                       | Owner             | Page                                                       | API                                                                |
|----|------------------------------------|-------------------|------------------------------------------------------------|--------------------------------------------------------------------|
| 1  | User Login/Logout                  | Wen Hao           | `frontend/src/pages/Login.tsx`                             | `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/captcha` |
| 2  | Sidebar + Baseline                 | Alvin             | `frontend/src/components/Sidebar.tsx`, `AppLayout.tsx`     | n/a                                                                |
| 3  | User Dashboard                     | Reagan            | `frontend/src/pages/Dashboard.tsx`                         | `GET /api/user/dashboard`                                          |
| 4  | User Transaction History (filter)  | Elroy             | `frontend/src/pages/Transactions.tsx`                      | `GET /api/user/transactions`                                       |
| 5  | User Transfer Funds (account/phone, QR) | Nathaniel    | `frontend/src/pages/Transfer.tsx`                          | `POST /api/user/transfer` · `GET /api/user/lookup`                 |
| 6  | User Recipients (create/delete)    | Emily             | `frontend/src/pages/Recipients.tsx`                        | `GET/POST/DELETE /api/user/recipients`                             |
| 7  | User Profile / Update Password     | Nicholas          | `frontend/src/pages/Profile.tsx`                           | `GET /api/user/profile` · `PUT /api/user/password`                 |
| 8  | Admin Login/Logout                 | Wen Hao           | `frontend/src/pages/admin/AdminLogin.tsx`                  | `POST /api/auth/admin/login`                                       |
| 9  | Admin User Management              | Alvin / Nathaniel | `frontend/src/pages/admin/AdminUsers.tsx`                  | `GET/POST/PUT/DELETE /api/admin/users`                             |
| 10 | Admin User Transaction History     | Elroy             | `frontend/src/pages/admin/AdminTransactions.tsx`           | `GET /api/admin/transactions`                                      |
| 11 | Admin Logs table                   | Emily             | `frontend/src/pages/admin/AdminLogs.tsx`                   | `GET /api/admin/logs`                                              |
| 12 | Database Design                    | Nicholas          | uses `Securebank.sql` schema as-is                         | n/a                                                                |
| 13 | Database Backup                    | Reagan            | _reserved_ — add `backend/scripts/backupDb.js` on a cron   | n/a                                                                |
| 14 | 2FA (SMS / Email / OTP)            | Yue Heng          | _reserved_ — hook inside `routes/auth.js` before `req.session.regenerate(...)` | _reserved_                                          |

---

## 4. Security baseline already in place

- **Password storage** — bcrypt cost 12 (`routes/auth.js`, `routes/users.js`).
- **Parameterized SQL everywhere** — every query uses `pool.execute(sql, [params])`. No string concatenation.
- **Sessions** — `express-session` with `httpOnly` + `sameSite=lax` cookies; session is **regenerated** on every successful login to mitigate session-fixation.
- **Rate limiting** — login limiter is **per IP + username** (5 attempts / 15 min). A separate global limiter caps general traffic.
- **CAPTCHA** — server-side arithmetic question stored in the session, single-use, verified on every login. Swap in hCaptcha / reCAPTCHA in production.
- **Account lock-out** — after `ACCOUNT_LOCK_THRESHOLD` failures the user is locked for `ACCOUNT_LOCK_MINUTES`. `failed_attempts` and `locked_until` columns from the schema are used.
- **Audit logging** — every login, transfer, password change, admin status change writes to the `logs` table via `utils/logger.js`.
- **Input validation** — regex patterns shared client (`utils/format.ts`) and server (`middleware/validation.js`); `express-validator` produces structured 400s.
- **Defence headers + transport** — `helmet`, credentialed `cors` restricted to `CLIENT_ORIGIN`, `compression`.
- **Atomic transfers** — `START TRANSACTION` + `SELECT … FOR UPDATE` on both sides, two-row insert into `transaction_history`. Insufficient-balance and self-transfer cases roll back.

---

## 5. First-time setup

### 5.1 Database access (SSH tunnel)

The cloud MySQL is reachable only through the bastion. The dev helper opens a
tunnel for you so the backend can keep using `DB_HOST=127.0.0.1`:

```bash
cd backend
cp .env.example .env       # fill SSH_* and DB_* with the credentials from your TA
npm install
node scripts/sshTunnel.js  # leaves a tunnel listening on 127.0.0.1:3307
```

Alternatively, open the tunnel yourself with any SSH client (MySQL Workbench,
plink, ssh, …) — point local port `3307` to remote `127.0.0.1:3306`.

### 5.2 Seed the placeholder bcrypt hashes

The `Securebank.sql` dump ships with **placeholder hashes that don't match
any known plaintext**. Run this once after importing the dump:

```bash
node scripts/seedPasswords.js
```

You can override the defaults via env:
`SEED_ADMIN_PW=... SEED_USER_PW=... node scripts/seedPasswords.js`.

### 5.3 Run the backend

```bash
cd backend
npm run dev      # nodemon · listens on http://localhost:4000 (or whatever PORT in .env)
```

### 5.4 Run the frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, proxies /api/* to the backend
```

If your machine already has something on **port 4000**, set `PORT=4010` (or
similar) in `backend/.env` and point Vite at it via `frontend/.env`:
`VITE_API_TARGET=http://localhost:4010`.

> **Tip (Windows)**: Vite binds to IPv6 only, so use `http://localhost:5173`,
> not `http://127.0.0.1:5173`.

---

## 6. Default credentials after seeding

| Role  | Username   | Password        | Notes                                                |
|-------|------------|-----------------|------------------------------------------------------|
| Admin | `admin`    | `Admin@123`     | full admin access                                    |
| User  | `john.doe` (and the rest of the seeded users) | `Password@123` | every seeded user shares this password until they change it |

Change them via the Change-Password page after first login.

---

## 7. Manual verification checklist

- [ ] `GET /api/health` returns `{ ok: true }`.
- [ ] Login as `john.doe / Password@123` succeeds; dashboard shows balance from MySQL.
- [ ] Five failed logins within 15 minutes return HTTP 423 (account locked).
- [ ] Transfer from one seeded user to another updates both balances atomically.
- [ ] Suspending a user from the admin page prevents them from logging in.
- [ ] Admin Audit Logs page shows the LOGIN, TRANSFER, USER_STATUS_CHANGE rows
      written during the steps above.

---

## 8. Notes for assignees

- **2FA (Yue Heng)** — add the OTP step between the successful `bcrypt.compare`
  and the `req.session.regenerate(...)` call in `routes/auth.js`. The
  `users.otp_secret` column from the schema is already available; install
  `otplib` for authenticator apps, `twilio` for SMS, `nodemailer` for email.
- **QR transfer (Nathaniel)** — `qrcode` is already a backend dependency. Add a
  short-lived signed payload (e.g. a JWT with 6-7 minute expiry) and a
  `POST /api/user/transfer/qr` endpoint that consumes it.
- **DB backup (Reagan)** — add `backend/scripts/backupDb.js` that shells out to
  `mysqldump` on a cron, and uploads to wherever your team agrees.

---

## 9. Important — never commit secrets

- `.env` is gitignored. **Do not** check it in.
- Real DB / SSH credentials live only in your local `.env`.
- If you must share dev credentials, use the team's private channel.
