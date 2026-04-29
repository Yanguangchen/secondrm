# Project Context — Second Room (`secondrm.com`)

This document is the operational orientation for anyone (human or AI agent) who needs to work on this repository. Pair it with [`architecture.mmd`](./architecture.mmd) for a visual system view, and the top-level [`README.md`](../README.md) for build/run instructions.

> **Owner:** Yan Guang Chen (`yanguangchensp@gmail.com`).
> **Source of truth:** this file plus `firestore.rules`, `api/form/submit.js`, `functions/index.js`, `register.html`, `admin.html`. If those disagree with prose here, the code wins — please update this file in the same PR.
> **Review trigger:** any change to a public page, the form schema, the admin allow-list, the Firebase project, or the deployment target. At minimum, review every quarter.

---

## 1. Business Context

**Second Room Pte Ltd** is a Singapore-based capital-markets advisory practice founded by Grace Chen. It helps companies prepare for high-stakes capital-raising moments — pre-IPO, listings, fundraises, and ongoing investor engagement — by combining strategy, narrative, and investor insight.

The website's primary jobs are:

1. **Position** the practice and its three pillars (Strategic Advisory, SR Academy, SR Studio).
2. **Capture qualified leads** via the Register Interest form on `register.html` (currently scoped to the Core Build Lab programme).
3. **Provide an internal admin view** of submitted leads at `admin.html`.

There is no e‑commerce, no public user accounts, and no user-generated content beyond form submissions.

---

## 2. Site Map

| Page | Purpose | In `sitemap.xml` |
| --- | --- | --- |
| `index.html` | Homepage / hero | yes |
| `about.html` | Company philosophy and structure | yes |
| `our-offerings.html` | Three-pillar overview | yes |
| `strategicadvisory.html` | Bespoke advisory product | yes |
| `sr-academy.html` | Learning frameworks & programmes | yes |
| `sr-studio.html` | Roundtables / thought leadership | yes |
| `corebuildlab.html` | "Market-Ready IR Operating System" programme | yes |
| `behind-sr.html` | Founder background | yes |
| `contact.html` | Contact details | yes |
| `register.html` | Lead capture form (POST → `/api/form/submit`) | excluded |
| `admin.html` | Auth-gated lead viewer | excluded |

`llms.txt`, `sitemap.xml`, and `robots.txt` describe the public surface for crawlers and LLMs.

---

## 3. Architecture Overview

The system is intentionally minimal: static pages on a CDN, plus one serverless endpoint that brokers form writes to Firestore.

See [`architecture.mmd`](./architecture.mmd) for the diagram. Key flows:

### 3.1 Public browsing
Visitor → Vercel CDN → static HTML/CSS/Assets. No backend interaction.

### 3.2 Lead capture (the only write path)
1. `register.html` renders a Google **reCAPTCHA v2 checkbox** widget (site key embedded in HTML) and a form.
2. On submit it reads the v2 token from the hidden `g-recaptcha-response` textarea and POSTs JSON `{ token, payload }` to `/api/form/submit`.
3. The Vercel function `api/form/submit.js`:
   - Verifies the token against `https://www.google.com/recaptcha/api/siteverify`. It accepts both v2 (no score) and v3 responses; for v3 it rejects `score < 0.5`. With the current v2 widget, only `success` matters.
   - Initialises `firebase-admin` from the `FIREBASE_SERVICE_ACCOUNT` env var (JSON string; escaped `\n` in `private_key` are normalised back to newlines).
   - Appends a document to Firestore `form_submissions` with `submittedAt = serverTimestamp()`.
4. Browser receives `{ ok: true }` on 200, or an `error` JSON on 4xx/5xx.

The Firebase service account bypasses `firestore.rules`, so direct client writes from `register.html` are **not** required (and would be blocked anyway).

### 3.3 Admin review
1. Admin opens `admin.html` and clicks **Sign in with Google**.
2. The page uses the Firebase Web SDK (`GoogleAuthProvider` + `signInWithPopup`, with `prompt: select_account`) against the `secondrm` Firebase project (config inlined in `admin.html`).
3. The client checks `user.email` (from the signed-in `User` object) against the `ADMIN_EMAILS` set declared in `admin.html`. The authoritative server-side check is `request.auth.token.email` against the same allow-list inside `isAdmin()` in `firestore.rules`.
4. If both checks pass, the page reads, updates, and deletes documents in `form_submissions`, and reads/edits documents in `page_content`, directly via the Firebase client SDK.

