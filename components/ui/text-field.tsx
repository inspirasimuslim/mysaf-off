import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = Omit<TextInputProps, 'style' | 'className'> & {
  label: string;
  error?: string | null;
  /** Papar butang tunjuk/sembunyi dan tetapkan secureTextEntry secara automatik. */
  secure?: boolean;
};

export function TextField({ label, error, secure = false, ...rest }: Props) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);

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
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink-muted">{label}</Text>

      <View className={`${boxClass} ${surfaceClass} ${borderClass}`}>
        <TextInput
          className={`flex-1 text-base ${readOnly ? 'text-ink-muted' : 'text-ink'}`}
          placeholderTextColor={Colors.inkFaint}
          secureTextEntry={secure && hidden}
          textAlignVertical={rest.multiline ? 'top' : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />

        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Tunjuk kata laluan' : 'Sembunyi kata laluan'}
            hitSlop={10}
            onPress={() => setHidden((value) => !value)}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={Colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      {error ? <Text className="text-sm text-negative">{error}</Text> : null}
    </View>
  );
}
