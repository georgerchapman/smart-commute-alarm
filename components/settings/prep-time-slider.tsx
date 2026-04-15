import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  value: number; // minutes
  onChange: (minutes: number) => void;
};

const MIN = 5;
const MAX = 90;
const STEP = 5;

export function PrepTimeSlider({ value, onChange }: Props) {
  const tint = useThemeColor({}, 'tint');

  const decrement = () => onChange(Math.max(MIN, value - STEP));
  const increment = () => onChange(Math.min(MAX, value + STEP));

  return (
    <View style={styles.container}>
      <ThemedText type="defaultSemiBold">Preparation Time</ThemedText>
      <View style={styles.stepper}>
        <TouchableOpacity
          onPress={decrement}
          disabled={value <= MIN}
          style={[styles.btn, { borderColor: tint, opacity: value <= MIN ? 0.3 : 1 }]}
        >
          <ThemedText style={[styles.btnText, { color: tint }]}>−</ThemedText>
        </TouchableOpacity>
        <ThemedText type="defaultSemiBold" style={styles.value}>
          {value} min
        </ThemedText>
        <TouchableOpacity
          onPress={increment}
          disabled={value >= MAX}
          style={[styles.btn, { borderColor: tint, opacity: value >= MAX ? 0.3 : 1 }]}
        >
          <ThemedText style={[styles.btnText, { color: tint }]}>+</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 20,
    lineHeight: 22,
  },
  value: {
    minWidth: 80,
    textAlign: 'center',
    fontSize: 17,
  },
});
