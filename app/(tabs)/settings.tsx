import { ScrollView, View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DestinationPicker } from '@/components/destination/destination-picker';
import { PrepTimeSlider } from '@/components/settings/prep-time-slider';
import { PermissionStatusRow } from '@/components/settings/permission-status-row';
import { useAlarm } from '@/src/hooks/use-alarm';
import { usePermissions } from '@/src/hooks/use-permissions';
import { useSubscription } from '@/src/hooks/use-subscription';
import { openExactAlarmSettings } from '@/src/services/permissions/permission-service';
import { useThemeColor } from '@/hooks/use-theme-color';
import Constants from 'expo-constants';

export default function SettingsScreen() {
  const router = useRouter();
  const { config, updateConfig } = useAlarm();
  const { statuses, check } = usePermissions();
  const { isPro, restore } = useSubscription();
  const tint = useThemeColor({}, 'tint');
  const tintText = useThemeColor({ light: '#fff', dark: '#000' }, 'tint');
  const border = useThemeColor({}, 'border');
  const cardBg = useThemeColor({}, 'cardBackground');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.heading}>Settings</ThemedText>

        {/* Destination */}
        <Section title="Destination" border={border} bg={cardBg}>
          <DestinationPicker
            value={config?.destination ?? null}
            onChange={(destination) => updateConfig({ destination })}
          />
        </Section>

        {/* Preparation Time */}
        <Section title="Preparation Time" border={border} bg={cardBg}>
          <PrepTimeSlider
            value={config?.prepMinutes ?? 30}
            onChange={(prepMinutes) => updateConfig({ prepMinutes })}
          />
        </Section>

        {/* Schedule */}
        <Section title="Schedule" border={border} bg={cardBg}>
          <DayPicker
            value={config?.daysOfWeek ?? [1, 2, 3, 4, 5]}
            onChange={(daysOfWeek) => updateConfig({ daysOfWeek })}
            tint={tint}
            tintText={tintText}
            border={border}
          />
        </Section>

        {/* Permissions */}
        <Section title="Permissions" border={border} bg={cardBg}>
          {statuses ? (
            <>
              <PermissionStatusRow
                label="Notifications"
                status={statuses.notifications}
              />
              {Platform.OS === 'ios' && (
                <PermissionStatusRow
                  label="Critical Alerts"
                  status={statuses.criticalAlerts}
                />
              )}
              <PermissionStatusRow
                label="Location (Always)"
                status={statuses.locationBackground}
              />
              {Platform.OS === 'android' && (
                <PermissionStatusRow
                  label="Exact Alarms"
                  status={statuses.exactAlarms}
                  onFix={openExactAlarmSettings}
                />
              )}
            </>
          ) : (
            <TouchableOpacity onPress={check}>
              <ThemedText style={{ color: tint }}>Check permissions</ThemedText>
            </TouchableOpacity>
          )}
        </Section>

        {/* Subscription */}
        <Section title="Subscription" border={border} bg={cardBg}>
          {isPro ? (
            <ThemedText style={styles.proLabel}>SyncWake Pro ✓</ThemedText>
          ) : (
            <TouchableOpacity
              style={[styles.proBtn, { backgroundColor: tint }]}
              onPress={() => router.push('/paywall')}
            >
              <ThemedText style={[styles.proBtnText, { color: tintText }]}>Go Pro</ThemedText>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={restore} style={styles.restoreBtn}>
            <ThemedText style={{ color: tint, fontSize: 14 }}>
              Restore Purchases
            </ThemedText>
          </TouchableOpacity>
        </Section>

        {/* App Info */}
        <ThemedText style={styles.version}>
          SyncWake {Constants.expoConfig?.version ?? '1.0.0'}
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function DayPicker({
  value,
  onChange,
  tint,
  tintText,
  border,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  tint: string;
  tintText: string;
  border: string;
}) {
  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort();
    onChange(next);
  };

  return (
    <View style={styles.dayRow}>
      {DAY_LABELS.map((label, day) => {
        const active = value.includes(day);
        return (
          <TouchableOpacity
            key={day}
            onPress={() => toggle(day)}
            style={[
              styles.dayChip,
              { borderColor: tint },
              active && { backgroundColor: tint },
            ]}
          >
            <ThemedText
              style={[styles.dayChipText, active && { color: tintText }]}
            >
              {label}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Section({
  title,
  children,
  border,
  bg,
}: {
  title: string;
  children: React.ReactNode;
  border: string;
  bg: string;
}) {
  return (
    <View style={styles.sectionWrapper}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      <ThemedView style={[styles.sectionCard, { borderColor: border, backgroundColor: bg }]}>
        {children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingVertical: 24, gap: 20 },
  heading: { marginBottom: 4 },
  sectionWrapper: { gap: 6 },
  sectionTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.5,
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 4,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  dayChip: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dayChipTextActive: {},
  proLabel: { fontSize: 15 },
  proBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  proBtnText: { fontWeight: '600' },
  restoreBtn: { paddingTop: 10, alignItems: 'center' },
  version: {
    textAlign: 'center',
    fontSize: 12,
    opacity: 0.3,
    paddingBottom: 32,
  },
});
