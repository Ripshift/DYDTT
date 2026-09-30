# DYDTT Phase 1 — Push Notification Testing Matrix

**Total scenarios:** 93
**Last updated:** 2026-09-28
**Format:** [ ] = Not tested · [x] = Pass · [F] = Fail · [N/A] = Not applicable

---

## 1. Permission Flow (12 scenarios)

| # | Scenario | Android Chrome | iOS Safari | Desktop Chrome | Desktop Edge |
|---|---|---|---|---|---|
| 1.1  | First visit — browser permission prompt shown | [ ] | [ ] | [ ] | [ ] |
| 1.2  | User grants permission — subscription created | [ ] | [ ] | [ ] | [ ] |
| 1.3  | User denies permission — graceful fallback UI | [ ] | [ ] | [ ] | [ ] |
| 1.4  | User dismisses prompt — re-prompted after 24h | [ ] | [ ] | [ ] | [ ] |
| 1.5  | Permission denied — settings toggle disabled | [ ] | [ ] | [ ] | [ ] |
| 1.6  | Permission granted — subscription sent to server | [ ] | [ ] | [ ] | [ ] |
| 1.7  | Permission revoked in browser — app detects on next visit | [ ] | [ ] | [ ] | [ ] |
| 1.8  | Permission re-granted after revoke — re-subscribes | [ ] | [ ] | [ ] | [ ] |
| 1.9  | In-app toggle off — unsubscribes from push | [ ] | [ ] | [ ] | [ ] |
| 1.10 | In-app toggle on — re-subscribes | [ ] | [ ] | [ ] | [ ] |
| 1.11 | VAPID key missing — permission flow skipped silently | [ ] | [ ] | [ ] | [ ] |
| 1.12 | SW not registered — subscribe returns null gracefully | [ ] | [ ] | [ ] | [ ] |

---

## 2. Subscription Lifecycle (8 scenarios)

| # | Scenario | Result | Notes |
|---|---|---|---|
| 2.1 | subscribeToPush returns valid PushSubscription object | [ ] | |
| 2.2 | serialiseSubscription produces correct endpoint + keys | [ ] | |
| 2.3 | validateVapidKey passes on valid 87-char key | [ ] | |
| 2.4 | validateVapidKey fails on short/malformed key | [ ] | |
| 2.5 | Existing subscription returned without re-subscribing | [ ] | |
| 2.6 | unsubscribeFromPush clears IDB push preference | [ ] | |
| 2.7 | Subscription survives page reload | [ ] | |
| 2.8 | Subscription survives app reinstall (same device) | [ ] | |

---

## 3. Reminder Scheduling (10 scenarios)

| # | Scenario | Result | Notes |
|---|---|---|---|
| 3.1  | Task with reminderAt in future — setTimeout fires correctly | [ ] | |
| 3.2  | Task with reminderAt in past — setTimeout not set | [ ] | |
| 3.3  | Task reminder fires and notification shown in same session | [ ] | |
| 3.4  | Task reminder logged to pushLog table | [ ] | |
| 3.5  | cancelTaskReminder closes existing notification by tag | [ ] | |
| 3.6  | Reminder rescheduled after task edit changes time | [ ] | |
| 3.7  | Reminder cancelled after task deleted | [ ] | |
| 3.8  | Reminder cancelled after task marked done | [ ] | |
| 3.9  | Multiple tasks same reminder time — all fire | [ ] | |
| 3.10 | buildReminderTs produces correct Unix ms from date + time | [ ] | |

---

## 4. Notification Display (12 scenarios)

| # | Scenario | Android Chrome | iOS Safari | Desktop Chrome |
|---|---|---|---|---|
| 4.1  | Notification shows correct title | [ ] | [ ] | [ ] |
| 4.2  | Notification shows correct body (task title) | [ ] | [ ] | [ ] |
| 4.3  | Notification shows app icon 192x192 | [ ] | [ ] | [ ] |
| 4.4  | Notification shows badge (monochrome icon) | [ ] | N/A | [ ] |
| 4.5  | Notification vibrates on Android | [ ] | N/A | N/A |
| 4.6  | Notification tag deduplicates same task | [ ] | [ ] | [ ] |
| 4.7  | Open task action shown | [ ] | N/A | [ ] |
| 4.8  | Dismiss action shown | [ ] | N/A | [ ] |
| 4.9  | Notification persists until interacted with | [ ] | [ ] | [ ] |
| 4.10 | Multiple task reminders stacked (not collapsed) | [ ] | N/A | [ ] |
| 4.11 | Notification shown when app is in foreground | [ ] | [ ] | [ ] |
| 4.12 | Notification shown when app is in background | [ ] | [ ] | [ ] |

---

## 5. Notification Interaction (8 scenarios)

