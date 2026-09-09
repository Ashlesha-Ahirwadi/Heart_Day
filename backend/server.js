"use strict";

/**
 * CPR Awareness certificate site — backend (Render).
 *
 * Responsibilities (see PRD §11):
 *  - Hold the SendGrid API key (server-side only, never shipped to the browser).
 *  - POST /submit: always log the submission to the Google Sheet (via the
 *    Apps Script web app), and — only when method === "email" — send the
 *    certificate PDF (generated in the browser, passed in as base64) via
 *    SendGrid.
 *
 * This server never generates the PDF. The browser is the single source of
 * truth for the certificate file, so Download works even if this server is
 * down.
 */

const express = require("express");
const cors = require("cors");
const sgMail = require("@sendgrid/mail");

const {
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  SHEET_WEBHOOK_URL,
  ALLOWED_ORIGIN,
  PORT,
} = process.env;

if (!SENDGRID_API_KEY) {
  console.warn("[startup] SENDGRID_API_KEY is not set — email delivery will fail.");
} else {
  sgMail.setApiKey(SENDGRID_API_KEY);
}
if (!SENDGRID_FROM_EMAIL) {
  console.warn("[startup] SENDGRID_FROM_EMAIL is not set — email delivery will fail.");
}
if (!SHEET_WEBHOOK_URL) {
  console.warn("[startup] SHEET_WEBHOOK_URL is not set — Sheet logging will fail.");
}
if (!ALLOWED_ORIGIN) {
  console.warn("[startup] ALLOWED_ORIGIN is not set — CORS will reject all browser origins.");
}

const app = express();

// The certificate PDF is base64 in the JSON body; allow some headroom.
app.use(express.json({ limit: "12mb" }));

// Trimmed defensively: a stray trailing space/newline in the platform's
// env var UI would otherwise silently break cors's exact-string match.
const allowedOrigin = (ALLOWED_ORIGIN || "").trim().replace(/\/+$/, "");

app.use(
  cors({
    origin: allowedOrigin || false,
    methods: ["POST", "OPTIONS"],
  })
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

app.post("/submit", async (req, res) => {
  const body = req.body || {};
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const method = body.method;
  const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64 : "";
  const issuedAt = typeof body.issuedAt === "string" && body.issuedAt ? body.issuedAt : new Date().toISOString();

  // ---- Validation ----
  if (!firstName) return badRequest(res, "firstName is required.");
  if (!lastName) return badRequest(res, "lastName is required.");
  if (!phone) return badRequest(res, "phone is required.");
  if (method !== "email" && method !== "download") {
    return badRequest(res, 'method must be "email" or "download".');
  }
  if (method === "email") {
    if (!email) return badRequest(res, "email is required when method is \"email\".");
    if (!EMAIL_RE.test(email)) return badRequest(res, "email is not a valid email address.");
    if (!pdfBase64) return badRequest(res, "pdfBase64 is required when method is \"email\".");
  } else if (email && !EMAIL_RE.test(email)) {
    return badRequest(res, "email is not a valid email address.");
  }

  // ---- Always log to the Sheet ----
  const logResult = await logToSheet({ issuedAt, firstName, lastName, email, phone, method });
  if (!logResult.ok) {
    // Log-only failure on a download submission: the certificate already
    // reached the visitor client-side, so we still report success — the
    // failure is recorded server-side for the owner to notice.
    console.error("[sheet] failed to log submission:", logResult.error);
    if (method === "download") {
      return res.status(200).json({ ok: true });
    }
    // For email, keep going — a failed Sheet row shouldn't block sending
    // the certificate. We still surface the eventual outcome below based
    // on the email send result.
  }

  if (method === "download") {
    return res.status(200).json({ ok: true });
  }

  // ---- method === "email": send via SendGrid ----
  try {
    await sendCertificateEmail({ firstName, lastName, email, pdfBase64 });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[sendgrid] failed to send email:", err && err.message ? err.message : err);
    return res.status(502).json({ ok: false, error: "Failed to send the certificate email. Please try again." });
  }
});

async function logToSheet({ issuedAt, firstName, lastName, email, phone, method }) {
  if (!SHEET_WEBHOOK_URL) {
    return { ok: false, error: "SHEET_WEBHOOK_URL is not configured." };
  }
  try {
    const response = await fetch(SHEET_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: issuedAt,
        firstName,
        lastName,
        email,
        phone,
        method,
      }),
    });
    if (!response.ok) {
      return { ok: false, error: `Apps Script responded with status ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : "Unknown error contacting Apps Script." };
  }
}

async function sendCertificateEmail({ firstName, lastName, email, pdfBase64 }) {
  const filename = `CPR-Certificate-${sanitizeFileNamePart(firstName)}-${sanitizeFileNamePart(lastName)}.pdf`;

  const subject = "Your CPR Awareness certificate is here";
  const text = `Hi ${firstName},

Thank you for taking the time to learn about CPR. Your certificate of
CPR Awareness is attached to this email as a PDF.

Every person who knows the basics of CPR makes their community a little
safer — thank you for being one of them.

Warm regards,
Revive Heart Foundation & Rotary Club Laxmi Raad Pune
`;

  const msg = {
    to: email,
    from: SENDGRID_FROM_EMAIL,
    subject,
    text,
    attachments: [
      {
        content: pdfBase64,
        filename,
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  };

  await sgMail.send(msg);
}

function sanitizeFileNamePart(s) {
  return (s || "").replace(/[^a-zA-Z0-9-]+/g, "") || "Certificate";
}

app.get("/", (_req, res) => {
  res.status(200).send("CPR Awareness certificate backend is running.");
});

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
