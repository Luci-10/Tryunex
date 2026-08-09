# TryUnex — UI/UX Redesign Specification

## 1. Purpose and scope

Redesign the existing TryUnex frontend into a polished, **minimal, colourful, mobile-first wardrobe app**. The product already has a working Express/Drizzle backend and React/Vite frontend. This work is primarily a frontend/UI/interaction upgrade: preserve all existing API contracts and functional flows unless a small frontend-compatible backend change is genuinely necessary.

The experience should feel warm, personal and playful—not like an enterprise dashboard. It must remain fast and easy to use on a phone, with the desktop layout feeling intentionally composed rather than merely stretched.

Primary goals:

- Make all key actions visually obvious and delightful.
- Reduce visual clutter and excessive text.
- Make Try-on Studio a premium, slide-based experience.
- Make every screen responsive, accessible, and touch-friendly.
- Retain the existing product functionality listed below.

Do not replace the stack, add a UI component library, or introduce a global state library. Use React 19, React Router, TypeScript, Tailwind CSS, and the current API wrapper.

## 2. Existing technical constraints

### Frontend

- `frontend/` is a Vite + React 19 + TypeScript app.
- Tailwind 3 is installed and should be the styling system. Small reusable components are preferred over duplicate page markup.
- Routes and protected-session behavior are defined in `frontend/src/App.tsx`.
- API calls must use `frontend/src/api.ts`; it automatically uses `/api` on web and `https://www.tryunex.in/api` inside Capacitor.
- Authentication is cookie-based. Every API request needs `credentials: "include"` (the `api` helper already handles this).
- The app runs in a browser and a Capacitor Android wrapper. Do not rely on mouse-only interactions, hover-only controls, or desktop-only APIs.
- Keep the existing one-time mobile photo-access explanation via `photoConsent.ts` and `PhotoAccessPrompt` for photo pickers.

### Backend / API: preserve these contracts

- Auth: `/auth/start`, `/auth/verify`, `/auth/complete`, `/auth/me`, `/auth/logout`
- Clothes: list/filter, create via R2 presigned upload, get, patch, delete, wear, plan, reset, clean
- Sharing: share code creation/redeem, remove/disconnect, friend wardrobe, suggestions, editor plans
- History, contact form, AI chat
- Try-on: selfie upload URL + record, generate an image from 1–5 clothes, result cache/history/delete

Cloth records include `id`, `name`, `category`, `imageUrl`, `status`, `createdAt`, and sometimes `lastWornOn`. Do not change their public shape casually.

### Important functional rules

- Clean and worn clothes are separate states. A planned item is hidden from the clean grid until its plan is settled/cancelled.
- Plans can only be today or future dates.
- Sharing permission is `view`, `suggest`, or `edit`; `allowTryon` is an independent opt-in.
- The app is not a generic fashion marketplace: users manage their own wardrobe and may view friends’ wardrobes only when explicitly shared.
- R2 uploads are browser-direct: request a presigned URL, `PUT` the resized file, then record the returned public URL through the API.

## 3. Visual system

### Brand direction

Keep purple as the brand anchor, but broaden the palette so it feels bright and aesthetic rather than monochrome. Use colour deliberately for meaning and sections.

Suggested tokens (define in Tailwind or CSS variables):

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#20212A` | Main text |
| Canvas | `#FCFAFF` | Page background |
| Lavender | `#7657E8` | Primary actions / active state |
| Lilac | `#EEE9FF` | Soft purple surfaces |
| Peach | `#FFE1D2` | Warm accents / planning |
| Mint | `#CFF4DF` | Success / clean clothes |
| Sky | `#DCEEFF` | Information / sharing |
| Butter | `#FFF1B8` | Highlights / empty-state accents |
| Coral | `#F36F6F` | Destructive actions / errors |

- Use the canvas background with very subtle colored radial blobs/gradients in large empty areas only; content cards must remain readable.
- Avoid heavy shadows. Use `shadow-sm`, a 1px translucent border, soft 16–24px radii, and generous spacing.
- Typography: system sans is acceptable; use clear hierarchy, not many weights. Headings should be friendly and compact.
- Images are primary visual content: use consistent rounded image cards, `object-cover`, loading skeletons, and a calm neutral placeholder.
- Buttons must have clear filled/secondary/quiet/destructive variants. Minimum touch target: 44×44px.
- Do not use emojis as the only affordance. They may support labels, but controls need text or `aria-label`.

