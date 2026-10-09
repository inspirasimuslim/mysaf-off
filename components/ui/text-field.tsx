import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type Ref } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useKeyboardAwareField } from '@/lib/keyboard-aware';
import { useColors } from '@/lib/theme';

type Props = Omit<TextInputProps, 'style' | 'className'> & {
  label: string;
  error?: string | null;
  /** Papar butang tunjuk/sembunyi dan tetapkan secureTextEntry secara automatik. */
  secure?: boolean;
  /** Rujukan ke TextInput di dalam, supaya induk boleh memindahkan fokus. */
  inputRef?: Ref<TextInput>;
  /**
   * Untuk medan CARIAN yang keputusannya terus di bawah medan ini (senarai
   * ditapis semasa menaip). Bila papan kekunci terbuka, medan ditatal ke ATAS
   * bekas (bukan ke bawah berdekatan papan kekunci seperti biasa) supaya
   * ruang antara medan dan papan kekunci dimaksimumkan untuk keputusan itu —
   * tanpa ini keputusan tersembunyi di belakang papan kekunci. Lihat
   * `lib/keyboard-aware.tsx`.
   */
  topAnchored?: boolean;
};

export function TextField({
  label,
  error,
  secure = false,
  inputRef,
  topAnchored = false,
  onFocus,
  onBlur,
  onContentSizeChange,
  ...rest
}: Props) {
  const colors = useColors();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  /*
    Seluruh medan (label + kotak + ralat) yang didaftarkan, bukan TextInput
    sahaja — supaya bekas menatal sehingga BAWAH medan kelihatan, termasuk
    medan multiline yang tinggi dan mesej ralat di bawahnya.
  */
  const containerRef = useRef<View>(null);
  const keyboard = useKeyboardAwareField();

  const borderClass = error ? 'border-negative' : focused ? 'border-primary' : 'border-line';

  /* `editable={false}` mesti KELIHATAN tidak boleh disunting, bukan sekadar
     tidak bertindak balas — latar pudar yang sama seperti medan paparan sahaja
     dalam `MemberForm`, supaya kedua-duanya dibaca sebagai benda yang sama. */
  const readOnly = rest.editable === false;
  const surfaceClass = readOnly ? 'bg-background' : 'bg-surface';

  /* Medan berbilang baris perlu TUMBUH, jadi tinggi tetap ditukar kepada tinggi
     minimum dan teks dijajarkan ke atas. Tanpa itu, penerangan yang panjang
     ditaip ke dalam kotak setinggi satu baris yang menyembunyikan apa yang
     sudah ditulis. */
  const boxClass = rest.multiline
    ? 'min-h-[140px] flex-row items-start rounded-field border px-4 py-3'
    : 'h-14 flex-row items-center rounded-field border px-4';

  return (
    <View ref={containerRef} className="gap-2">
      <Text className="text-sm font-medium text-ink-muted">{label}</Text>

      <View className={`${boxClass} ${surfaceClass} ${borderClass}`}>
        <TextInput
          ref={inputRef}
          className={`flex-1 text-base ${readOnly ? 'text-ink-muted' : 'text-ink'}`}
          placeholderTextColor={colors.inkFaint}
          secureTextEntry={secure && hidden}
          textAlignVertical={rest.multiline ? 'top' : undefined}
          {...rest}
          onFocus={(event) => {
            setFocused(true);
            keyboard?.focus(containerRef.current, topAnchored ? { anchor: 'top' } : undefined);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            keyboard?.blur(containerRef.current);
            onBlur?.(event);
          }}
          onContentSizeChange={(event) => {
            // Medan multiline membesar semasa menaip — kekalkan bawahnya kelihatan.
            if (focused && rest.multiline) keyboard?.focus(containerRef.current, topAnchored ? { anchor: 'top' } : undefined);
            onContentSizeChange?.(event);
          }}
        />

        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Tunjuk kata laluan' : 'Sembunyi kata laluan'}
            hitSlop={10}
            onPress={() => setHidden((value) => !value)}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      {error ? <Text className="text-sm text-negative">{error}</Text> : null}
    </View>
  );
}
