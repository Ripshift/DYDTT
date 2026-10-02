# DYDTT — Do Your Daily Tasks Today · Phase 1 PWA

> **Status:** Pre-development kickoff · Sprint 1 starts immediately after this handoff
> **Stack:** Vanilla JS (ES2022) · Vite · Dexie.js · Workbox · Web Push API · Storybook
> **Target:** Mobile-first (square viewport philosophy), installable PWA, offline-first

---

## Table of Contents

1. [Product Vision](#product-vision)
2. [Architecture Overview](#architecture-overview)
3. [Design System](#design-system)
4. [Folder Structure](#folder-structure)
5. [Getting Started](#getting-started)
6. [PWA & Offline Strategy](#pwa--offline-strategy)
7. [Accessibility Contract](#accessibility-contract)
8. [Testing Strategy](#testing-strategy)
9. [Sprint 1 Scope](#sprint-1-scope)
10. [Contributing](#contributing)

---

## Product Vision

DYDTT is a square-first, ultrahigh-end daily task manager PWA. The visual language is
grey + gold + purple — muted luxury, not garish colour. The UX surface is deliberately
minimal: one burger menu, no other chrome buttons visible, and all navigation is gestural
(swipe left/right for days, scroll for tasks). The weekly overview is the "9 Day" view: a 3x3
grid of the surrounding days above the selected day's tasks, chosen in the Display tab.

### Core Phase 1 Features

| Feature | Interaction |
|---|---|
| Day view | Swipe L/R to navigate days |
| Task list | Scroll vertically within the day |
| Views | Settings → View: 1 Day, 48 Hour (today + tomorrow), 9 Day (3x3 grid + tasks) |
| Reminders | In-app reminder card while open; optional system notifications (Settings) |
| Burger menu | Single hamburger top-right; opens Edit / Settings / Logout modal |
| Edit/Settings/Logout | Single modal, tabbed |
| Reduced motion | System preference honoured + in-app toggle |
| Offline | Full offline read/write via IndexedDB (Dexie) |
| Push notifications | Web Push when the app is closed — planned (needs server) |

---

## Architecture Overview

Browser
  Service Worker (Workbox)
    Cache-first: shell, assets, fonts
    Network-first: API calls (future)
    Background Sync: pending writes
  App Shell (Vanilla JS / Vite)
    Router (hash-based, no server deps)
    State (observable store, no framework)
    Dexie.js -> IndexedDB
    Web Push client stubs

No framework in Phase 1. Lightweight observable store pattern only.
Framework migration (React/Svelte) is a Phase 2 decision gate.

---

## Design System

Full token reference lives in src/styles/tokens.css.
Storybook component library lives in src/stories/.

### Palette Roles

| Token | Value | Usage |
|---|---|---|
| --color-bg-base | #141414 | App background |
| --color-bg-surface | #1E1E1E | Cards, modals |
| --color-bg-raised | #272727 | Hover states |
| --color-gold-400 | #C9A84C | Primary accent |
| --color-gold-300 | #E2C97E | Hover gold |
| --color-purple-500 | #7B5EA7 | Secondary accent |
| --color-grey-100 | #F5F5F5 | Primary text |
| --color-grey-300 | #BDBDBD | Secondary text |
| --color-danger | #C0392B | Red X, delete |

---

## Folder Structure

dydtt-phase1/
  public/
    manifest.json
    icons/
    sw.js
  src/
    main.js
    router.js
    store.js
    db/
      schema.js
      seed.js
    push/
      client.js
      reminders.js
      vapid.js
    components/
      BurgerMenu.js
      DayView.js
      FortyEightHourView.js
      WeekGridView.js
      TaskItem.js
      Modal.js
      SwipeController.js
    styles/
      tokens.css
      reset.css
      base.css
      layout.css
      components.css
      animations.css
    utils/
      dateHelpers.js
      motionPrefs.js
      a11y.js
      sw.js
      toast.js
    stories/
      BurgerMenu.stories.js
      WeekGridView.stories.js
      TaskItem.stories.js
      Modal.stories.js
  .storybook/
    main.js
    preview.js
  tests/
    push-matrix.md
    setup.js
  docs/
    SPRINT_BACKLOG.md
    QA_CHECKLIST.md
  vite.config.js
  package.json
  README.md

---

## Getting Started

### Prerequisites

- Node.js >= 20 LTS
- pnpm >= 9 (or npm >= 10)
- A modern browser (Chrome 120+, Firefox 121+, Safari 17.2+)

### Install & Run

  git clone https://github.com/your-org/dydtt-phase1.git
  cd dydtt-phase1
  pnpm install
  pnpm dev        # http://localhost:5173
  pnpm storybook  # http://localhost:6006
  pnpm build
  pnpm preview

### Environment Variables

Create .env.local (never commit):

  VITE_VAPID_PUBLIC_KEY=your_vapid_public_key_here
  VITE_PUSH_ENDPOINT=https://your-push-server.example.com

---

## PWA & Offline Strategy

| Scenario | Behaviour |
|---|---|
| First load (online) | Shell + assets cached via Workbox precache |
| Return visit (online) | Cache-first for shell; stale-while-revalidate for data |
| Offline | Full app operational; writes queue via Background Sync |
| Push received offline | Notification shown via SW; task reminder stored in IDB |
| SW update | Silent update with Refresh to update banner |

---

## Accessibility Contract

- WCAG 2.2 AA minimum across all components
- prefers-reduced-motion: all transitions disabled or replaced with instant cuts
- In-app reduced-motion toggle stored in Dexie settings table
- Focus trap in burger modal (Tab / Shift+Tab cycles within)
- aria-live polite region for task CRUD confirmations
- All swipe gestures have keyboard equivalents (Arrow L/R for day nav)
- Minimum touch target: 44x44 CSS px
- Colour contrast: gold on dark bg >= 4.5:1, grey-100 on bg-base >= 7:1
- Screen reader tested: VoiceOver iOS, TalkBack Android, NVDA Windows

---

## Testing Strategy

| Layer | Tool | Coverage target |
|---|---|---|
| Unit | Vitest | >= 80% for utils, store, db |
| Component | Storybook play() | All interactive states |
| Integration | Playwright | Critical user flows |
| Push E2E | Push Testing Matrix | All 93 scenarios |
| Accessibility | axe-core + manual | 0 violations AA |
| Offline | Playwright + SW mock | 5 offline scenarios |

---

## Sprint 1 Scope

See docs/SPRINT_BACKLOG.md for full story breakdown.

Sprint 1 goal: Working offline day-view with swipe navigation, task CRUD stored in
IndexedDB, burger menu opening modal, and PWA installable on Android + iOS.

---

## Contributing

1. Branch from main using feature/GH-issue-number-short-description
2. Each PR must reference a GitHub issue and pass all CI checks
3. Storybook story required for every new UI component
4. Run pnpm lint && pnpm test before pushing
5. Accessibility review required on any PR touching interactive components

---

DYDTT Phase 1 - Handoff package generated 2026-09-25
