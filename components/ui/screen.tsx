import { useRef } from 'react';
import { ScrollView, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsDesktop } from '@/lib/use-desktop';
import { KeyboardAwareProvider, useKeyboardAware } from '@/lib/keyboard-aware';
import { useResetScrollOnFocus } from '@/lib/scroll-reset';
import { useEmbedded } from '@/components/ui/split-pane';

/** Reka bentuk disasarkan untuk telefon — hadkan lebar supaya web tidak melebar. */
const MAX_CONTENT_WIDTH = 560;
/** Mod desktop: skrin biasa dipusatkan pada lebar munasabah; skrin `wide` (Utama) guna grid lebar. */
const DESKTOP_CONTENT_WIDTH = 840;
const DESKTOP_WIDE_WIDTH = 1200;

type Props = ViewProps & {
  /** Kandungan boleh ditatal (default) atau tetap. */
  scroll?: boolean;
  /** Sisipkan padding atas selamat — matikan bila skrin ada header sendiri. */
  padTop?: boolean;
  className?: string;
  /** Mod desktop sahaja: benarkan lebar grid (skrin yang sudah disusun semula untuk desktop). */
  wide?: boolean;
};

export function Screen({ scroll = true, padTop = true, wide = false, className = '', children, ...rest }: Props) {
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  // Dipasang di panel kanan (panel berkembar): isi lebar panel, tanpa padding atas.
  const embedded = useEmbedded();
  const maxWidth = desktop ? (wide ? DESKTOP_WIDE_WIDTH : DESKTOP_CONTENT_WIDTH) : MAX_CONTENT_WIDTH;
  const paddingTop = padTop && !embedded ? insets.top + 12 : 0;
  // Semua skrin yang ditatal melalui komponen ini dibuka semula di atas.
  const scrollRef = useRef<ScrollView>(null);
  useResetScrollOnFocus(scrollRef);
  /*
    Setiap skrin boleh tatal mengurus papan kekunci di SINI, sekali — bukan
    KeyboardAvoidingView berasingan di setiap borang. Lihat lib/keyboard-aware.
  */
  const keyboard = useKeyboardAware(scrollRef);

  const body = (
    <View className="w-full self-center" style={{ maxWidth: embedded ? undefined : maxWidth, paddingTop }}>
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View className={`flex-1 items-center ${className}`} {...rest}>
        {body}
      </View>
    );
  }

  return (
    <KeyboardAwareProvider value={keyboard.api}>
      <ScrollView
        ref={scrollRef}
        className={`flex-1 ${className}`}
        contentContainerStyle={{ alignItems: embedded ? 'stretch' : 'center', paddingBottom: 32 + keyboard.inset }}
        keyboardShouldPersistTaps="handled"
        onScroll={keyboard.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
    </KeyboardAwareProvider>
  );
}
