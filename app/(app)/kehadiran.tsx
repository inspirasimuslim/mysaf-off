import { View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/screen-header';

export default function KehadiranScreen() {
  return (
    <Screen padTop={false}>
      <ScreenHeader title="Kehadiran" />
      <View className="px-gutter">
        <EmptyState
          icon="calendar-number-outline"
          title="Modul Kehadiran akan datang"
          description="Skrin ini masih placeholder. Kandungan akan ditambah pada fasa seterusnya."
        />
      </View>
    </Screen>
  );
}