> The Firebase Web API key in `admin.html` is **not a secret**; it identifies the project. Real protection comes from `firestore.rules`.

### 3.4 Alternative backend (`functions/`)
`functions/index.js` exposes **similar but not identical** logic as Firebase Cloud Functions. Differences from the Vercel function:

| Concern | Vercel `api/form/submit.js` | Firebase `functions/index.js` |
| --- | --- | --- |
| Surface | Single `POST` handler | Three exports: `submitFormWithCaptcha` (callable), `submitFormWithCaptchaHttp` (HTTP), `formSubmit` (URL alias of HTTP, identical logic — captcha is **still** verified, the alias only avoids ad-blockers that match the substring "captcha") |
| CORS | None — same-origin only (`/api/form/submit`) | `cors` middleware enforces an explicit origin allow-list (`https://www.secondrm.com`, `https://secondrm.com`, `http://localhost:5173`, `http://127.0.0.1:5173`); OPTIONS preflight handled by the same middleware. Disallowed origins receive no `Access-Control-Allow-Origin` header and are blocked by the browser. |
| `remoteip` forwarded to Google | No | Yes (from `context.rawRequest.ip` / `req.ip`) |
| Secret binding | `process.env.RECAPTCHA_SECRET` only | `functions.config().recaptcha.secret` **or** `process.env.RECAPTCHA_SECRET` |
| Service-account credential | `FIREBASE_SERVICE_ACCOUNT` env (JSON string) | Default ADC inside the Functions runtime |
| Live? | **Yes (production)** | No, kept as a fallback if Vercel is swapped out |

The live form posts only to the Vercel function. The constant `CF_URL = "/api/form/submit"` in `register.html` is the single point of switching.

---

## 4. Data Model (Firestore)

### `form_submissions/{auto-id}`

Written by the serverless function. The shape is **the literal payload object built in the submit handler in `register.html`** (search for the `ANCHOR: form-submission-payload` comment), plus a server timestamp added by the function. Field-by-field contract:

| Field | Source (`register.html` id) | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `company` | `#company` | string (trimmed) | yes | HTML5 `required` |
| `ticker` | `#ticker` | string | yes | Must match `[A-Za-z0-9.\-]{1,10}` |
| `contactName` | `#contactName` | string | yes | — |
| `role` | `#role` | string | yes | — |
| `email` | `#email` | string | yes | HTML5 `type=email` |
| `mobile` | `#mobile` | string (trimmed) | yes | Must match `[0-9()+\-\s]{7,}` |
| `office` | `#office` | string | yes | Office location |
| `attendance` | `input[name=attendance]` | boolean | no | `true` if the "CEO/CFO can attend" box is checked |
| `contactConsent` | `input[name=contactConsent]` | boolean | no | — |
| `pdpaConsent` | `input[name=pdpaConsent]` | boolean | yes | Form refuses to submit if false |
| `userAgent` | `navigator.userAgent` | string | auto | Set by client |
| `page` | `location.href` | string | auto | Set by client |
| `submittedAt` | `FieldValue.serverTimestamp()` | Firestore `Timestamp` | auto | Added by the server function |

There is **no server-side validation beyond reCAPTCHA**. The Vercel function spreads the client payload into the document as-is, so do not trust any field for downstream automation without re-validating.

**Retention policy:** none implemented. Submissions remain in Firestore until manually deleted via `admin.html` or the Firebase console. If/when a retention policy is required (PDPA review, GDPR, etc.), implement it as a scheduled Cloud Function that prunes documents older than `N` days.

**Example real submission (illustrative):**

```jsonc
{
  "company": "Acme Holdings Ltd",
  "ticker": "ACME",
  "contactName": "Jane Doe",
  "role": "Head of IR",
  "email": "jane@acme.example",
  "mobile": "+65 8123 4567",
  "office": "Singapore",
  "attendance": true,
  "contactConsent": true,
  "pdpaConsent": true,
  "userAgent": "Mozilla/5.0 …",
  "page": "https://www.secondrm.com/register.html",
  "submittedAt": "2026-04-29T05:53:11Z"
}
```

### `page_content/{docId}`
Editable marketing copy for selected pages (e.g. the Core Build Lab page). Public read, admin write. Schema is per-document (arbitrary string fields, one per copy slot).

---

## 5. Security Model

