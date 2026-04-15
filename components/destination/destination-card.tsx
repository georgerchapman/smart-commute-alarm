import { TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { Destination } from '@/src/types/alarm';

type Props = {
  destination: Destination | null;
  onPress: () => void;
};

export function DestinationCard({ destination, onPress }: Props) {
  const tint = useThemeColor({}, 'tint');
  const border = useThemeColor({}, 'border');
  const cardBg = useThemeColor({}, 'cardBackground');

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <ThemedView style={[styles.card, { borderColor: border, backgroundColor: cardBg }]}>
        <IconSymbol name="location.fill" size={20} color={tint} />
        <ThemedView style={styles.text}>
          {destination?.label ? (
            <>
              <ThemedText type="defaultSemiBold">{destination.label}</ThemedText>
              <ThemedText style={styles.address} numberOfLines={1}>
                {destination.address}
              </ThemedText>
            </>
          ) : (
            <ThemedText style={styles.placeholder}>Set destination</ThemedText>
          )}
        </ThemedView>
        <IconSymbol name="chevron.right" size={14} color={tint} />
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  text: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  address: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 2,
  },
  placeholder: {
    opacity: 0.5,
  },
});
