import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';

export default function AlbumScreen() {
  return (
    <Screen padTop={false}>
      <ScreenHeader title="Album" />
      <View className="px-gutter">
        <EmptyState
          icon="images-outline"
          title="Modul Album akan datang"
          description="Skrin ini masih placeholder. Kandungan akan ditambah pada fasa seterusnya."
        />
      </View>
    </Screen>
  );
}