### Responsive layout

- Design from 360px wide upward; no horizontal page overflow.
- Mobile: 16px side padding, 12px grid gaps, two-column wardrobe cards; controls stack or scroll horizontally.
- Tablet: 3 columns; desktop (`lg`) 4–5 columns and `max-w-6xl` content width.
- Navigation must remain usable on a small screen. Use a compact sticky bottom navigation for the 4–5 highest-frequency destinations on mobile, plus a simple “More” sheet/menu for remaining routes. Retain a clean sticky top/header navigation on desktop.
- Respect safe areas in Capacitor: use `env(safe-area-inset-bottom)` for bottom navigation/action areas.
- Respect `prefers-reduced-motion`; animations should be short, optional, and never block actions.

## 4. Global interaction rules

- Show immediate optimistic feedback where safe (e.g. card moves to Worn), with an undo toast when practical.
- Use skeleton cards for image grids and inline progress for uploads/generation. Never leave a blank page during loading.
- Use snackbars/toasts for successful lightweight actions; use inline error messages near the failed action.
- Confirm destructive actions (delete cloth, revoke/disconnect, discard outfit). Native `confirm()` may be replaced by the existing `Modal` component.
- Include empty states with one primary next action, not a wall of text.
- All dialogs close by Escape, backdrop tap/click (when safe), and an explicit close button. Focus must remain usable.
- Images need meaningful `alt` text based on the garment name; decorative art uses empty alt text.

## 5. Information architecture and screen specs

### Login and registration

- Create a calm, branded auth shell with a gradient/orb backdrop, compact logo, and one focused card.
- Email and OTP should feel like one progressive flow with a clear back/change-email option, resend affordance, loading state, and accessible error/status messages.
- Registration should be a short, friendly step after verification; retain required name, DOB and gender behavior.

### Wardrobe (home)

This is the main daily screen.

- Header: friendly greeting, compact user avatar/initials, optional “clean count” pill.
- Use an editorial hero/summary strip: total pieces, clean/worn status and a simple contextual message. It should be compact on mobile, not a large dashboard.
- Sunday laundry prompt should be a cheerful, compact colored banner with the existing reset action.
- Add segmented filter chips and search. Keep sort in a small icon/button/menu so it does not dominate.
- Clothing cards: photo first, category micro-label, title, last worn label; always-visible concise quick actions on touch (try on, wear today) without requiring hover. The whole card opens detail.
- The primary “Add piece” action is a floating branded button on mobile and a header button on desktop.
- Support category grouping when sorting by category, but preserve clean visual rhythm.

### Add/edit cloth

- Use a polished bottom sheet on mobile and centered modal on desktop.
- Upload area must show a large image preview, a clear replace action, progress indicator, and simple name/category fields.
- Continue client resizing before upload. Preserve the existing direct R2 upload flow.
- Detail view should make photo, wear count, last worn date, rename/category, “wear today”, “try on”, “ask AI”, and delete easy to scan.

### Worn and plan

- Worn should feel like a contained “laundry basket”: count, reset-all action, and clean-item button on each card.
- Plan page should become a simple schedule experience: date selector near the top, selected-items tray, and a clear “Plan outfit” CTA.
- Upcoming plans should be grouped as date cards with horizontal garment thumbnails and an easy cancel action.

### Sharing and friend wardrobes

- Share should use clear permission cards (View / Suggest / Edit) explaining outcomes in one line each; selection must be visually unambiguous.
- Put Try-on sharing permission as a small, clearly explained optional toggle.
- Share code needs large monospaced display, copy confirmation, and unused-code management.
- Friends lists should use person cards/rows with identity, permission badge, and a clearly separated destructive action.
- Friend wardrobe should visibly identify whose wardrobe is being viewed and display a permission badge. Hide controls the user cannot use; for Suggest/Edit, use a persistent selected-items tray/bottom bar instead of a busy sticky form.

### Account, history, contact

- Account: concise profile card, suggestions inbox as colorful actionable cards, sign-out in a quiet danger zone.
- History: chronological visual timeline or date-grouped cards; preserve current data.
- Contact: a welcoming simple form with character count and success state.

### AI chat

