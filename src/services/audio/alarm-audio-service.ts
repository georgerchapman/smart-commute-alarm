import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { logger } from '@/src/utils/logger';
import { getAlarmSound, DEFAULT_ALARM_SOUND_ID } from '@/src/constants/alarm-sounds';

/**
 * AlarmAudioService
 *
 * Manages in-app alarm audio, bypassing the iOS ringer/silent switch via
 * AVAudioSession Playback category.
 *
 * `playsInSilentModeIOS: true`  — overrides the physical ringer switch
 * `staysActiveInBackground: true` — audio continues after screen locks
 *
 * Pass a soundId from the ALARM_SOUNDS catalog to play a specific sound.
 * Falls back to DEFAULT_ALARM_SOUND_ID if the ID is not found.
 */

export const AlarmAudioService = {
  _sound: null as Audio.Sound | null,

  async configure(): Promise<void> {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      allowsRecordingIOS: false,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      playThroughEarpieceAndroid: false,
      shouldDuckAndroid: true,
    });
    logger.audio('Audio session configured (playsInSilentModeIOS: true, staysActiveInBackground: true)');
  },

  /**
   * Play the alarm sound on loop. Idempotent — stops any current sound first.
   * @param soundId  ID from ALARM_SOUNDS catalog. Defaults to DEFAULT_ALARM_SOUND_ID.
   */
  async play(soundId?: string): Promise<void> {
    await this.stop();
    await this.configure();

    const sound = getAlarmSound(soundId ?? DEFAULT_ALARM_SOUND_ID);
    logger.audio(`Playing alarm sound: "${sound.label}" (id: ${sound.id})`);

    try {
      const { sound: avSound } = await Audio.Sound.createAsync(
        sound.module,
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      this._sound = avSound;
      logger.audio('Alarm audio started (looping)');
    } catch (err) {
      logger.error('AlarmAudioService.play() failed to load sound', err);
      throw err;
    }
  },

  /**
   * Preview a sound once (no loop). Auto-clears the sound reference when
   * playback finishes. Does NOT configure the audio session for background —
   * previews are foreground-only.
   * @param soundId  ID from ALARM_SOUNDS catalog.
   * @param onFinish Optional callback when playback ends naturally.
   */
  async preview(soundId: string, onFinish?: () => void): Promise<void> {
    await this.stop();

    // Foreground preview: playsInSilentModeIOS still set so the sound is
    // audible during the settings walkthrough even in silent mode.
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      allowsRecordingIOS: false,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      playThroughEarpieceAndroid: false,
      shouldDuckAndroid: true,
    });

    const sound = getAlarmSound(soundId);
    logger.audio(`Previewing sound: "${sound.label}" (id: ${sound.id})`);

    try {
      const { sound: avSound } = await Audio.Sound.createAsync(
        sound.module,
        { shouldPlay: true, isLooping: false, volume: 1.0 }
      );
      this._sound = avSound;

      avSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          logger.audio(`Preview finished: ${sound.id}`);
          avSound.unloadAsync().catch(() => {});
          this._sound = null;
          onFinish?.();
        }
      });
    } catch (err) {
      logger.error('AlarmAudioService.preview() failed to load sound', err);
      throw err;
    }
  },

  /** Stop and release any active sound. Safe to call when nothing is playing. */
  async stop(): Promise<void> {
    if (this._sound) {
      try {
        await this._sound.stopAsync();
        await this._sound.unloadAsync();
      } catch {
        // Unload errors are non-fatal — the sound reference may be stale
      } finally {
        this._sound = null;
      }
      logger.audio('Alarm audio stopped');
    }
  },

  /** Returns true if any sound (alarm or preview) is currently loaded. */
  isPlaying(): boolean {
    return this._sound !== null;
  },
};
