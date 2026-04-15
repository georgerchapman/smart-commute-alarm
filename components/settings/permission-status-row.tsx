import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { PermissionResult } from '@/src/services/permissions/permission-service';

type Props = {
  label: string;
  status: PermissionResult;
  onFix?: () => void;
};

const STATUS_ICON: Record<PermissionResult, string> = {
  granted: 'checkmark.circle.fill',
  denied: 'xmark.circle.fill',
  unavailable: 'minus.circle.fill',
};

export function PermissionStatusRow({ label, status, onFix }: Props) {
  const tint = useThemeColor({}, 'tint');

  const iconColor =
    status === 'granted' ? '#22C55E' : status === 'denied' ? '#EF4444' : '#9BA1A6';

  return (
    <TouchableOpacity
      onPress={status === 'denied' ? onFix : undefined}
      activeOpacity={status === 'denied' ? 0.7 : 1}
      style={styles.row}
    >
      <IconSymbol name={STATUS_ICON[status] as any} size={20} color={iconColor} />
      <ThemedText style={styles.label}>{label}</ThemedText>
      {status === 'denied' && onFix && (
        <ThemedText style={[styles.fix, { color: tint }]}>Fix</ThemedText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  label: {
    flex: 1,
  },
  fix: {
    fontSize: 14,
  },
});
