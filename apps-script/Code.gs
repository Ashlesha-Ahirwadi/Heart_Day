/**
 * CPR Awareness certificate site — Google Apps Script web app.
 *
 * Logs to the Sheet below by ID. Receives a JSON POST from the Render
 * backend and appends one row per submission.
 *
 * Sheet column order (add this exact header row to row 1 of the sheet):
 *   Timestamp | First name | Last name | Email | Phone | Method
 *
 * Deploy (standalone project — not opened from inside the Sheet):
 * script.google.com → New project → paste this file → Deploy → New
 * deployment → type "Web app" → Execute as: Me → Who has access: Anyone.
 * Copy the resulting web app URL into the Render env var SHEET_WEBHOOK_URL.
 *
 * The first run will prompt you to authorize access to this Sheet ID —
 * accept it (click through the "unverified app" screen via
 * Advanced → Go to (project name)).
 */

var SHEET_ID = "19P0DFpG3Zmad34MEGhpNik7RfppTIkgaRML-pDxgaQU";

function doPost(e) {
  var result = { ok: true };

  try {
    var data = JSON.parse(e.postData.contents);

    var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.firstName || "",
      data.lastName || "",
      data.email || "",
      data.phone || "",
      data.method || "",
    ]);
  } catch (err) {
    result = { ok: false, error: String(err) };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
