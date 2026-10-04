import { ActivityIndicator, View } from 'react-native';

import { useEmbedded } from '@/components/ui/split-pane';
import { Colors } from '@/constants/theme';

export function LoadingScreen() {
  const embedded = useEmbedded();

  return (
    <View className="flex-1 items-center justify-center bg-background" style={embedded ? { minHeight: 240 } : undefined}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}
