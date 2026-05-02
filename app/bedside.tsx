import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { ThemedText } from '@/components/themed-text';
import { useAlarm } from '@/src/hooks/use-alarm';
import { useTraffic } from '@/src/hooks/use-traffic';
import { AlarmAudioService } from '@/src/services/audio/alarm-audio-service';
import { logger } from '@/src/utils/logger';
import { formatWakeTime, formatDuration } from '@/src/utils/time';

const ANTI_BURN_INTERVAL_MS = 60_000; // shift clock position every 60 seconds
const ANTI_BURN_RANGE_PX = 6;         // max ±6 px drift per axis

function useClock(): string {
  const [time, setTime] = useState(() => formatCurrentTime());
  useEffect(() => {
    const id = setInterval(() => setTime(formatCurrentTime()), 1_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function formatCurrentTime(): string {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function BedsideScreen() {
  const router = useRouter();
  const { config, status, lastCalculatedWakeTime, snoozeCount, snooze, dismiss } = useAlarm();
  const { lastResult } = useTraffic();

  // Keep the screen on for as long as Bedside Mode is active (REQ-1.1)
  useKeepAwake();

  const isFiring = status === 'firing';
  const currentTime = useClock();

  // Anti-OLED burn-in: slowly drift the clock position (REQ-5.2)
  const offsetX = useRef(new Animated.Value(0)).current;
  const offsetY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    logger.bedside('Bedside Mode entered');
    return () => {
      logger.bedside('Bedside Mode exited');
      // Stop audio if user navigates back while alarm is firing
      if (AlarmAudioService.isPlaying()) {
        AlarmAudioService.stop().catch(() => {});
      }
    };
  }, []);

  // Start drifting immediately and repeat every 60 s
  useEffect(() => {
    const drift = () => {
      const newX = (Math.random() * 2 - 1) * ANTI_BURN_RANGE_PX;
      const newY = (Math.random() * 2 - 1) * ANTI_BURN_RANGE_PX;
      Animated.parallel([
        Animated.timing(offsetX, { toValue: newX, duration: 8_000, useNativeDriver: true }),
        Animated.timing(offsetY, { toValue: newY, duration: 8_000, useNativeDriver: true }),
      ]).start();
      logger.bedside(`Anti-burn shift → (${newX.toFixed(1)}, ${newY.toFixed(1)}) px`);
    };

    drift();
    const id = setInterval(drift, ANTI_BURN_INTERVAL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio: play when firing starts, stop on snooze/dismiss
  useEffect(() => {
    if (isFiring) {
      logger.bedside(`Alarm firing — starting audio (sound: ${config?.alarmSoundId ?? 'default'})`);
      AlarmAudioService.play(config?.alarmSoundId).catch((err) =>
        logger.error('Bedside: audio play failed', err)
      );
    } else if (!isFiring && AlarmAudioService.isPlaying()) {
      AlarmAudioService.stop().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFiring]);

  const handleSnooze = () => {
    logger.bedside(`Snooze tapped (snoozeCount: ${snoozeCount})`);
    AlarmAudioService.stop().catch(() => {});
    snooze();
  };

  const handleDismiss = () => {
    logger.bedside('Dismiss tapped');
    AlarmAudioService.stop().catch(() => {});
    dismiss();
    // After dismissing a one-off alarm, leave Bedside Mode
    if (config && config.daysOfWeek.length === 0) {
      router.back();
    }
  };

  const handleLeave = () => {
    logger.bedside('User left Bedside Mode manually');
    router.back();
  };

  const wakeTimeLabel = lastCalculatedWakeTime
    ? `Alarm: ${formatWakeTime(new Date(lastCalculatedWakeTime))}`
    : null;

  const trafficLabel = lastResult
    ? (() => {
        const delaySec = lastResult.durationSeconds - lastResult.staticDurationSeconds;
        if (delaySec > 60) return `+${Math.round(delaySec / 60)}m delay`;
        return `${formatDuration(lastResult.durationSeconds)} commute`;
      })()
    : null;

  // ── Firing state ─────────────────────────────────────────────────────────
  if (isFiring) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.firingContent}>
            <ThemedText style={styles.firingTime}>{currentTime}</ThemedText>
            <ThemedText style={styles.firingTitle}>Wake Up!</ThemedText>
            {lastResult && (
              <ThemedText style={styles.firingSubtitle}>
                {formatDuration(lastResult.durationSeconds)} commute today
              </ThemedText>
            )}
            <View style={styles.firingActions}>
              {snoozeCount < 3 && (
                <TouchableOpacity style={styles.snoozeBtn} onPress={handleSnooze}>
                  <ThemedText style={styles.snoozeBtnText}>Snooze 9 min</ThemedText>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss}>
                <ThemedText style={styles.dismissBtnText}>Dismiss</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Armed / monitoring state ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        {/* Subtle leave button — low opacity so it doesn't disrupt sleep */}
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <ThemedText style={styles.leaveText}>← Leave</ThemedText>
        </TouchableOpacity>

        {/* Clock — slightly offset for OLED burn-in protection */}
        <Animated.View
          style={[
            styles.clockContainer,
            { transform: [{ translateX: offsetX }, { translateY: offsetY }] },
          ]}
        >
          <ThemedText style={styles.clock}>{currentTime}</ThemedText>

          {wakeTimeLabel && (
            <ThemedText style={styles.wakeLabel}>{wakeTimeLabel}</ThemedText>
          )}
        </Animated.View>

        {/* Traffic status — barely visible at the bottom */}
        {trafficLabel && (
          <View style={styles.trafficRow}>
            <ThemedText style={styles.trafficText}>{trafficLabel}</ThemedText>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safe: {
    flex: 1,
  },

  // ── Armed state ────────────────────────────────────────────────
  leaveBtn: {
    position: 'absolute',
    top: 56,
    left: 20,
    padding: 8,
    opacity: 0.2,
    zIndex: 10,
  },
  leaveText: {
    color: '#fff',
    fontSize: 14,
  },
  clockContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  clock: {
    fontSize: 72,
    fontWeight: '200',
    color: '#fff',
    opacity: 0.3,
    letterSpacing: 2,
  },
  wakeLabel: {
    fontSize: 18,
    color: '#fff',
    opacity: 0.35,
    fontWeight: '300',
  },
  trafficRow: {
    position: 'absolute',
    bottom: 40,
    width: SCREEN_WIDTH,
    alignItems: 'center',
  },
  trafficText: {
    color: '#fff',
    opacity: 0.2,
    fontSize: 13,
    fontWeight: '300',
  },

  // ── Firing state ───────────────────────────────────────────────
  firingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  firingTime: {
    fontSize: 56,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: 1,
  },
  firingTitle: {
    fontSize: 42,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  firingSubtitle: {
    fontSize: 18,
    color: '#fff',
    opacity: 0.75,
  },
  firingActions: {
    marginTop: 40,
    gap: 16,
    width: '100%',
  },
  snoozeBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  snoozeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  dismissBtn: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  dismissBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
  },
});
