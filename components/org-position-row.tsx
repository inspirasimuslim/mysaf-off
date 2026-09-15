import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { MemberAvatar } from '@/components/ui/member-avatar';
import { Colors } from '@/constants/theme';
import type { OrgPosition } from '@/lib/org-chart';

const AVATAR_SIZE = 44;

/**
 * Satu jawatan dalam carta organisasi: avatar, label jawatan, nama.
 *
 * Jawatan kosong tetap dipapar dengan avatar kelabu dan "Kosong" — struktur
 * carta mesti kelihatan lengkap walaupun ada kekosongan. Dikongsi oleh skrin
 * ahli (paparan sahaja) dan skrin urus admin.
 */
export function OrgPositionRow({ position }: { position: OrgPosition }) {
  const vacant = !position.member_id || !position.full_name;

  return (
    <View className="flex-row items-center gap-3">
      {vacant ? (
        <View
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
          className="items-center justify-center bg-background">
          <Ionicons name="person-outline" size={20} color={Colors.inkFaint} />
        </View>
      ) : (
        <MemberAvatar fullName={position.full_name as string} avatarUrl={position.avatar_url} size={AVATAR_SIZE} />
      )}

      <View className="flex-1">
        <Text className="text-xs font-semibold uppercase tracking-wide text-primary">{position.jawatan}</Text>
        {vacant ? (
          <Text className="mt-0.5 text-base italic text-ink-faint">Kosong</Text>
        ) : (
          <Text className="mt-0.5 text-base font-semibold text-ink" numberOfLines={2}>
            {position.full_name}
          </Text>
        )}
      </View>
    </View>
  );
}
