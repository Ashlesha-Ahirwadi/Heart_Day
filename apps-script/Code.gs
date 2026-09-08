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
 * IMPORTANT — authorize Sheets access BEFORE relying on the deployed URL:
 * a fresh project has no Sheets permission yet, and calling the deployed
 * web app alone does not trigger the consent prompt. Instead, select
 * `testSheetAccess` in the function dropdown and click Run once in the
 * editor; approve the "unverified app" prompt (Advanced → Go to project
 * → Allow). Only after that succeeds (check the Execution log) should
 * you deploy/redeploy and start using the URL.
 *
 * KNOWN COSMETIC GLITCH: after calling the deployed URL, you may see
 * Google's "Sorry, unable to open the file at this time" page instead of
 * the `{"ok":true}` JSON. This is a flaky failure in Google's redirect/
 * confirmation-page delivery, not a failure of doPost itself — the row
 * is appended regardless. If in doubt, check the Sheet directly rather
 * than trusting what a browser/curl shows for the response body.
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

/**
 * One-time manual test: run this from the editor (Run ▶ with this
 * function selected) to trigger the Sheets-access authorization prompt
 * before the web app is used for real. Check the Execution log for
 * "Success — sheet name: ...". Not called by doPost; safe to leave in.
 */
function testSheetAccess() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  Logger.log("Success — sheet name: " + sheet.getName());
}
