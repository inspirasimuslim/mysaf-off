import { View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/screen-header';

export default function AktivitiScreen() {
  return (
    <Screen padTop={false}>
      <ScreenHeader title="Aktiviti" />
      <View className="px-gutter">
        <EmptyState
          icon="calendar-outline"
          title="Modul Aktiviti akan datang"
          description="Skrin ini masih placeholder. Kandungan akan ditambah pada fasa seterusnya."
        />
      </View>
    </Screen>
  );
}
