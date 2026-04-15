// NOTE: Placeholder replacing react-native-purchases-ui for Expo Go compatibility.
// Swap back to the real RevenueCatUI.Paywall implementation for the dev build.
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';

export default function PaywallScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ThemedText type="title">SyncWake Pro</ThemedText>
        <ThemedText style={styles.sub}>Paywall coming in the dev build.</ThemedText>
        <ThemedText type="link" onPress={() => router.back()}>
          Go back
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  sub: { opacity: 0.6, textAlign: 'center' },
});
