# CPR Awareness Certificate Site

A single-page site that autoplays a CPR awareness video and lets visitors
claim a personalized "Certificate of CPR Awareness" PDF — by Email or
Download. Built per `PRD-cpr-certificate-site.md`.

- **`/frontend`** — static site (no build step). Deploy to **GitHub Pages**.
- **`/backend`** — tiny Node/Express server. Deploy to **Render**. Holds the
  SendGrid key and sends the certificate email.
- **`/apps-script`** — Google Apps Script web app that appends each
  submission as a row in a Google Sheet.

WhatsApp delivery is intentionally **not built** — it's shown as a disabled
"Coming soon" option, per the PRD.

---

## How it fits together

```
Browser (GitHub Pages)  --POST /submit-->  Render (Express)  --POST-->  Apps Script  -->  Google Sheet
                                                  |
                                                  +--> SendGrid (email only)
```

- The certificate **PDF is generated entirely in the browser** with jsPDF.
  Download never touches the server — it works even if Render is down.
- Email submissions POST the visitor's details + the base64 PDF to Render,
  which emails it via SendGrid and logs the row.
- Download submissions log to the Sheet too, but this is fire-and-forget
  from the browser's point of view — the download already succeeded before
  that request is even sent.

---

## Deploy order

Deploy in this order, because each step's output feeds the next one's
environment variables:

1. **Google Sheet + Apps Script** (§1 below) → gives you `SHEET_WEBHOOK_URL`.
2. **Render backend** (§2 below) → gives you the backend's live URL.
3. **Frontend** — put the Render URL into `BACKEND_URL` in `index.html`,
   then deploy to **GitHub Pages** (§3 below) → gives you the Pages origin.
4. Go back to Render and set `ALLOWED_ORIGIN` to that Pages origin
   (§2, step 6).

---

## 1. Google Sheet + Apps Script

1. Create a new Google Sheet.
2. In row 1, add this exact header row:
   ```
   Timestamp | First name | Last name | Email | Phone | Method
   ```
3. Open **Extensions → Apps Script**.
4. Delete any starter code and paste in the contents of
   `apps-script/Code.gs` from this repo.
5. Click **Deploy → New deployment**.
6. Under "Select type," choose **Web app**.
7. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
8. Click **Deploy**, and authorize the script when prompted (it needs
   permission to edit this Sheet).
9. Copy the **Web app URL** it gives you — this is your
   `SHEET_WEBHOOK_URL`. Keep this tab open, you'll need it in step 2.

> **Note on exposure:** per the PRD, this endpoint is deployed with
> "Anyone" access because that's what a Google Apps Script web app requires
> to be reachable from the Render server. In practice this means anyone who
> obtains this exact URL could POST a row directly to your Sheet, bypassing
> the website. This is an accepted, documented tradeoff for this prototype
> — do not share the URL publicly, and treat the Sheet as semi-trusted
> data (a human reviews it, it isn't used for anything automated/sensitive
> downstream).

---

## 2. Backend (Render)

1. In SendGrid, create an **API key** (Settings → API Keys → Create API
   Key). This is your `SENDGRID_API_KEY`.
2. In SendGrid, verify a **sender identity** (Settings → Sender
   Authentication) — a single verified email is enough for this
   prototype. This is your `SENDGRID_FROM_EMAIL`.
3. Push this repo to GitHub (if you haven't already).
4. In Render: **New → Web Service**, connect this repo, and set:
   - **Root directory:** `backend`
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. Add these **Environment Variables** in the Render dashboard (Render
   sets `PORT` for you automatically — leave it out):

   | Variable              | Value                                              |
   |------------------------|----------------------------------------------------|
   | `SENDGRID_API_KEY`     | The API key from step 1                            |
   | `SENDGRID_FROM_EMAIL`  | The verified sender address from step 2            |
   | `SHEET_WEBHOOK_URL`    | The Apps Script web app URL from §1, step 9         |
   | `ALLOWED_ORIGIN`       | Your GitHub Pages origin — fill in after §3 below   |

6. Deploy. Once it's live, copy the service URL (e.g.
   `https://your-service.onrender.com`) — you need it in §3.
7. After you complete §3 and know your GitHub Pages origin, come back and
   set `ALLOWED_ORIGIN` to it exactly (e.g.
   `https://your-username.github.io`, no trailing slash), then redeploy
   or let Render auto-redeploy on the env var change.

---

## 3. Frontend (GitHub Pages)

1. Open `frontend/index.html` and find this line near the top of the
   `<script>` block:
   ```js
   const BACKEND_URL = "https://REPLACE-ME.onrender.com";
   ```
   Replace it with your real Render service URL from §2, step 6 (no
   trailing slash).
2. Commit and push.
3. In your GitHub repo: **Settings → Pages**.
4. Under "Build and deployment," set **Source: Deploy from a branch**,
   **Branch: main**, **Folder: `/frontend`** (or configure your preferred
   branch/folder — any static host works as long as `frontend/` is the
   published root).
5. Save. GitHub will give you a Pages URL, e.g.
   `https://your-username.github.io/Heart_Day/`. The **origin** (scheme +
   host, no path) — e.g. `https://your-username.github.io` — is the value
   to put into Render's `ALLOWED_ORIGIN` (§2, step 7).

---

## Environment variables — full reference

All backend env vars are documented (with no real values) in
`backend/.env.example`.

| Variable              | Where it's used | Where to get it |
|------------------------|------------------|------------------|
| `SENDGRID_API_KEY`     | Render only      | SendGrid dashboard → Settings → API Keys |
| `SENDGRID_FROM_EMAIL`  | Render only      | SendGrid dashboard → Settings → Sender Authentication (must be a verified sender) |
| `SHEET_WEBHOOK_URL`    | Render only      | Output of deploying `apps-script/Code.gs` as a web app (§1, step 9) |
| `ALLOWED_ORIGIN`       | Render only      | Your GitHub Pages origin, e.g. `https://your-username.github.io` (§3, step 5) |
| `PORT`                 | Render only      | Set automatically by Render — don't set it yourself |
| `BACKEND_URL`          | Frontend (`index.html` constant, not an env var) | Your Render service URL (§2, step 6) |

**No secrets are ever placed in `/frontend`.** The SendGrid key lives only
in Render's environment variables.

---

## Local development

**Backend:**
```bash
cd backend
cp .env.example .env   # fill in real values in .env (never commit it)
npm install
npm start
```

**Frontend:** just open `frontend/index.html` in a browser, or serve the
folder with any static file server. Point `BACKEND_URL` at
`http://localhost:3000` for local testing (and set `ALLOWED_ORIGIN` on the
local backend to match whatever origin you're serving the frontend from).

---

## CORS note

Per the PRD, a permissive (`*`) CORS origin would be acceptable for a
prototype, but this backend requires `ALLOWED_ORIGIN` to be set to your
specific GitHub Pages origin — this is stricter than the PRD's minimum bar,
and is the recommended setting.

---

## What's intentionally not here

Per the PRD's non-goals: no WhatsApp delivery (disabled "Coming soon"
picker only), no user accounts/login, no admin dashboard, no payments, no
extra analytics, no custom video player, no database other than the Google
Sheet. See §2 and §9 of the PRD.

The certificate design (logos, signatures, "J S Hiremath" / "Dr Kinjal
Goyal" name spellings) is a placeholder the owner will redesign later —
per the PRD, do not "fix" these without the owner's direction.
