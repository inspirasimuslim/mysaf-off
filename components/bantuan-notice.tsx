import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fetchBantuanNotifikasi, type BantuanNotifikasi } from '@/lib/bantuan';
import { useColors } from '@/lib/theme';

const COPY: Record<BantuanNotifikasi['status'], { title: string; icon: 'checkmark-circle' | 'close-circle' | 'alert-circle' }> = {
  approved: { title: 'Permohonan zakat anda diluluskan', icon: 'checkmark-circle' },
  rejected: { title: 'Permohonan zakat anda tidak diluluskan', icon: 'close-circle' },
  needs_information: { title: 'Permohonan zakat memerlukan maklumat tambahan', icon: 'alert-circle' },
};

/**
 * Notifikasi ahli untuk Permohonan Zakat (migration 148) di skrin Utama.
 * Diterbitkan daripada `bantuan_notifikasi_ahli()`: hilang sendiri sebaik ahli
 * membuka keputusan atau menghantar semula maklumat. Tiada apa-apa dipaparkan
 * bila tiada notifikasi, dan kegagalan bacaan senyap (tidak mengganggu Utama).
 * Dalam-app sahaja — bukan notifikasi tolak (push) ke peranti.
 */
export function BantuanNotice() {
  const router = useRouter();
  const colors = useColors();
  const [items, setItems] = useState<BantuanNotifikasi[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchBantuanNotifikasi()
        .then((rows) => active && setItems(rows))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  if (items.length === 0) return null;

  return (
    <View className="gap-2">
      {items.slice(0, 3).map((item) => {
        const copy = COPY[item.status];
        const tone = item.status === 'approved' ? colors.positive : item.status === 'rejected' ? colors.negative : colors.warn;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={copy.title}
            onPress={() => router.push({ pathname: '/(app)/bantuan-info', params: { id: item.id } })}
            className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-3 active:opacity-70">
            <Ionicons name={copy.icon} size={24} color={tone} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-ink">{copy.title}</Text>
              {item.no_rujukan ? <Text className="text-xs text-ink-muted">{item.no_rujukan}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}
