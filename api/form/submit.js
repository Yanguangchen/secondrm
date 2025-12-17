// Vercel Serverless Function (Node.js) to verify reCAPTCHA v3 and write to Firestore.
// Requires environment variables (set in Vercel project settings):
// - RECAPTCHA_SECRET: your reCAPTCHA v3 secret (server key)
// - FIREBASE_SERVICE_ACCOUNT: JSON string of a Firebase service account with Firestore access

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  }
  let creds;
  try {
    creds = JSON.parse(raw);
    if (typeof creds.private_key === 'string') {
      // Handle escaped newlines from env storage
      creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    }
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
  return admin.initializeApp({ credential: admin.credential.cert(creds) });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const { token, payload } = req.body || {};
    if (!token) return res.status(400).json({ error: 'missing_recaptcha_token' });
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'missing_payload' });
    }
    const secret = process.env.RECAPTCHA_SECRET;
    if (!secret) return res.status(500).json({ error: 'server_not_configured' });

    // Verify reCAPTCHA v3 token
    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`
    });
    const result = await verifyRes.json();
    if (!result?.success || (typeof result.score === 'number' && result.score < 0.5)) {
      return res.status(400).json({ error: 'recaptcha_failed', details: result });
    }

    // Write to Firestore via Admin SDK
    const app = initAdmin();
    const db = admin.firestore(app);
    await db.collection('form_submissions').add({
      ...payload,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('api/form/submit error:', err);
    return res.status(500).json({ error: 'internal' });
  }
};


