import { Image } from 'expo-image';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';

import { Colors } from '@/constants/theme';

/**
 * Poster program dengan kod QR kehadiran di penjuru — dilukis sebagai View
 * biasa, kemudian ditangkap menjadi SATU imej JPEG.
 *
 * Komposisi dibuat dalam susun atur app dan bukan dalam kanvas sendiri: poster
 * dan kod QR sudah dilukis dengan betul oleh `expo-image` dan
 * `react-native-qrcode-svg`, jadi `react-native-view-shot` hanya perlu
 * mengambil gambar apa yang sudah kelihatan pada skrin. Pratonton yang admin
 * lihat ialah imej yang akan dihasilkan.
 *
 * Kod QR diletak dalam kotak putih dengan zon senyap di sekelilingnya: tanpa
 * latar putih, kod di atas poster yang gelap atau bercorak tidak dapat dibaca
 * oleh kamera.
 */

/** Lebar imej hasil. Tinggi mengikut nisbah poster asal. */
const OUTPUT_WIDTH = 1440;

/** Saiz kod QR sebagai pecahan lebar poster. */
const QR_FRACTION = 0.26;

export type PosterQrComposerHandle = {
  /** URI imej hasil — `data:` di web, fail sementara di peranti. */
  capture: () => Promise<string>;
};

type Props = {
  posterUrl: string;
  qrValue: string;
  /** `true` bila poster selesai dimuat — tangkapan sebelum itu menghasilkan kotak kosong. */
  onReady?: (ready: boolean) => void;
  ref?: Ref<PosterQrComposerHandle>;
};

export function PosterQrComposer({ posterUrl, qrValue, onReady, ref }: Props) {
  const viewRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();
  const [aspect, setAspect] = useState(3 / 4);
  /*
    Lebar sebenar datang daripada `onLayout`; sebelum itu, anggaran daripada
    lebar skrin (kandungan maks 560, tolak gutter 20 setiap sisi). Tanpa
    anggaran ini kod QR tidak dilukis sehingga susun atur diukur — dan imej
    yang ditangkap sebelum itu ialah poster TANPA kod QR.
  */
  const [measured, setMeasured] = useState(0);
  const width = measured || Math.min(windowWidth, 560) - 40;

  useImperativeHandle(
    ref,
    () => ({
      capture: async () => {
        if (!viewRef.current) throw new Error('Pratonton poster belum sedia.');
        return captureRef(viewRef, {
          format: 'jpg',
          quality: 0.95,
          width: OUTPUT_WIDTH,
          height: Math.round(OUTPUT_WIDTH / aspect),
          result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
        });
      },
    }),
    [aspect],
  );

  const qrSize = Math.max(64, Math.round(width * QR_FRACTION));
  const pad = Math.round(qrSize * 0.08);

  return (
    /*
      Sudut membulat pada pembalut pratonton SAHAJA. View yang ditangkap mesti
      segi empat tepat: sudut bulat di dalam tangkapan menjadi putih di web dan
      boleh menjadi hitam dalam JPEG di peranti (JPEG tiada ketelusan).
    */
    <View style={{ width: '100%', overflow: 'hidden', borderRadius: 12 }}>
      <View
        ref={viewRef}
        collapsable={false}
        onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
        style={{ width: '100%', aspectRatio: aspect, backgroundColor: Colors.white }}>
        <Image
          source={{ uri: posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          // Keutamaan muat tinggi: butang jana menunggu `onLoad`, jadi poster ini
          // patut dimuat sebelum imej lain dalam skrin. (Di web gambar kekal
          // `loading="lazy"` — ia dimuat sebaik kelihatan dalam tab yang dibuka.)
          priority="high"
          // Tiada `transition`: tangkapan semasa pudar-masuk menghasilkan poster separuh lutsinar.
          onLoad={(event) => {
            const { width: w, height: h } = event.source;
            if (w && h) setAspect(w / h);
            onReady?.(true);
          }}
          onError={() => onReady?.(false)}
          accessibilityLabel="Poster program"
        />

        {width > 0 ? (
          <View
            style={{
              position: 'absolute',
              right: Math.round(width * 0.04),
              bottom: Math.round(width * 0.04),
              padding: pad,
              borderRadius: Math.round(pad * 1.2),
              backgroundColor: Colors.white,
              alignItems: 'center',
            }}>
            <QRCode value={qrValue} size={qrSize} color={Colors.ink} backgroundColor={Colors.white} />
            <Text
              style={{ marginTop: Math.round(pad * 0.6), fontSize: Math.max(8, Math.round(qrSize * 0.085)), color: Colors.ink }}
              className="font-semibold">
              Imbas untuk kehadiran
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
