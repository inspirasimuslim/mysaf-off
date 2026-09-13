import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Colors } from '@/constants/theme';
import type { DeliveryMode } from '@/lib/file-delivery';
import {
  USRAH_EVENT_STATUS_LABEL,
  dateRangeLabel,
  timeRangeLabel,
  usrahEventStatus,
  type UsrahEvent,
} from '@/types/database';

const THUMB = 56;
const MAX_SHEET_WIDTH = 560;
const STATUS_TONE = { aktif: 'positive', tamat: 'neutral', nonaktif: 'warn' } as const;

export type EventRowAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

/**
 * Tindakan eksport untuk menu baris: di peranti setiap eksport menjadi DUA
 * pilihan — "Simpan … ke Peranti" dan "Kongsi …" — manakala di web satu
 * "Muat Turun …" kerana pelayar memuat turun terus. Lihat `file-delivery.ts`.
 */
export function exportMenuActions<K extends string>(
  exports: readonly { key: K; label: string; icon: keyof typeof Ionicons.glyphMap }[],
  run: (key: K, mode: DeliveryMode) => void,
): EventRowAction[] {
  if (Platform.OS === 'web') {
    return exports.map((item) => ({
      key: item.key,
      label: 'Muat Turun ' + item.label,
      icon: item.icon,
      onPress: () => run(item.key, 'save'),
    }));
  }

  return exports.flatMap((item) => [
    {
      key: item.key + '-save',
      label: 'Simpan ' + item.label + ' ke Peranti',
      icon: item.icon,
      onPress: () => run(item.key, 'save'),
    },
    {
      key: item.key + '-share',
      label: 'Kongsi ' + item.label,
      icon: 'share-social-outline' as const,
      onPress: () => run(item.key, 'share'),
    },
  ]);
}

type Props = {
  event: UsrahEvent;
  onPress: () => void;
  actions: EventRowAction[];
  /** Satu tindakan sedang berjalan untuk acara ini — butang menu jadi penunjuk. */
  busy?: boolean;
  /** Tindakan lain (acara lain) sedang berjalan — menu dikunci. */
  locked?: boolean;
};

/**
 * Satu acara dalam senarai admin — satu baris padat setinggi thumbnail.
 *
 * KIRI thumbnail tetap 56px (ikon kelabu bila tiada poster) supaya setiap baris
 * sama tinggi dan mata boleh menyusur ke bawah tanpa lompat. TENGAH nama (dua
 * baris maks), tarikh dan status. KANAN satu butang "⋯": tindakan dikumpul
 * dalam lembaran bawah dan bukan dibentang sebagai butang penuh, supaya
 * menambah tindakan (kehadiran, RSVP) tidak memanjangkan setiap baris.
 *
 * Kawasan tap butiran dan butang menu ialah dua `Pressable` BERSEBELAHAN, bukan
 * bersarang: tap pada menu tidak pernah terlepas menjadi navigasi.
 */
export function EventListRow({ event, onPress, actions, busy = false, locked = false }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const status = usrahEventStatus(event);

  const choose = (action: EventRowAction) => {
    setOpen(false);
    action.onPress();
  };

  return (
    <View className="flex-row items-center rounded-field border border-line bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Butiran ' + event.name}
        onPress={onPress}
        className="flex-1 flex-row items-center gap-3 p-2.5 active:opacity-70">
        <View
          className="items-center justify-center overflow-hidden bg-background"
          style={{ width: THUMB, height: THUMB, borderRadius: 10 }}>
          {event.poster_url ? (
            <Image
              source={{ uri: event.poster_url }}
              style={{ width: THUMB, height: THUMB }}
              contentFit="cover"
              transition={120}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Ionicons name="image-outline" size={22} color={Colors.inkFaint} />
          )}
        </View>

        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold leading-5 text-ink" numberOfLines={2}>
            {event.name}
          </Text>
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Text className="text-xs text-ink-muted" numberOfLines={1}>
              {dateRangeLabel(event.start_date, event.end_date) + ' · ' + timeRangeLabel(event.start_time, event.end_time)}
            </Text>
            <Badge label={USRAH_EVENT_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
          </View>
        </View>
      </Pressable>

      {actions.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Tindakan untuk ' + event.name}
          accessibilityState={{ disabled: locked || busy, busy }}
          disabled={locked || busy}
          onPress={() => setOpen(true)}
          hitSlop={6}
          className={`h-14 w-11 items-center justify-center ${locked && !busy ? 'opacity-40' : 'active:opacity-60'}`}>
          {busy ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.inkMuted} />
          )}
        </Pressable>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup"
            className="absolute inset-0"
            onPress={() => setOpen(false)}
          />

          <View
            className="w-full self-center rounded-t-[28px] bg-background px-gutter pt-6"
            style={{ maxWidth: MAX_SHEET_WIDTH, paddingBottom: insets.bottom + 24 }}>
            <View className="mb-4 flex-row items-center gap-4">
              <Text className="flex-1 text-lg font-bold text-ink" numberOfLines={2}>
                {event.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tutup"
                hitSlop={10}
                onPress={() => setOpen(false)}
                className="h-9 w-9 items-center justify-center rounded-pill border border-line bg-surface active:opacity-70">
                <Ionicons name="close" size={18} color={Colors.ink} />
              </Pressable>
            </View>

            <View className="gap-2">
              {actions.map((action) => (
                <Pressable
                  key={action.key}
                  accessibilityRole="button"
                  onPress={() => choose(action)}
                  className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-4 active:opacity-70">
                  <Ionicons name={action.icon} size={20} color={Colors.primary} />
                  <Text className="flex-1 text-base text-ink">{action.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
