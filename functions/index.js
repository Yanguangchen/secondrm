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
 * Verifies Google reCAPTCHA v3 token on the server using the secret,
 * and on success writes the provided payload to Firestore.
 *
 * Configure your secret securely (do NOT commit it to source control):
 *   - Preferred (Secrets):  firebase functions:secrets:set RECAPTCHA_SECRET
 *     Then access via process.env.RECAPTCHA_SECRET at runtime.
 *   - Legacy config:        firebase functions:config:set recaptcha.secret="YOUR_SECRET"
 */
exports.submitFormWithCaptcha = functions.https.onCall(async (data, context) => {
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
 */
exports.submitFormWithCaptchaHttp = functions.https.onRequest(async (req, res) => {
  if (req.method === "OPTIONS") {
    // Handle CORS preflight
    cors(req, res, () => {
      res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.status(204).send("");
    });
    return;
  }
  return cors(req, res, async () => {
    try {
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
        (functions .config().recaptcha && functions .config().recaptcha.secret) ||
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
      res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error("submitFormWithCaptchaHttp error:", e);
      res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.status(500).json({ error: "Internal error" });
    }
  });
});

// Alias without the word "captcha" in the URL to avoid aggressive ad‑block filters.
exports.formSubmit = exports.submitFormWithCaptchaHttp;


