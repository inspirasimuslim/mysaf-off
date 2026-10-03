import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Colors } from '@/constants/theme';
import type { BusinessAdStatus } from '@/lib/business-ads';

const THUMB = 56;

export const BUSINESS_AD_STATUS_LABEL: Record<
  BusinessAdStatus,
  { label: string; tone: 'warn' | 'negative' | 'neutral' | 'positive' }
> = {
  menunggu: { label: 'Pending', tone: 'warn' },
  diluluskan: { label: 'Aktif', tone: 'positive' },
  ditolak: { label: 'Ditolak', tone: 'negative' },
  tamat_tempoh: { label: 'Tamat Tempoh', tone: 'neutral' },
};

type Props = {
  posterUrl: string;
  title: string;
  subtitle: string;
  status: BusinessAdStatus;
  onPress: () => void;
};

/**
 * Satu iklan bisnes dalam senarai — baris padat setinggi thumbnail, sama
 * corak `EventListRow` (Program Usrah di admin hub). Tiada menu tindakan
 * di sini: tekan baris terus buka skrin detail penuh, di situlah semua
 * tindakan (lulus/tolak/sunting/padam) berada — senarai kekal ringkas.
 */
export function BusinessAdListRow({ posterUrl, title, subtitle, status, onPress }: Props) {
  const statusInfo = BUSINESS_AD_STATUS_LABEL[status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-2.5 active:opacity-70">
      <View
        className="items-center justify-center overflow-hidden bg-background"
        style={{ width: THUMB, height: THUMB, borderRadius: 10 }}>
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={{ width: THUMB, height: THUMB }}
            contentFit="cover"
            transition={120}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Ionicons name="storefront-outline" size={22} color={Colors.inkFaint} />
        )}
      </View>

      <View className="flex-1 gap-1">
        <Text className="text-sm font-semibold leading-5 text-ink" numberOfLines={1}>
          {title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text className="text-xs text-ink-muted" numberOfLines={1}>
            {subtitle}
          </Text>
          <Badge label={statusInfo.label} tone={statusInfo.tone} />
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={Colors.inkFaint} />
    </Pressable>
  );
}
