import { Image, type ImageLoadEventData } from 'expo-image';
import { useState } from 'react';
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

/**
 * Paparan gambar tambahan (Gambar 2/3) pada skrin DETAIL — bukan borang
 * upload. Rombak 2026-10-04: dulu dipaksa masuk bekas segi empat sama
 * (`aspectRatio: 1`) dengan `contentFit="contain"`, jadi gambar bukan segi
 * empat sama dapat jalur kosong (letterbox) kiri/kanan atau atas/bawah.
 * Ahli muat naik gambar bebas resolusi — nisbah SEBENAR fail hanya diketahui
 * selepas dimuat, jadi dikesan runtime melalui `onLoad` (`event.source`
 * daripada expo-image) dan bekas disesuaikan kepadanya, bermula daripada
 * anggaran 4:3 sementara menunggu. Dipaparkan PENUH LEBAR tanpa `borderRadius`
 * (bucu bulat janggal pada gambar yang bersentuh terus dengan tepi skrin) —
 * ibu bapa (skrin panggil) mesti letak komponen ini LUAR bekas `px-gutter`
 * supaya tepi kiri/kanan benar-benar sampai hujung, bukan sekadar lebar penuh
 * dalam bekas berpadding.
 */
export function AutoAspectImage({ uri, label }: { uri: string; label: string }) {
  const [aspectRatio, setAspectRatio] = useState(4 / 3);

  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', aspectRatio }}
      contentFit="cover"
      transition={150}
      accessibilityLabel={label}
      onLoad={(event: ImageLoadEventData) => {
        const { width, height } = event.source;
        if (width > 0 && height > 0) setAspectRatio(width / height);
      }}
    />
  );
}
