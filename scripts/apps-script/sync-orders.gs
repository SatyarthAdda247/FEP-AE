/**
 * EduSkill — Orders → Cohort auto-sync (Google Apps Script)
 * ---------------------------------------------------------------------------
 * Bind this to the Campus Program Google Sheet. Whenever the "Raw-Orders" tab
 * changes, it pushes every row to the dashboard, which enrolls anyone who paid
 * above the threshold into the August cohort (idempotently — re-runs are safe).
 *
 * The sheet stays private. Auth is a shared secret, not a Google/Claude
 * connector, so it's safe for enterprise use.
 *
 * ── ONE-TIME SETUP ─────────────────────────────────────────────────────────
 * 1. Open the sheet → Extensions → Apps Script. Paste this file in.
 * 2. Project Settings (⚙) → Script Properties → add two properties:
 *      WEBHOOK_URL          = https://<your-dashboard-domain>/api/cohorts/sync-orders
 *      ORDERS_SYNC_SECRET   = <the same value set in the dashboard's env>
 * 3. Run `installTriggers` once (authorize when prompted). This wires up:
 *      - an onChange installable trigger  → syncs seconds after any edit
 *      - an hourly time-driven trigger    → safety net / catches bulk imports
 * 4. (Optional) Run `syncNow` manually to do an immediate first sync and see
 *    the result in the Apps Script execution log.
 *
 * Column headers on Raw-Orders are matched by name (case-insensitive), so the
 * column order can change freely. Required columns: phone, name, revenue.
 */

var ORDERS_TAB = 'Raw-Orders';

function _props() { return PropertiesService.getScriptProperties(); }

function _config() {
  var p = _props();
  var url = p.getProperty('WEBHOOK_URL');
  var secret = p.getProperty('ORDERS_SYNC_SECRET');
  if (!url || !secret) {
    throw new Error('Set WEBHOOK_URL and ORDERS_SYNC_SECRET in Project Settings → Script Properties.');
  }
  return { url: url, secret: secret };
}

function _colIndex(header, names) {
  var lower = header.map(function (h) { return String(h).trim().toLowerCase(); });
  for (var i = 0; i < names.length; i++) {
    var idx = lower.indexOf(names[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Read Raw-Orders → array of { phone, name, revenue } */
function _readRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_TAB);
  if (!sheet) throw new Error('Tab "' + ORDERS_TAB + '" not found in this spreadsheet.');
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var header = values[0];
  var iPhone = _colIndex(header, ['phone', 'contact', 'mobile', 'phone number']);
  var iName = _colIndex(header, ['name', 'student name', 'full name']);
  var iRev = _colIndex(header, ['revenue', 'amount', 'paid', 'sum of revenue']);
  if (iPhone === -1 || iName === -1 || iRev === -1) {
    throw new Error('Raw-Orders must have phone, name and revenue columns. Found: ' + header.join(', '));
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var phone = row[iPhone];
    var name = row[iName];
    if (!phone && !name) continue;
    rows.push({ phone: String(phone), name: String(name), revenue: row[iRev] });
  }
  return rows;
}

function _post(rows) {
  var cfg = _config();
  var res = UrlFetchApp.fetch(cfg.url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': cfg.secret },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  Logger.log('Sync response ' + code + ': ' + text);
  if (code < 200 || code >= 300) {
    throw new Error('Webhook returned ' + code + ': ' + text);
  }
  return JSON.parse(text);
}

/** Push all current Raw-Orders rows to the dashboard. */
function syncNow() {
  var rows = _readRows();
  if (!rows.length) { Logger.log('No rows to sync.'); return; }
  return _post(rows);
}

/** Trigger handlers (Apps Script calls these on the events wired below). */
function onChangeTrigger() { syncNow(); }
function onEditTrigger() { syncNow(); }

/** Run ONCE to install the triggers. Safe to re-run (clears dupes first). */
function installTriggers() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) ScriptApp.deleteTrigger(existing[i]);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Fires seconds after structural changes (row adds, imports, edits)
  ScriptApp.newTrigger('onChangeTrigger').forSpreadsheet(ss).onChange().create();
  // Hourly safety net in case a change event is missed
  ScriptApp.newTrigger('syncNow').timeBased().everyHours(1).create();

  Logger.log('Triggers installed: onChange + hourly.');
}