- Keep the floating entry point, but give it a modern bottom-sheet chat on mobile / anchored panel on desktop.
- Show the attached garment as a removable compact visual chip.
- Include message bubbles, typing/loading state, empty-state starter prompts, and strong focus/keyboard behavior.

## 6. Try-on Studio — highest-priority redesign

Turn `/tryon` into an intuitive **slide-based outfit creation flow**. It must retain the current selfie upload, outfit building, Gemini generation, cache behavior, friend clothing access, and result display.

### Core model

- An outfit remains a local collection of 1–5 selected clothes from `TryOnProvider`.
- A selfie is required before generating, but users can build outfits before uploading one.
- Each generated result is tied to the current selfie and selected clothes. Do not claim the image is exact or permanent beyond what the backend stores.

### Mobile slide flow

Implement a horizontal slide/carousel or stepper with buttons and optional swipe gestures. Swiping is an enhancement only; explicit previous/next controls are mandatory.

1. **Slide 1 — Your photo**
   - Large hero/selfie card, upload or replace action, short photo guidance.
   - On upload, show a real progress bar.
   - If a generated look is currently being previewed, support “Show original photo”.

2. **Slide 2 — Build your look**
   - Category filter pills and a simple visual garment picker.
   - Selected pieces appear in a horizontal “look tray” with thumbnail, name, and remove button.
   - Show a clear 0/5 through 5/5 limit. Avoid duplicate selection.
   - “Try this outfit” button advances to preview/generation.

3. **Slide 3 — Preview and generate**
   - A layered/styled collage of the selfie + selected garment thumbnails, with concise edit/back controls.
   - Prominent “Put it on me” CTA, disabled with helpful text if selfie or clothes are missing.
   - Generation state should be a visually pleasing full-card progress state (animated shimmer/soft pulse, clear “usually 5–15 seconds” copy); prevent duplicate submissions.

4. **Slide 4 — Your look**
   - Generated image is the hero. Provide zoom, retry, edit outfit, show original, and start a new look.
   - Display selected garments below the result.
   - Show a small cached-result badge only when applicable; do not make caching confusing.

### Desktop behavior

- Same ordered stages, but show a left step rail or progress indicator and allow more spacious side-by-side selection/preview panels.
- Keep stage order clear; no separate, confusing full-page forms.

### Try-on motion and accessibility

- Slide transition: 180–250ms opacity/translate, disabled for reduced motion.
- Announce slide title and generation success/error in an `aria-live` region.
- Keyboard users can operate all stage controls and image zoom.
- Do not auto-advance after an upload; allow the user to review their selfie.

## 7. Implementation expectations

1. First inspect the current source and preserve working endpoints/types.
2. Establish shared primitives: `PageShell`, `AppHeader`, mobile navigation, `Button`, `IconButton`, `Surface/Card`, `BottomSheet/Modal`, `Toast`, `EmptyState`, `Skeleton`, and `SectionHeading`. Keep them small and Tailwind-based.
3. Update `Nav` and app layout before individual pages so responsive behavior is consistent.
4. Refactor each page incrementally without deleting current working functionality.
5. Rebuild Try-on Studio using a clear local step state while continuing to use `TryOnProvider` for local outfits and existing try-on endpoints.
6. Run `npm run build` from repository root. Fix TypeScript errors and obvious responsive issues.

### Quality bar / acceptance checklist

- [ ] All existing routes still load and protected routes redirect correctly.
- [ ] Every existing API-backed action remains available and uses the current API helper.
- [ ] No critical action relies only on hover.
- [ ] Phone layouts work at 360px, 390px and 430px without clipped content or horizontal overflow.
- [ ] Desktop layout is polished at 1280px+.
- [ ] Try-on supports upload selfie → select 1–5 clothes → generate → view/zoom result → edit/retry/new look.
- [ ] Upload and generation errors are clearly recoverable.
- [ ] Loading, empty, success, disabled and destructive states are designed—not browser defaults.
- [ ] Colour has adequate contrast; keyboard focus is visible; reduced motion is respected.
- [ ] `npm run build` succeeds.

## 8. Deliverables

- Updated React/Tailwind frontend implementation.
- No secrets, API keys, or `.env` values committed.
- A concise implementation summary naming changed components/pages, any API changes, and build verification.

Use this specification as the source of truth. Where a visual decision is unspecified, prefer a simple, legible, touch-friendly solution over adding more controls or decoration.