| # | Scenario | Result | Notes |
|---|---|---|---|
| 5.1 | Click Open task — app window focuses if open | [ ] | |
| 5.2 | Click Open task — new window opens if no window open | [ ] | |
| 5.3 | Click Dismiss — notification closed, no navigation | [ ] | |
| 5.4 | Click notification body — navigates to task day | [ ] | |
| 5.5 | notificationclick fires in SW correctly | [ ] | |
| 5.6 | Notification closed by system — no crash or error | [ ] | |
| 5.7 | Focus existing tab rather than opening new one | [ ] | |
| 5.8 | Clicking stale notification for deleted task — graceful | [ ] | |

---

## 6. Offline Push Behaviour (8 scenarios)

| # | Scenario | Result | Notes |
|---|---|---|---|
| 6.1  | Push received while offline — notification shown via SW | [ ] | |
| 6.2  | App opened from notification while offline — loads from cache | [ ] | |
| 6.3  | Reminder fires while offline — local notification shown | [ ] | |
| 6.4  | Subscription persists through offline period | [ ] | |
| 6.5  | Push not lost when app closed and offline | [ ] | |
| 6.6  | Notification data survives SW restart | [ ] | |
| 6.7  | Push received offline — taskId in notification data intact | [ ] | |
| 6.8  | Push received offline — pushLog entry written on reconnect | [ ] | |

---

## 7. SW Push Handler (10 scenarios)

| # | Scenario | Result | Notes |
|---|---|---|---|
| 7.1  | push event fires in SW | [ ] | |
| 7.2  | event.data.json() parses payload correctly | [ ] | |
| 7.3  | Malformed JSON falls back to text payload | [ ] | |
| 7.4  | Missing event.data — handler returns early, no crash | [ ] | |
| 7.5  | showNotification called with correct options | [ ] | |
| 7.6  | event.waitUntil correctly wraps showNotification | [ ] | |
| 7.7  | SW push handler does not throw on missing icon | [ ] | |
| 7.8  | SW push handler does not throw on missing tag | [ ] | |
| 7.9  | SW activated before push event fires | [ ] | |
| 7.10 | Multiple pushes in quick succession — all shown | [ ] | |

---

## 8. Cross-Device & Cross-Browser (10 scenarios)

| # | Scenario | Android Chrome | iOS Safari | Desktop Chrome | Desktop Edge |
|---|---|---|---|---|---|
| 8.1 | Subscribe on Android — notification received | [ ] | N/A | N/A | N/A |
| 8.2 | Subscribe on iOS — notification received | N/A | [ ] | N/A | N/A |
| 8.3 | Subscribe on desktop — notification received | N/A | N/A | [ ] | [ ] |
| 8.4 | Subscribe on Android, app also open on desktop — both notified | [ ] | N/A | [ ] | N/A |
| 8.5 | Permission granted Chrome, test in Edge — independent | N/A | N/A | [ ] | [ ] |
| 8.6 | Notification on Android with Do Not Disturb on | [ ] | N/A | N/A | N/A |
| 8.7 | Notification on iOS with Focus mode on | N/A | [ ] | N/A | N/A |
| 8.8 | Low battery mode — notification still delivered | [ ] | [ ] | N/A | N/A |
| 8.9 | Airplane mode toggled — missed push delivered on reconnect | [ ] | [ ] | [ ] | N/A |
| 8.10| Push works after OS-level notification permission toggle | [ ] | [ ] | [ ] | [ ] |

---

## 9. Error Handling & Edge Cases (15 scenarios)

| # | Scenario | Result | Notes |
|---|---|---|---|
| 9.1  | subscribe() throws — error caught, returns null | [ ] | |
| 9.2  | VAPID key invalid — subscribe returns null, no throw | [ ] | |
| 9.3  | Server unreachable — subscription stored locally, retry | [ ] | |
| 9.4  | pushManager undefined — handled gracefully | [ ] | |
| 9.5  | navigator.serviceWorker undefined — handled gracefully | [ ] | |
| 9.6  | Notification constructor not supported — fallback | [ ] | |
| 9.7  | SW not active yet on subscribe — waits for ready | [ ] | |
| 9.8  | Subscription expired — re-subscription triggered | [ ] | |
| 9.9  | Push payload > 4KB — truncated or dropped gracefully | [ ] | |
| 9.10 | logPushSent fails — push still shown, error logged | [ ] | |
| 9.11 | pushLog table corrupt — app boots without crash | [ ] | |
| 9.12 | cancelTaskReminder called for non-existent tag — no error | [ ] | |
| 9.13 | scheduleTaskReminder called with null reminderAt — no-op | [ ] | |
| 9.14 | Double subscription call — idempotent, no duplicate | [ ] | |
| 9.15 | Unsubscribe called when not subscribed — no error | [ ] | |

---

## Sign-Off

| Role | Name | Date | Pass rate |
|---|---|---|---|
| Dev QA | | | /93 |
| Release approver | | | |
