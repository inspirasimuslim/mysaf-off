import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { displayName, useAuth } from '@/lib/auth-context';

export default function ProfilScreen() {
  const { user } = useAuth();

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Profil" />

      <View className="px-gutter pt-6">
        <Card>
          <View className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-pill bg-primary-soft">
              <Ionicons name="person" size={24} color={Colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-bold text-ink">{displayName(user)}</Text>
              <Text className="mt-0.5 text-sm text-ink-muted" numberOfLines={1}>
                {user?.email ?? 'Tiada emel'}
              </Text>
            </View>
          </View>
        </Card>

        <EmptyState
          icon="settings-outline"
          title="Modul Profil akan datang"
          description="Tetapan akaun buat masa ini berada di tab Utama."
        />
      </View>
    </Screen>
  );
}
