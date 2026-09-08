# PRD — CPR Awareness Certificate Site

**Owner:** (project owner)
**For organizations:** Relieve Foundation & Rotary Club Pune
**Document purpose:** This is a build specification for **Claude Code**. Build exactly what is written here. Do not add features, screens, integrations, or dependencies that are not specified. If something required to run is genuinely undefined, stop and ask rather than inventing it. Where this document says "placeholder," use a placeholder — do not fabricate real logos, names, or credentials.

---

## 1. One-paragraph summary

Build a single-page website that autoplays a specific YouTube video and shows a persistent, always-visible "Claim your CPR certificate" button on top of the video for the entire time the page is open. Clicking the button opens a modal that collects the visitor's first name, last name, email, and phone number, and lets them choose how to receive a personalized CPR-awareness certificate: **Email**, **WhatsApp**, or **Download**. On submit, the certificate is generated as a PDF with the visitor's name printed on it, the submission is recorded to a Google Sheet, and the certificate is delivered by the chosen method. **WhatsApp is out of scope for this build** (see §9) — its button appears but is disabled. The site's front end is a static site hosted on **GitHub Pages**; the email + logging back end is a small server hosted on **Render**.

---

## 2. Goals and non-goals

### Goals
- Autoplay the video the moment the page loads (muted; see §7 constraint).
- Keep a clickable "Claim your CPR certificate" button visible over the video the whole time.
- Collect first name, last name, email, phone via a modal.
- Let the visitor pick delivery method: Email / WhatsApp / Download.
- Generate a PDF certificate with the visitor's **name printed on it** (not a one-size-fits-all image).
- Deliver by **Email** (SendGrid) or **Download** (browser). 
- Record every submission to a **Google Sheet**.

### Non-goals (do NOT build these)
- WhatsApp delivery (parked — button disabled, see §9).
- User accounts, login, or authentication.
- An admin dashboard or CMS.
- Payment.
- Any analytics beyond what is specified.
- A custom video player — use the standard YouTube embed.
- A database other than the Google Sheet (no Postgres/Mongo/etc.).

---

## 3. Architecture overview

Two deployable pieces. They are separate and communicate over HTTPS.

```
  Visitor's browser
  ┌─────────────────────────────────────────────┐
  │  FRONTEND  (static, hosted on GitHub Pages)   │
  │  - YouTube embed (autoplay, muted, loop)      │
  │  - Persistent "Claim certificate" button      │
  │  - Modal form + method picker                 │
  │  - Generates certificate PDF in-browser       │
  │  - Download handled 100% client-side          │
  └───────────────┬───────────────────────────────┘
                  │  HTTPS POST /submit  (only for Email + logging)
                  ▼
  ┌─────────────────────────────────────────────┐
  │  BACKEND  (Node/Express, hosted on Render)    │
  │  - Holds SendGrid API key (server-side only)  │
  │  - Sends certificate email via SendGrid       │
  │  - Appends the submission to the Google Sheet │
  └───────────────┬───────────────────────────────┘
                  │  HTTPS POST (append row)
                  ▼
  ┌─────────────────────────────────────────────┐
  │  Google Apps Script Web App  (bound to Sheet) │
  │  - Receives a row, appends it to the Sheet    │
  └─────────────────────────────────────────────┘
```

### Why this shape (do not "optimize" this away)
- **GitHub Pages serves static files only** — there is no server there, so it cannot hold a SendGrid key or call SendGrid directly (SendGrid rejects browser calls, and a key in front-end JS is public and will be abused). Therefore the SendGrid key lives **only** on the Render back end.
- **Download** needs no server — the PDF is built in the browser, so downloads work even if the back end is down.
- The **Google Sheet** is written via a Google Apps Script web app so we don't have to ship Google service-account credentials inside the Render server. The Render server just POSTs a row to the Apps Script URL.

---

## 4. Repository layout

Create a single repo with two top-level folders:

```
/frontend            → deploy this folder to GitHub Pages
  index.html         → the whole front end (HTML + CSS + JS in one file is acceptable)
  /assets            → placeholder logos, favicon, fonts if self-hosted
/backend             → deploy this folder to Render
  server.js          → Express server
  package.json
  .env.example       → documents required env vars (NO real secrets committed)
/apps-script
  Code.gs            → the Google Apps Script for Sheet logging
README.md            → setup + deploy steps for all three pieces
```

Keep front end and back end independently deployable. The front end must know the back end's URL through a single clearly-marked constant at the top of its JS (e.g. `const BACKEND_URL = "https://REPLACE-ME.onrender.com";`).

---

## 5. The video

