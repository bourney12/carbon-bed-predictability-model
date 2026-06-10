# Static Go-Live Notes

This release is the single-user/static deployment of the Carbon Bed Predictability Model.

Upload these two files together to the same folder on the live host:

- `index.html`
- `carbon-predictability-model.jsx`

Open `index.html` in the browser. The app runs client-side and stores operational data in that browser's local storage.

## Backup Procedure

After every operational update, stack test import, CoA import, or manual entry:

1. Open `Settings`.
2. Use `Export Backup`.
3. Save the JSON backup in the controlled project document store.
4. Keep the original MCERTS stack test PDFs and Koppers CoA PDFs in the same controlled document store.

The app stores extracted records and manually entered records. It does not store the original uploaded PDFs.

## Restore Procedure

To restore data on a browser or replacement machine:

1. Open the live app.
2. Open `Settings`.
3. Use `Import Backup`.
4. Select the latest exported JSON backup.

## Current Limitation

This static version does not include a shared multi-user database or server-side automatic backup. Each browser has its own local storage until the multi-user live system is added later.
