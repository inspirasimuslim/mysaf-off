import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { memberInitials } from '@/types/database';

/**
 * Avatar ahli, dengan inisial sebagai sandaran.
 *
 * `avatar_url` adalah NULL sehingga seseorang memuat naik gambar, jadi laluan
 * inisial ialah yang paling kerap dilihat.
 */

/**
 * Rona dipilih daripada nama supaya seorang ahli sentiasa mendapat warna yang
 * sama pada setiap skrin, tanpa perlu menyimpan pilihan itu di mana-mana.
 * Julat kekal dalam keluarga hijau/teal agar sejajar dengan warna forest app.
 */
function hueFor(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 360;
  }
  return 120 + (hash % 90);
}

type Props = {
  fullName: string;
  avatarUrl: string | null;
  size: number;
};

export function MemberAvatar({ fullName, avatarUrl, size }: Props) {
  const hue = hueFor(fullName);

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={150}
        accessibilityLabel={fullName}
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={fullName}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsl(${hue}, 32%, 90%)`,
      }}
      className="items-center justify-center">
      <Text
        style={{ fontSize: size * 0.36, color: `hsl(${hue}, 45%, 28%)` }}
        className="font-bold">
        {memberInitials(fullName)}
      </Text>
    </View>
  );
}
