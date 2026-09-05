import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

const MAX_SHEET_WIDTH = 560;

type Props = {
  visible: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

/** Helaian ringkas untuk borang pendek (tukar emel / kata laluan). */
export function FormModal({ visible, title, description, onClose, children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        {/* Ketuk di luar helaian untuk tutup. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup"
          className="absolute inset-0"
          onPress={onClose}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ maxHeight: '90%' }}>
          <View
            className="w-full self-center rounded-t-[28px] bg-background px-gutter pt-6"
            style={{ maxWidth: MAX_SHEET_WIDTH, paddingBottom: insets.bottom + 24 }}>
            <View className="mb-5 flex-row items-start gap-4">
              <View className="flex-1">
                <Text className="text-xl font-bold text-ink">{title}</Text>
                {description ? <Text className="mt-1.5 text-sm leading-5 text-ink-muted">{description}</Text> : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tutup"
                hitSlop={10}
                onPress={onClose}
                className="h-9 w-9 items-center justify-center rounded-pill border border-line bg-surface active:opacity-70">
                <Ionicons name="close" size={18} color={Colors.ink} />
              </Pressable>
            </View>

            {/* flexShrink membenarkan senarai mengecil bila ruang skrin terhad. */}
            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View className="gap-4 pb-1">{children}</View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