- **YouTube video URL:** `https://www.youtube.com/watch?v=hblmFtbyYKQ`
- **Video ID:** `hblmFtbyYKQ`
- Embed with the YouTube IFrame embed (use the privacy-friendly `www.youtube-nocookie.com` embed domain).
- Playback: **autoplay on load, muted, looping.** Looping a single video requires `loop=1` **and** `playlist=hblmFtbyYKQ` in the embed URL.
- Include an obvious **unmute** control (browsers block unmuted autoplay; see §7).
- The video is the visual centerpiece of the page. The certificate button sits on top of / adjacent to it and stays visible the entire session.

---

## 6. The persistent button

- Label: **"Claim your CPR certificate"** (sentence case).
- Visible **throughout** — from page load, over the whole video, not tied to any timestamp and not only after the video ends.
- Must be obviously clickable and draw the eye (a gentle recurring pulse animation is acceptable; respect `prefers-reduced-motion` and stop animating for those users).
- Clicking it opens the modal (§8). It remains available again if the modal is closed.

---

## 7. Hard browser constraint (state this in the UI, don't fight it)

Browsers only autoplay video **if it is muted**. So the video starts muted and the user taps **unmute** to hear it. This is a browser rule, not a bug. Do not attempt hacks to force unmuted autoplay. Surface a small, clear "Tap to unmute" affordance.

---

## 8. Modal flow (exact sequence — build this and only this)

The confirmed sequence is: **click button → collect details → pick method → submit → deliver by chosen method.**

