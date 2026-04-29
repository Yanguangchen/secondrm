# Second Room — secondrm.com

The marketing and lead‑capture site for **Second Room Pte Ltd** (Singapore) — a capital‑markets advisory practice helping leaders prepare for pre‑IPO storytelling, listings, and post‑listing investor engagement.

This repository contains a static HTML/CSS website plus a small serverless backend that handles the **Register Interest** form (reCAPTCHA verification + Firestore write).

For a deeper architectural / operational overview, see [`grepp/context.md`](grepp/context.md) and the diagram in [`grepp/architecture.mmd`](grepp/architecture.mmd). For design conventions and visual logic, see [`DESIGN.md`](DESIGN.md).

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Pages | Plain HTML5 + a single shared `styles.css` (Inter / Playfair Display via Google Fonts) |
| Hosting | [Vercel](https://vercel.com/) (static + Serverless Functions) |
| Form API (live) | `api/form/submit.js` — Vercel Node.js serverless function |
| Form API (fallback) | `functions/index.js` — Firebase Cloud Functions (callable + HTTP) |
| Captcha | Google reCAPTCHA **v2 checkbox** on the client; the server accepts both v2 and v3 |
| Data | Firebase **Firestore** (collections: `form_submissions`, `page_content`) — project `secondrm` |
| Admin auth | Firebase Authentication — Google sign-in popup, gated by `firestore.rules` allow-list |

---

## Repository Layout

```
.
├── index.html                 # Landing page
├── about.html                 # Company / philosophy
├── our-offerings.html         # Three‑pillar offering overview
├── strategicadvisory.html     # Strategic Advisory product page
├── sr-academy.html            # SR Academy product page
├── sr-studio.html             # SR Studio product page
├── corebuildlab.html          # "Core Build Lab" programme detail
├── behind-sr.html             # Founder / "Behind Second Room"
├── contact.html               # Contact details
├── register.html              # Register‑interest form (POSTs /api/form/submit)
├── admin.html                 # Authenticated admin console (lead review,
│                              #   lead updates/deletes, editable page_content)
├── styles.css                 # Single global stylesheet
├── DESIGN.md                  # Design conventions and UI/UX logic
├── llms.txt                   # LLM‑readable site description
├── sitemap.xml / robots.txt   # SEO
│
├── api/
│   └── form/submit.js         # Vercel serverless: reCAPTCHA + Firestore write
│
├── functions/                 # Firebase Cloud Functions (alt. deploy target)
│   ├── index.js               #   submitFormWithCaptcha (callable + HTTP) + formSubmit alias
│   └── package.json
│
├── Assets/                    # Images, icons, hero video
├── profilePics/               # Team / contributor photos
│
├── firebase.json              # Firestore rules + functions source mapping
├── firestore.rules            # Public read for page_content; admin‑only otherwise
├── package.json               # Top‑level deps for Vercel function (firebase-admin, node-fetch)
├── LICENSE                    # MIT (covers source only — not brand assets)
└── grepp/                     # Architecture & context docs (UML, context.md)
```

---

## Local Development

### Prerequisites

- **Node.js ≥ 18** (matches `package.json#engines`).
- A non-production Firebase project (e.g. `secondrm-dev`) **or** the [Firestore emulator](https://firebase.google.com/docs/emulator-suite) — see the two-option setup in [`grepp/context.md` §7](grepp/context.md#7-local-development). When using the emulator, exporting `FIRESTORE_EMULATOR_HOST=localhost:8080` makes the Admin SDK route every read/write to the emulator regardless of credentials. **Do not point local development at the production `secondrm` project.**
- A Google reCAPTCHA v2 site/secret key pair if you want to exercise the form end-to-end. For pure UI work the form will short-circuit on a missing token.

### Steps

```bash
# 1. Install root deps (firebase-admin, node-fetch — used by api/form/submit.js)
npm install

# 2. Copy the env template and fill in real values (git-ignored).
#    .env.example documents both variables and a non-prod-Firestore warning.
cp .env.example .env.local
${EDITOR:-vi} .env.local

# 3. Run a static server OR vercel dev (which also runs api/* locally)
python3 -m http.server 5173      # static-only
# – or –
npx vercel dev                   # static + /api/form/submit
```

Then open `http://localhost:5173/` (or whatever port Vercel reports).

> The form submission endpoint (`/api/form/submit`) only works under `vercel dev` (or after deploy), because it requires a Node runtime and the env vars above.

### Required environment variables

| Variable | Where it's read | Purpose |
| --- | --- | --- |
| `RECAPTCHA_SECRET` | `api/form/submit.js`, `functions/index.js` | Server-side reCAPTCHA secret matching the site key embedded in `register.html`. |
| `FIREBASE_SERVICE_ACCOUNT` | `api/form/submit.js` | Full service-account JSON, as a single string. The code normalises `\n` inside `private_key`, so escaped or literal newlines both work. Only required for the **Vercel** deploy path; Firebase Functions uses the runtime's default credentials. |

If you instead deploy via Firebase Functions:

```bash
# 1. Store the value in Secret Manager
firebase functions:secrets:set RECAPTCHA_SECRET

# 2. Make sure each function declares the secret. functions/index.js
#    already wires this up via:
#       functions.runWith({ secrets: ["RECAPTCHA_SECRET"] }).https.onCall(...)
#       functions.runWith({ secrets: ["RECAPTCHA_SECRET"] }).https.onRequest(...)
#    Without the runWith binding, process.env.RECAPTCHA_SECRET is
#    undefined at runtime even though the secret exists.

# 3. Redeploy
firebase deploy --only functions
```

The code also falls back to the legacy `functions.config().recaptcha.secret` set via `firebase functions:config:set recaptcha.secret="…"` for v1 functions. See [`grepp/context.md` §6](grepp/context.md#6-deployment-targets) for upgrade notes (Functions v2 / `defineSecret`) and Firebase's [Configure your environment](https://firebase.google.com/docs/functions/config-env) docs for the canonical reference.

---

## Form Submission Flow

1. User fills out `register.html` and ticks the **reCAPTCHA v2 checkbox**.
2. The page reads the token from `textarea[name="g-recaptcha-response"]` and POSTs `{ token, payload }` to `/api/form/submit`.
3. The function verifies the token against `https://www.google.com/recaptcha/api/siteverify`. Any `success: false` is rejected; if Google returns a `score`, anything below `0.5` is rejected as well.
4. On success it appends a document to the Firestore `form_submissions` collection with a server timestamp.
5. `admin.html` (auth-gated) reads back the collection for review.

The full schema of `form_submissions` (every field, where it comes from, whether it's required) is documented in [`grepp/context.md` §4](grepp/context.md#4-data-model-firestore).

A higher‑level diagram lives in [`grepp/architecture.mmd`](grepp/architecture.mmd).

---

## Deployment

### Vercel (primary, live)

```bash
npm install
npx vercel        # preview
npx vercel --prod # production
```

Required env vars under **Project → Settings → Environment Variables** (all of `Production`, `Preview`, `Development`):

- `RECAPTCHA_SECRET`
- `FIREBASE_SERVICE_ACCOUNT`

### Firebase (rules + alternative functions)

```bash
firebase deploy --only firestore:rules
cd functions && npm install && cd ..
firebase deploy --only functions
```

To switch the live form to the Firebase backend, edit `CF_URL` in `register.html` to the deployed HTTPS URL of `formSubmit` — a URL alias of `submitFormWithCaptchaHttp` whose only purpose is to remove the substring "captcha" from the path so ad-blockers don't drop the request. The captcha is still verified. Note: the Firebase HTTP function enforces an explicit CORS origin allow-list (set in `functions/index.js`) and forwards the caller IP to Google, while the Vercel function does neither. See [`grepp/context.md` §3.4](grepp/context.md#34-alternative-backend-functions) for the full diff.

---

## Admin Access

`admin.html` is the operations console for reviewing leads, updating/deleting `form_submissions` rows, and editing `page_content` documents.

- **Auth provider:** Google sign-in (popup) via the Firebase Web SDK against the `secondrm` Firebase project. Make sure the Google provider is enabled in **Firebase Console → Authentication → Sign-in method**, and that the deploy domain (`www.secondrm.com`, `secondrm.com`, plus any preview domains and `localhost`) is in the **Authorised domains** list.
- **Authorisation:** double-gated.
  1. **Server (authoritative):** `firestore.rules → isAdmin()` checks `request.auth.token.email` against an explicit allow-list. This is what actually enforces access; everything below is UX.
  2. **Client (UX):** `admin.html → ADMIN_EMAILS` is a parallel allow-list, checked against `user.email` from the signed-in `User` object, used to hide admin views from non-allow-listed accounts after sign-in.
- **Adding/removing an admin:**
  1. Edit `isAdmin()` in `firestore.rules` and `ADMIN_EMAILS` in `admin.html` — keep them in sync.
  2. `firebase deploy --only firestore:rules`.
  3. Redeploy the static site so the updated `admin.html` ships.
- **First sign-in:** the new admin opens `/admin.html`, clicks **Sign in with Google**, and accepts the OAuth consent. No prior provisioning is needed.

---

## Manual Smoke Tests

There is no CI. Before promoting any change, run the checklist in [`grepp/context.md` §8](grepp/context.md#8-smoke-test-checklist-manual-this-repo-has-no-ci): static pages render, lead capture happy + failure paths, admin sign-in, SEO surfaces (`sitemap.xml`, `robots.txt`, `llms.txt`), and a security spot-check.

---

## Security Notes

- `.env.local`, `*.pfx`, `*.pem`, `*.key`, `*.p12`, `*.crt`, and `serviceAccount*.json` / `firebase-adminsdk*.json` are git-ignored.
- ⚠️ `localhost.pfx` is currently tracked in this repo from before the gitignore was hardened. It looks like a self-signed dev cert, but if it contains a real private key, **rotate it, `git rm` the file, and consider scrubbing history** before relying on this repo as a clean source.
- The Firebase Web API key in `admin.html` is not a secret — it identifies the Firebase project. Real protection comes from `firestore.rules`.
- The reCAPTCHA site key in `register.html` is public; only the matching secret is sensitive.

---

## License

MIT — see [`LICENSE`](LICENSE). Source only; brand assets in `Assets/` and `profilePics/` remain © Second Room Pte Ltd.

---

Company: **Second Room Pte Ltd** (Singapore) · grace@secondrm.com · +65‑8065‑4655
