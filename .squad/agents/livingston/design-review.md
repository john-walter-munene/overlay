# Overlay Bets — Design Review

> **Reviewer:** Livingston (UI/UX Designer)
> **Date:** 2026-07-17
> **Scope:** Full UX audit of `apps/web/app/` — design system, user flows, visual consistency, IA, trust, accessibility, responsive, gaps.

---

## 1. Design System Status

**Verdict: Foundations exist, but no formal system yet.**

The app has a coherent *visual language* without a proper *design system*. The difference matters — what's here works for now, but it'll fracture as the product grows.

### What's working

| Layer | Status | Notes |
|-------|--------|-------|
| **Color tokens** | ✅ Solid | `globals.css` defines `--bg`, `--surface`, `--surface-2`, `--fg`, `--muted`, `--border`, `--accent`, `--danger`, `--warning`, `--success`, `--focus-ring` for both dark/light themes. Well-chosen, WCAG-aware values. |
| **Typography** | ✅ Good | Serif display (`Charter`, `Sitka Text`) for `h1–h3`, humanist sans (`Segoe UI`, system-ui) for body. No web-font fetch — fast and offline-safe. `letter-spacing: -0.01em` on headings adds a pro touch. |
| **Theme switching** | ✅ Excellent | `data-theme` attribute on `<html>`, inline script prevents FOUC, `localStorage` persistence, `prefers-color-scheme` fallback. `ThemeToggle` has proper `aria-pressed` and SSR-safe mounting. One of the cleanest implementations I've seen. |
| **Button system** | ✅ Good | `.btn` with `--primary`, `--secondary`, `--ghost` variants and `--sm`, `--lg` sizes in `globals.css`. Consistent padding, border-radius (8px), transitions. Used on both `<button>` and `<a>`. |
| **Focus states** | ✅ Good | Global `:focus-visible` rule with `--focus-ring` color, 2px offset. Skip link implemented. |
| **Reduced motion** | ✅ Present | `@media (prefers-reduced-motion)` kills transitions. |

### What's missing (→ OB-016)

| Gap | Impact |
|-----|--------|
| **No Card component** | Cards are rebuilt inline everywhere — `dashboard`, `earnings`, `account`, `tipsters`, `admin`. Each has slightly different `borderRadius` (8, 10, 12px), padding, background. |
| **No Table component** | Tables are inline `<table>` with bespoke styling in `tipsters`, `admin/users`, `admin/settlements`, `admin/audit-log`. No shared header, row, or pagination pattern. |
| **No Badge/Tag component** | Status badges (`won`, `lost`, `void`, `pending`, `live`) are hardcoded `<span>` elements with inline color logic scattered across `feed`, `dashboard`, `earnings`, `admin`. |
| **No Stat/Metric card** | Summary cards in `dashboard`, `earnings`, `PerformanceDashboard`, `admin` are all slightly different inline implementations. |
| **No Input component** | `formStyles.ts` provides a shared object, but it's inline CSS — no reusable `<Input>`, `<Select>`, `<Textarea>` with built-in label, error, and a11y support. |
| **No spacing scale** | Gaps/padding are arbitrary (`0.85rem`, `1.1rem`, `1.25rem`, `1.4rem`). No `4px` or `8px` grid discipline. |
| **Inline CSS dominance** | ~90% of page-level styling is `style={{ ... }}`. This prevents hover states, media queries, and pseudo-elements without workarounds. |

### Recommendation

Build the component library specified in **OB-016** before adding more pages. Priority extraction order: `Card` → `StatCard` → `StatusBadge` → `DataTable` → `FormField` → `Pagination`. Every new component should consume the existing CSS variables — the token layer is ready.

---

## 2. User Flow Audit

### Flow A: Tipster Onboarding (signup → first pick)

