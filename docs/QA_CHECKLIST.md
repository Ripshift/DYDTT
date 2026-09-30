# DYDTT Phase 1 — QA Checklist

**Version:** Phase 1 · Sprint 3 Sign-off
**Last updated:** 2026-09-25
**Format:** [ ] = Not tested · [x] = Pass · [F] = Fail · [N/A] = Not applicable

---

## 1. Installation & PWA

| # | Check | Android Chrome | iOS Safari | Desktop Chrome | Desktop Edge |
|---|---|---|---|---|---|
| 1.1 | App installs via Add to Home Screen prompt | [ ] | [ ] | [ ] | [ ] |
| 1.2 | Installed app opens in standalone mode | [ ] | [ ] | [ ] | [ ] |
| 1.3 | Splash screen shows app name + icon (no white flash) | [ ] | [ ] | N/A | N/A |
| 1.4 | App icon appears on home screen at correct size | [ ] | [ ] | [ ] | [ ] |
| 1.5 | Maskable icon fills adaptive icon shape correctly | [ ] | N/A | N/A | N/A |
| 1.6 | Lighthouse PWA audit score = 100 | [ ] | N/A | [ ] | [ ] |
| 1.7 | manifest.json loads with correct MIME type | [ ] | [ ] | [ ] | [ ] |
| 1.8 | Service Worker registers without error in DevTools | [ ] | [ ] | [ ] | [ ] |
| 1.9 | SW update banner appears after deploying a new build | [ ] | [ ] | [ ] | [ ] |
| 1.10 | Refresh to update banner click reloads and activates new SW | [ ] | [ ] | [ ] | [ ] |

---

## 2. Offline Behaviour

| # | Check | Android Chrome | iOS Safari | Desktop Chrome |
|---|---|---|---|---|
| 2.1 | App loads fully with DevTools Network Offline checked | [ ] | [ ] | [ ] |
| 2.2 | Day view renders existing tasks when offline | [ ] | [ ] | [ ] |
| 2.3 | New task created offline is written to IndexedDB immediately | [ ] | [ ] | [ ] |
| 2.4 | Task completed offline persists after page reload | [ ] | [ ] | [ ] |
| 2.5 | Task deleted offline is removed from IDB after page reload | [ ] | [ ] | [ ] |
| 2.6 | Sync status indicator shows pending when offline writes exist | [ ] | [ ] | [ ] |
| 2.7 | Background Sync flushes syncQueue when connectivity restored | [ ] | [ ] | [ ] |
| 2.8 | No JavaScript console errors thrown in offline mode | [ ] | [ ] | [ ] |
| 2.9 | Week grid loads cached task counts when offline | [ ] | [ ] | [ ] |
| 2.10 | No blank screens when toggling offline repeatedly | [ ] | [ ] | [ ] |

---

## 3. Day View & Swipe Navigation

| # | Check | Notes |
|---|---|---|
| 3.1 | Swipe left navigates to next day | |
| 3.2 | Swipe right navigates to previous day | |
| 3.3 | Swipe animation runs at 60 fps | |
| 3.4 | Day header updates to correct date after each swipe | |
| 3.5 | Task list for new day loads from IDB within 100 ms | |
| 3.6 | Arrow Right key navigates to next day | |
| 3.7 | Arrow Left key navigates to previous day | |
| 3.8 | Swipe threshold >= 50 px required to trigger navigation | |
| 3.9 | Sub-threshold swipe snaps back to current day | |
| 3.10 | Rapid successive swipes do not desync day counter | |
| 3.11 | Swipe dots reflect current day position accurately | |
| 3.12 | Vertical scroll does not trigger day swipe | |
| 3.13 | Empty state message shown when day has zero tasks | |

---

## 4. Task CRUD

| # | Check | Notes |
|---|---|---|
| 4.1 | Add task via modal appears in day list immediately | |
| 4.2 | Task title required; save blocked if empty | |
| 4.3 | Task title <= 255 chars; truncates gracefully in list | |
| 4.4 | Edit task changes persist after modal close | |
| 4.5 | Delete task confirmation shown before removal | |
| 4.6 | Delete task removed from IDB | |
| 4.7 | Undo delete toast appears for 5 s after deletion | |
| 4.8 | Undo delete restores task within 5 s window | |
| 4.9 | Checkbox tap marks task done in IDB | |
| 4.10 | Done tasks render with strikethrough + reduced opacity | |
| 4.11 | Re-checking a done task unmarks it correctly | |
| 4.12 | Task updatedAt timestamp updates on every edit | |
| 4.13 | Task order is respected for list rendering | |

---

## 5. Burger Menu & Modal

| # | Check | Notes |
|---|---|---|
| 5.1 | Burger button visible and tappable in all viewports | |
| 5.2 | Burger to X animation completes without glitch | |
| 5.3 | aria-expanded toggles correctly on burger button | |
| 5.4 | Modal opens from bottom with slide-up animation | |
| 5.5 | Modal overlay darkens background correctly | |
| 5.6 | Focus moves to first focusable element inside modal on open | |
| 5.7 | Tab key cycles through modal elements only (focus trap) | |
| 5.8 | Shift+Tab cycles backwards within modal | |
| 5.9 | Escape key closes the modal | |
| 5.10 | Edit tab active and visible by default | |
| 5.11 | Settings tab switches without delay or visual artifacts | |
| 5.12 | Logout tab shows confirmation text and sign-out button | |
| 5.13 | Modal close returns focus to burger button | |
| 5.14 | No burger button other than the single top-right instance | |
| 5.15 | No other visible chrome buttons present in day view | |

