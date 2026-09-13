import { useRef } from 'react';
import { ScrollView, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResetScrollOnFocus } from '@/lib/scroll-reset';

/** Reka bentuk disasarkan untuk telefon — hadkan lebar supaya web tidak melebar. */
const MAX_CONTENT_WIDTH = 560;

type Props = ViewProps & {
  /** Kandungan boleh ditatal (default) atau tetap. */
  scroll?: boolean;
  /** Sisipkan padding atas selamat — matikan bila skrin ada header sendiri. */
  padTop?: boolean;
  className?: string;
};

export function Screen({ scroll = true, padTop = true, className = '', children, ...rest }: Props) {
  const insets = useSafeAreaInsets();
  const paddingTop = padTop ? insets.top + 12 : 0;
  // Semua skrin yang ditatal melalui komponen ini dibuka semula di atas.
  const scrollRef = useRef<ScrollView>(null);
  useResetScrollOnFocus(scrollRef);

  const body = (
    <View className="w-full self-center" style={{ maxWidth: MAX_CONTENT_WIDTH, paddingTop }}>
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View className={`flex-1 items-center bg-background ${className}`} {...rest}>
        {body}
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      className={`flex-1 bg-background ${className}`}
      contentContainerStyle={{ alignItems: 'center', paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {body}
    </ScrollView>
  );
}
