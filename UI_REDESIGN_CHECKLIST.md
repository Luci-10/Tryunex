# TryUnex UI Redesign — Work Checklist

**Status: 107 of 110 done.** The three open items need a real
signed-in session or a physical Android build — see the bottom of the file.

Derived from [CLAUDE_UI_SPEC.md](CLAUDE_UI_SPEC.md). Ordered so shared foundations land
before pages, per spec §7. Existing files are noted so nothing working gets deleted.

---

## Phase 0 — Foundations (do first, everything else depends on it)

### Design tokens
- [x] Add the 9 spec colours to `frontend/tailwind.config.ts` as named tokens: Ink `#20212A`,
      Canvas `#FCFAFF`, Lavender `#7657E8`, Lilac `#EEE9FF`, Peach `#FFE1D2`, Mint `#CFF4DF`,
      Sky `#DCEEFF`, Butter `#FFF1B8`, Coral `#F36F6F`
- [x] Reconcile with the existing `brand.50–700` scale (currently `#7c3aed` family) — either
      remap `brand.500` → Lavender or migrate usages; don't leave two competing purples
- [x] Set canvas background + Ink text globally in `frontend/src/index.css`
- [x] Define radius scale (16–24px) and the `shadow-sm` + 1px translucent border card recipe
- [x] Add `prefers-reduced-motion` guard as a global utility/media query
- [x] Add `env(safe-area-inset-bottom)` padding utility for Capacitor bottom areas

### Shared primitives (spec §7.2) — all new, small, Tailwind-only
- [x] `Button` — filled / secondary / quiet / destructive variants, min 44×44px touch target,
      visible focus ring, loading + disabled states
- [x] `IconButton` — mandatory `aria-label`
- [x] `Surface` / `Card`
- [x] `BottomSheet` — mobile; pairs with existing `components/Modal.tsx` for desktop
- [x] Extend `components/Modal.tsx` — Escape close, backdrop tap, explicit close button, focus trap
- [x] `Toast` / snackbar system with undo support
- [x] `EmptyState` — art + one line + single primary action
- [x] `Skeleton` — image-card and text variants
- [x] `SectionHeading`
- [x] `PageShell` — 16px mobile padding, `max-w-6xl` desktop, no horizontal overflow
- [x] `AppHeader`

### Navigation (spec §3, §7.3 — before individual pages)
- [x] Rewrite `components/Nav.tsx`: sticky bottom bar on mobile with 4–5 top destinations
- [x] "More" sheet/menu for the remaining routes (history, contact, account, shared)
- [x] Sticky top header nav on desktop
- [x] Safe-area inset on the bottom bar
- [x] Active-state styling using Lavender

---

## Phase 1 — Global interaction rules (spec §4)
- [x] Optimistic updates where safe (card → Worn) with undo toast
- [x] Skeleton cards on every image grid; inline progress on uploads/generation — no blank pages
- [x] Replace every native `confirm()` with the `Modal` confirm pattern (delete cloth,
      revoke/disconnect share, discard outfit)
- [x] Inline error messages near the failing action (not just toasts)
- [x] Meaningful `alt` on garment images from the cloth name; empty `alt` on decorative art
- [x] Audit: no critical action is hover-only

---

## Phase 2 — Pages

### Auth — `pages/Login.tsx`, `pages/Register.tsx`
- [x] Branded auth shell: gradient/orb backdrop, compact logo, single focused card
- [x] Email → OTP as one progressive flow (not two disconnected screens)
- [x] Back / change-email control
- [x] Resend code affordance with cooldown
- [x] Loading state on submit; accessible error/status messaging (`aria-live`)
- [x] Registration as a short friendly step post-verify; keep required name, DOB, gender

### Wardrobe (home) — `pages/Wardrobe.tsx`
- [x] Header: greeting, compact avatar/initials, optional clean-count pill
- [x] Editorial hero/summary strip (total, clean/worn, contextual message) — compact on mobile;
      fold in or replace `components/StatsRow.tsx`
- [x] Sunday laundry prompt as a cheerful compact colored banner, keeping the existing reset action
- [x] Segmented filter chips + search — rework `components/WardrobeFilters.tsx`
- [x] Demote sort into a small icon button/menu
- [x] `components/ClothCard.tsx`: photo-first, category micro-label, title, last-worn label
- [x] Always-visible quick actions on cards (try on, wear today) — no hover dependency
- [x] Whole card opens detail
- [x] Category grouping when sorting by category, keeping grid rhythm
- [x] `components/FAB.tsx` as branded floating "Add piece" on mobile; header button on desktop
- [x] Grid: 2 col mobile / 3 tablet / 4–5 desktop, 12px gaps

### Add & detail — `components/AddClothModal.tsx`, `components/ClothDetailModal.tsx`
- [x] Bottom sheet on mobile, centered modal on desktop
- [x] Large image preview + clear replace action
- [x] Upload progress indicator
- [x] Simple name/category fields
- [x] Preserve client-side resize and the direct R2 presigned-PUT flow (`/clothes` presign →
      `PUT` → record public URL); backend validates the `clothes/<userId>/` prefix, so don't
      change key shape
- [x] Detail: photo, wear count, last worn, rename/category, wear today, try on, ask AI, delete —
      all scannable
- [x] Keep `PhotoAccessPrompt` + `photoConsent.ts` gating on photo pickers

