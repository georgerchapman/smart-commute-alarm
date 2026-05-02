import { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ALARM_SOUNDS, DEFAULT_ALARM_SOUND_ID } from '@/src/constants/alarm-sounds';
import { AlarmAudioService } from '@/src/services/audio/alarm-audio-service';
import { logger } from '@/src/utils/logger';

type Props = {
  value: string | undefined;
  onChange: (soundId: string) => void;
};

/**
 * AlarmSoundPicker
 *
 * Renders the full catalog of bundled alarm sounds. Each row:
 *   - Tap the row label area → selects the sound (saved to config)
 *   - Tap the ▶ / ■ button → previews the sound (plays once, stops on finish or on re-tap)
 *
 * Only one sound can preview at a time.
 */
export function AlarmSoundPicker({ value, onChange }: Props) {
  const selectedId = value ?? DEFAULT_ALARM_SOUND_ID;

  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const tint = useThemeColor({}, 'tint');
  const tintText = useThemeColor({ light: '#fff', dark: '#000' }, 'tint');
  const subtleText = useThemeColor({}, 'tabIconDefault');
  const border = useThemeColor({}, 'border');

  // Stop any preview when the component unmounts (user navigates away from Settings)
  useEffect(() => {
    return () => {
      if (AlarmAudioService.isPlaying()) {
        AlarmAudioService.stop().catch(() => {});
      }
    };
  }, []);

  const handlePreview = useCallback(
    async (soundId: string) => {
      // Stop any currently playing sound
      if (previewingId) {
        logger.audio(`Stopping preview: ${previewingId}`);
        await AlarmAudioService.stop();
        const wasSameSound = previewingId === soundId;
        setPreviewingId(null);
        if (wasSameSound) return; // toggle off — user tapped stop on same row
      }

      setLoadingId(soundId);
      try {
        await AlarmAudioService.preview(soundId, () => {
          // Called when playback finishes naturally
          setPreviewingId(null);
        });
        setPreviewingId(soundId);
      } catch (err) {
        logger.error(`Preview failed for sound ${soundId}`, err);
        setPreviewingId(null);
      } finally {
        setLoadingId(null);
      }
    },
    [previewingId]
  );

  const handleSelect = useCallback(
    (soundId: string) => {
      if (soundId === selectedId) return;
      logger.ui(`Alarm sound selected: ${soundId}`);
      onChange(soundId);
    },
    [selectedId, onChange]
  );

  return (
    <View style={styles.container}>
      {ALARM_SOUNDS.map((sound, index) => {
        const isSelected = sound.id === selectedId;
        const isPreviewing = sound.id === previewingId;
        const isLoading = sound.id === loadingId;
        const isLast = index === ALARM_SOUNDS.length - 1;

        return (
          <View key={sound.id}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleSelect(sound.id)}
              activeOpacity={0.6}
            >
              {/* Play / Stop / Loading button */}
              <TouchableOpacity
                style={[styles.playBtn, { borderColor: tint }]}
                onPress={() => handlePreview(sound.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={tint} />
                ) : (
                  <ThemedText style={[styles.playIcon, { color: tint }]}>
                    {isPreviewing ? '■' : '▶'}
                  </ThemedText>
                )}
              </TouchableOpacity>

              {/* Sound name */}
              <ThemedText
                style={[
                  styles.label,
                  isSelected && styles.labelSelected,
                ]}
                numberOfLines={1}
              >
                {sound.label}
              </ThemedText>

              {/* Selected checkmark */}
              {isSelected && (
                <View style={[styles.checkmark, { backgroundColor: tint }]}>
                  <ThemedText style={[styles.checkmarkText, { color: tintText }]}>✓</ThemedText>
                </View>
              )}
            </TouchableOpacity>

            {/* Divider (skip after last row) */}
            {!isLast && <View style={[styles.divider, { backgroundColor: border }]} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 12,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  playIcon: {
    fontSize: 11,
    lineHeight: 14,
  },
  label: {
    flex: 1,
    fontSize: 15,
  },
  labelSelected: {
    fontWeight: '600',
  },
  checkmark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmarkText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44, // aligns with the label, not the play button
  },
});
