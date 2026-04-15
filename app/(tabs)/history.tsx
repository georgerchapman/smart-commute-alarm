import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HistoryItem } from '@/components/history/history-item';
import { HistoryStorage } from '@/src/services/storage/alarm-storage';
import { useMemo } from 'react';
import type { AlarmHistoryEntry } from '@/src/types/alarm';

export default function HistoryScreen() {
  const entries: AlarmHistoryEntry[] = useMemo(() => HistoryStorage.readAll(), []);

  return (
    <SafeAreaView style={styles.safe}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.heading}>History</ThemedText>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText style={styles.emptyText}>
              No alarm history yet. Once your alarm fires, entries will appear here.
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <HistoryItem entry={item} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 16 },
  heading: { paddingTop: 16, marginBottom: 16 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.5,
    lineHeight: 22,
  },
  list: {
    paddingBottom: 32,
  },
});
