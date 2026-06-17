# Multi-User Platform Notes

This workspace now includes the first deployable shared-platform layer for the Carbon Bed Predictability Model.

## What Exists Now

- Shared live state served from `/api/state`
- SQLite-backed live persistence in `work/platform-data/platform.sqlite`
- Timestamped state snapshots in `work/platform-data/snapshots/`
- Server-side document retention for uploaded original PDFs
- Login, session handling, password change flow, and role-based access
- Audit logging for state changes, logins, document uploads, imports, and admin actions
- Automated charge CSV ingestion from a watched inbox

## Roles

The platform currently supports:

- `admin`
  - Full access
  - Can create users
  - Can import backups
  - Can clear/reset shared state
  - Can view audit history
- `operator`
  - Can edit shared plant/model data
  - Can upload retained documents
  - Can trigger charge import scans
- `viewer`
  - Read-only access to the live model and retained documents
  - Cannot mutate shared platform data

Bootstrap admin credentials are controlled by environment variables:

- `CARBON_PLATFORM_ADMIN_USER`
- `CARBON_PLATFORM_ADMIN_PASSWORD`

If no password is supplied, the fallback bootstrap password is marked as temporary and must be changed after first login.

## Shared State Keys

These keys are persisted server-side:

- `cgb_chargeLog`
- `cgb_coaData`
- `cgb_settings`
- `cgb_lastChangeout`
- `cgb_stackDataExtra`
- `cgb_downtimeHrs`
- `cgb_fanHrs`
- `cgb_thermalLog`

Historical seed data P1-P8 remains in the app code. Shared state stores only live additions and overrides.

## Backups and Recovery

Every server-side write updates the live SQLite store and creates a JSON snapshot.

Backup avenues currently covered:

- Automatic point-in-time snapshots on write
- Manual JSON backup export from the app
- Manual JSON backup import into the shared state
- Original imported PDFs retained on the server
- Processed charge CSV files archived after ingestion

Primary storage paths:

- Live database:
  `work/platform-data/platform.sqlite`
- Legacy JSON migration source:
  `work/platform-data/live-state.json`
- Snapshots:
  `work/platform-data/snapshots/`
- Charge inbox:
  `work/platform-data/imports/charges/`
- Processed charge archive:
  `work/platform-data/imports/charges-processed/`
- Retained original documents:
  `work/platform-data/documents/`

## Retained Original Documents

The app now stores original uploaded files server-side for traceability:

- Stack test PDFs
- CoA PDFs

Document metadata is exposed via `/api/documents`, and authenticated downloads are served through:

- `GET /api/documents/:id/download`

## Server-Side AI Extraction

PDF extraction now runs on the backend rather than in the browser.

Required backend environment variable:

- `CARBON_ANTHROPIC_API_KEY`

Optional override:

- `CARBON_ANTHROPIC_MODEL`

API routes:

- `POST /api/extract/stack-test`
- `POST /api/extract/coa`

This keeps the AI credential off the client and centralises document parsing behind authenticated server routes.

## Automated Charge Imports

Drop charge CSV files into:

```text
work/platform-data/imports/charges/
```

Expected columns:

```text
date,type,count,durationHrs,notes
```

Accepted `type` values include:

- `plant1`, `p1`, `fencing`, `fence`
- `plant2`, `p2`, `poles`, `pole`

Processed CSVs are moved into:

```text
work/platform-data/imports/charges-processed/
```

The backend also runs a timed import scan loop so new files can be picked up without manual intervention.

## Local Run

Start the backend API:

```powershell
npm run server
```

Start the frontend:

```powershell
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8787`.

## Current API Surface

Auth:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/change-password`

Users and audit:

- `GET /api/users`
- `POST /api/users`
- `GET /api/audit`

Documents:

- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/:id/download`

Shared state and platform ops:

- `GET /api/state`
- `PUT /api/state/:key`
- `GET /api/status`
- `GET /api/backup/export`
- `POST /api/backup/import`
- `POST /api/imports/charges/run`
- `POST /api/extract/stack-test`
- `POST /api/extract/coa`
- `POST /api/reset`

## Critical Operational Note

Enter the P8 PAH result as soon as it is received from the lab. That single certified value remains the highest-value model improvement available without any further code changes.

## What Is Still Not Finished

This is a solid shared operational layer, but it is not yet a full production SaaS platform.

Still recommended next:

- Add encrypted off-machine backup replication
- Add richer user management flows such as password reset and account disable
- Add deployment hardening, monitoring, and alerting
- Add object-storage style document retention if volume grows
- Add full multi-site / multi-tenant separation if the platform expands