---

## 6. Weekly 3x3 Grid

| # | Check | Notes |
|---|---|---|
| 6.1 | Week grid opens from menu entry | |
| 6.2 | 9 cells rendered, days -4 to +4 relative to today | |
| 6.3 | Today cell highlighted with gold border and pulse | |
| 6.4 | Task dot counts match IDB data for each day | |
| 6.5 | Done task dots render in success colour | |
| 6.6 | Tapping a cell navigates to that day | |
| 6.7 | Pinch-to-zoom gesture does not break grid layout | |
| 6.8 | Red X button dismisses grid (only dismiss mechanism) | |
| 6.9 | aria-label on each cell describes day + task counts | |
| 6.10 | Grid overlay blocks interaction with day view behind it | |
| 6.11 | Grid opens/closes with smooth animation | |
| 6.12 | No other exit button visible besides red X | |

---

## 7. Accessibility (WCAG 2.2 AA)

| # | Check | Tool | Notes |
|---|---|---|---|
| 7.1 | axe-core: 0 violations on Day View | axe DevTools | |
| 7.2 | axe-core: 0 violations on Week Grid | axe DevTools | |
| 7.3 | axe-core: 0 violations on Modal (all 3 tabs) | axe DevTools | |
| 7.4 | Colour contrast >= 4.5:1 gold text on dark bg | Colour Contrast Analyser | |
| 7.5 | Colour contrast >= 7:1 grey-100 on bg-base | Colour Contrast Analyser | |
| 7.6 | All touch targets >= 44x44 CSS px | Manual + DevTools | |
| 7.7 | VoiceOver iOS: full day view navigable by swipe | Manual | |
| 7.8 | VoiceOver iOS: task checkbox announces state change | Manual | |
| 7.9 | TalkBack Android: day view readable with gestures | Manual | |
| 7.10 | NVDA Windows: modal focus trap works correctly | Manual | |
| 7.11 | prefers-reduced-motion: all animations disabled | DevTools emulation | |
| 7.12 | In-app reduced-motion toggle disables all transitions | Manual | |
| 7.13 | In-app toggle state persists after page reload | Manual | |
| 7.14 | Skip-to-content link appears on first Tab press | Manual | |
| 7.15 | No keyboard trap outside intentional modal focus lock | Manual | |
| 7.16 | aria-live region announces task add/complete/delete | Screen reader | |

---

## 8. Performance

| # | Check | Target | Tool |
|---|---|---|---|
| 8.1 | Largest Contentful Paint (LCP) | < 1.5 s on 4G | Lighthouse |
| 8.2 | First Contentful Paint (FCP) | < 0.8 s | Lighthouse |
| 8.3 | Total Blocking Time (TBT) | < 200 ms | Lighthouse |
| 8.4 | Cumulative Layout Shift (CLS) | < 0.1 | Lighthouse |
| 8.5 | JS bundle initial | < 80 kB gzipped | Vite build |
| 8.6 | CSS bundle initial | < 20 kB gzipped | Vite build |
| 8.7 | IDB read getTasksForDate | < 10 ms p95 | Performance panel |
| 8.8 | IDB write upsertTask | < 20 ms p95 | Performance panel |
| 8.9 | Swipe animation frame rate | >= 58 fps | Chrome FPS meter |
| 8.10 | App interactive after cold start | < 2 s mid-range Android | Manual |

---

## 9. Cross-Browser Compatibility

| # | Check | Chrome 128 | Safari 18 | Firefox 130 | Edge 128 |
|---|---|---|---|---|---|
| 9.1 | App installs where supported | [ ] | [ ] | N/A | [ ] |
| 9.2 | Swipe navigation works | [ ] | [ ] | [ ] | [ ] |
| 9.3 | IndexedDB CRUD works | [ ] | [ ] | [ ] | [ ] |
| 9.4 | Service Worker registers | [ ] | [ ] | [ ] | [ ] |
| 9.5 | CSS tokens render correctly | [ ] | [ ] | [ ] | [ ] |
| 9.6 | Animations run without FOUC | [ ] | [ ] | [ ] | [ ] |
| 9.7 | Push permission flow shows | [ ] | [ ] | [ ] | [ ] |

---

## 10. Security

| # | Check | Notes |
|---|---|---|
| 10.1 | App served over HTTPS in production | |
| 10.2 | Content-Security-Policy header set | |
| 10.3 | VAPID private key never in client bundle | |
| 10.4 | No sensitive data logged to console in production | |
| 10.5 | IDB data not readable by other origins | |
| 10.6 | SW scope restricted to app origin | |

---

## Sign-Off Table

| Role | Name | Device | OS | Browser | Date | Signature |
|---|---|---|---|---|---|---|
| Dev QA | | | | | | |
| Product | | | | | | |
| A11y reviewer | | | | | | |
| Release approver | | | | | | |
