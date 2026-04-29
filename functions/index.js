"use strict";
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const cors = require("cors")({
  origin: [
    "https://www.secondrm.com",
    "https://secondrm.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ],
  methods: ["POST", "OPTIONS"],
  credentials: false
});

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Cloud Function: submitFormWithCaptcha
 *
 * Verifies a Google reCAPTCHA token (v2 checkbox in the live UI; v3 score
 * also tolerated) on the server using the secret, and on success writes the
 * provided payload to Firestore.
 *
 * Configure the secret BEFORE deploying (never commit it):
 *   1. Preferred — Secret Manager:
 *        firebase functions:secrets:set RECAPTCHA_SECRET
 *      The secret must also be bound to each function below via
 *      `runWith({ secrets: [...] })`, otherwise `process.env.RECAPTCHA_SECRET`
 *      is undefined at runtime.
 *   2. Legacy — runtime config:
 *        firebase functions:config:set recaptcha.secret="YOUR_SECRET"
 *      Read via `functions.config().recaptcha.secret`. No binding needed,
 *      but Firebase has deprecated this for v2 functions.
 */
exports.submitFormWithCaptcha = functions
  .runWith({ secrets: ["RECAPTCHA_SECRET"] })
  .https.onCall(async (data, context) => {
  try {
    const token = data && data.token;
    const payload = data && data.payload;
    if (!token) {
      throw new functions.https.HttpsError("failed-precondition", "Missing reCAPTCHA token.");
    }
    if (!payload || typeof payload !== "object") {
      throw new functions.https.HttpsError("invalid-argument", "Missing payload.");
    }

    const secret =
      (functions.config().recaptcha && functions.config().recaptcha.secret) ||
      process.env.RECAPTCHA_SECRET;
    if (!secret) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "reCAPTCHA secret not configured. Set with 'firebase functions:secrets:set RECAPTCHA_SECRET' or functions:config:set recaptcha.secret=..."
      );
    }

    // Verify token with Google
    const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";
    const res = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}${
        context.rawRequest && context.rawRequest.ip
          ? `&remoteip=${encodeURIComponent(context.rawRequest.ip)}`
          : ""
      }`,
    });
    const result = await res.json();
    if (!result.success) {
      throw new functions.https.HttpsError(
        "permission-denied",
        `reCAPTCHA verification failed: ${JSON.stringify(result)}`
      );
    }
    // For v3, optionally check score and action
    if (typeof result.score === "number" && result.score < 0.5) {
      throw new functions.https.HttpsError("permission-denied", "Low reCAPTCHA score.");
    }

    const db = admin.firestore();
    const toWrite = {
      ...payload,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("form_submissions").add(toWrite);
    return { ok: true };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    console.error("submitFormWithCaptcha error:", err);
    throw new functions.https.HttpsError("internal", "Internal error");
  }
});

/**
 * HTTP variant with explicit CORS for use from plain fetch.
 * Endpoint: https://us-central1-<project>.cloudfunctions.net/submitFormWithCaptchaHttp
 * Body: { token: string, payload: {...} }
 *
 * Same secret-binding requirement as the callable above: the secret must be
 * declared via `runWith({ secrets: [...] })` to appear in `process.env`.
 */
exports.submitFormWithCaptchaHttp = functions
  .runWith({ secrets: ["RECAPTCHA_SECRET"] })
  .https.onRequest(async (req, res) => {
  // Delegate ALL CORS handling (including OPTIONS preflight) to the `cors`
  // middleware initialised at the top of this file with an explicit origin
  // allow-list. Do NOT re-set `Access-Control-Allow-Origin` manually below —
  // doing so previously echoed any caller's Origin and silently bypassed the
  // allow-list.
  return cors(req, res, async () => {
    try {
      if (req.method === "OPTIONS") {
        // cors() already wrote the appropriate CORS headers (or refused).
        res.status(204).send("");
        return;
      }
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      const { token, payload } = req.body || {};
      if (!token) {
        res.status(400).json({ error: "Missing reCAPTCHA token" });
        return;
      }
      if (!payload || typeof payload !== "object") {
        res.status(400).json({ error: "Missing payload" });
        return;
      }
      const secret =
        (functions.config().recaptcha && functions.config().recaptcha.secret) ||
        process.env.RECAPTCHA_SECRET;
      if (!secret) {
        res.status(500).json({ error: "reCAPTCHA secret not configured" });
        return;
      }
      const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";
      const vr = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}${
          req.ip ? `&remoteip=${encodeURIComponent(req.ip)}` : ""
        }`,
      });
      const vjson = await vr.json();
      if (!vjson.success || (typeof vjson.score === "number" && vjson.score < 0.5)) {
        res.status(403).json({ error: "reCAPTCHA verification failed", details: vjson });
        return;
      }
      const db = admin.firestore();
      const toWrite = {
        ...payload,
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await db.collection("form_submissions").add(toWrite);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error("submitFormWithCaptchaHttp error:", e);
      res.status(500).json({ error: "Internal error" });
    }
  });
});

// URL alias: identical handler, exported under a name that does NOT contain
// the substring "captcha" so that aggressive ad-block / privacy filters do
// not block the request. The captcha verification still runs — the alias
// changes only the URL, not the logic.
exports.formSubmit = exports.submitFormWithCaptchaHttp;


