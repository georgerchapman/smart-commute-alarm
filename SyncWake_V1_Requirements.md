# PROJECT: SyncWake Mobile App (V1.0)
# OBJECTIVE: Smart alarm with dynamic traffic-based adjustment.
# STRATEGY: Foreground "Bedside Mode" priority with Time-Sensitive Notification fallback.
# STORAGE: Local device storage only.

## 1. DEVICE PERMISSIONS & ACCESS
REQ-1.1: Screen Management (Bedside Mode)
- Behavior: When the alarm is armed, the app must activate a `keepAwake` state (preventing the device from sleeping).
- Pass Criteria: The screen remains on indefinitely while the app is in the "Armed" state.

REQ-1.2: Notification Permissions
- Behavior: App requests standard notification permissions (Android) and "Time-Sensitive Notifications" (iOS).
- Pass Criteria: User successfully grants permission; iOS payload includes the 'Time-Sensitive' interruption level.

REQ-1.3: Location Services
- Behavior: App requests "While Using the App" (since the app will stay in the foreground overnight).
- Pass Criteria: App functions and fetches traffic data without requiring "Always On" background location.

## 2. ONBOARDING & USER EDUCATION
REQ-2.1: The "Mute Switch" Warning (iOS Only)
- Behavior: App detects if it is running on iOS and displays a mandatory onboarding screen advising the user to leave the physical mute switch ON and allow the app to bypass Focus Mode.
- Pass Criteria: User must explicitly tap "I Understand" before setting their first alarm.

REQ-2.2: Power Warning
- Behavior: When arming the alarm, if the device battery is < 20% and not plugged in, display an alert.
- Pass Criteria: Alert warns user: "Bedside Mode consumes battery. Please plug in your device."

## 3. CORE LOGIC & FAIL-SAFES
REQ-3.1: Nominal Check & Dynamic Adjustment
- Behavior: App stores "Normal" commute duration. Trigger Time = Target Arrival - (Live Duration + Prep Buffer).
- Pass Criteria: Alarm triggers earlier than the baseline if live traffic duration exceeds the normal duration.

REQ-3.2: Connectivity Fail-Safe
- Behavior: If the Maps API ping fails (no internet), the app MUST trigger at the "Nominal Journey Time."
- Pass Criteria: Alarm fires at the ideal time despite 0% connectivity.

## 4. ALARM FUNCTIONALITY & AUDIO
REQ-4.1: Foreground Audio Trigger (Bedside Mode)
- Behavior: When the app is in the foreground, it uses `AVAudioSessionCategoryPlayback` (iOS) and `STREAM_ALARM` (Android) to play a high-volume looping audio file, overriding the physical mute switch.
- Pass Criteria: Audio plays loudly even if the phone is set to silent (while the app is open).

REQ-4.2: Background Fallback (The Safety Net)
- Behavior: If the user accidentally locks the phone or backgrounds the app, the app schedules a local Time-Sensitive Notification with a custom, loud 30-second audio file attached.
- Pass Criteria: A critical-style notification fires at the correct time if the app is not in the foreground.

REQ-4.3: Standard Snooze
- Behavior: Dismissing with "Snooze" silences the alarm for a fixed 9-minute interval.
- Pass Criteria: Alarm restarts exactly 540 seconds after Snooze is pressed.

## 5. USER INTERFACE
REQ-5.1: Destination Setup
- Behavior: Places Autocomplete allows the user to select their destination.
- Pass Criteria: Selected destination and Prep Buffer are displayed on the settings dashboard.

REQ-5.2: Bedside UI (Dark Mode)
- Behavior: When "Armed," the UI shifts to a pitch-black background with a large, dimmed clock. The clock text must slowly shift position every few minutes to prevent OLED screen burn-in.
- Pass Criteria: UI successfully dims, minimizes visual clutter, and moves elements periodically. 

REQ-5.3: Status Feedback
- Behavior: Bedside UI displays a subtle "Traffic Check at [Time]" or "Traffic: +5m delay" status.
- Pass Criteria: Visual feedback updates dynamically without turning on bright screen elements.