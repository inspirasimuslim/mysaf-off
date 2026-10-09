import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { toMalayError } from '@/lib/errors';
import {
  MAX_EXTRA_DESCRIPTION,
  MAX_EXTRA_POSTERS,
  type ExtraInfoDraft,
} from '@/lib/event-extra-info';
import { pickImages } from '@/lib/image-upload';
import { useColors } from '@/lib/theme';

type Props = {
  value: ExtraInfoDraft;
  onChange: (next: ExtraInfoDraft) => void;
  disabled?: boolean;
};

/**
 * Borang "Maklumat Tambahan" acara.
 *
 * Lalai TUTUP: kebanyakan acara cukup dengan satu poster utama, jadi borang
 * cipta tidak diserabutkan dengan medan yang jarang digunakan. Penganjur yang
 * ada penerangan atau poster lain menghidupkan togel kecil di sini — barulah
 * medan penerangan dan butang tambah poster muncul.
 *
 * Komponen terkawal sepenuhnya: draf hidup pada induk (skrin cipta menyimpannya
 * selepas acara wujud; skrin butiran menyimpannya melalui butang sendiri).
 */
export function EventExtraInfoEditor({ value, onChange, disabled = false }: Props) {
  const colors = useColors();
  const [error, setError] = useState<string | null>(null);

  const addPosters = useCallback(async () => {
    setError(null);
    const room = MAX_EXTRA_POSTERS - value.posters.length;
    if (room <= 0) return;
    try {
      const uris = await pickImages(room);
      if (uris.length === 0) return;
      onChange({ ...value, posters: [...value.posters, ...uris.map((uri) => ({ uri, remote: false }))] });
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memilih gambar.'));
    }
  }, [onChange, value]);

  const removePoster = useCallback(
    (index: number) => {
      onChange({ ...value, posters: value.posters.filter((_, position) => position !== index) });
    },
    [onChange, value],
  );

  return (
    <View className="gap-3">
      {/* Togel kecil — bukan kad penuh seperti ToggleRow; ini pilihan sampingan, bukan keputusan utama borang. */}
      <View collapsable={false} className="flex-row items-center justify-between gap-3">
        <View collapsable={false} className="flex-1">
          <Text className="text-sm font-semibold text-ink">Ada maklumat tambahan?</Text>
          <Text className="mt-0.5 text-xs text-ink-muted">
            Penerangan atau poster lain. Dipaparkan di hujung butiran program kepada ahli.
          </Text>
        </View>
        <Switch
          value={value.enabled}
          onValueChange={(enabled) => onChange({ ...value, enabled })}
          disabled={disabled}
          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          trackColor={{ false: colors.line, true: colors.primaryMid }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.line}
        />
      </View>

      {value.enabled ? (
        <View className="gap-3">
          <TextField
            label="Penerangan tambahan"
            value={value.description}
            onChangeText={(description) => onChange({ ...value, description })}
            editable={!disabled}
            autoCapitalize="sentences"
            multiline
            numberOfLines={5}
            maxLength={MAX_EXTRA_DESCRIPTION}
          />

          {value.posters.map((poster, index) => (
            <View
              key={poster.uri + index}
              className="overflow-hidden rounded-card border border-line bg-surface">
              <Image
                source={{ uri: poster.uri }}
                style={{ width: '100%', height: 220 }}
                contentFit="contain"
                transition={150}
                accessibilityLabel={'Pratonton poster tambahan ' + (index + 1)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Buang poster tambahan ' + (index + 1)}
                disabled={disabled}
                hitSlop={8}
                onPress={() => removePoster(index)}
                className="absolute right-2 top-2 h-9 w-9 items-center justify-center rounded-pill bg-black/60 active:opacity-70">
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}

          {value.posters.length < MAX_EXTRA_POSTERS ? (
            <Button
              label={value.posters.length === 0 ? 'Tambah Poster' : 'Tambah Poster Lagi'}
              variant="secondary"
              disabled={disabled}
              icon={<Ionicons name="images-outline" size={18} color={colors.primary} />}
              onPress={() => void addPosters()}
            />
          ) : (
            <Text className="text-center text-xs text-ink-muted">
              {'Had ' + MAX_EXTRA_POSTERS + ' poster tambahan dicapai.'}
            </Text>
          )}

          {error ? <Notice tone="negative" message={error} /> : null}
        </View>
      ) : null}
    </View>
  );
}
