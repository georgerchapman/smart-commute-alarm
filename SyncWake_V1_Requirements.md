# SyncWake V1 Requirements

**Project:** SyncWake Mobile App (V1.0)
**Objective:** Smart alarm clock with dynamic traffic-based wake time adjustment.
**Storage:** Local device storage only. No authentication required.

---

## Implementation Constraints

| ID | Constraint | Detail |
|---|---|---|
| CON-1 | Silent mode bypass | On iOS, third-party apps are restricted. Use `AVAudioSession` category `Playback` to ensure the alarm sounds even when the physical ringer switch is off. |
| CON-2 | API throttling | Limit Google Maps Routes API calls to avoid billing. V1 targets two checks per alarm day: one at 60 minutes before nominal wake time, one at 15 minutes before. |

---

## 1. Device Permissions & Access

### REQ-1.1 Background Execution

| Field | Value |
|---|---|
| **Behaviour** | The app uses platform-native scheduling (`AlarmManager` on Android, `BGTaskScheduler`/push on iOS) to trigger traffic checks and fire the alarm. |
| **Acceptance criteria** | |

- [ ] **AC-1.1.1** The alarm notification fires even when the app is not in the foreground.
- [ ] **AC-1.1.2** Background traffic checks execute at the scheduled checkpoints (60 min and 15 min before nominal wake time).
- [ ] **AC-1.1.3** If a background check fails to run (OS throttling), the alarm still fires at the last calculated wake time.

### REQ-1.2 Location Services

| Field | Value |
|---|---|
| **Behaviour** | The app requests location permission for accurate origin-based traffic queries. |
| **Acceptance criteria** | |

- [ ] **AC-1.2.1** The app requests location permission during onboarding.
- [ ] **AC-1.2.2** The app does not crash when permission is granted.
- [ ] **AC-1.2.3** The app does not crash when permission is denied; alarm falls back to nominal commute time.

---

## 2. Data Storage (Local)

### REQ-2.1 Local Persistence

| Field | Value |
|---|---|
| **Behaviour** | All user settings (destination, arrival time, prep buffer, schedule days) are persisted to local device storage. |
| **Acceptance criteria** | |

- [ ] **AC-2.1.1** Settings survive an app force-close and restart.
- [ ] **AC-2.1.2** Alarm history entries persist across app restarts.
- [ ] **AC-2.1.3** The enabled/disabled state of the alarm persists across restarts.

---

## 3. Core Logic & Fail-Safes

### REQ-3.1 Nominal Check (Baseline)

| Field | Value |
|---|---|
| **Behaviour** | The app stores a "nominal" (no-traffic) commute duration as the baseline. This is established when the route is first set up. |
| **Acceptance criteria** | |

- [ ] **AC-3.1.1** A nominal journey duration is fetched and stored when the user first enables the alarm with a configured destination.
- [ ] **AC-3.1.2** If the nominal duration cannot be fetched (no network, API error), a 45-minute fallback (`FALLBACK_COMMUTE_SECONDS`) is used.
- [ ] **AC-3.1.3** The nominal duration is displayed on the alarm card when no live traffic data is available.

### REQ-3.2 Dynamic Traffic Adjustment

| Field | Value |
|---|---|
| **Behaviour** | Wake time is calculated as: `WakeTime = ArrivalTime - (LiveDuration + PrepBuffer)`. If live traffic is worse than nominal, the alarm moves earlier. |
| **Acceptance criteria** | |

- [ ] **AC-3.2.1** When live traffic duration exceeds the current estimate by more than 120 seconds, the alarm is rescheduled earlier.
- [ ] **AC-3.2.2** When live traffic duration is within 120 seconds of the current estimate, no reschedule occurs (avoids churn).
- [ ] **AC-3.2.3** Traffic checks occur at two checkpoints: 60 minutes and 15 minutes before nominal wake time.
- [ ] **AC-3.2.4** The wake time is never set to a time in the past; it is clamped to at least `now + 10s` if the calculated time has already passed.
- [ ] **AC-3.2.5** Changing `prepMinutes` adjusts the wake time by the exact difference (e.g. 30 to 45 min adds 15 min buffer).

### REQ-3.3 Connectivity Fail-Safe

| Field | Value |
|---|---|
| **Behaviour** | If the traffic API fails (no internet, server error, timeout), the alarm fires at the nominal wake time. The user is never left without an alarm. |
| **Acceptance criteria** | |

