import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { UsrahMonthRecordRow } from '@/components/usrah-month-record';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/lib/auth-context';
import { toMalayError } from '@/lib/errors';
import { fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { fetchUsrahYearRecords, usrahYearOptions, type UsrahMonthRecord } from '@/lib/usrah';

/**
 * Sejarah Kehadiran Usrah ahli sendiri — dibuka dengan mengetik jalur
 * 12 bulatan di Utama.
 *
 * Jalur itu menjawab "hadir atau tidak"; skrin ini menambah DI MANA dan BILA.
 * Butiran hanya wujud untuk kehadiran melalui imbasan QR atau yang direkod oleh
 * admin — rekod import lama dipapar "Tiada rekod kawasan" dan bukan tekaan.
 */

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; months: UsrahMonthRecord[] }
  | { step: 'tiada-rekod' }
  | { step: 'gagal'; message: string };

const YEAR_OPTIONS = usrahYearOptions();

export default function UsrahSejarahScreen() {
  const { user } = useAuth();
  const goBack = useGoBack();

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [state, setState] = useState<State>({ step: 'memuat' });

  useFocusEffect(
    useCallback(() => {
      const userId = user?.id ?? null;
      if (!userId) return;
      let active = true;

      void (async () => {
        try {
          const member = await fetchMyMemberLinked(userId);
          if (!active) return;
          if (!member) {
            setState({ step: 'tiada-rekod' });
            return;
          }
          const months = await fetchUsrahYearRecords(member.id, Number(year));
          if (active) setState({ step: 'sedia', months });
        } catch (caught) {
          if (active) setState({ step: 'gagal', message: toMalayError(caught, 'Gagal memuatkan sejarah kehadiran.') });
        }
      })();

      return () => {
        active = false;
      };
    }, [user?.id, year]),
  );

  const header = (
    <ScreenHeader eyebrow="Tarbiah" title="Sejarah Kehadiran Usrah" onBackPress={goBack} />
  );

  if (state.step === 'memuat') return <LoadingScreen />;

  if (state.step === 'tiada-rekod') {
    return (
      <Screen padTop={false}>
        {header}
        <View className="px-gutter">
          <EmptyState
            icon="people-outline"
            title="Belum ada rekod kehadiran"
            description="Akaun anda belum dipadankan dengan rekod ahli. Hubungi pentadbir untuk memautkannya."
          />
        </View>
      </Screen>
    );
  }

  const months = state.step === 'sedia' ? state.months : [];
  const hadir = months.filter((month) => month.attended === true).length;

  return (
    <Screen padTop={false}>
      {header}

      <View className="gap-4 px-gutter pb-8 pt-6">
        <PickerField
          label="Tahun"
          value={year}
          options={YEAR_OPTIONS}
          clearable={false}
          onChange={(next) => {
            if (!next || next === year) return;
            setState({ step: 'memuat' });
            setYear(next);
          }}
        />

        {state.step === 'gagal' ? (
          <Notice tone="negative" message={state.message} />
        ) : (
          <>
            <Text className="text-sm text-ink-muted">{'Hadir ' + hadir + ' daripada 12 bulan pada ' + year + '.'}</Text>
            <View className="gap-2">
              {months.map((record) => (
                <UsrahMonthRecordRow key={record.month} record={record} />
              ))}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
