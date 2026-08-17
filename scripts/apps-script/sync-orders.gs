/**
 * EduSkill — Orders → August cohort auto-sync (Google Apps Script)
 * ===========================================================================
 * Reads the Raw-Orders tab and enrolls everyone who paid above the threshold
 * into the August cohort — automatically, whenever the sheet changes.
 *
 * PASTE into: the sheet → Extensions → Apps Script. Then:
 *   1. Fill in the two CONFIG values below.
 *   2. Run `installTriggers` once (authorize when asked)  → enables auto-sync.
 *   3. (If you use the /exec Web App URL) Deploy → Manage deployments →
 *      edit (✎) → Deploy, so the URL picks up doGet below. Trigger a manual
 *      sync anytime by visiting:  <WebApp /exec URL>?token=<SYNC_SECRET>
 * ===========================================================================
 */

// ── CONFIG — fill these two in ──────────────────────────────────────────────
// The DASHBOARD's webhook (NOT this script's /exec URL):
var WEBHOOK_URL = 'https://YOUR-DASHBOARD-DOMAIN/api/cohorts/sync-orders'; // e.g. https://eduskill.adda247.com/api/cohorts/sync-orders
var SYNC_SECRET = 'PASTE-THE-SAME-SECRET-AS-THE-DASHBOARD';                // must equal ORDERS_SYNC_SECRET in the dashboard env
// ────────────────────────────────────────────────────────────────────────────

var ORDERS_TAB = 'Raw-Orders';

/** Read Raw-Orders → [{ phone, name, revenue }, ...] (columns matched by header name). */
function readOrderRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_TAB);
  if (!sheet) throw new Error('Tab "' + ORDERS_TAB + '" not found in this spreadsheet.');

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var header = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var find = function (names) {
    for (var i = 0; i < names.length; i++) { var idx = header.indexOf(names[i]); if (idx !== -1) return idx; }
    return -1;
  };
  var iPhone = find(['phone', 'contact', 'mobile', 'phone number']);
  var iName  = find(['name', 'student name', 'full name']);
  var iRev   = find(['revenue', 'amount', 'paid', 'sum of revenue']);
  var iPkg   = find(['package_id', 'packageid', 'package id', 'package']);
  if (iPhone === -1 || iName === -1 || iRev === -1) {
    throw new Error('Raw-Orders needs phone, name and revenue columns. Found: ' + header.join(', '));
  }
  if (iPkg === -1) {
    throw new Error('Raw-Orders needs a package_id column (used to select the EduSkill Program packages). Found: ' + header.join(', '));
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[iPhone] && !row[iName]) continue;
    rows.push({
      phone: String(row[iPhone]),
      name: String(row[iName]),
      revenue: row[iRev],
      packageId: String(row[iPkg]).trim(),
    });
  }
  return rows;
}

/** Read Raw-Orders and push all rows to the dashboard webhook. Returns the parsed response. */
function syncNow() {
  if (WEBHOOK_URL.indexOf('YOUR-DASHBOARD-DOMAIN') !== -1 || SYNC_SECRET.indexOf('PASTE-') === 0) {
    throw new Error('Fill in WEBHOOK_URL and SYNC_SECRET at the top of the script first.');
  }
  var rows = readOrderRows_();
  if (!rows.length) { Logger.log('No rows to sync.'); return { received: 0 }; }

  var res = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': SYNC_SECRET },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  Logger.log('Sync ' + code + ': ' + res.getContentText());
  if (code < 200 || code >= 300) throw new Error('Webhook returned ' + code + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

/** Web App entrypoints — visiting <exec URL>?token=<SYNC_SECRET> runs a sync. */
function doGet(e)  { return _handleWebApp_(e); }
function doPost(e) { return _handleWebApp_(e); }
function _handleWebApp_(e) {
  var json = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  };
  var token = e && e.parameter ? e.parameter.token : '';
  if (token !== SYNC_SECRET) return json({ ok: false, error: 'unauthorized' });
  try { return json({ ok: true, result: syncNow() }); }
  catch (err) { return json({ ok: false, error: String(err) }); }
}

/** onChange trigger handler. */
function onChangeTrigger() { syncNow(); }

/** Run ONCE to enable auto-sync. Safe to re-run (clears old triggers first). */
function installTriggers() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) ScriptApp.deleteTrigger(existing[i]);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onChangeTrigger').forSpreadsheet(ss).onChange().create(); // fires on edits/imports
  ScriptApp.newTrigger('syncNow').timeBased().everyHours(1).create();             // hourly safety net

  Logger.log('Triggers installed: onChange + hourly. Running an initial sync now...');
  syncNow();
}
