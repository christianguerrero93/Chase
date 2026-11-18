# Expense Tracker (Chase + Netlify)

A private budget and expense tracker. It pulls your Chase transactions
through **Plaid**, auto-sorts them into budget categories, and shows spend vs.
budget by month. It also imports Chase CSV exports, so you can use it today
while Plaid production access is pending.

**What you get**
- Monthly dashboard: spent, budget, remaining, income, change vs. last month, budget pace
- Category budgets with progress bars (amber at 85%, red when over)
- 6-month spend trend and top merchants
- Transaction list with search, filter, and one-tap re-categorizing
- "Always" rules: recategorize once, apply to every future charge from that merchant
- Credit card payments and transfers are excluded from spending, so paying your
  Chase card from checking isn't counted twice
- Password-protected; bank access tokens never leave the server

## How it works

```
Browser (public/)  ──►  Netlify Functions (netlify/functions/)  ──►  Plaid  ──►  Chase
                              │
                              └── Netlify Blobs (your transactions, budgets, rules)
```

| Endpoint | Does |
|---|---|
| `POST /api/link-token` | Starts the Plaid "connect your bank" flow |
| `POST /api/exchange` | Saves the bank connection and does the first sync |
| `POST /api/sync` | Pulls new, changed and removed transactions |
| `GET/POST /api/data` | Dashboard data, budgets, rules, CSV import |

## Setup

### 1. Get Plaid keys
1. Sign up at https://dashboard.plaid.com
2. Under **Developers → Keys**, copy your `client_id` and the **Sandbox** secret.

### 2. Deploy to Netlify
This uses serverless functions with npm packages, so deploy from **Git** or the
**Netlify CLI**. Drag-and-drop deploys won't install the functions.

```bash
# push this folder to a GitHub repo, then in Netlify: Add new site → Import from Git
# or, with the CLI:
npm install
npx netlify login
npx netlify init        # create/link a site
npx netlify deploy --prod
```

There is no build command. Publish directory is `public` (already set in `netlify.toml`).

### 3. Set environment variables
Netlify → **Site configuration → Environment variables**:

| Key | Value |
|---|---|
| `APP_PASSWORD` | A long password. Anyone with your URL needs it to see anything. |
| `PLAID_CLIENT_ID` | From Plaid |
| `PLAID_SECRET` | Sandbox secret to start |
| `PLAID_ENV` | `sandbox` |
| `PLAID_REDIRECT_URI` | Leave blank in sandbox. See step 5. |

Redeploy after adding them (Deploys → Trigger deploy).

### 4. Test with sandbox
Open your site, unlock it, tap **Connect Chase**, choose any bank, and log in
with `user_good` / `pass_good`. You'll get fake transactions to check that
everything works end to end.

### 5. Connect your real Chase account
1. In the Plaid dashboard, request **Production** access and complete the
   application and company profile. Chase is an OAuth bank, so Plaid also
   requires its **OAuth institution registration** to be done before Chase
   shows up. This can take anywhere from a few days to a few weeks.
2. Under **Developers → API → Allowed redirect URIs**, add your site URL
   exactly, e.g. `https://your-site.netlify.app/`
3. Change the Netlify env vars:
   `PLAID_ENV=production`, `PLAID_SECRET=<production secret>`,
   `PLAID_REDIRECT_URI=https://your-site.netlify.app/`
4. Redeploy, then **Connect Chase**. Connect checking and credit cards in the same flow.

**Cost:** Plaid's Transactions product is billed in production (typically a
monthly fee per connected bank login). Check your Plaid dashboard pricing
before going live.

**Note:** right after connecting, Plaid may only return recent transactions.
Up to 2 years of history usually arrives within minutes to hours. Tap **Sync** later.

## Use it now with Chase CSV exports
No Plaid needed:
1. chase.com → pick an account → **Download account activity** → CSV
2. In the tracker, tap **Import CSV** (you can select several files)

Works with Chase credit card and checking exports. Re-importing the same file
won't create duplicates. If you later connect the same account via Plaid,
delete the CSV data from **Connected accounts** to avoid double counting.

## Local development
```bash
cp .env.example .env     # fill in values
npm install
npm run dev              # http://localhost:8888
```

## Customizing
- **Categories / auto-mapping:** `netlify/lib/categories.js`
- **Excluded from spending:** `NON_SPENDING` in the same file
- **Look and feel:** `public/styles.css`

## Security notes
- Everything is behind `APP_PASSWORD`. The password is checked on every API call
  and is kept only for the browser tab session.
- Plaid access tokens are stored in Netlify Blobs and are never sent to the browser.
- This is built for one person. If you share it, everyone with the password sees all data.
- "Remove" on a connection revokes it at Plaid as well.
