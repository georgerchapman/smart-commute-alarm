import { Switch, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
};

export function AlarmToggle({ enabled, onToggle, disabled = false }: Props) {
  const tint = useThemeColor({}, 'tint');

  return (
    <View style={styles.row}>
      <ThemedText type="defaultSemiBold">
        {enabled ? 'Alarm On' : 'Alarm Off'}
      </ThemedText>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ true: tint }}
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
