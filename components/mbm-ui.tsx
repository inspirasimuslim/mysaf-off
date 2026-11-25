import { Asset } from 'expo-asset';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Image, ImageBackground, Platform, Pressable, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';

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
const CORAK = require('@/assets/images/mbm-corak.png');

/**
 * Latar hijau bercorak. Web: `resizeMode="repeat"` tidak mengubin gambar (hanya satu salinan di
 * penjuru, selebihnya hijau kosong), jadi guna CSS background yang diulang. Native: ImageBackground.
 */
/** Percubaan minimalis: `false` = hijau rata tanpa corak. Tukar ke `true` untuk memulihkan corak. */
const GUNA_CORAK = false;

export function MbmGreen({ children, className }: { children: ReactNode; className?: string }) {
  if (!GUNA_CORAK) {
    return (
      <View style={{ backgroundColor: MBM.emerald }} className={className}>
        {children}
      </View>
    );
  }
  if (Platform.OS === 'web') {
    const uri = Asset.fromModule(CORAK).uri;
    const webStyle = {
      backgroundColor: MBM.emerald,
      backgroundImage: uri ? 'url(' + uri + ')' : undefined,
      backgroundRepeat: 'repeat',
    } as unknown as object;
    return (
      <View style={webStyle} className={className}>
        {children}
      </View>
    );
  }
  return (
    <ImageBackground source={CORAK} resizeMode="repeat" style={{ backgroundColor: MBM.emerald }} className={className}>
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

/**
 * Gambar berbingkai emas dengan nisbah asal gambar (tiada crop). Saiz dikira dalam piksel
 * kerana `aspectRatio` dengan lebar peratus tidak boleh dipercayai dalam bekas yang
 * dipusatkan (hasilnya bingkai tinggi dan sempit di web).
 */
export function MbmFramedImage({
  source,
  ratio,
  label,
  maxWidth = 300,
  radius = 28,
}: {
  source: ImageSourcePropType;
  ratio: number;
  label: string;
  maxWidth?: number;
  radius?: number;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(160, Math.min(maxWidth, windowWidth - 120));
  const height = Math.round(width / ratio);
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        borderWidth: 3,
        borderColor: MBM.gold,
        overflow: 'hidden',
        backgroundColor: MBM.ivory,
      }}>
      <Image source={source} accessibilityLabel={label} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}
