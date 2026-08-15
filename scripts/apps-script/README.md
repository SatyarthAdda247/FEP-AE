# Orders → August Cohort auto-sync

Automatically enrols everyone who pays **more than ₹1500** (from the Campus
Program sheet's **Raw-Orders** tab) into the **August EduSkill** cohort — the
moment the sheet changes. New enrolments land as *pending* accounts that the
person completes via the onboarding flow (`/onboarding`, look up by phone).

## How it works

```
Google Sheet (Raw-Orders)  ──onChange──▶  Apps Script  ──HTTPS POST──▶  /api/cohorts/sync-orders
        (private)                         (sync-orders.gs)   x-sync-secret      (dashboard)
                                                                                    │
                                                              dedup by phone · keep >₹1500 · upsert
                                                              idempotent · pending August accounts
```

No public sheet, no Google/Claude connector — auth is a shared secret, so it's
safe for enterprise use. The server is the source of truth: the script just
pushes rows, the server dedups (by phone, keeping the highest amount), applies
the ₹1500 threshold, and skips anyone who already has an account.

## Setup (one time)

**1. Dashboard side**
- Set `ORDERS_SYNC_SECRET` in the deployed environment (generate: `openssl rand -hex 32`).
- Deploy (the `/api/cohorts/sync-orders` route ships with the app).

**2. Google Sheet side**
- Open the sheet → **Extensions → Apps Script**.
- Paste in [`sync-orders.gs`](./sync-orders.gs).
- **Project Settings (⚙) → Script Properties**, add:
  - `WEBHOOK_URL` = `https://<your-dashboard-domain>/api/cohorts/sync-orders`
  - `ORDERS_SYNC_SECRET` = *(the exact same value as the dashboard)*
- Run **`installTriggers`** once and authorize. This wires:
  - an **onChange** trigger — syncs seconds after any edit/import, and
  - an **hourly** trigger — safety net for missed events / bulk imports.
- (Optional) Run **`syncNow`** once for an immediate first sync; check the
  execution log for the `{ received, qualifying, created }` response.

## Tuning

Both live at the top of [`../../src/app/api/cohorts/sync-orders/route.ts`](../../src/app/api/cohorts/sync-orders/route.ts):
- `REVENUE_THRESHOLD` (default `1500`) — change the cutoff.
- `COHORT_NAME` (default `"August EduSkill"`) — change the target cohort.

Required Raw-Orders columns (matched by header name, any order): **phone**,
**name**, **revenue**.

## Manual test

```bash
curl -sX POST https://<domain>/api/cohorts/sync-orders \
  -H "x-sync-secret: $ORDERS_SYNC_SECRET" -H "Content-Type: application/json" \
  -d '{"dryRun":true,"rows":[{"phone":"9000000001","name":"Test","revenue":1999}]}'
# → {"ok":true,"dryRun":true,"qualifying":1,"wouldCreate":1,...}
```
