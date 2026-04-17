import { View, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { AlarmToggle } from './alarm-toggle';
import { CountdownDisplay } from './countdown-display';
import { TrafficStatusBadge } from './traffic-status-badge';
import { AlarmTimePicker } from './alarm-time-picker';
import type { AlarmConfig, AlarmStatus } from '@/src/types/alarm';
import type { TrafficResult } from '@/src/types/traffic';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  config: AlarmConfig;
  status: AlarmStatus;
  wakeTimeIso: string | null;
  trafficResult: TrafficResult | null;
  isFetchingTraffic: boolean;
  trafficLastFetchedAt?: string | null;
  nominalDurationSeconds?: number | null;
  onToggle: (enabled: boolean) => void;
  onEditArrivalTime: () => void;
};

export function AlarmCard({
  config,
  status,
  wakeTimeIso,
  trafficResult,
  isFetchingTraffic,
  trafficLastFetchedAt,
  nominalDurationSeconds,
  onToggle,
  onEditArrivalTime,
}: Props) {
  const border = useThemeColor({}, 'border');
  const cardBg = useThemeColor({}, 'cardBackground');

  return (
    <ThemedView style={[styles.card, { borderColor: border, backgroundColor: cardBg }]}>
      <AlarmToggle
        enabled={config.enabled}
        onToggle={onToggle}
      />

      <View style={[styles.divider, { backgroundColor: border }]} />

      <CountdownDisplay wakeTimeIso={config.enabled ? wakeTimeIso : null} />

      <TrafficStatusBadge
        result={trafficResult}
        isFetching={isFetchingTraffic}
        nominalDurationSeconds={nominalDurationSeconds}
        lastFetchedAt={trafficLastFetchedAt}
      />

      <View style={[styles.divider, { backgroundColor: border }]} />

      <AlarmTimePicker
        hour={config.arrivalTime.hour}
        minute={config.arrivalTime.minute}
        label="Must arrive by"
        onPress={onEditArrivalTime}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
});
