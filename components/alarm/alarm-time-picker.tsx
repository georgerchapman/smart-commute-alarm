import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  hour: number;
  minute: number;
  label: string;
  onPress: () => void;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatAmPm(hour: number, minute: number) {
  const period = hour < 12 ? 'AM' : 'PM';
  const h = hour % 12 || 12;
  return `${h}:${pad(minute)} ${period}`;
}

export function AlarmTimePicker({ hour, minute, label, onPress }: Props) {
  const tint = useThemeColor({}, 'tint');

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <ThemedView style={styles.container}>
        <ThemedText type="default" style={styles.label}>
          {label}
        </ThemedText>
        <ThemedText type="defaultSemiBold" style={[styles.time, { color: tint }]}>
          {formatAmPm(hour, minute)}
        </ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  label: {
    opacity: 0.7,
  },
  time: {
    fontSize: 17,
  },
});
