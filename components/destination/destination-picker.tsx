import { useState, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { Destination } from '@/src/types/alarm';

const PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACES_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '';

type Suggestion = { placeId: string; text: string };

type Props = {
  value: Destination | null;
  onChange: (destination: Destination) => void;
};

export function DestinationPicker({ value, onChange }: Props) {
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');

  const [query, setQuery] = useState(value?.address ?? '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
        },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      console.log('[Places] status:', res.status, 'body:', JSON.stringify(data));
      setSuggestions(
        (data.suggestions ?? []).map((s: any) => ({
          placeId: s.placePrediction.placeId,
          text: s.placePrediction.text.text,
        }))
      );
    } catch (err) {
      console.log('[Places] fetch error:', err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (input: string) => {
      setQuery(input);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => fetchSuggestions(input), 400);
    },
    [fetchSuggestions]
  );

  const handleSelect = useCallback(
    async (s: Suggestion) => {
      setSuggestions([]);
      setQuery(s.text);
      let latitude = 0;
      let longitude = 0;
      try {
        const res = await fetch(`${PLACES_DETAILS_URL}/${s.placeId}?fields=location`, {
          headers: { 'X-Goog-Api-Key': API_KEY },
        });
        const data = await res.json();
        latitude = data.location?.latitude ?? 0;
        longitude = data.location?.longitude ?? 0;
      } catch {
        /* fall back to 0,0 */
      }
      onChange({
        label: value?.label ?? '',
        address: s.text,
        placeId: s.placeId,
        latitude,
        longitude,
      });
    },
    [value, onChange]
  );

  const handleLabelChange = (label: string) => {
    onChange({
      label,
      address: value?.address ?? '',
      placeId: value?.placeId,
      latitude: value?.latitude ?? 0,
      longitude: value?.longitude ?? 0,
    });
  };

  const locationResolved = (value?.latitude ?? 0) !== 0;

  return (
    <View style={styles.container}>
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
        <View style={styles.inputRow}>
          <TextInput
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Start typing an address…"
            placeholderTextColor={border}
            style={[styles.input, styles.inputFlex, { color: text }]}
            returnKeyType="search"
            multiline={false}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {loading && <ActivityIndicator size="small" color={tint} />}
        </View>
      </View>

      {suggestions.length > 0 && (
        <ThemedView style={[styles.dropdown, { borderColor: border }]}>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={s.placeId}
              style={[
                styles.suggestionRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border },
              ]}
              onPress={() => handleSelect(s)}
            >
              <ThemedText style={styles.suggestionText} numberOfLines={2}>
                {s.text}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ThemedView>
      )}

      {locationResolved && (
        <ThemedText style={[styles.resolvedHint, { color: tint }]}>
          ✓ Location set
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    fontSize: 16,
  },
  inputFlex: {
    flex: 1,
  },
  dropdown: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  suggestionText: {
    fontSize: 15,
  },
  resolvedHint: {
    fontSize: 13,
    paddingHorizontal: 4,
  },
});
