import { Switch, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';

// iOS system green — matches the Clock app's alarm toggle colour
const ALARM_GREEN = '#34C759';

type Props = {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
};

export function AlarmToggle({ enabled, onToggle, disabled = false }: Props) {
  return (
    <View style={styles.row}>
      <ThemedText type="defaultSemiBold">
        {enabled ? 'Alarm On' : 'Alarm Off'}
      </ThemedText>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ true: ALARM_GREEN }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
