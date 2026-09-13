import { Ionicons } from '@expo/vector-icons';
import { Platform, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import type { DeliveryMode } from '@/lib/file-delivery';

type Props = {
  /** 'image' → "Simpan ke Galeri"; 'file' → "Simpan ke Peranti". */
  kind: 'image' | 'file';
  onPress: (mode: DeliveryMode) => void;
  /** Pilihan yang sedang berjalan — spinner pada butang itu, kedua-dua dikunci. */
  busy: DeliveryMode | null;
  disabled?: boolean;
  /** Label tunggal di web, contoh "Muat Turun Excel". */
  webLabel: string;
  /** Gaya butang utama; lalai 'primary'. Skrin yang butang ini bukan tindakan utamanya boleh guna 'secondary'. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /**
   * Label kecil di atas dua butang (peranti sahaja), contoh "Semua Data Ahli (.xlsx)".
   * Diperlukan bila skrin ada butang lain berdekatan: "Simpan ke Peranti" sahaja
   * tidak memberitahu APA yang disimpan.
   */
  nativeCaption?: string;
};

/**
 * Dua pilihan jelas untuk setiap muat turun: SIMPAN (utama) dan KONGSI
 * (sekunder). Sebelum ini semua muat turun melalui share sheet sahaja, dan
 * sesetengah peranti Android tidak menawarkan "Simpan" yang jelas di situ.
 *
 * Di web hanya SATU butang: pelayar memuat turun terus, jadi dua butang yang
 * melakukan perkara sama hanya mengelirukan.
 */
export function SaveShareButtons({
  kind,
  onPress,
  busy,
  disabled = false,
  webLabel,
  variant = 'primary',
  nativeCaption,
}: Props) {
  const locked = disabled || busy !== null;

  if (Platform.OS === 'web') {
    return (
      <Button
        label={webLabel}
        variant={variant}
        loading={busy !== null}
        disabled={locked}
        onPress={() => onPress('save')}
      />
    );
  }

  const iconColor = variant === 'primary' ? Colors.white : variant === 'ghost' ? Colors.primary : Colors.ink;

  return (
    <View className="gap-2">
      {nativeCaption ? <Text className="text-xs font-medium text-ink-muted">{nativeCaption}</Text> : null}
      <View className="flex-row gap-3">
      <View className="flex-1">
        <Button
          label={kind === 'image' ? 'Simpan ke Galeri' : 'Simpan ke Peranti'}
          variant={variant}
          className="px-3"
          loading={busy === 'save'}
          disabled={locked}
          icon={<Ionicons name="download-outline" size={18} color={iconColor} />}
          onPress={() => onPress('save')}
        />
      </View>
      <View className="flex-1">
        <Button
          label="Kongsi"
          variant="secondary"
          className="px-3"
          loading={busy === 'share'}
          disabled={locked}
          icon={<Ionicons name="share-social-outline" size={18} color={Colors.ink} />}
          onPress={() => onPress('share')}
        />
      </View>
      </View>
    </View>
  );
}
