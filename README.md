# Ledger: personal budget and expense tracker

A private budgeting app that pulls your Chase (and other bank) transactions
through **Plaid**, sorts them into categories, and helps you plan, check in,
and review your money each month. Hosted on Netlify. Installable on your phone.

## What it does

**Today** (the screen to check daily)
- **Safe to spend today**: what you can spend after protecting your savings goal,
  yearly set-asides, and bills that haven't hit yet. Tap "How is this calculated?"
  to see the math.
- **Savings goal status**: whether this month's goal is still protected.
- **Weekly caps** with streaks, **alerts**, **upcoming bills**, recent purchases.

**Plan**: give every dollar a job
- Monthly income, savings goal (paid first), set-asides for yearly costs,
  detected bills, and category budgets, with "left to assign".
- **Rollover budgets**: unspent (or overspent) money carries into next month.
- **Weekly caps** across any categories (weeks run Monday to Sunday).

**Activity**: every transaction, grouped by day, with search and filters.
Tap one to **split** it across categories, add a **note**, or attach a **receipt photo**.
Export to CSV.

**Bills**: subscriptions and bills detected from repeating charges, yearly cost,
price increases, and a 30-day calendar. Mark one "Cancelling" to drop it from your plan.

**Insights**: month-end review with one suggested change, what drove each
increase (e.g. "DoorDash, 9 charges"), needs vs wants, wants by day of week,
6-month trends, savings per month, and net worth over time.

**Goals**: savings goals with target dates, the monthly amount needed to finish
on time, and your record of hitting the monthly savings goal.

**Email** (optional): a Monday-morning summary of last week, and alerts when a budget or cap hits 85%
or goes over, a subscription price goes up, or a bill is due tomorrow.

**Automatic syncing**: Plaid notifies the site when new transactions arrive, and a
daily job syncs every morning as a backup. The Sync button still works anytime.

**Sign-in**: password with lockout after 5 wrong tries, secure session cookies
(30 days), passkeys (Face ID / Touch ID), and "sign out everywhere".

## Setup

### 1. Environment variables (Netlify → Site configuration → Environment variables)

| Key | Required | Value |
|---|---|---|
| `APP_PASSWORD` | yes | A long password |
| `PLAID_CLIENT_ID` | yes | From the Plaid dashboard |
| `PLAID_SECRET` | yes | Sandbox or Production secret |
| `PLAID_ENV` | yes | `sandbox` or `production` |
| `PLAID_REDIRECT_URI` | production | Your site URL with trailing slash, e.g. `https://your-site.netlify.app/` (also add it in Plaid → API → Allowed redirect URIs) |
| `RESEND_API_KEY` | for email | From https://resend.com (free tier is enough) |
| `DIGEST_EMAIL` | for email | Where to send summaries and alerts |
| `DIGEST_FROM` | optional | e.g. `Ledger <ledger@yourdomain.com>` once you verify a domain in Resend. Without it, emails come from `onboarding@resend.dev`, which Resend only allows to your own Resend account email. |

Redeploy after changing variables (Deploys → Trigger deploy).

### 2. Turn on automatic syncing
Nothing to do. On the next sync, Ledger tells Plaid to send updates to
`https://your-site/api/plaid-webhook`. Settings shows an "auto-sync" tag on each
bank once that's done. Webhooks are verified against Plaid's signature.

### 3. Set up your plan (in the app)
1. **Plan** → enter take-home income (or leave blank to use your 3-month average)
   and your monthly savings goal.
2. Add **weekly caps** for flexible spending (e.g. Shopping + Clothing).
3. Set **budgets** for the categories you want to control. Turn on **Roll over** where it helps.
4. Add **set-asides** for yearly costs (gifts, travel, annual subscriptions).
5. **Settings** → add a **passkey**, connect any other banks, and check **Needs vs wants**.
6. **Bills** → review subscriptions and mark any you're cancelling.

### 4. Install on your phone
- **iPhone:** open the site in Safari → Share → Add to Home Screen.
- **Android:** open in Chrome → menu → Install app.

## How the key numbers work

**Safe to spend** = income − savings goal − set-asides − spent so far − bills still due this month.
Today's number is that divided by the days left, minus what you've spent today.
Income is your Plan amount, or your 3-month average if blank.

**Savings goal status**: mid-month, "income minus spending" swings a lot (rent goes
out on the 1st, pay comes later). So Today shows whether the goal is still
*protected*. It is, as long as you stay within safe-to-spend.

**Bills** are detected from charges that repeat on a regular schedule (weekly to
yearly) at a similar amount. It needs 2 to 3 months of history.

**Net worth** = linked account balances minus credit card and loan balances,
recorded once per day when Ledger syncs.

## How categories are chosen
1. Your **split**, one-off change, or **rule** ("Always" button) always wins.
2. Card payments and transfers are detected so they never count as spending.
3. **Merchant directory** (`netlify/lib/merchants.js`): 870+ known merchant names.
4. Your bank's own category (Plaid, or the Chase card CSV column).
5. Chase transaction type (ATM, Zelle, fees) for checking exports.
6. Generic keywords like "pizza" or "pharmacy".
7. Anything left is **Other**, and Ledger asks you to sort it.

## Use it with Chase CSV exports
chase.com → account → Download account activity → CSV, then Settings → Import CSV.
Re-importing the same file won't create duplicates. If you also connect that account
through Plaid, delete the CSV copy in Settings to avoid double counting.

## Project layout
```
public/                 the app (no build step)
  js/engine.js          all budget math, shared by the app and the email jobs
  js/pages/*.js         Today, Activity, Plan, Bills, Insights, Goals, Settings
netlify/functions/      API: auth, data, sync, Plaid, receipts, webhook
  daily-sync.js         every morning: sync + alert emails
  weekly-digest.js      Monday summary email
netlify/lib/            storage, Plaid sync, categories, merchant directory, email
```
Data lives in Netlify Blobs, private to your site. Plaid access tokens never reach the browser.

## Local development
```bash
cp .env.example .env     # fill in values
npm install
npm run dev              # http://localhost:8888
```

## Known limits
- Budgets don't keep history: changing a budget also changes how past months are judged.
- Goals track what you record; Ledger doesn't move money.
- Built for one person. Anyone with the password or a passkey sees everything.
