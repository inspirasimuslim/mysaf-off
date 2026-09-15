import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';

export default function KomenScreen() {
  return (
    <Screen padTop={false}>
      <ScreenHeader title="Komen" />
      <View className="px-gutter">
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title="Modul Komen akan datang"
          description="Skrin ini masih placeholder. Kandungan akan ditambah pada fasa seterusnya."
        />
      </View>
    </Screen>
  );
}
