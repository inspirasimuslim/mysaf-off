import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ImageBackground, Platform, Pressable, Text, View } from 'react-native';

/**
 * Elemen visual halaman Majlis Baitul Muslim — tema dewan akad nikah (zamrud + emas + merah jambu pudar).
 * Palet tetap (tidak mengikut tema cerah/gelap) kerana ia satu identiti visual tersendiri.
 */
export const MBM = {
  emerald: '#0E4A43',
  emeraldDeep: '#072B27',
  gold: '#C79B3B',
  goldLight: '#EBD393',
  rose: '#F2D6CF',
  roseDeep: '#A93E55',
  ivory: '#FBF3EA',
  ink: '#1C2A26',
} as const;

export const MBM_SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });

/** Latar zamrud dengan corak geometri emas yang samar. */
export function MbmGreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ImageBackground
      source={require('@/assets/images/mbm-corak.png')}
      resizeMode="repeat"
      style={{ backgroundColor: MBM.emerald }}
      imageStyle={{ opacity: 1 }}
      className={className}>
      {children}
    </ImageBackground>
  );
}

/** Garis emas dengan berlian di tengah. */
export function MbmDivider() {
  return (
    <View className="my-3 flex-row items-center justify-center gap-2">
      <View style={{ height: 1.5, width: 64, backgroundColor: MBM.gold }} />
      <Ionicons name="diamond" size={11} color={MBM.gold} />
      <View style={{ height: 1.5, width: 64, backgroundColor: MBM.gold }} />
    </View>
  );
}

export function MbmHeading({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <Text
      accessibilityRole="header"
      style={{ fontFamily: MBM_SERIF, fontSize: 25, lineHeight: 31, textAlign: 'center', color: light ? MBM.goldLight : MBM.emerald }}>
      {children}
    </Text>
  );
}

export function MbmGoldButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: MBM.gold,
        borderRadius: 14,
        paddingVertical: 15,
        alignItems: 'center',
        borderBottomWidth: 3,
        borderBottomColor: '#8A6A1F',
        opacity: disabled ? 0.55 : 1,
      }}>
      <Text style={{ color: MBM.emeraldDeep, fontWeight: '700', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}
