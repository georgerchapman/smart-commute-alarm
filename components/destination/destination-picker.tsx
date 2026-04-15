import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { Destination } from '@/src/types/alarm';

type Props = {
  value: Destination | null;
  onChange: (destination: Destination) => void;
};

/**
 * MVP: Manual address + label entry.
 * Phase 2: Replace with Google Places autocomplete.
 */
export function DestinationPicker({ value, onChange }: Props) {
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');

  const handleLabelChange = (label: string) => {
    onChange({ ...(value ?? { address: '', latitude: 0, longitude: 0 }), label });
  };

  const handleAddressChange = (address: string) => {
    onChange({ ...(value ?? { label: '', latitude: 0, longitude: 0 }), address });
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="defaultSemiBold" style={styles.heading}>
        Destination
      </ThemedText>

      <View style={[styles.field, { borderColor: border }]}>
        <ThemedText style={styles.fieldLabel}>Label</ThemedText>
        <TextInput
          value={value?.label ?? ''}
          onChangeText={handleLabelChange}
          placeholder="e.g. Work, School"
          placeholderTextColor={border}
          style={[styles.input, { color: text }]}
          returnKeyType="next"
        />
      </View>

      <View style={[styles.field, { borderColor: border }]}>
        <ThemedText style={styles.fieldLabel}>Address</ThemedText>
        <TextInput
          value={value?.address ?? ''}
          onChangeText={handleAddressChange}
          placeholder="Full address"
          placeholderTextColor={border}
          style={[styles.input, { color: text }]}
          returnKeyType="done"
          multiline={false}
        />
      </View>

      <ThemedText style={styles.note}>
        Phase 2: autocomplete with Google Places will be added here.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  heading: {
    marginBottom: 4,
  },
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fieldLabel: {
    fontSize: 11,
    opacity: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 16,
  },
  note: {
    fontSize: 12,
    opacity: 0.4,
    fontStyle: 'italic',
  },
});
