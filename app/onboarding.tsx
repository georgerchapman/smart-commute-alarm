import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePermissions } from '@/src/hooks/use-permissions';
import { useThemeColor } from '@/hooks/use-theme-color';
import { AlarmStorage } from '@/src/services/storage/alarm-storage';
import { logger } from '@/src/utils/logger';

type Step = {
  icon: string;
  title: string;
  body: string;
  action: string;
  /** When true, the "Skip for now" link is hidden — user must tap the action button. */
  required?: boolean;
  platform?: 'ios' | 'android';
};

const STEPS: Step[] = [
  {
    icon: 'bell.fill',
    title: 'Stay in the loop',
    body: "SyncWake needs permission to send you alarm notifications — even when your phone is silent.",
    action: 'Allow Notifications',
  },
  ...(Platform.OS === 'ios'
    ? [{
        icon: 'speaker.slash.fill',
        title: 'Leave the ringer on',
        body: "SyncWake plays your alarm through the app — not a notification. For the alarm to sound, the app must be open and the ringer switch must be ON.\n\nPlug in overnight and leave the app open on your bedside table.",
        action: 'I Understand',
        required: true,
        platform: 'ios' as const,
      }]
    : []),
  {
    icon: 'location.fill',
    title: 'Live commute times',
    body: 'SyncWake uses your location to calculate how long it will take to reach your destination.',
    action: 'Allow Location',
  },
  ...(Platform.OS === 'android'
    ? [{
        icon: 'alarm.fill',
        title: 'Precise alarms',
        body: 'Android requires special permission to fire alarms at exact times. Tap below to grant it.',
        action: 'Open Settings',
        platform: 'android' as const,
      }]
    : []),
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const { requestAll } = usePermissions();
  const tint = useThemeColor({}, 'tint');
  const tintText = useThemeColor({ light: '#fff', dark: '#000' }, 'tint');

  const currentStep = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const handleAction = async () => {
    logger.ui(`[DEBUG] Onboarding step ${stepIndex + 1}/${STEPS.length}: "${currentStep.action}" tapped`);
    if (stepIndex === 0) {
      // Request notification permission on first tap
      await requestAll();
    }

    if (isLast) {
      logger.ui('[DEBUG] Onboarding complete');
      AlarmStorage.markOnboardingComplete();
      router.replace('/');
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handleSkip = () => {
    logger.ui(`[DEBUG] Onboarding skipped at step ${stepIndex + 1}/${STEPS.length}`);
    AlarmStorage.markOnboardingComplete();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ThemedView style={styles.container}>
        {/* Progress dots */}
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === stepIndex ? tint : 'rgba(120,120,128,0.3)' },
              ]}
            />
          ))}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <IconSymbol name={currentStep.icon as any} size={64} color={tint} />
          <ThemedText type="title" style={styles.title}>
            {currentStep.title}
          </ThemedText>
          <ThemedText style={styles.body}>{currentStep.body}</ThemedText>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: tint }]}
            onPress={handleAction}
          >
            <ThemedText style={[styles.primaryBtnText, { color: tintText }]}>
              {currentStep.action}
            </ThemedText>
          </TouchableOpacity>

          {/* Hide skip on required steps (e.g. the mute switch warning) */}
          {!currentStep.required && (
            <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
              <ThemedText style={styles.skipText}>
                {isLast ? 'Done' : 'Skip for now'}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, paddingVertical: 20 },
  dots: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    textAlign: 'center',
    marginTop: 8,
  },
  body: {
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.7,
    maxWidth: 320,
  },
  actions: {
    gap: 12,
    paddingBottom: 8,
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    opacity: 0.5,
    fontSize: 15,
  },
});
