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
  /** `false` mengunci helaian semasa penghantaran berjalan supaya borang tidak hilang separuh jalan. */
  dismissable?: boolean;
  /**
   * Dipaparkan di bawah kandungan yang ditatal, bukan di dalamnya — untuk
   * butang hantar yang mesti sentiasa kelihatan walaupun senarai di atasnya
   * lebih panjang daripada skrin.
   */
  footer?: ReactNode;
  children: ReactNode;
};

/** Helaian ringkas untuk borang pendek (tukar emel / kata laluan). */
export function FormModal({ visible, title, description, onClose, dismissable = true, footer, children }: Props) {
  const insets = useSafeAreaInsets();

  const close = () => {
    if (dismissable) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View className="flex-1 justify-end bg-black/40">
        {/* Ketuk di luar helaian untuk tutup. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup"
          accessibilityState={{ disabled: !dismissable }}
          disabled={!dismissable}
          className="absolute inset-0"
          onPress={close}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ maxHeight: '90%' }}>
          {/*
            flexShrink WAJIB di sini. Tanpanya helaian mengambil tinggi penuh
            kandungannya dan melimpah keluar dari had 90% di atas — bahagian
            bawahnya (butang hantar dan padding inset) jatuh di bawah bar
            navigasi sistem, dan ScrollView di dalam tidak pernah mengecil.
          */}
          <View
            className="w-full self-center rounded-t-[28px] bg-background px-gutter pt-6"
            style={{ maxWidth: MAX_SHEET_WIDTH, flexShrink: 1, paddingBottom: insets.bottom + 24 }}>
            <View className="mb-5 flex-row items-start gap-4">
              <View className="flex-1">
                <Text className="text-xl font-bold text-ink">{title}</Text>
                {description ? <Text className="mt-1.5 text-sm leading-5 text-ink-muted">{description}</Text> : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tutup"
                accessibilityState={{ disabled: !dismissable }}
                disabled={!dismissable}
                hitSlop={10}
                onPress={close}
                className={`h-9 w-9 items-center justify-center rounded-pill border border-line bg-surface ${
                  dismissable ? 'active:opacity-70' : 'opacity-40'
                }`}>
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

            {footer ? <View className="pt-4">{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
