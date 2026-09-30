import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { GenerationChip } from '@/components/ui/generation-chip';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { toMalayError } from '@/lib/errors';
import { fetchMbmCouples } from '@/lib/mbm';
import { useGoBack } from '@/lib/navigation';
import type { MbmCouple } from '@/types/database';

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; rows: MbmCouple[] }
  | { step: 'gagal'; message: string };

/**
 * Senarai pasangan Ahli MBM — dibuka oleh SEMUA ahli daripada tab Ahli.
 *
 * `list_mbm_couples()` hanya memulangkan pasangan yang pautannya SAH dua hala
 * (kedua-dua belah `spouse_member_id` menunjuk kepada satu sama lain), dan
 * hanya lapan field terhad — NRIC, alamat dan medan sensitif lain tidak
 * pernah sampai ke skrin ini.
 */
export default function AhliMbmScreen() {
  const goBack = useGoBack();
  const [state, setState] = useState<State>({ step: 'memuat' });

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const rows = await fetchMbmCouples();
        if (active) setState({ step: 'sedia', rows });
      } catch (caught) {
        if (active) {
          setState({ step: 'gagal', message: toMalayError(caught, 'Gagal memuatkan senarai Ahli MBM.') });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

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
          icon="heart-outline"
          title="Tiada pasangan Ahli MBM direkodkan"
          description="Pasangan dipaparkan di sini selepas kedua-dua belah dipautkan dalam borang profil masing-masing."
        />
      );
    }

    return (
      <View className="gap-3 px-gutter pb-8 pt-4">
        {state.rows.map((row, index) => (
          <CoupleCard key={row.nama_suami + ':' + row.nama_isteri + ':' + index} row={row} />
        ))}
      </View>
    );
  }, [state]);

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Direktori"
        title="Ahli MBM"
        subtitle={state.step === 'sedia' ? state.rows.length + ' pasangan' : undefined}
        onBackPress={goBack}
      />

      {body()}
    </Screen>
  );
}

/** Satu kad setiap pasangan — suami di atas, isteri di bawah, butiran ringkas di penjuru. */
function CoupleCard({ row }: { row: MbmCouple }) {
  return (
    <View className="gap-3 rounded-card border border-line bg-surface p-4">
      <View className="gap-2">
        <Spouse label="Suami" nama={row.nama_suami} generasi={row.generasi_suami} />
        <View className="h-px bg-line" />
        <Spouse label="Isteri" nama={row.nama_isteri} generasi={row.generasi_isteri} />
      </View>

      {row.tahun_berkahwin || row.bil_anak !== null ? (
        <View className="gap-1.5 border-t border-line pt-3">
          {row.tahun_berkahwin ? (
            <DetailRow icon="calendar-outline" text={'Berkahwin ' + row.tahun_berkahwin} />
          ) : null}
          {row.bil_anak !== null ? (
            <DetailRow icon="people-outline" text={row.bil_anak + ' orang anak'} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Spouse({ label, nama, generasi }: { label: string; nama: string; generasi: string | null }) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="w-12 text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</Text>
      <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
        {nama}
      </Text>
      <GenerationChip code={generasi} />
    </View>
  );
}

function DetailRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Ionicons name={icon} size={14} color={Colors.inkFaint} style={{ marginTop: 2 }} />
      <Text className="flex-1 text-sm leading-5 text-ink-muted">{text}</Text>
    </View>
  );
}
