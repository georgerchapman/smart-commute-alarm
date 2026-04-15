import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useCountdown } from '@/src/hooks/use-countdown';
import { formatWakeTime } from '@/src/utils/time';

type Props = {
  wakeTimeIso: string | null;
};

export function CountdownDisplay({ wakeTimeIso }: Props) {
  const { hours, minutes, seconds, isExpired } = useCountdown(wakeTimeIso);

  if (!wakeTimeIso) {
    return (
      <View style={styles.container}>
        <ThemedText type="subtitle" style={styles.placeholder}>
          No alarm set
        </ThemedText>
      </View>
    );
  }

  if (isExpired) {
    return (
      <View style={styles.container}>
        <ThemedText type="title" style={styles.time}>
          Wake up!
        </ThemedText>
      </View>
    );
  }

  const wakeLabel = formatWakeTime(new Date(wakeTimeIso));
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.label}>
        Wake up at {wakeLabel}
      </ThemedText>
      <ThemedText type="title" style={styles.time}>
        {hours > 0 ? `${pad(hours)}:` : ''}{pad(minutes)}:{pad(seconds)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  label: {
    marginBottom: 8,
    opacity: 0.7,
  },
  time: {
    fontSize: 44,
    lineHeight: 52,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  placeholder: {
    opacity: 0.5,
  },
});
