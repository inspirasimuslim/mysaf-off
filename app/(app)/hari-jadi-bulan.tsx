import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
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
      <View className="gap-3 px-gutter pb-8 pt-6">
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

/**
 * Satu baris: hari dalam bulatan emas di kiri, nama dan generasi di kanan.
 *
 * Nombor hari dipaparkan besar dan berulang supaya mata boleh menyusuri
 * lajur kiri untuk mencari tarikh, tanpa membaca setiap nama.
 */
function BirthdayCard({ row }: { row: BirthdayThisMonth }) {
  return (
    <View className="flex-row items-center gap-4 rounded-card border border-line bg-surface p-card">
      <View
        className="h-12 w-12 items-center justify-center rounded-pill"
        style={{ backgroundColor: BIRTHDAY_GOLD + '1A' }}>
        <Text className="text-lg font-bold" style={{ color: BIRTHDAY_GOLD }}>
          {row.hari}
        </Text>
      </View>

      <View className="flex-1">
        <Text className="text-base font-semibold text-ink">{row.full_name}</Text>
        <Text className="mt-0.5 text-sm text-ink-muted">
          {row.tarikh_lahir + (row.generasi ? ' · Generasi ' + row.generasi : '')}
        </Text>
      </View>

      <Ionicons name="gift-outline" size={18} color={BIRTHDAY_GOLD} />
    </View>
  );
}
