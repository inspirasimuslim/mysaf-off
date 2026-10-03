import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';

/**
 * Satu slot gambar PILIHAN (Gambar 2/3 iklan bisnes) — bebas orientation
 * (keputusan 2026-10-03), jadi pratonton guna bekas segi empat sama +
 * `contentFit="contain"` (tidak memotong apa-apa orientation) berbanding
 * `aspectRatio` tetap seperti poster (Gambar 1).
 *
 * Dikongsi oleh `bisnes-upload.tsx` (ahli hantar/sunting sendiri) dan
 * `admin/iklan-tambah.tsx` (admin hantar bagi pihak ahli lain, migration 108)
 * — diekstrak daripada komponen dalaman `bisnes-upload.tsx` sebelum ini
 * supaya tidak disalin dua kali.
 */
export function OptionalImageSlot({
  label,
  previewUri,
  onChoose,
  onTakePhoto,
  onRemove,
  disabled,
}: {
  label: string;
  previewUri: string | null;
  onChoose: () => void;
  onTakePhoto?: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <View className="gap-3 rounded-card border border-line bg-surface p-4">
      <Text className="text-sm font-semibold text-ink">{label}</Text>

      {previewUri ? (
        <Image
          source={{ uri: previewUri }}
          style={{ width: '100%', aspectRatio: 1, borderRadius: 16 }}
          contentFit="contain"
          accessibilityLabel={label}
        />
      ) : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label={previewUri ? 'Tukar' : 'Pilih Gambar'} variant="secondary" onPress={onChoose} disabled={disabled} />
        </View>
        {onTakePhoto ? (
          <View className="flex-1">
            <Button label="Kamera" variant="secondary" onPress={onTakePhoto} disabled={disabled} />
          </View>
        ) : null}
      </View>

      {previewUri ? <Button label="Buang Gambar Ini" variant="danger" onPress={onRemove} disabled={disabled} /> : null}
    </View>
  );
}
