import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { fetchMyMemberLinked } from '@/lib/members';
import { fetchUsrahYear, type UsrahYear } from '@/lib/usrah';
import { MONTH_LABELS } from '@/lib/usrah-import';

/**
 * Kehadiran usrah pengguna sendiri bagi tahun semasa — dua belas bulatan.
 *
 * Seksyen ini HILANG sepenuhnya apabila pengguna tiada rekod ahli. Dua belas
 * bulatan kelabu tanpa data tidak memberitahu apa-apa kecuali bahawa sesuatu
 * tidak berfungsi, dan itu bukan mesej yang patut menyambut seseorang di skrin
 * pertama.
 *
 * Warna membawa makna, bukan hiasan:
 *   hijau  — hadir
 *   hitam  — tidak hadir
 *   kelabu — belum ada rekod (termasuk bulan yang belum berlaku)
 */

const DOT_SIZE = 14;
/** Ruang untuk label menegak; label tiga huruf pada 9px muat dalam 26px. */
const LABEL_BOX = 26;

type State = { months: UsrahYear; ready: true } | { ready: false };

function dotColor(attended: boolean | null): string {
  if (attended === true) return Colors.primary;
  if (attended === false) return Colors.ink;
  return Colors.line;
}

export function UsrahStrip({ userId }: { userId: string | null }) {
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

          const months = await fetchUsrahYear(member.id, year);
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
    <View>
      <Text className="text-sm font-semibold text-ink">Kehadiran Usrah {year}</Text>

      <View className="mt-3 flex-row items-start justify-between">
        {MONTH_LABELS.map((label, index) => (
          <View key={label} className="items-center">
            <View
              style={{
                width: DOT_SIZE,
                height: DOT_SIZE,
                borderRadius: DOT_SIZE / 2,
                backgroundColor: dotColor(state.months[index] ?? null),
              }}
            />

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
                  color: Colors.inkFaint,
                  transform: [{ rotate: '-90deg' }],
                }}
                numberOfLines={1}>
                {label}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