| Step | Page | UX Rating | Notes |
|------|------|-----------|-------|
| 1. Sign up | `/signup` | ⭐⭐⭐ | Role selector ("Bettor" vs "Tipster") with inline descriptions is clear. Username pre-validation is nice. Missing: privacy policy link, password strength meter. |
| 2. Email confirm | `/auth/callback` | ⭐⭐ | Just says "Signing you in…" — no progress indicator, no timeout, no error state. If the callback fails silently, user is stuck. |
| 3. Choose username | `/choose-username` | ⭐⭐⭐⭐ | Auto-focused input, avatar picker, prefilled from metadata. Clean flow. Minor: `<Suspense>` fallback is `null` (brief blank flash). |
| 4. Onboarding wizard | `/onboarding` | ⭐⭐⭐⭐ | 6-step progressive form with progress bar, step chips, auto-save. Best UX in the app. Issues: country/dial-code selects lack search, sports input has no autocomplete, bio has no character count, pricing shows no currency label. |
| 5. Dashboard | `/dashboard` | ⭐⭐⭐ | Shows pick submission form, performance stats, recent picks. Functional but dense — no first-run guidance or empty-state coaching. |

**Overall: ⭐⭐⭐ — The skeleton is complete.** The wizard is surprisingly good for an MVP. Biggest gaps: no handholding at the callback step, no "what's next?" guidance after wizard completion, and the pick submission form (OB-022) needs market-specific inputs.

### Flow B: Bettor Discovery → Subscribe

| Step | Page | UX Rating | Notes |
|------|------|-----------|-------|
| 1. Browse tipsters | `/tipsters` | ⭐⭐⭐ | Filters (sport, price, sample), sort, pagination, leaderboard sidebar. Solid. Missing: search within tipsters, no card/grid view toggle, filter requires clicking "Apply" instead of live-filtering. |
| 2. View profile | `/tipsters/[id]` | ⭐⭐⭐ | Stats grid, CLV chart, bio, sports, verification explainer. CLV chart is a raw SVG with no axis labels or tooltips. Verification explainer is long — most users will skip it. |
| 3. Subscribe | `SubscribeButton` → Stripe | ⭐⭐⭐ | Multi-currency support, payment method selector, local price estimate. Smart edge cases (blocks self-subscribe, blocks tipster accounts). Error states present. |
| 4. Post-checkout | `/subscribe/success` | ⭐⭐ | "You're subscribed 🎉" — then what? No next steps, no link to the tipster's picks, no "go to your feed" CTA. This is a dead end. |
| 5. Feed | `/feed` | ⭐⭐⭐ | Pill filters (live/settled), tipster dropdown, pick cards with status coloring, 30s auto-refresh. Functional. Missing: no "clear filters", outcome filter disappears when switching status tabs, no sort options. |

**Overall: ⭐⭐⭐ — Mechanically complete, emotionally flat.** The subscribe-to-feed funnel works but doesn't celebrate the moment of subscription. Post-checkout is the biggest UX hole — this is where trust and excitement peak and we waste it with a dead-end page.

### Flow C: Pick Submission (tipster)

| Step | Location | UX Rating | Notes |
|------|----------|-----------|-------|
| 1. Submit | `/dashboard` (inline form) | ⭐⭐ | Basic text inputs for all fields. No market-specific inputs (1X2 vs spread vs totals), no odds format toggle, no event search/autocomplete, no confirmation modal. (→ OB-022) |
| 2. Lock confirmation | Inline | ⭐⭐ | Pick appears in list below after submission. No visual "locked" animation, no hash display, no "this is permanent" warning. |
| 3. Settlement | Automatic | N/A | Background process — no UX needed. |

**Overall: ⭐⭐ — The weakest critical flow.** Pick submission is the core product action and it's a plain form. Needs serious UX work per OB-022.

---

## 3. Visual Consistency

### What's cohesive

- **Color palette** is consistent across all pages — tokens are well-used.
- **Button classes** (`btn btn--primary`, etc.) create visual unity on CTAs.
- **Header/footer** are shared components with proper responsive breakpoints.
- **Cards** all *feel* similar (surface background, border, rounded corners) even though they're not the same component.

### Jarring inconsistencies