- **Public read** is allowed only on `page_content/*`. Everything else (including `form_submissions`) is admin-only.
- **Form writes** happen exclusively through the Vercel function via a service-account credential, which bypasses `firestore.rules`. Browsers cannot write directly to `form_submissions`.
- **reCAPTCHA** is the spam/bot gate. The site key is in `register.html`; the secret lives in `RECAPTCHA_SECRET` on the server.
- **Admin allow-list lives in two places** that must be kept in sync:
  - `firestore.rules → isAdmin()` (server-enforced; the only one that matters for security).
  - `admin.html → ADMIN_EMAILS` (client UX gate; hides admin views from non-admins after sign-in).
  When adding/removing an admin, update **both** and `firebase deploy --only firestore:rules`.
- **Secrets hygiene:**
  - `.env*` and `.env.local` are git-ignored.
  - `*.pfx`, `*.pem`, `*.key`, `*.p12`, `*.crt`, and `serviceAccount*.json` / `firebase-adminsdk*.json` are git-ignored.
  - **Caveat:** `localhost.pfx` is currently **tracked** in this repo from before the gitignore was hardened. It appears to be a self-signed dev certificate, but if it contains a real private key, treat it as compromised, rotate it, `git rm` it, and consider scrubbing history (`git filter-repo` / GitHub support).
- **Firebase Web API key** in `admin.html` is intentionally public; access control is enforced by `firestore.rules`.

---

## 6. Deployment Targets

### Primary: Vercel
- Static assets served from the edge.
- `api/form/submit.js` runs as a Node ≥ 18 serverless function.
- Required env vars (set in **Project → Settings → Environment Variables** for `Production`, `Preview`, and `Development`):
  - `RECAPTCHA_SECRET` — server-side reCAPTCHA secret matching the site key in `register.html`.
  - `FIREBASE_SERVICE_ACCOUNT` — full service-account JSON as a single string. The function normalises `\n` inside `private_key`, so either escaped or literal newlines work.
- Deploy:
  ```bash
  npm install
  npx vercel        # preview
  npx vercel --prod # production
  ```

