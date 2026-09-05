import { View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/screen-header';

export default function AhliScreen() {
  return (
    <Screen padTop={false}>
      <ScreenHeader title="Ahli" />
      <View className="px-gutter">
        <EmptyState
          icon="people-outline"
          title="Modul Ahli akan datang"
          description="Skrin ini masih placeholder. Kandungan akan ditambah pada fasa seterusnya."
        />
      </View>
    </Screen>
  );
}