### 8.1 Fields (all in one modal step)
1. First name — text, required.
2. Last name — text, required.
3. Email — email, required **if** method = Email; otherwise optional but validate format if filled.
4. Phone number — text/tel, required (kept for records; format-validate loosely, don't over-restrict international numbers).

### 8.2 Method picker (three buttons/cards, single-select)
- **Email**
- **WhatsApp** — **rendered but disabled**, with a small "Coming soon" tag. It is not selectable and triggers nothing.
- **Download**

### 8.3 Submit button
- One submit action.
- The submit button's label should say what will happen based on the chosen method: "Email my certificate" or "Download my certificate." (Consistent verb through to the success message.)
- Disabled until a valid method + required fields are provided.

### 8.4 On submit — behavior by method

**All methods:** first generate the certificate PDF in the browser with the visitor's name on it (§10), and record the submission to the Sheet (via the back end, §11).

- **Download:**
  1. Trigger the browser download of the generated PDF.
  2. Log the submission (fire the `/submit` call with `method: "download"`; no email is sent).
  3. Show success state: "Downloaded. Check your device's downloads."

- **Email:**
  1. POST the details + the generated PDF (base64) + `method: "email"` to the back end `/submit`.
  2. Back end sends the email with the PDF attached (§11) and logs the row.
  3. Show success state: "Sent. Check your inbox (and spam)." On failure, show a clear retry message (§12).

- **WhatsApp:** not reachable (button disabled). No code path required beyond the disabled state.

### 8.5 Modal states
- Default (form), Submitting (spinner / disabled controls), Success, Error (with retry). Errors explain what to do, in the interface's voice — no vague failures.

---

## 9. WhatsApp — explicitly parked

WhatsApp auto-delivery of a file requires the WhatsApp Business API (Meta business verification, an approved message template, a paid provider). That is a separate project and is **not** in this build. Implement the WhatsApp option only as a **disabled** picker item labeled "Coming soon." Do not add Twilio, Meta Cloud API, `wa.me` links, or any WhatsApp code. Leave the flow structured so a WhatsApp method could be added later without redesign.

---

## 10. The certificate (dummy for now, but personalized)

Generate the certificate as a **PDF in the browser** (use `jsPDF` via CDN; landscape orientation). It is a placeholder design the owner will redesign later — but the data on it must be real per submission.

**Must contain:**
- Title: **"Certificate of CPR Awareness"**
- A standard attestation line, e.g. "This is to certify that" followed by the visitor's **First name + Last name** as entered.
- The **date** the certificate is generated (issue date).
- Both organization names: **"Relieve Foundation"** and **"Rotary Club Pune."**
- **Two signature blocks**, one lower-left and one lower-right, as **text placeholders**:
  - Left: `J S Hiremath` (name is a placeholder; owner will correct spelling and add real signature image later)
  - Right: `Dr Kinjal Goyal` (same — placeholder)
- Placeholder spots for two org logos (top-left / top-right) — use simple text or box placeholders, not fabricated logo art.

**Note for the builder:** Names and spellings above are placeholders confirmed by the owner; do not "correct" them and do not invent logos or signature graphics. Keep the layout clean and centered so it's easy to restyle later.

---

## 11. Backend (Render) — spec

**Runtime:** Node.js + Express. Keep it tiny.

**Enable CORS** for the GitHub Pages origin (the front end is on a different domain). Allow the specific Pages origin; a permissive origin is acceptable for the prototype but note it in README.

### Endpoint: `POST /submit`
Request JSON body:
```json
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "phone": "string",
  "method": "email | download",
  "pdfBase64": "string (base64 of the certificate PDF, no data-uri prefix)",
  "issuedAt": "ISO 8601 timestamp string"
}
```

Behavior:
1. Validate presence of required fields. Reject with 400 + a clear JSON error if malformed.
2. **Always** append a row to the Google Sheet by POSTing to the Apps Script web app URL (§12), including: timestamp, first name, last name, email, phone, method.
3. If `method === "email"`: send an email via **SendGrid** to the visitor's email, with the PDF attached (filename like `CPR-Certificate-FirstName-LastName.pdf`, `application/pdf`). Use the exact subject and body in §11.1 (plain text). Fill `{{firstName}}` from the submission.
4. If `method === "download"`: do **not** send email; just log.
5. Respond `200` with `{ "ok": true }` on success, or a non-2xx with `{ "ok": false, "error": "..." }` on failure. Never leak secrets in errors.

**Do not** generate the PDF on the back end — it is generated in the browser and passed in. (Download must work without the server, so the browser is the single source of truth for the PDF.)

### 11.1 Email template (use verbatim; plain text)

Send as a plain-text email. `{{firstName}}` is filled from the submission's first name.

**Subject:**
```
Your CPR Awareness certificate is here
```

**Body:**
```
Hi {{firstName}},

Thank you for taking the time to learn about CPR. Your certificate of
CPR Awareness is attached to this email as a PDF.

Every person who knows the basics of CPR makes their community a little
safer — thank you for being one of them.

Warm regards,
Relieve Foundation & Rotary Club Pune
```

Notes: keep it plain text for deliverability (least likely to land in spam for a first version). Do not add tracking pixels, marketing footers, or unsubscribe links for this prototype. An HTML version is out of scope unless the owner requests it.

### Environment variables (document in `.env.example`, never commit real values)
- `SENDGRID_API_KEY` — SendGrid API key.
- `SENDGRID_FROM_EMAIL` — verified sender address in SendGrid.
- `SHEET_WEBHOOK_URL` — the deployed Apps Script web app URL.
- `ALLOWED_ORIGIN` — the GitHub Pages origin allowed by CORS.
- `PORT` — provided by Render; default to it.

---

## 12. Google Sheet logging (Apps Script) — spec

Provide `apps-script/Code.gs` implementing a `doPost(e)` web app that:
1. Parses the JSON body.
2. Appends a row to the bound Sheet with columns, in this order:
   `Timestamp | First name | Last name | Email | Phone | Method`
3. Returns a small JSON `{ "ok": true }`.

README must explain: create a Google Sheet, add the header row, open Extensions → Apps Script, paste `Code.gs`, deploy as a **Web app** (Execute as: me; Who has access: Anyone), copy the resulting URL into the Render env var `SHEET_WEBHOOK_URL`.

---

## 13. Error handling & edge cases

- Back end unreachable during an **email** submit → show "We couldn't send it right now. Try again, or choose Download." Downloads must still work offline from the server's perspective.
- Invalid email format when Email chosen → inline validation before submit.
- Double-submit → disable submit while a request is in flight.
- Very long names → certificate text should not overflow; wrap or shrink gracefully.
- `prefers-reduced-motion` → disable the button pulse and any non-essential motion.
- Basic keyboard accessibility: button and modal are focusable, modal traps focus while open, `Esc` closes it, visible focus rings.

---

## 14. Tech constraints

- Front end: plain HTML/CSS/JS, **no build step** (must deploy as static files to GitHub Pages). Third-party libs via CDN only (e.g. `jsPDF`). No framework required.
- Back end: Node/Express, `@sendgrid/mail`. Keep dependencies minimal.
- No secrets in the front end. The SendGrid key exists only in Render env vars.
- Everything over HTTPS.

---

## 15. Deliverables (Definition of Done)

1. `/frontend/index.html` that, when opened, autoplays the muted looping video with an unmute control and a persistent "Claim your CPR certificate" button.
2. Working modal implementing the exact §8 flow.
3. In-browser PDF certificate generation with the visitor's name and all §10 content.
4. Download path works with no back end.
5. Email path sends the certificate via SendGrid through the Render back end.
6. Every submission (email and download) appended as a row to the Google Sheet.
7. WhatsApp option visible but disabled ("Coming soon"), no WhatsApp code.
8. `README.md` with step-by-step setup and deploy for GitHub Pages, Render, and Apps Script, plus how to fill every environment variable.
9. `.env.example` documenting all env vars with no real values.

---

## 16. Open items the owner will handle later (not for this build)
- Final certificate design, real logos, real signature images, correct name spellings.
- Enabling WhatsApp delivery (WhatsApp Business API).
- An HTML-formatted version of the email (the plain-text version in §11.1 is the build default).
- Custom domain, if any.