### Secondary: Firebase Functions (fallback)
- Deploys `firestore.rules` and `functions/`.
- The Cloud Function reads `RECAPTCHA_SECRET` via either:
  - **Modern (recommended)** — Secret Manager. Two steps:
    1. `firebase functions:secrets:set RECAPTCHA_SECRET` (paste the value when prompted).
    2. Bind the secret to each function in `functions/index.js` with `runWith({ secrets: ["RECAPTCHA_SECRET"] })` — the current file already does this. **Without this binding, `process.env.RECAPTCHA_SECRET` is undefined at runtime**, even if the secret exists in Secret Manager. (See [Firebase docs — Configure your environment](https://firebase.google.com/docs/functions/config-env).)
    3. Redeploy: `firebase deploy --only functions`.
  - **Legacy** — `firebase functions:config:set recaptcha.secret="…"` and redeploy. The code falls back to this if the env var is missing. Firebase has deprecated runtime config for v2 functions; treat this as v1-only.
- Service-account credentials come from the Functions runtime ADC (`admin.initializeApp()` with no args).
- Deploy:
  ```bash
  cd functions && npm install && cd ..
  firebase deploy --only firestore:rules
  firebase deploy --only functions
  ```
- To activate the Firebase backend instead of Vercel, change `CF_URL` in `register.html` to the deployed HTTPS URL of `formSubmit` — which is just a URL alias of `submitFormWithCaptchaHttp` (the substring "captcha" is removed from the path to dodge ad-blocker rules; the function still verifies the captcha token).

---

## 7. Local Development

See the README for the canonical runbook. Key constraints:

- **Node ≥ 18** is required (declared in `package.json#engines`).
- Run `npm install` at the repo root before `vercel dev` so `firebase-admin` and `node-fetch` are present.
- Run `cd functions && npm install` only if you intend to test the Firebase backend locally with the emulator.
- `.env.local` (git-ignored) at the repo root must contain at least:
  ```bash
  RECAPTCHA_SECRET=<server secret matching the site key>
  FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
  ```
- **Do not test against production Firestore.** Two safe options:
  1. **Separate Firebase project for dev** — create e.g. `secondrm-dev`, generate a service-account key for it, and put that JSON in `.env.local` as `FIREBASE_SERVICE_ACCOUNT`. Real network, isolated data.
  2. **Firestore emulator** — run `firebase emulators:start --only firestore`, then export `FIRESTORE_EMULATOR_HOST=localhost:8080` (and any other non-secret values) into your shell before `vercel dev`. With that env var set, the Firebase Admin SDK auto-routes all reads/writes to the emulator and **ignores credentials**, so any non-empty `FIREBASE_SERVICE_ACCOUNT` JSON will do — there is no need for a real key. Use a throwaway project ID such as `secondrm-emulator` so production data and dev data can never be confused. The emulator data lives only in the emulator process unless you `--export-on-exit`.

---

## 8. Smoke-Test Checklist (manual; this repo has no CI)

Run after every change before deploying to production:

1. **Static pages render**
   - [ ] `index.html` loads, hero video plays, nav works.
   - [ ] Each page in section 2 loads with no console errors.
   - [ ] `styles.css` is fetched once and applies to all pages.
2. **Lead capture happy path** (against a non-prod project)
   - [ ] Visit `/register.html`, fill all required fields, complete reCAPTCHA, submit.
   - [ ] Network tab: `POST /api/form/submit` returns `200 { ok: true }`.
   - [ ] Firestore: a new document appears in `form_submissions` with all 12 client payload fields plus the server-added `submittedAt`.
3. **Lead capture failure paths**
   - [ ] Submitting without the reCAPTCHA shows the inline error and does not call the API.
   - [ ] Submitting with `pdpaConsent` unchecked is blocked.
   - [ ] An invalid `ticker` (e.g. `??`) blocks submission via the HTML5 `pattern` check.
4. **Admin access**
   - [ ] `/admin.html` shows the Sign-in CTA when signed out.
   - [ ] Signing in with an email **not** in `ADMIN_EMAILS` shows the "not authorised" view.
   - [ ] Signing in with an allow-listed email lists `form_submissions` and `page_content` rows.
5. **SEO surface**
   - [ ] `sitemap.xml` is reachable and contains all 9 indexed pages.
   - [ ] `robots.txt` is reachable.
   - [ ] `llms.txt` reflects current pages and offerings.
6. **Security spot-check**
   - [ ] Calling `/api/form/submit` without a token returns `400 missing_recaptcha_token`.
   - [ ] Reading `form_submissions` from a signed-out browser console (Firebase SDK) is denied.

---

## 9. Conventions & Gotchas

- **One stylesheet.** All pages share `styles.css`. Keep page-specific tweaks inline-scoped (a `<style>` block in that page) to avoid bleed.
- **No build step.** Pages are authored as plain HTML; do not introduce a bundler unless there is a real reason. Editing a page = editing a file.
- **Form endpoint path is fixed.** `register.html` posts to `/api/form/submit`. If you move the function, update the constant `CF_URL` in `register.html`.
- **reCAPTCHA mode is v2.** The current `register.html` uses the v2 checkbox; do not turn on `score < 0.5` enforcement on the client side. The server function is permissive about v2 vs v3 (it only enforces score *if Google returns one*).
- **Email allow-list lives in two places.** Authoritative copy: `firestore.rules`. Client-UX copy: `admin.html → ADMIN_EMAILS`. Update both.
- **Sitemap & llms.txt maintenance.** When adding a public page: add `<url>` to `sitemap.xml` and a bullet to the relevant section of `llms.txt`, and bump `Last-Updated`.
- **Backends are not byte-identical.** See section 3.4 — do not assume a behaviour observed in one backend exists in the other.

---

## 10. When You're About To…

| Task | Touch these files |
| --- | --- |
| Add a new public marketing page | new `*.html` + `sitemap.xml` + `llms.txt` (+ link from `<nav>` in existing pages) |
| Change the form fields | `register.html` (UI + payload), the schema in section 4, and any consumers in `admin.html` |
| Add an admin user | `firestore.rules → isAdmin()` **and** `admin.html → ADMIN_EMAILS`, then `firebase deploy --only firestore:rules` |
| Rotate reCAPTCHA keys | Site key in `register.html`; secret in Vercel env (`RECAPTCHA_SECRET`) and Firebase secret |
| Move off Vercel | Deploy `functions/`, set `CF_URL` in `register.html` to the deployed `formSubmit` HTTPS URL |
| Update editable Core Build Lab copy | Firestore `page_content/*` (via `admin.html`) — no code change needed |

---

## 11. Out-of-Scope (intentionally)

- No CMS, no blog engine — content is hand-authored HTML.
- No analytics pipeline beyond standard Vercel/Google tooling.
- No multi-tenant or user-account features.
- No automated CI/CD tests; the smoke-test checklist in section 8 is the standard.

---

_Last reviewed: 2026-04-29 — Yan Guang Chen._
