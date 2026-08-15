/**
 * EduSkill — Orders → August cohort auto-sync (Google Apps Script)
 * ===========================================================================
 * Paste this into the Campus Program sheet: Extensions → Apps Script.
 * Then do TWO things:
 *   1. Fill in the two CONFIG values just below.
 *   2. Run `installTriggers` once (authorize when asked).
 * That's it — from then on, anyone in Raw-Orders who paid above the threshold
 * is enrolled into the August cohort automatically whenever the sheet changes.
 *
 * (Optional) Run `syncNow` once for an immediate first sync and check
 * View → Logs for the result.
 * ===========================================================================
 */

// ── CONFIG — fill these two in ──────────────────────────────────────────────
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
  if (iPhone === -1 || iName === -1 || iRev === -1) {
    throw new Error('Raw-Orders needs phone, name and revenue columns. Found: ' + header.join(', '));
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[iPhone] && !row[iName]) continue;
    rows.push({ phone: String(row[iPhone]), name: String(row[iName]), revenue: row[iRev] });
  }
  return rows;
}

/** Push all current Raw-Orders rows to the dashboard webhook. */
function syncNow() {
  if (WEBHOOK_URL.indexOf('YOUR-DASHBOARD-DOMAIN') !== -1 || SYNC_SECRET.indexOf('PASTE-') === 0) {
    throw new Error('Fill in WEBHOOK_URL and SYNC_SECRET at the top of the script first.');
  }
  var rows = readOrderRows_();
  if (!rows.length) { Logger.log('No rows to sync.'); return; }

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
}

/** onChange trigger handler. */
function onChangeTrigger() { syncNow(); }

/** Run ONCE to install triggers. Safe to re-run (clears old ones first). */
function installTriggers() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) ScriptApp.deleteTrigger(existing[i]);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onChangeTrigger').forSpreadsheet(ss).onChange().create(); // fires on edits/imports
  ScriptApp.newTrigger('syncNow').timeBased().everyHours(1).create();             // hourly safety net

  Logger.log('Triggers installed: onChange + hourly. Running an initial sync now...');
  syncNow();
}
