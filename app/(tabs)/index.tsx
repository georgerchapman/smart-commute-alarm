import { View, ScrollView, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { useCountdown } from '@/src/hooks/use-countdown';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AlarmCard } from '@/components/alarm/alarm-card';
import { DestinationCard } from '@/components/destination/destination-card';
import { useAlarm } from '@/src/hooks/use-alarm';
import { useTraffic } from '@/src/hooks/use-traffic';
import { useNominalJourney } from '@/src/hooks/use-nominal-journey';
import { useThemeColor } from '@/hooks/use-theme-color';
import { logger } from '@/src/utils/logger';

export default function AlarmScreen() {
  const router = useRouter();
  const { config, status, lastCalculatedWakeTime, snoozeCount, enableAlarm, disableAlarm, updateConfig, snooze, dismiss, setFiring } = useAlarm();
  const { lastResult, lastFetchedAt, isFetching, refresh: refreshTraffic } = useTraffic();
  const { durationSeconds: nominalSeconds } = useNominalJourney();
  const tint = useThemeColor({}, 'tint');
  const tintText = useThemeColor({ light: '#fff', dark: '#000' }, 'tint');

  const [showTimePicker, setShowTimePicker] = useState(false);

  // Detect when the countdown reaches zero and the alarm should start firing.
  // Only active when the alarm is in a schedulable state so that the initial
  // isExpired=true (from a null wakeTime) does not trigger the overlay.
  const alarmIsActive =
    config?.enabled && (status === 'scheduled' || status === 'monitoring' || status === 'snoozed');
  const { isExpired } = useCountdown(alarmIsActive ? lastCalculatedWakeTime : null);

  useEffect(() => {
    if (isExpired && alarmIsActive && lastCalculatedWakeTime) {
      setFiring();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired]);

  // Auto-refresh live traffic whenever the screen comes into focus and alarm is enabled
  useFocusEffect(
    useCallback(() => {
      if (!config?.enabled) return;
      (async () => {
        try {
          const { status: locStatus } = await Location.getForegroundPermissionsAsync();
          if (locStatus !== 'granted') return;
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          await refreshTraffic(pos.coords.latitude, pos.coords.longitude);
        } catch (err) {
          logger.warn('Home screen traffic refresh failed', err);
        }
      })();
    }, [config?.enabled, refreshTraffic])
  );

  // Build a Date object from the stored hour/minute for the picker
  const pickerDate = (() => {
    const d = new Date();
    d.setHours(config?.arrivalTime.hour ?? 8, config?.arrivalTime.minute ?? 0, 0, 0);
    return d;
  })();

  const handleTimeChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === 'android') setShowTimePicker(false);
      if (event.type === 'dismissed') return;
      if (selected) {
        updateConfig({ arrivalTime: { hour: selected.getHours(), minute: selected.getMinutes() } });
      }
    },
    [updateConfig],
  );

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      await enableAlarm(nominalSeconds ?? undefined);
    } else {
      await disableAlarm();
    }
  };

  // Empty state — no config yet
  if (!config) {
    return (
      <SafeAreaView style={styles.safe}>
        <ThemedView style={styles.empty}>
          <ThemedText type="title" style={styles.emptyTitle}>SyncWake</ThemedText>
          <ThemedText style={styles.emptyBody}>
            Set your destination and arrival time in Settings to get started.
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  // Firing overlay
  if (status === 'firing') {
    return (
      <SafeAreaView style={styles.safe}>
        <ThemedView style={styles.firing}>
          <ThemedText type="title" style={styles.firingTitle}>Wake Up!</ThemedText>
          <ThemedText style={styles.firingBody}>
            Time to start your commute.
          </ThemedText>
          <View style={styles.firingActions}>
            {snoozeCount < 3 && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.snoozeBtn]}
                onPress={snooze}
              >
                <ThemedText type="defaultSemiBold">Snooze</ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: tint }]}
              onPress={dismiss}
            >
              <ThemedText type="defaultSemiBold" style={{ color: tintText }}>
                Dismiss
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.heading}>SyncWake</ThemedText>

        <AlarmCard
          config={config}
          status={status}
          wakeTimeIso={lastCalculatedWakeTime}
          trafficResult={lastResult}
          isFetchingTraffic={isFetching}
          trafficLastFetchedAt={lastFetchedAt}
          nominalDurationSeconds={nominalSeconds}
          onToggle={handleToggle}
          onEditArrivalTime={() => setShowTimePicker(true)}
        />

        {/* Android: DateTimePicker renders as a dialog directly */}
        {showTimePicker && Platform.OS === 'android' && (
          <DateTimePicker
            mode="time"
            value={pickerDate}
            onChange={handleTimeChange}
          />
        )}

        <View style={styles.gap} />

        <DestinationCard
          destination={config.destination}
          onPress={() => router.push('/(tabs)/settings')}
        />
      </ScrollView>

      {/* iOS: wrap in a modal so the spinner sits in a dismissable sheet */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showTimePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowTimePicker(false)}
          >
            <ThemedView style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <ThemedText type="defaultSemiBold">Must arrive by</ThemedText>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <ThemedText type="link">Done</ThemedText>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                mode="time"
                display="spinner"
                value={pickerDate}
                onChange={handleTimeChange}
                style={styles.picker}
              />
            </ThemedView>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingVertical: 24,
    gap: 12,
  },
  heading: {
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  gap: { height: 4 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
    opacity: 0.6,
    lineHeight: 22,
  },
  firing: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  firingTitle: {
    fontSize: 48,
  },
  firingBody: {
    opacity: 0.7,
    textAlign: 'center',
  },
  firingActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  actionBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  snoozeBtn: {
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  picker: {
    width: '100%',
  },
});
