import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { GenerationChip } from '@/components/ui/generation-chip';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { BIRTHDAY_GOLD } from '@/constants/theme';
import { fetchBirthdaysThisMonth, type BirthdayThisMonth } from '@/lib/birthdays';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { MONTH_NAMES } from '@/types/database';

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; rows: BirthdayThisMonth[] }
  | { step: 'gagal'; message: string };

/**
 * Hari jadi sepanjang bulan semasa — dibuka oleh SEMUA ahli, dari ketukan pada
 * ucapan di skrin Utama atau butang di tab Ahli.
 *
 * `birthday_this_month()` memulangkan hari dan bulan sahaja; tahun lahir tidak
 * pernah meninggalkan pangkalan data, jadi skrin ini tidak boleh mendedahkan
 * umur sesiapa walaupun ia mahu.
 *
 * Susunan datang dari SQL (hari menaik) dan tidak diisih semula di sini —
 * senarai ini kalendar, jadi tempat setiap nama ditentukan oleh tarikhnya.
 */
export default function HariJadiBulanScreen() {
  const goBack = useGoBack();
  const [state, setState] = useState<State>({ step: 'memuat' });

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const rows = await fetchBirthdaysThisMonth();
        if (active) setState({ step: 'sedia', rows });
      } catch (caught) {
        if (active) {
          setState({ step: 'gagal', message: toMalayError(caught, 'Gagal memuatkan senarai hari jadi.') });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  /*
    Nama bulan untuk TAJUK diambil dari jam peranti, bukan dari baris pertama
    senarai: bulan tanpa seorang pun yang menyambut tetap perlu bernama, dan
    tajuk "Hari Jadi Bulan" tanpa bulan membaca seperti kerosakan.
  */
  const monthName = MONTH_NAMES[new Date().getMonth()] ?? '';

  const body = useCallback(() => {
    if (state.step === 'memuat') return <LoadingScreen />;

    if (state.step === 'gagal') {
      return (
        <View className="px-gutter pt-6">
          <Notice tone="negative" message={state.message} />
        </View>
      );
    }

    if (!state.rows.length) {
      return (
        <EmptyState
          icon="gift-outline"
          title="Tiada ahli sambut hari jadi bulan ini"
          description={'Tiada tarikh lahir yang jatuh pada bulan ' + monthName + ' dalam rekod ahli.'}
        />
      );
    }

    return (
      <View className="gap-2 px-gutter pb-8 pt-4">
        {state.rows.map((row, index) => (
          <BirthdayCard key={row.full_name + ':' + index} row={row} />
        ))}
      </View>
    );
  }, [monthName, state]);

  return (
    <Screen padTop={false}>
      {/*
        Tajuk dipecah antara eyebrow dan tajuk, bukan satu baris penuh:
        `ScreenHeader` mengunci tajuknya pada satu baris, dan "Hari Jadi Bulan
        September" terpotong jadi "Hari Jadi Bula..." pada lebar telefon.
        Dibaca dari atas ke bawah, ayatnya tetap sama.
      */}
      <ScreenHeader
        eyebrow="Hari Jadi Bulan"
        title={monthName}
        subtitle={state.step === 'sedia' ? state.rows.length + ' ahli' : undefined}
        onBackPress={goBack}
      />

      {body()}
    </Screen>
  );
}

/** Singkatan tiga huruf, selari dengan `MONTH_NAMES`. */
const MONTH_SHORT = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'] as const;

/**
 * Bulan dibaca daripada `tarikh_lahir` ('15 September') yang dibina oleh
 * pangkalan data dalam waktu Malaysia — bukan jam peranti — supaya kotak
 * tarikh tidak tersasar sebulan pada malam pertukaran bulan.
 */
function shortMonth(tarikh: string): string {
  const index = MONTH_NAMES.findIndex((name) => tarikh.endsWith(name));
  return MONTH_SHORT[index >= 0 ? index : new Date().getMonth()] ?? '';
}

/**
 * Satu baris padat: kotak tarikh emas di kiri, nama dan generasi sebaris.
 *
 * Kotak tarikh sahaja membawa tarikh — tiada ulangan "15 September" di bawah
 * nama — dan lajur kotak yang sekata membolehkan mata menyusuri tarikh tanpa
 * membaca setiap nama. Nama dipotong pada satu baris supaya setiap baris sama
 * tinggi dan lebih banyak nama muat dalam satu skrin.
 */
function BirthdayCard({ row }: { row: BirthdayThisMonth }) {
  return (
    <View className="flex-row items-center gap-3 rounded-field border border-line bg-surface px-3 py-2">
      <View
        className="w-11 items-center justify-center rounded-lg py-1"
        style={{ backgroundColor: BIRTHDAY_GOLD + '1A' }}>
        <Text className="text-base font-bold leading-5" style={{ color: BIRTHDAY_GOLD }}>
          {row.hari}
        </Text>
        <Text className="text-xs font-semibold leading-4" style={{ color: BIRTHDAY_GOLD }}>
          {shortMonth(row.tarikh_lahir)}
        </Text>
      </View>

      <View className="flex-1 flex-row items-center gap-2">
        <Text className="shrink text-base font-semibold text-ink" numberOfLines={1} ellipsizeMode="tail">
          {row.full_name}
        </Text>
        <GenerationChip code={row.generasi} />
      </View>

      <Ionicons name="gift-outline" size={15} color={BIRTHDAY_GOLD} />
    </View>
  );
}
