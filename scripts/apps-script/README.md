# Orders → August Cohort auto-sync

Automatically enrols everyone who buys the **EduSkill Program** (Campus Program
packages **110020** / **110023**) and pays **above ₹1499**, straight into the
**August EduSkill** cohort — the moment the Raw-Orders sheet changes. New
enrolments land as *pending* accounts the person completes via the onboarding
flow (`/onboarding`, look up by phone).

## How it works

```
Google Sheet (Raw-Orders)  ──onChange──▶  Apps Script  ──HTTPS POST──▶  /api/cohorts/sync-orders
        (private)                         (sync-orders.gs)   x-sync-secret      (dashboard)
                                                                                    │
                                          keep pkg 110020/110023 · >₹1499 · dedup by phone · upsert
                                                              idempotent · pending August accounts
```

No public sheet, no Google/Claude connector — auth is a shared secret, so it's
safe for enterprise use. The server is the source of truth: the script pushes
all rows (incl. `package_id`), and the server keeps only the allowed packages
above the threshold, dedups by phone (highest amount wins), and skips anyone
who already has an account.

## Go live (one time)

**1. Deploy the dashboard**
- Set `ORDERS_SYNC_SECRET` in the deployed environment (`openssl rand -hex 32`).
- Deploy the app to its public URL (the `/api/cohorts/sync-orders` route ships with it).

**2. Wire up the sheet**
- Open the sheet → **Extensions → Apps Script**.
- Paste in [`sync-orders.gs`](./sync-orders.gs) and fill the two CONFIG values:
  - `WEBHOOK_URL` = `https://<your-dashboard-domain>/api/cohorts/sync-orders`
  - `SYNC_SECRET` = *(the exact same value as the dashboard's `ORDERS_SYNC_SECRET`)*
- Run **`installTriggers`** once and authorize. This wires an **onChange**
  trigger (syncs seconds after any edit/import) + an **hourly** safety net, and
  runs one sync immediately. Check **View → Logs** for `{ received, qualifying,
  created }`.

That's it — from then on, every new qualifying paid order lands in the cohort
automatically.

## Tuning

At the top of [`../../src/app/api/cohorts/sync-orders/route.ts`](../../src/app/api/cohorts/sync-orders/route.ts):
- `ALLOWED_PACKAGE_IDS` (default `110020`, `110023`) — which packages count as the paid program.
- `REVENUE_THRESHOLD` (default `1499` → enrol amounts **above** it).
- `COHORT_NAME` (default `"August EduSkill"`).

Required Raw-Orders columns (matched by header name, any order): **phone**,
**name**, **revenue**, **package_id**.

## Manual test (dry run — no writes)

```bash
curl -sX POST https://<domain>/api/cohorts/sync-orders \
  -H "x-sync-secret: $ORDERS_SYNC_SECRET" -H "Content-Type: application/json" \
  -d '{"dryRun":true,"rows":[{"phone":"9000000001","name":"Test","revenue":1999,"packageId":"110023"}]}'
# → {"ok":true,"dryRun":true,"qualifying":1,"wouldCreate":1,...}
```
