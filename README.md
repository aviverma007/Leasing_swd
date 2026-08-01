# Leasing_swd — ScoopSense Leasing & Billing

A production-grade **React + Node/Express + SQL Server** application for real-estate leasing,
billing and investor rent disbursement. Rebuilt from the original single-file `ScoopSense`
prototype into a full stack app with persistent backend storage.

## Modules

- **Masters** — Company, Asset, Block, Unit, Brand, User (role hierarchy)
- **Leasing & Billing** — Leases (MG / MG-vs-RS / Pure RS / Variable RS), monthly Sales entry,
  auto-generated Invoices (MG / Rev-share / CAM / Utility / Ad-hoc) with GST + e-invoice IRN,
  and Collections (with TDS and instrument capture)
- **Rent Disbursement** — Investor Units with maker-checker approval, monthly disbursement
  processing with deductions, TDS, hold logic and NEFT/NRI export
- **Reports & SAP** — Disbursement report, hold-rent report, deductions invoiced, security-deposit
  liability, and a SAP GL entry book with CSV export

## Architecture

```
frontend/   React 18 + Vite (dev port 96) — proxies /api to the backend
backend/    Node + Express (default port 5096) + mssql
backend/sql/schema.sql   SQL Server schema (database: LeasingBillingDB)
```

Sequence-based document codes (CO-0001, AST-0001, LSE-0001, INV-0001, RCT-0001, DIS-0001, …)
are generated server-side via a `Sequences` table + MERGE, mirroring the original app's `nextNo()`.

## Setup

### 1. Database

You have two options.

**Option A — dedicated database (default).** Open `backend/sql/schema.sql` in SSMS and run it.
It creates the `LeasingBillingDB` database and all tables under `dbo`. Keep `DB_SCHEMA=dbo`.

**Option B — add to an EXISTING shared database (no impact on existing tables).**
If you want these tables to live inside a database you already use (e.g. alongside another
app's `dbo.*` tables), the app can install everything under a dedicated `leasing` schema so
nothing collides:

1. In `.env`, set `DB_DATABASE=<your existing DB>` and `DB_SCHEMA=leasing`.
2. Run `backend/sql/schema_existing_db.sql` in SSMS **while connected to that database**.
   It only does `CREATE SCHEMA leasing` + `CREATE TABLE leasing.*` (guarded by
   `IF OBJECT_ID(...) IS NULL`). It never creates/alters/drops the database or any `dbo` object.

The tables then live as `leasing.Companies`, `leasing.Invoices`, etc., fully isolated from
your existing `dbo.*` tables. To sanity-check for name collisions beforehand, run:

```sql
SELECT name FROM sys.tables
WHERE name IN ('Assets','Blocks','Brands','ChangeLog','Collections','Companies',
  'Disbursals','InvestorUnitInvestors','InvestorUnits','Invoices','Leases','Sales',
  'Sequences','Units','Users') AND SCHEMA_NAME(schema_id) = 'leasing';
```

**Either option, one command:** instead of running the .sql by hand, fill in `.env` and run
`npm run setup-db` from `backend/`. It picks the right script based on `DB_SCHEMA`, applies it,
and lists the resulting tables. (In shared-DB mode it will not create or alter the database.)

### 2. Backend

```bash
cd backend
cp .env.example .env      # fill in your SQL Server credentials
npm install
npm run seed              # optional: load demo data
npm start                 # or: npm run dev  (nodemon)
```

`.env` keys:

```
DB_SERVER=192.168.66.33
DB_DATABASE=LeasingBillingDB
DB_USER=sa
DB_PASSWORD=YourPassword
DB_PORT=1433
PORT=5096
DB_SCHEMA=dbo

# Login / auth
ADMIN_ID=admin
ADMIN_PASSWORD=set-your-admin-password
JWT_SECRET=long-random-string
```

## Login & users

- The app opens on a **login page**. Nothing loads until you sign in.
- **Admin** signs in with `ADMIN_ID` / `ADMIN_PASSWORD` from `.env` (not stored in the
  database). Only the admin sees the **User Master** menu.
- **Regular users** are created inside the app under User Master (admin only). Each user's
  password is set there and stored **bcrypt-hashed** in `leasing.Users`. They log in with
  their email + that password.
- Editing a user and leaving the password field blank keeps their existing password.
- Tokens are JWTs signed with `JWT_SECRET`, valid 12 hours.

The connection uses `encrypt: false` + `trustServerCertificate: true` for older internal
SQL Server instances (same convention as the other SWD apps).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:96
```

The Vite dev server proxies `/api/*` to `http://localhost:5096`. To point at a different
backend, set `VITE_API_TARGET` before running.

For production: `npm run build` outputs static files to `frontend/dist/`.

## API surface

| Resource | Endpoint |
|---|---|
| Health | `GET /api/health` |
| Masters | `GET/POST /api/{companies,assets,blocks,units,brands,users}` · `PUT/DELETE /:id` |
| Leases | `GET/POST /api/leases` · `PUT/DELETE /:id` · `POST /:id/hold` · `POST /:id/release` |
| Sales | `GET/POST/DELETE /api/sales` |
| Invoices | `GET /api/invoices` · `POST /api/invoices/generate` · `POST /api/invoices/adhoc` · `DELETE /:id` |
| Collections | `GET/POST/DELETE /api/collections` |
| Investor units | `GET/POST/PUT/DELETE /api/investor-units` · `POST /:id/approve` |
| Disbursement | `GET /api/disbursement/candidates?ym=` · `POST /api/disbursement/process` · `POST /:id/approve` · `POST /:id/void` |
| Reports | `GET /api/reports/{summary,sap-entries,log}` |

## Billing logic (server-side, mirrors the prototype)

- MG invoice = lumpsum, or ₹/sq ft × **carpet** area
- CAM / Utility = rate × **built-up** area
- Rev-share = sales × rev-share %; for MG-vs-RS only the **excess over MG** is billed as a top-up
- Rent-collected-for-unit counts only the net-of-GST portion of MG + Rev-share receipts in the month
- Disbursement candidates = approved investor units with collected rent, split by disbursement %
