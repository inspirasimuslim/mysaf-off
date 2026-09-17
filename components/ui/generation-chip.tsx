import { Text, View } from 'react-native';

/**
 * Kod generasi ringkas ("i21") sebagai label kecil di sebelah nama.
 *
 * Kod dan bukan "Generasi i21": dalam senarai padat label ini duduk sebaris
 * dengan nama, jadi ia mesti cukup pendek untuk tidak menolak nama terpotong.
 */
export function GenerationChip({ code }: { code: string | null }) {
  if (!code) return null;

  return (
    <View className="rounded-pill bg-primary-soft px-2 py-0.5">
      <Text className="text-xs font-semibold text-primary">{code}</Text>
    </View>
  );
}