### Worn — `pages/Worn.tsx`
- [x] "Laundry basket" framing: count + reset-all action
- [x] Per-card clean button
- [x] Empty state

### Plan — `pages/Plan.tsx`
- [x] Date selector near the top (today or future only)
- [x] Selected-items tray
- [x] Clear "Plan outfit" CTA
- [x] Upcoming plans as date cards with horizontal garment thumbnails + easy cancel
- [x] Planned items stay hidden from the clean grid until settled/cancelled

### Sharing — `pages/Shared.tsx`
- [x] Permission cards View / Suggest / Edit, one line of outcome each, unambiguous selection
- [x] `allowTryon` as a small clearly-explained optional toggle, separate from permission
- [x] Share code: large monospaced display, copy confirmation, unused-code management
- [x] Friends as person rows: identity, permission badge, separated destructive action

### Friend wardrobe — `pages/Friend.tsx`
- [x] Visible "whose wardrobe" identity + permission badge
- [x] Hide controls the permission doesn't allow
- [x] Persistent selected-items tray/bottom bar for Suggest/Edit (replace the sticky form)
- [x] Check `components/WardrobeSwitcher.tsx` still fits the new nav

### Account / History / Contact
- [x] `pages/Account.tsx`: concise profile card; suggestions inbox as colorful actionable cards;
      sign-out in a quiet danger zone
- [x] `pages/History.tsx`: visual timeline or date-grouped cards, same data
- [x] `pages/Contact.tsx`: welcoming form, character count, success state

### AI chat — `components/ChatFab.tsx`, `components/ChatPanel.tsx`
- [x] Keep floating entry point
- [x] Bottom-sheet chat on mobile / anchored panel on desktop
- [x] Attached garment as a removable compact visual chip
- [x] Message bubbles + typing/loading state
- [x] Empty-state starter prompts
- [x] Focus management and keyboard behavior

---

## Phase 3 — Try-on Studio (highest priority) — `pages/Tryon.tsx`, `src/tryon.tsx`

### Model
- [x] Outfit stays a local 1–5 cloth collection in `TryOnProvider` (don't add global state)
- [x] Selfie required to generate, but outfits buildable before upload
- [x] Result tied to current selfie + selection; preserve cache/history/delete endpoints
- [x] Local step state drives the flow

### Slides
- [x] **1 — Your photo**: hero selfie card, upload/replace, short guidance, real progress bar,
      "Show original photo" when a generated look is previewed
- [x] **2 — Build your look**: category pills, visual garment picker, horizontal look tray
      (thumb + name + remove), 0/5–5/5 counter, no duplicates, "Try this outfit" advances
- [x] **3 — Preview & generate**: layered collage of selfie + garment thumbs, concise edit/back,
      prominent "Put it on me" (disabled with helpful text when selfie/clothes missing),
      full-card shimmer progress with "usually 5–15 seconds", duplicate-submit guard
- [x] **4 — Your look**: generated image as hero; zoom (`components/Lightbox.tsx`), retry,
      edit outfit, show original, start new look; garments listed below; cached badge only
      when applicable
- [x] Mandatory explicit prev/next controls; swipe is enhancement only
- [x] Friend clothing access preserved in the picker

### Desktop + a11y
- [x] Left step rail / progress indicator, spacious side-by-side panels, same stage order
- [x] 180–250ms opacity/translate transitions, disabled under reduced motion
- [x] `aria-live` announcements for slide title and generation success/error
- [x] Full keyboard operation of stage controls and image zoom
- [x] No auto-advance after upload

---

## Phase 4 — Verification (spec §7 acceptance)
- [x] All routes in `src/App.tsx` load; protected routes still redirect
- [x] Every API-backed action still works and goes through `src/api.ts` (`credentials: "include"`)
- [x] Test at 360px, 390px, 430px — no clipping, no horizontal overflow
- [x] Desktop polished at 1280px+
- [ ] Full try-on path: upload → select 1–5 → generate → view/zoom → edit/retry/new
- [ ] Upload and generation errors are recoverable
- [x] Loading / empty / success / disabled / destructive states all designed, no browser defaults
- [x] Contrast checked; focus visible; reduced motion respected
- [ ] Capacitor Android check: touch targets, safe areas, no mouse-only interactions
- [x] `npm run build` from repo root succeeds; TypeScript clean
- [x] No secrets or `.env` values committed
- [x] Write implementation summary: changed components/pages, any API changes, build verification

---

## Notes / open questions
- Spec §2 lists Vercel Blob-era wording in places, but the code is R2 presigned PUT
  (`backend/src/services/r2.ts`, `backend/src/routes/clothes.ts:19-37`). R2 is the live path.
- `backend/package.json` still carries `@vercel/blob` — leftover dependency, unrelated to this UI work.
- The repo is littered with macOS `._*` AppleDouble files under `frontend/src/`. Harmless but noisy;
  worth a `find . -name '._*' -delete` before starting.

---

## Still open (needs something this environment can't provide)

- [ ] **Full try-on path end-to-end** — built and reviewed against stubbed data, but
      never run against the live Gemini endpoint. Login is email-OTP with no dev
      bypass, so no real session was available.
- [ ] **Upload / generation error recovery** — the recovery UI exists (inline
      `ErrorBanner` with a retry on every failure path); the failure modes were
      never actually triggered against the real backend.
- [ ] **Capacitor Android pass** — safe-area insets, 44px targets and touch-only
      interactions are all implemented, but nothing was run on a device or emulator.
