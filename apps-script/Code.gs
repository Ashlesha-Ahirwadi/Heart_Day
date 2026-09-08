/**
 * CPR Awareness certificate site — Google Apps Script web app.
 *
 * Bound to the logging Google Sheet. Receives a JSON POST from the Render
 * backend and appends one row per submission.
 *
 * Sheet column order (add this exact header row to row 1 of the sheet):
 *   Timestamp | First name | Last name | Email | Phone | Method
 *
 * Deploy: Extensions → Apps Script → paste this file → Deploy → New
 * deployment → type "Web app" → Execute as: Me → Who has access: Anyone.
 * Copy the resulting web app URL into the Render env var SHEET_WEBHOOK_URL.
 */

function doPost(e) {
  var result = { ok: true };

  try {
    var data = JSON.parse(e.postData.contents);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

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
