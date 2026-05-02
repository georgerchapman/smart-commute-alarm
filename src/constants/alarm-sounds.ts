/**
 * Static catalog of bundled alarm sounds.
 *
 * All require() calls must be static strings so Metro can resolve them at
 * build time. Do NOT generate these dynamically from filenames at runtime.
 */

export interface AlarmSound {
  id: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: any; // result of require() — typed as any because RN asset modules have no shared type
}

export const ALARM_SOUNDS: AlarmSound[] = [
  {
    id: 'classic_beeper',
    label: 'Classic Beeper',
    module: require('../../assets/sounds/alarms/alarm_classic_beeper.mp3'),
  },
  {
    id: 'dual_tone',
    label: 'Dual Tone',
    module: require('../../assets/sounds/alarms/alarm_dual_tone.mp3'),
  },
  {
    id: 'escalating_urgency',
    label: 'Escalating Urgency',
    module: require('../../assets/sounds/alarms/alarm_escalating_urgency.mp3'),
  },
  {
    id: 'marimba_groove',
    label: 'Marimba Groove',
    module: require('../../assets/sounds/alarms/alarm_marimba_groove.mp3'),
  },
  {
    id: 'morning_chimes',
    label: 'Morning Chimes',
    module: require('../../assets/sounds/alarms/alarm_morning_chimes.mp3'),
  },
  {
    id: 'rapid_pulse',
    label: 'Rapid Pulse',
    module: require('../../assets/sounds/alarms/alarm_rapid_pulse.mp3'),
  },
  {
    id: 'rising_siren',
    label: 'Rising Siren',
    module: require('../../assets/sounds/alarms/alarm_rising_siren.mp3'),
  },
  {
    id: 'steel_drum_sunrise',
    label: 'Steel Drum Sunrise',
    module: require('../../assets/sounds/alarms/alarm_steel_drum_sunrise.mp3'),
  },
  {
    id: 'tubular_bells',
    label: 'Tubular Bells',
    module: require('../../assets/sounds/alarms/alarm_tubular_bells.mp3'),
  },
  {
    id: 'wind_chimes',
    label: 'Wind Chimes',
    module: require('../../assets/sounds/alarms/alarm_wind_chimes.mp3'),
  },
  {
    id: 'xylophone_fanfare',
    label: 'Xylophone Fanfare',
    module: require('../../assets/sounds/alarms/alarm_xylophone_fanfare.mp3'),
  },
];

export const DEFAULT_ALARM_SOUND_ID = 'classic_beeper';

/** Look up a sound by ID, falling back to the default if not found. */
export function getAlarmSound(id: string | undefined): AlarmSound {
  return ALARM_SOUNDS.find((s) => s.id === id) ?? ALARM_SOUNDS[0];
}
