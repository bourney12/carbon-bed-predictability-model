# Deployment Guide

This app is now wired to deploy as a single Node service:

- the backend serves `/api`
- the same backend serves the built React frontend from `dist/`
- live shared data persists in SQLite at `work/platform-data/platform.sqlite`

## Required Environment

Copy [.env.example](C:/Users/cgjabo/Documents/Codex/2026-06-08/files-mentioned-by-the-user-carbon/.env.example) and set:

- `CARBON_PLATFORM_ADMIN_PASSWORD`
- `CARBON_ANTHROPIC_API_KEY`

Recommended:

- set `CARBON_PLATFORM_DATA_DIR` to a persistent mounted directory
- keep `HOST=0.0.0.0`
- set `PORT` from your host/platform

## Local Production Run

Install dependencies:

```powershell
npm install
```

Build the frontend:

```powershell
npm run build
```

Start the unified server:

```powershell
npm start
```

The app will then be available from the same process:

- frontend at `/`
- API at `/api/*`

## Docker Run

Build:

```powershell
docker build -t carbon-bed-platform .
```

Run:

```powershell
docker run ^
  -p 8787:8787 ^
  -e CARBON_PLATFORM_ADMIN_PASSWORD=replace_me ^
  -e CARBON_ANTHROPIC_API_KEY=replace_me ^
  -v carbon-platform-data:/app/work/platform-data ^
  carbon-bed-platform
```

## Render Deployment

This repo is now wired for Render with [render.yaml](C:/Users/cgjabo/Documents/Codex/2026-06-08/files-mentioned-by-the-user-carbon/render.yaml).

Important:

- this app must run as a Render `web` service, not a static site
- it needs a persistent disk because SQLite, retained PDFs, snapshots, and charge imports are server-side
- the included Blueprint uses a disk mounted at `/var/data`

Render setup flow:

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the repository.
3. Confirm the service settings from `render.yaml`.
4. Set the unsynced secrets in the Render dashboard:
   - `CARBON_PLATFORM_ADMIN_PASSWORD`
   - `CARBON_ANTHROPIC_API_KEY`
5. Deploy.

The service will:

- run `npm install && npm run build`
- start with `npm start`
- expose health at `/api/health`

Expected public app URL:

- `https://<your-render-service>.onrender.com`

## Operational Checklist

Before calling the deployment live:

1. Confirm login works with the admin user.
2. Change the bootstrap admin password immediately.
3. Create at least one operator account and one viewer account.
4. Upload a CoA PDF and verify:
   - extraction succeeds
   - original PDF appears in the document library
   - the record survives restart
5. Upload a stack test PDF and verify the same.
6. Drop a charge CSV into the inbox and confirm it is:
   - imported
   - archived
   - reflected in the shared charge log
7. Restart the server and confirm state reloads from SQLite.
8. Back up the SQLite file and snapshots directory as part of host backup policy.

## Production Notes

- `work/platform-data/platform.sqlite` is now the live source of truth.
- `work/platform-data/live-state.json` is only a legacy migration source if present.
- Keep `work/platform-data/` on persistent storage, not ephemeral disk.
- The server-side AI extraction depends on Anthropic being reachable from the deployment host.
- v1.9.0 seed data covers P1-P14 (to JOB-3146, 24 Sep 2026). P9-P14 active hours are estimated at 21.7 hrs/day and should be reconciled against the charge log.

## Creosote log sync (v1.10.0)

The site's `Creosote Tank and Flash Point Log.xlsx` (SharePoint) feeds the CoA Data tab.

- Endpoint: `POST /api/imports/creosote/xlsx-sync`, header `X-Import-Api-Key` (same `CARBON_IMPORT_API_KEY` as the charge sync).
- PC side: `scripts/sync-creosote-xlsx.ps1` reads the **Deliveries** and **Daily Log** tabs straight from the .xlsx (no Excel needed; columns matched by header text) and posts them. `scripts/install-creosote-sync-task.ps1` registers a 15-minute scheduled task that only posts when the workbook has changed.
- The workbook must be synced to the PC by OneDrive ("Add shortcut to My files", then "Always keep on this device").
- On each sync, deliveries and tank readings from `SinceDate` (default 2024-01-01) replace the platform copy for that range, and every delivery with a cert number is upserted into `cgb_coaData` by cert number (the workbook is the master record). New state keys: `cgb_creoDeliveries`, `cgb_creoDailyLog`.
