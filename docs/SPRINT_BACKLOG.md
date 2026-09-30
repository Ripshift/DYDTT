# DYDTT Phase 1 — Sprint Backlog

**Sprint cadence:** 2 weeks
**Sprint 1 start:** 2026-09-28
**Sprint 1 end:** 2026-10-09
**Sprint 1 goal:** Working offline day-view with swipe navigation, task CRUD persisted in
IndexedDB, burger menu opening the modal, and the PWA installable on Android + iOS Safari.

---

## Velocity & Points

| Story type | Point scale |
|---|---|
| Spike / research | 1-2 |
| UI component simple | 1-3 |
| UI component complex | 3-5 |
| Data layer / offline | 2-5 |
| Integration / E2E | 2-4 |
| Infrastructure | 1-3 |

**Sprint 1 capacity:** 40 points (2 devs x 10 days x ~2 pt/day)

---

## Sprint 1 Stories

### INFRA — Project Scaffolding

| ID | Story | Points | Status | Assignee |
|---|---|---|---|---|
| S1-01 | Set up Vite project with pnpm, ESLint, Prettier, Vitest | 2 | TODO | — |
| S1-02 | Integrate vite-plugin-pwa (Workbox), confirm SW registers | 2 | TODO | — |
| S1-03 | Storybook 8 + addon-a11y running locally | 2 | TODO | — |
| S1-04 | CI pipeline: GitHub Actions — lint, test, Storybook build | 2 | TODO | — |
| S1-05 | Design tokens + CSS starter imported into Storybook preview | 1 | TODO | — |

**Sub-total: 9 pts**

---

### DATA — Dexie / IndexedDB Layer

| ID | Story | Points | Status | Assignee |
|---|---|---|---|---|
| S1-06 | Implement schema.js — all 5 tables, helpers, openDb() | 3 | TODO | — |
| S1-07 | Implement seed.js — idempotent dev seed with pnpm seed | 2 | TODO | — |
| S1-08 | Unit tests for upsertTask, getTasksForDate, getWeeklySummary | 2 | TODO | — |
| S1-09 | Unit tests for settings helpers getSetting, setSetting | 1 | TODO | — |

**Sub-total: 8 pts**

---

### UI — Core Components

| ID | Story | Points | Status | Assignee |
|---|---|---|---|---|
| S1-10 | BurgerMenu.js — renders, animates, manages aria-expanded | 2 | TODO | — |
| S1-11 | Modal.js — 3-tab modal with focus trap | 5 | TODO | — |
| S1-12 | TaskItem.js — renders, checkbox toggle, priority indicator | 3 | TODO | — |
| S1-13 | DayView.js — day header, empty state, task list | 3 | TODO | — |
| S1-14 | SwipeController.js — touch events, L/R swipe, keyboard fallback | 5 | TODO | — |

**Sub-total: 18 pts**

---

### PWA — Manifest & Install

| ID | Story | Points | Status | Assignee |
|---|---|---|---|---|
| S1-15 | manifest.json validated, all icon sizes present | 2 | TODO | — |
| S1-16 | Install app prompt surfaced via beforeinstallprompt | 2 | TODO | — |
| S1-17 | iOS meta tags — apple-touch-icon, splash screens | 1 | TODO | — |

**Sub-total: 5 pts**
**Sprint 1 total: ~40 pts**

---

## Sprint 2 Preview (2026-10-12 to 2026-10-23)

**Sprint 2 goal:** Week grid overlay, reduced-motion support, task add/edit flow wired
to Dexie, push permission flow + local reminders.

| ID | Story | Points |
|---|---|---|
| S2-01 | WeekGrid.js — 3x3 grid, today highlight, pinch-zoom passthrough | 5 |
| S2-02 | Task add flow in modal wired to upsertTask | 4 |
| S2-03 | Task delete with confirmation toast and undo | 3 |
| S2-04 | Reduced-motion toggle wired to IDB setting | 2 |
| S2-05 | SwipeHint dots component | 2 |
| S2-06 | Push permission flow UI in Settings tab | 3 |
| S2-07 | scheduleTaskReminder wired to task reminder time | 3 |
| S2-08 | DayView skeleton loading state shimmer | 2 |
| S2-09 | Toast notification system success/error/info | 2 |
| S2-10 | Accessibility audit pass — axe-core 0 violations AA | 3 |
| S2-11 | Offline smoke tests — Playwright + DevTools SW intercept | 3 |

**Sprint 2 total: ~32 pts**

---

## Sprint 3 Preview (2026-10-26 to 2026-11-06)

**Sprint 3 goal:** SW background sync, push testing matrix all-green,
Lighthouse PWA 100, final Phase 1 QA pass, production deploy.

| ID | Story | Points |
|---|---|---|
| S3-01 | Background Sync — flush syncQueue on reconnect | 5 |
| S3-02 | SW update banner Refresh to update | 2 |
| S3-03 | Web Push E2E — all 93 scenarios in push testing matrix | 4 |
| S3-04 | Lighthouse PWA audit — score 100 | 3 |
| S3-05 | Cross-browser smoke test Chrome, Safari, Firefox, Edge | 3 |
| S3-06 | Screen reader test VoiceOver, TalkBack, NVDA | 3 |
| S3-07 | Production build + deploy to Vercel / Cloudflare Pages | 2 |
| S3-08 | Performance budget gate LCP < 1.5 s on 4G throttle | 3 |

**Sprint 3 total: ~25 pts**

---

## Icebox (Post-Phase 1 / Phase 2 gate)

| Theme | Item |
|---|---|
| Backend | REST API for cross-device sync |
| Auth | Magic-link / passkey login |
| Sharing | Share task list via URL |
| Widgets | iOS/Android home screen widget |
| Themes | Light mode, high-contrast mode |
| Repeating tasks | Recurrence rules daily/weekly/custom |
| Tags | Tag filter + search |
| Drag-to-reorder | Reorder tasks within a day |
| Mood tracking | Day mood emoji 1-5 |
| Export | CSV / iCal export |
| Framework | Evaluate React / Svelte migration |
