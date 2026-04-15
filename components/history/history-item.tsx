import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatWakeTime, formatDuration, formatShortDate } from '@/src/utils/time';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { AlarmHistoryEntry } from '@/src/types/alarm';

type Props = {
  entry: AlarmHistoryEntry;
};

const OUTCOME_LABEL: Record<AlarmHistoryEntry['outcome'], string> = {
  dismissed: 'Dismissed',
  snoozed: 'Snoozed',
  missed: 'Missed',
};

export function HistoryItem({ entry }: Props) {
  const border = useThemeColor({}, 'border');
  const cardBg = useThemeColor({}, 'cardBackground');

  const wakeTime = formatWakeTime(new Date(entry.actualWakeTime));
  const arrivalTime = formatWakeTime(new Date(entry.configuredArrivalTime));
  const date = formatShortDate(new Date(entry.date));

  return (
    <ThemedView style={[styles.card, { borderColor: border, backgroundColor: cardBg }]}>
      <View style={styles.row}>
        <ThemedText type="defaultSemiBold">{date}</ThemedText>
        <ThemedText style={styles.outcome}>{OUTCOME_LABEL[entry.outcome]}</ThemedText>
      </View>
      <View style={styles.row}>
        <ThemedText style={styles.meta}>Woke at {wakeTime}</ThemedText>
        <ThemedText style={styles.meta}>Arrive by {arrivalTime}</ThemedText>
      </View>
      <ThemedText style={styles.meta}>
        Commute: {formatDuration(entry.trafficDurationSeconds)}
        {entry.snoozeCount > 0 ? ` · Snoozed ×${entry.snoozeCount}` : ''}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  outcome: {
    fontSize: 13,
    opacity: 0.6,
  },
  meta: {
    fontSize: 13,
    opacity: 0.6,
  },
});
