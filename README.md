# Wordrobe

Your wardrobe in your pocket. Upload photos of your clothes, plan what to wear, share your wardrobe with friends and family.

Single repo with npm workspaces. **One command** starts everything in dev. Deploys to **Vercel** as a single project.

```
Tryunex_wordrobe/
├── api/         Vercel serverless entry — forwards /api/* to the Express app
├── backend/     Express + TypeScript + Drizzle + Neon Postgres + nodemailer
├── frontend/    Vite + React + React Router + Tailwind
└── vercel.json
```

## Features

- **Login by email + 6-digit OTP** sent from your own Gmail. OTPs are stored **statelessly in a signed httpOnly cookie** (HMAC'd, attempts capped at 5) — never in the database, and they survive serverless invocations without any external store.
- If the email is already in the DB → straight to wardrobe.
- If not → quick registration step (name, date of birth, gender) → wardrobe.
- Upload clothes (photo + name + category)
- Plan an outfit → moves picked items to the Worn pile, logs to History
- **Sunday manual-confirm reset** — banner on Sundays asks "did you do laundry?"; moves the Worn pile back to your wardrobe
- Share your wardrobe with friends/family via an **8-character code** with three access levels:
  - View only · View + suggest · View + edit
- See/revoke everyone you've shared with, and everyone you can see
- Suggestions inbox on the Account page
- Wear history grouped by date

## Prerequisites

- Node 20+
- A Neon Postgres database (https://console.neon.tech)
- A Gmail account with an **App Password** (https://myaccount.google.com/apppasswords — requires 2-Step Verification on the account)

## Local setup

```bash
# 1) install everything (npm workspaces installs root + backend + frontend in one go)
npm install

# 2) configure the backend
cp backend/.env.example backend/.env
#   then edit backend/.env and fill in:
#     DATABASE_URL          — your Neon connection string
#     JWT_SECRET            — long random string  (openssl rand -hex 48)
#     GMAIL_USER            — your gmail address (the OTP sender)
#     GMAIL_APP_PASSWORD    — 16-char Google app password

# 3) push the schema to Neon
npm run db:push

# 4) start both backend + frontend on a single command
npm run dev
```

- Frontend → http://localhost:5173
- Backend  → http://localhost:3001 (Vite proxies API calls so the frontend uses same-origin URLs)

## Deploy to Vercel

The repo is set up as a single Vercel project: the Express app runs as a serverless function at `/api/*`, the React app is served as static files.

```bash
# 1) push the repo to GitHub
git init && git add -A && git commit -m "wordrobe init"
git remote add origin <your repo>
git push -u origin main

# 2) `vercel link` (or use the dashboard "Import Project")
npm i -g vercel
vercel link

# 3) Required env vars (set in the Vercel dashboard for Production):
#      DATABASE_URL             your Neon connection string
#      JWT_SECRET               long random string (openssl rand -hex 48)
#      GMAIL_USER               sender Gmail address
#      GMAIL_APP_PASSWORD       16-char Google app password
#      BLOB_READ_WRITE_TOKEN    from `vercel blob` or the dashboard

# 4) provision a Blob store (one-time)
vercel blob store add wordrobe-photos          # then attach the token to the project

# 5) push the schema once
DATABASE_URL=... JWT_SECRET=... npm run db:push

# 6) ship it
vercel deploy --prod
```

What runs where:
- Static frontend → Vercel CDN (built from `frontend/dist`)
- Express handler → single Vercel Function at `api/[[...path]].ts` (mounted at `/api/*`)
- OTP store → none. Stateless signed cookie carries the hash + attempt counter.
- Photo storage → Vercel Blob. URLs returned by the API are absolute Blob URLs.

In local dev (`npm run dev`) without `BLOB_READ_WRITE_TOKEN`, uploads fall back to `backend/uploads/` so you can iterate without setting up Blob.

## Auth flow (the OTP loop)

1. User enters email → `POST /api/auth/start`.
2. Backend generates a random 6-digit code, **hashes it (HMAC-SHA256 with `JWT_SECRET`)**, signs `{ email, otpHash, attempts: 0 }` into a 10-minute JWT cookie, and emails the plaintext code via Gmail SMTP.
3. User submits the code → `POST /api/auth/verify`. Backend recomputes the hash, compares in constant time, and:
   - If wrong → re-signs the cookie with `attempts + 1`. Cap is 5 — past that, the cookie is cleared and the user has to request a new code.
   - If right → clears the OTP cookie, then:
     - User row exists for that email → issue session cookie → wardrobe.
     - Otherwise → issue a short-lived "pending registration" cookie → `/register` to collect name/DOB/gender, then `POST /api/auth/complete` creates the user and issues the session cookie.

No external service holds OTP state. The cookie is the source of truth, and it's signed with `JWT_SECRET` so the attempt counter can't be tampered with.

## Tech notes

- **Sessions** are JWTs in `httpOnly` cookies; the frontend uses `credentials: "include"` and a Vite proxy in dev so cookies just work.
- **Photos** go to Vercel Blob in production (when `BLOB_READ_WRITE_TOKEN` is set). In dev they fall back to `backend/uploads/` served by Express. See [backend/src/services/upload.ts](backend/src/services/upload.ts).
- **Schema** lives in [backend/src/db/schema.ts](backend/src/db/schema.ts) (Drizzle ORM). Push changes with `npm run db:push` — uses Neon HTTP (port 443) since some networks block 5432.
- **OTP storage** ([backend/src/services/otp.ts](backend/src/services/otp.ts)) is a stateless signed cookie. No in-memory `Map`, no external store, works identically locally and on Vercel.

## Project layout

```
backend/
  src/
    index.ts                Express bootstrap
    db/
      schema.ts             Drizzle schema (users, clothes, wear_events, shares, ...)
      client.ts             Neon connection
    services/
      auth.ts               JWT cookies + middleware
      otp.ts                In-memory OTP store
      mailer.ts             Gmail SMTP via nodemailer
      upload.ts             multer disk storage
    routes/
      auth.ts               /auth/start, /verify, /complete, /me, /logout
      clothes.ts            wardrobe CRUD + /wear + /reset
      sharing.ts            /share/*, /friends/*, /suggestions/*
      history.ts            /history

frontend/
  src/
    main.tsx                React entry
    App.tsx                 Routes
    api.ts                  Tiny fetch wrapper
    auth.tsx                Session context (calls /auth/me)
    components/             Nav, ClothCard, AddCloth
    pages/
      Login.tsx             email → OTP
      Register.tsx          name + DOB + gender (new users only)
      Wardrobe.tsx          home
      Worn.tsx              worn pile
      Plan.tsx              pick clothes + date
      Shared.tsx            generate / manage / connect
      Friend.tsx            view a friend's wardrobe + suggest/wear
      History.tsx           wear history by date
      Account.tsx           profile + suggestions inbox + logout
```
