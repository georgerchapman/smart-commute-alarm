import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { formatDuration } from '@/src/utils/time';
import type { TrafficResult } from '@/src/types/traffic';

type Props = {
  result: TrafficResult | null;
  isFetching: boolean;
};

export function TrafficStatusBadge({ result, isFetching }: Props) {
  if (isFetching) {
    return (
      <View style={[styles.badge, styles.fetching]}>
        <ThemedText style={styles.text}>Checking traffic…</ThemedText>
      </View>
    );
  }

  if (!result) {
    return null;
  }

  const delay = result.durationSeconds - result.staticDurationSeconds;
  const hasDelay = delay > 60; // more than 1 minute delay

  return (
    <View style={[styles.badge, hasDelay ? styles.delayed : styles.clear]}>
      <ThemedText style={styles.text}>
        {formatDuration(result.durationSeconds)} commute
        {hasDelay ? ` (+${formatDuration(delay)} delay)` : ' — clear'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