- [ ] **AC-3.3.1** When the API call fails, the background task returns a `Failed` result and does not alter the existing wake time.
- [ ] **AC-3.3.2** The alarm fires at the previously scheduled time despite zero connectivity.
- [ ] **AC-3.3.3** No unhandled exception is thrown on API failure.

---

## 4. Alarm Functionality

### REQ-4.1 Audio Output

| Field | Value |
|---|---|
| **Behaviour** | The alarm fires a burst of notifications with sound to simulate a repeating alarm ring. On iOS, `AVAudioSession` category `Playback` is used to bypass silent mode. |
| **Acceptance criteria** | |

- [ ] **AC-4.1.1** A burst of 8 notifications is scheduled, spaced 30 seconds apart, starting at the calculated wake time.
- [ ] **AC-4.1.2** Notifications include sound.
- [ ] **AC-4.1.3** The first notification uses the primary alarm title (`Wake up — HH:MM`); subsequent notifications use a repeat title (`Still time to get up`).
- [ ] **AC-4.1.4** The alarm sounds even when the ringer/silent switch is off (requires dev build with native audio session; deferred in Expo Go).

### REQ-4.2 Standard Snooze

| Field | Value |
|---|---|
| **Behaviour** | Pressing "Snooze" silences the alarm for a fixed 540-second (9-minute) interval. Snooze is not traffic-aware. |
| **Acceptance criteria** | |

- [ ] **AC-4.2.1** After snooze, the alarm re-fires exactly 540 seconds later.
- [ ] **AC-4.2.2** The snooze interval is fixed regardless of live traffic conditions.
- [ ] **AC-4.2.3** Maximum 3 snoozes are allowed. After the 3rd snooze fires, the snooze button is hidden.
- [ ] **AC-4.2.4** A 4th snooze attempt (if triggered programmatically) auto-dismisses the alarm.
- [ ] **AC-4.2.5** Each snooze increments `snoozeCount` in the store and persists to storage.

---

## 5. User Interface

### REQ-5.1 Destination Setup

| Field | Value |
|---|---|
| **Behaviour** | Google Places Autocomplete allows the user to search for and select a destination. |
| **Acceptance criteria** | |

- [ ] **AC-5.1.1** Autocomplete suggestions appear after the user types 3 or more characters.
- [ ] **AC-5.1.2** Selecting a suggestion fetches place details (lat/lng) and stores them as the destination.
- [ ] **AC-5.1.3** The selected destination label and address are displayed on the alarm dashboard.
- [ ] **AC-5.1.4** Typing fewer than 3 characters does not trigger an API call.

### REQ-5.2 Status Feedback

| Field | Value |
|---|---|
| **Behaviour** | The UI displays real-time status feedback about traffic and alarm state. |
| **Acceptance criteria** | |

- [ ] **AC-5.2.1** While traffic is being fetched, a loading indicator or "Checking traffic..." message is shown.
- [ ] **AC-5.2.2** After a successful traffic fetch, the traffic duration or delay delta is displayed (e.g. `+5m delay`).
- [ ] **AC-5.2.3** The alarm status (`idle`, `scheduled`, `monitoring`, `snoozed`, `firing`, `dismissed`) is reflected in the UI.

---

## 6. Alarm Lifecycle

### REQ-6.1 Dismiss (One-Off Alarm)

| Field | Value |
|---|---|
| **Behaviour** | Dismissing a one-off alarm (empty `daysOfWeek`) disables it. |
| **Acceptance criteria** | |

- [ ] **AC-6.1.1** After dismiss, the alarm's `enabled` flag is set to `false`.
- [ ] **AC-6.1.2** Status transitions to `idle`.
- [ ] **AC-6.1.3** `lastCalculatedWakeTime` is cleared to `null`.
- [ ] **AC-6.1.4** All scheduled notifications are cancelled (including orphans).
- [ ] **AC-6.1.5** A history entry is recorded with the correct outcome (`dismissed` or `snoozed`).

### REQ-6.2 Dismiss (Recurring Alarm)

| Field | Value |
|---|---|
| **Behaviour** | Dismissing a recurring alarm automatically reschedules for the next matching day in `daysOfWeek`. |
| **Acceptance criteria** | |

- [ ] **AC-6.2.1** After dismiss, a new alarm is scheduled for the next day that appears in `daysOfWeek`.
- [ ] **AC-6.2.2** Status transitions to `scheduled`.
- [ ] **AC-6.2.3** `snoozeCount` is reset to 0.
- [ ] **AC-6.2.4** A history entry is recorded before rescheduling.