| Issue | Where | Details |
|-------|-------|---------|
| **Border-radius drift** | Everywhere | Cards use `8px`, `10px`, or `12px` depending on the file. Inputs use `8px`, some panels use `12px`. Pick one (I'd say `8px` for inputs, `12px` for cards). |
| **Admin hardcoded colors** | `/admin/*` | Admin pages use raw hex (`#0d1117`, `#238636`, `#1f6feb`) instead of CSS variables. Breaks in light mode. |
| **Max-width inconsistency** | Page containers | Home: `900px`, tipsters: `1080px`, account: `820px`, support: `760px`, blog: `720px`, onboarding: `680px`, auth forms: `420px`. No content-width scale. |
| **Heading font sizes** | Throughout | `h1` ranges from `1.6rem` (mobile clamp) to `2.3rem` (home hero). `h2` from `1.1rem` to `1.3rem`. No type scale. |
| **Status label formatting** | `feed`, `dashboard`, `earnings`, `admin` | "Live", "½ won", "½ lost", "pending", "Settled" — same statuses rendered with different labels, colors, and casing across files. Should be a shared `StatusBadge` with a single source of truth. |
| **Error feedback patterns** | All forms | Login uses inline `<p>` with `--danger`. Admin uses `window.alert()` and `window.prompt()`. Dashboard uses `alert()`. Onboarding uses inline success/error messages. Need one pattern. |

---

## 4. Information Architecture

### Navigation structure

```
Header:  [Overlay Bets]  Tipsters | Free tips | Betting Calculator | Content & News ▾ | About ▾  [🔍] [Sign in] [Get started] [🌓]
                                                                        ├─ Content              ├─ How it works
                                                                        └─ News                 └─ Support Center

Footer:  Product          Company         Resources        Legal
         ├─ Tipsters      ├─ About        ├─ Support       ├─ Terms
         ├─ Free tips     ├─ How it works ├─ Content       ├─ Privacy
         └─ Calculator    └─ Newsletter   └─ News          └─ Responsible Gambling
```

**What works:**
- Header groups content logically. The "About" dropdown nesting "How it works" + "Support Center" is sensible.
- Footer mirrors header structure with additional legal links.
- Conditional nav items (Dashboard, Admin) based on role — good progressive disclosure.
- Mobile nav collapses into hamburger with flattened dropdowns (section headings instead of hover overlays) — smart for touch.
- Search is accessible from every page via header icon.

**What doesn't:**
- **"Content & News" dropdown** is a weak label. Users don't think in CMS categories. Consider "Learn" or "Blog" as the parent.
- **No breadcrumbs** anywhere. Deep pages (`/tipsters/[id]`, `/blog/[slug]`, `/legal/terms`) lose positional context. The "← Back" links help but aren't systematic.
- **Dashboard link** only appears when logged in. Logged-out users can't preview what they'll get — no "see a demo dashboard" path.
- **Footer "How it works"** links to `/how-it-works` but header "How it works" links to `/about`. Both pages exist but with different content. Confusing.

---

## 5. Trust Signals

**This is a gambling-adjacent platform where trust is the product.** The trust architecture is surprisingly strong for an MVP.

### Strong trust signals ✅

| Signal | Where | Notes |
|--------|-------|-------|
| **"Locked before kickoff"** messaging | Home, About, How It Works, Support FAQ | Appears on nearly every page. The cryptographic integrity story is well-told. |
| **Closing Line Value (CLV)** | Leaderboard, profiles, performance dashboard | CLV as an anti-luck metric is explained and prominent. Differentiator vs. screenshot-based competitors. |
| **"No edits, no fake wins"** | Home hero, About | Direct attack on industry fraud. |
| **Transparent fee disclosure** | Support FAQ ("25% platform fee"), Earnings page | Not hidden in T&Cs. |
| **Legal compliance** | Terms, Privacy, Responsible Gambling pages | Proper disclaimers, harm-reduction resources, age-gate messaging. |
| **Verification system** | Onboarding wizard, tipster profiles | ID upload + social links → trust badge. Explained on profiles. |
| **Audit log** | Admin | Every role change, void, and moderation action is logged. |
| **WhatsApp contact** | Global floating button | Immediacy signal — "real humans respond." |
| **Cookie consent** | Global banner | `role="dialog"`, `aria-live="polite"`, reject/accept options. |

### Trust gaps ⚠️

| Gap | Impact | Fix |
|-----|--------|-----|
| **No hash/proof display on picks** | Users can't independently verify immutability claims | Show the SHA-256 hash + timestamp on settled picks. Even if users don't verify it, *showing* it builds trust. |
| **No "About the team" section** | Anonymous operators = suspicious in gambling | Add founder/team credibility on `/about`. Even pseudonymous with track records. |
| **No regulatory statement** | Common question for betting platforms | Add jurisdiction/regulatory status (even if "unregulated information service") to Terms + About. |
| **Privacy policy link missing from signup** | GDPR expectation; trust signal at point of data capture | Add "By signing up you agree to our Terms and Privacy Policy" with links. |
| **Post-checkout dead end** | Trust peaks at payment → wasted | Celebrate with next steps, first-pick preview, tipster welcome message. |
| **No SSL/security visual** | Forms don't show security indicators | "🔒 Secured by Stripe" on checkout, "Your data is encrypted" on auth forms. |

---

## 6. Accessibility

### What's been done well

- **Skip link** in `layout.tsx` — visible on focus, styled properly.
- **`:focus-visible` global rule** — 2px solid outline on all interactive elements.
- **`prefers-reduced-motion`** — transitions disabled.
- **`ThemeToggle`** — `aria-pressed`, `aria-label`, mounted-only rendering to prevent SSR mismatch.
- **`CookieConsent`** — `role="dialog"`, `aria-live="polite"`, `aria-label`.
- **`Flag`** — `role="img"`, `aria-label` with country name.
- **`FollowButton`** — `aria-pressed`.
- **`SiteHeader`** — hamburger has `aria-expanded`, `aria-controls`, `aria-label`.
- **Footer nav** — `aria-label` on each `<nav>` section.
- **`overflow-x: clip`** instead of `hidden` — preserves `position: sticky`.

### Critical accessibility issues

| Issue | Severity | Where | Details |
|-------|----------|-------|---------|
| **No `<label>` elements on form inputs** | 🔴 Critical | Login, signup, forgot-password, reset-password, choose-username, all admin forms | Every input uses `placeholder` as its only label. Placeholders disappear on focus and are not announced by all screen readers. WCAG 1.3.1 failure. |
| **Error messages not announced** | 🔴 Critical | All forms | No `aria-live="assertive"` region, no `aria-invalid`, no `aria-describedby` linking errors to inputs. Screen reader users won't know submission failed. |
| **No `aria-current="page"`** | 🟡 Moderate | SiteHeader nav links | Active page not indicated for screen readers. |
| **Tables lack `<th scope>`** | 🟡 Moderate | Tipsters, admin tables | Data tables without proper header scope are unusable with screen readers. |
| **Loading states not announced** | 🟡 Moderate | All async pages | No `aria-busy` on buttons during submission, no status announcements. |
| **Admin uses `window.prompt()`** | 🟡 Moderate | Admin settlements, users | Not keyboard-trappable, not announced, not styled. Should be inline form or modal. |
| **SVG charts have no `aria-label`** | 🟡 Moderate | PerformanceDashboard, CLV chart | `role="img"` without descriptive alt text. |
| **Color-only status indication** | 🟡 Moderate | Feed, dashboard, earnings | Won (green) / lost (red) relies solely on color. Need text labels or icons too (they exist but inconsistently). |

### Quick wins for OB-015

1. Add `<label>` elements to every form input (keep them visually hidden with `.sr-only` if design requires placeholder-style).
2. Wrap error messages in `<div role="alert">`.
3. Add `aria-invalid="true"` + `aria-describedby="error-{field}"` to invalid inputs.
4. Add `aria-busy="true"` to submit buttons during loading.

---

## 7. Mobile / Responsive

### What's been done

- **Header** collapses to hamburger at `720px` with flattened dropdowns.
- **Footer** grid stacks to single column below `768px`.
- **Tipsters layout** switches from 2-column (main + sidebar) to single column at `900px`.
- **Mobile padding** reduced at `640px` via `!important` override.
- **Heading size** clamped via `clamp(1.6rem, 7vw, 2.1rem)` on mobile.
- **Tables** get horizontal scroll on mobile (`display: block; overflow-x: auto`).
- **`overflow-x: clip`** on `html, body` prevents horizontal scroll from stray elements.
- **WhatsApp label** hidden on touch devices (`@media (hover: none)`).
- **Cards** use `auto-fit` grids that naturally collapse.

### Responsive concerns

| Issue | Where | Details |
|-------|-------|---------|
| **Leaderboard row data density** | Home page, `/tipsters` | On narrow screens, rows show rank + avatar + name + CLV + picks + yield — too much for <375px. CLV and picks columns should stack or hide. |
| **Dashboard stat cards** | `/dashboard` | `minmax(160px, 1fr)` grid works, but action button row (6 buttons) wraps unpredictably on mid-width screens. |
| **Onboarding form inputs** | `/onboarding` | Phone dial-code select + number input side-by-side — doesn't stack on narrow screens (uses `flex-wrap: wrap` but the dial-code select is wide enough to prevent wrapping). |
| **Admin pages** | `/admin/*` | Not responsive at all — tables, forms, and metric grids assume desktop width. Admin is lower priority but would benefit from basic stacking. |
| **No mobile-specific touch targets** | Global | Button heights are `0.6rem` padding (≈38px total). WCAG minimum is `44px`. `btn--sm` at `0.4rem` padding is even smaller (~30px). |

---

## 8. Missing Design Elements

### Must-have (blocks launch)

| Element | Why | Related issue |
|---------|-----|---------------|
| **Form labels** | WCAG compliance, screen reader usability | OB-015 |
| **Error announcement pattern** | Form errors invisible to assistive tech | OB-015 |
| **Post-checkout next steps** | `/subscribe/success` is a dead end — kills conversion momentum | OB-014 |
| **Empty states** | Dashboard, feed, subscriptions show nothing for new users — confusing | OB-014 |
| **Pick confirmation modal** | Tipsters submit irreversible picks with no "are you sure?" | OB-022 |

### Should-have (v1 quality)

| Element | Why | Related issue |
|---------|-----|---------------|
| **Shared Card, Table, Badge components** | Prevent visual drift, speed up page development | OB-016 |
| **Toast/notification system** | Replace `alert()` calls and scattered inline messages | OB-016 |
| **Loading skeleton/shimmer** | Pages flash empty then populated — shimmer would feel faster | OB-016 |
| **Type scale** | Heading sizes are arbitrary; define a modular scale | OB-016 |
| **Spacing scale** | Padding/margins are arbitrary values; adopt an 8px grid | OB-016 |
| **Breadcrumbs** | Deep pages lose context | OB-015 |
| **Privacy policy link on signup** | Trust + legal compliance | OB-155 |
| **Livescores page** | Drives engagement and return visits | OB-151 |

### Nice-to-have (post-v1)

| Element | Why |
|---------|-----|
| **Storybook** | Component documentation for the growing design system |
| **Social login** (Google, X) | Reduces signup friction |
| **Onboarding checklist overlay** | "Complete your profile" persistent widget for new tipsters |
| **Tipster comparison** | Side-by-side comparison of 2-3 tipsters before subscribing |
| **Micro-animations** | Subtle celebrations on subscription, pick lock, milestone badges |

---

## 9. Top UX Recommendations

Ranked by impact × effort. These are the changes that would most improve the user experience.

### 1. Fix form accessibility (OB-015) — 🔴 Critical

Add `<label>` elements, `aria-live` error regions, and `aria-invalid` to every form. This isn't optional — it's a legal and ethical requirement. The `formStyles.ts` pattern should be replaced with a `<FormField>` component that handles label, input, error, and help text with proper ARIA wiring. **Every form in the app is affected.**

### 2. Build 5 core components (OB-016) — 🟡 High

Extract `Card`, `StatusBadge`, `StatCard`, `DataTable`, and `FormField` from existing inline patterns. These 5 components cover ~80% of the visual surface. The CSS variable layer is ready — this is a refactor, not a redesign.

### 3. Design the post-checkout experience — 🟡 High

`/subscribe/success` should show: tipster name + avatar, "Your first picks will appear in your feed", link to `/feed`, link to the tipster's profile, and a "Browse more tipsters" secondary CTA. This is where emotional investment peaks — capture it.

### 4. Add empty states and first-run guidance (OB-014) — 🟡 High

New bettors see an empty dashboard and empty feed. New tipsters see an empty picks list. Each empty state should explain what goes here and provide a single clear CTA: "Browse tipsters →", "Submit your first pick →".

### 5. Harden pick submission UX (OB-022) — 🟡 High

Add market-specific input fields (1X2, spread, totals), odds format toggle (decimal/fractional/American), event search/autocomplete, stake input with unit label, and a confirmation modal showing "This pick will be permanently locked. Review before submitting."

### 6. Create a notification/toast system — 🟢 Medium

Replace all `alert()`, `window.prompt()`, and scattered inline success/error messages with a consistent toast pattern. Stack bottom-right, auto-dismiss after 4s, dismissable, accessible (`role="alert"`).

### 7. Normalize container widths — 🟢 Medium

Define 3-4 content widths: `narrow` (640px for articles/forms), `medium` (900px for dashboards), `wide` (1100px for marketplace/tables), `full` (100% for landing sections). Apply via utility classes.

### 8. Fix the /about → /how-it-works confusion — 🟢 Medium

Two pages cover overlapping content with different depths. Merge into one `/about` page with sections, or clearly differentiate: `/about` = mission + team, `/how-it-works` = technical process. Fix the inconsistent footer/header links.

### 9. Add hash/proof display on settled picks — 🟢 Medium

Show the SHA-256 hash + lock timestamp on every settled pick. This is the product's core differentiator and it's currently invisible to users. Even a collapsed "Verify this pick" section with the hash would massively boost credibility.

---

## Backlog Cross-Reference

| OB Issue | Priority | Design Review Finding |
|----------|----------|-----------------------|
| **OB-010** | P0 | Marketplace exists and works. Needs: search, live filtering, card view option. |
| **OB-011** | P0 | Profile page exists. Needs: hash explainer, better CLV chart, paywall preview. |
| **OB-012** | P0 | Feed exists and works. Needs: clear filters, sort options, better empty state. |
| **OB-013** | P1 | Subscriptions page exists with feedback system. Needs: expiry warning UX polish. |
| **OB-014** | P2 | **No empty states or first-run guidance anywhere. Upgrade to P1.** |
| **OB-015** | P1 | **Form a11y is critically broken. Upgrade to P0.** |
| **OB-016** | P2 | Component library not started. Should be P1 — everything else goes faster with it. |
| **OB-020** | P1 | Wizard exists and is solid. Needs: searchable selects, sports autocomplete. |
| **OB-022** | P1 | Pick form is bare-minimum. Market-specific inputs + confirmation modal needed. |
| **OB-023** | P1 | PerformanceDashboard component exists. Charts need labels/tooltips. |
| **OB-024** | P1 | Earnings page exists. Needs: currency labels, confirmation on payout settings. |
| **OB-025** | P1 | Admin dashboard exists. Needs: CSS variable adoption, responsive layout. |
| **OB-150** | P1 | Tips hub exists with date navigation. Clean. |
| **OB-152** | P2 | Odds calculator exists. Functional. |
| **OB-154** | P1 | About page exists with trust pillars. Needs: team section, illustrations. |

---

## Summary

The UI is *functional and coherent* — far better than most MVPs at this stage. The CSS variable system, theme toggle, and onboarding wizard show real design thinking. But the product claims are about *trust and verification*, and the UX doesn't yet *prove* those claims to users. The hash is invisible, the post-checkout experience is dead, and form accessibility is broken.

**Priority stack:**
1. ✅ Fix form accessibility (OB-015) — legal requirement
2. ✅ Extract 5 core components (OB-016) — velocity multiplier
3. ✅ Post-checkout + empty states (OB-014) — conversion impact
4. ✅ Pick submission UX (OB-022) — core product quality
5. ✅ Hash/proof visibility — trust differentiator

The design language is ready. The design *system* needs to be built.

— Livingston
