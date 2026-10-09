import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ThemeColors } from '@/constants/theme';
import { fetchMyMemberLinked } from '@/lib/members';
import { fetchUsrahYearDetail, type UsrahMonthDetail } from '@/lib/usrah';
import { MONTH_LABELS } from '@/lib/usrah-import';
import { useIsDesktop } from '@/lib/use-desktop';
import { useColors } from '@/lib/theme';

/**
 * Kehadiran usrah pengguna sendiri bagi tahun semasa — dua belas bulatan.
 *
 * Seksyen ini HILANG sepenuhnya apabila pengguna tiada rekod ahli. Dua belas
 * bulatan kelabu tanpa data tidak memberitahu apa-apa kecuali bahawa sesuatu
 * tidak berfungsi, dan itu bukan mesej yang patut menyambut seseorang di skrin
 * pertama.
 *
 * Warna membawa makna, bukan hiasan:
 *   hijau penuh          — hadir usrah
 *   atas kuning, bawah hijau — hadir melalui program "Ganti Usrah"
 *   hitam                — tidak hadir
 *   kelabu               — belum ada rekod (termasuk bulan yang belum berlaku)
 */

const DOT_SIZE = 14;
/** Ruang untuk label menegak; label tiga huruf pada 9px muat dalam 26px. */
const LABEL_BOX = 26;
/** Separuh atas bulatan program ganti. */
const GANTI_COLOR = '#EAB308';

type State = { months: UsrahMonthDetail[]; ready: true } | { ready: false };

function dotColor(attended: boolean | null, colors: ThemeColors): string {
  if (attended === true) return colors.primary;
  if (attended === false) return colors.ink;
  return colors.line;
}

/**
 * Satu bulatan. Program ganti dilukis sebagai dua separuh dalam bekas bulat
 * `overflow: hidden` — tiada SVG, jadi bentuk dan saiznya kekal sama dengan
 * bulatan biasa di sebelahnya.
 */
function MonthDot({ month }: { month: UsrahMonthDetail | undefined }) {
  const colors = useColors();
  const attended = month?.attended ?? null;
  const ganti = attended === true && month?.source === 'program_ganti';

  if (ganti) {
    return (
      <View
        style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, overflow: 'hidden' }}
        accessibilityLabel="Hadir melalui program ganti usrah">
        <View style={{ flex: 1, backgroundColor: GANTI_COLOR }} />
        <View style={{ flex: 1, backgroundColor: colors.primary }} />
      </View>
    );
  }

  return (
    <View
      style={{
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: dotColor(attended, colors),
      }}
    />
  );
}

export function UsrahStrip({ userId }: { userId: string | null }) {
  const colors = useColors();
  const router = useRouter();
  const desktop = useIsDesktop();
  const year = new Date().getFullYear();
  const [state, setState] = useState<State>({ ready: false });

  /*
    `useFocusEffect` dan bukan `useEffect`: kehadiran ditambah dari skrin lain
    (imbasan QR), jadi jalur ini perlu dibaca semula setiap kali Utama mendapat
    fokus semula — bukan sekali sahaja semasa dipasang. Tanpa ini, bulan yang
    baru direkodkan kekal kelabu sehingga app dimulakan semula.
  */
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;

      void (async () => {
        try {
          const member = await fetchMyMemberLinked(userId);
          if (!active || !member) return;

          const months = await fetchUsrahYearDetail(member.id, year);
          if (active) setState({ months, ready: true });
        } catch {
          // Widget ringkas di skrin utama — kegagalan bacaan menyembunyikannya,
          // bukan memaparkan ralat di atas sapaan pengguna.
          if (active) setState({ ready: false });
        }
      })();

      return () => {
        active = false;
      };
    }, [userId, year]),
  );

  if (!state.ready) return null;

  return (
    /*
      Garis nipis sahaja, tiada bayang dan tiada latar berlainan: jalur ini
      duduk antara dua kad gradient dan dua carousel, jadi ia perlu sempadan
      untuk dibaca sebagai satu seksyen — tetapi bukan berat yang menjadikannya
      kad ketiga.
    */
    // Seluruh kad boleh diketik — membuka Sejarah Kehadiran dengan kawasan, tempat dan tarikh.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Kehadiran Usrah ' + year + '. Ketik untuk lihat sejarah kehadiran.'}
      onPress={() => router.push('/(app)/usrah-sejarah')}
      className={`rounded-card border border-line p-card active:opacity-70 ${desktop ? 'bg-surface' : ''}`}>
      <View className="flex-row items-center">
        <Text className="flex-1 text-sm font-semibold text-ink">Kehadiran Usrah {year}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
      </View>

      <View className="mt-3 flex-row items-start justify-between">
        {MONTH_LABELS.map((label, index) => (
          <View key={label} className="items-center">
            <MonthDot month={state.months[index]} />

            {/*
              Label diputar, jadi kotaknya perlu bersaiz tetap: `transform`
              tidak mengubah susun atur, jadi teks yang diputar tetap menuntut
              lebar asalnya melainkan ia dikurung begini.
            */}
            <View
              style={{ width: DOT_SIZE, height: LABEL_BOX, alignItems: 'center', justifyContent: 'center' }}
              className="mt-1">
              <Text
                style={{
                  width: LABEL_BOX,
                  fontSize: 9,
                  textAlign: 'center',
                  color: colors.inkFaint,
                  transform: [{ rotate: '-90deg' }],
                }}
                numberOfLines={1}>
                {label}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
