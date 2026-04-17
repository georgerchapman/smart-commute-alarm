import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { formatDuration, formatRelativeTime } from '@/src/utils/time';
import type { TrafficResult } from '@/src/types/traffic';

type Props = {
  result: TrafficResult | null;
  isFetching: boolean;
  nominalDurationSeconds?: number | null;
  lastFetchedAt?: string | null;
};

export function TrafficStatusBadge({ result, isFetching, nominalDurationSeconds, lastFetchedAt }: Props) {
  const hasNominal = nominalDurationSeconds != null && nominalDurationSeconds > 0;

  if (isFetching) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.badge, styles.fetching]}>
          <ThemedText style={styles.text}>Checking live traffic…</ThemedText>
        </View>
        {hasNominal && (
          <ThemedText style={styles.nominalText}>
            ~{formatDuration(nominalDurationSeconds!)} without traffic
          </ThemedText>
        )}
      </View>
    );
  }

  if (!result) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.badge, styles.fetching]}>
          <ThemedText style={styles.text}>No live traffic data</ThemedText>
        </View>
        {hasNominal && (
          <ThemedText style={styles.nominalText}>
            ~{formatDuration(nominalDurationSeconds!)} without traffic
          </ThemedText>
        )}
      </View>
    );
  }

  const delay = result.durationSeconds - result.staticDurationSeconds;
  const hasDelay = delay > 60;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.badge, hasDelay ? styles.delayed : styles.clear]}>
        <ThemedText style={styles.text}>
          {formatDuration(result.durationSeconds)} commute
          {hasDelay ? ` (+${formatDuration(delay)} delay)` : ' — clear'}
        </ThemedText>
      </View>
      <ThemedText style={styles.nominalText}>
        {lastFetchedAt
          ? `Live traffic · Updated ${formatRelativeTime(lastFetchedAt)}`
          : hasNominal
            ? `~${formatDuration(nominalDurationSeconds!)} without traffic`
            : null}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 4,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  fetching: {
    backgroundColor: 'rgba(100,116,139,0.15)',
  },
  clear: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  delayed: {
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  text: {
    fontSize: 13,
  },
  nominalText: {
    fontSize: 12,
    opacity: 0.45,
  },
});
