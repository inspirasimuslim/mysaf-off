import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';

/**
 * Satu baris muat naik gambar iklan bisnes — label & butang "Upload"/"Tukar"
 * SEBARIS (keputusan 2026-10-03: dipermudah daripada reka bentuk asal yang
 * ada label di atas, pratonton, kemudian DUA butang "Pilih Gambar"/"Ambil
 * Gambar" berasingan). Kamera DIBUANG kekal — semua gambar dimuat naik
 * daripada storan/galeri peranti sahaja, tiada capaian kamera langsung.
 *
 * `onRemove` tidak diberi untuk Gambar 1 (poster, WAJIB — hanya "Tukar",
 * tiada "Buang"); diberi untuk Gambar 2/3 (PILIHAN) untuk papar butang
 * "Buang Gambar Ini" bila ada pratonton.
 *
 * Dikongsi oleh `bisnes-upload.tsx` (ahli hantar/sunting sendiri) dan
 * `admin/iklan-tambah.tsx` (admin hantar bagi pihak ahli lain).
 */
export function ImageUploadRow({
  label,
  previewUri,
  aspectRatio = 1,
  onChoose,
  onRemove,
  disabled,
}: {
  label: string;
  previewUri: string | null;
  /** Nisbah pratonton — `POSTER_ASPECT_RATIO` untuk Gambar 1, lalai 1:1 (segi empat sama) untuk Gambar 2/3 bebas orientation. */
  aspectRatio?: number;
  onChoose: () => void;
  /** Hanya untuk slot PILIHAN — bila diberi, butang "Buang Gambar Ini" dipaparkan selepas ada pratonton. */
  onRemove?: () => void;
  disabled: boolean;
}) {
  return (
    <View className="gap-3 rounded-card border border-line bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-sm font-semibold text-ink">{label}</Text>
        <Button
          label={previewUri ? 'Tukar' : 'Upload'}
          variant="secondary"
          size="sm"
          onPress={onChoose}
          disabled={disabled}
        />
      </View>

      {previewUri ? (
        <>
          <Image
            source={{ uri: previewUri }}
            style={{ width: '100%', aspectRatio, borderRadius: 16 }}
            contentFit="contain"
            accessibilityLabel={label}
          />
          {onRemove ? (
            <Button label="Buang Gambar Ini" variant="danger" size="sm" onPress={onRemove} disabled={disabled} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
