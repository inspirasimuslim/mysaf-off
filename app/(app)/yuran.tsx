import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { useAuth } from '@/lib/auth-context';
import { toMalayError } from '@/lib/errors';
import { fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { fetchYuranSummary, ringgit, type YuranSummary } from '@/lib/yuran';

/**
 * Yuran keahlian, seperti dilihat oleh ahli sendiri.
 *
 * Satu nombor besar di atas, kemudian pecahan tahun demi tahun. Nombor besar
 * itu ialah baki KESELURUHAN dan bukan baki tahun semasa: hutang tidak berhenti
 * di sempadan tahun, dan seseorang yang berhutang RM120 tidak terbantu dengan
 * skrin yang berkata RM30.
 */

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; summary: YuranSummary }
  | { step: 'tiada-rekod' }
  | { step: 'gagal'; message: string };

export default function YuranScreen() {
  const { user } = useAuth();
  const goBack = useGoBack();

  const [state, setState] = useState<State>({ step: 'memuat' });

  useFocusEffect(
    useCallback(() => {
      const userId = user?.id ?? null;
      if (!userId) return;

      let active = true;

      void (async () => {
        try {
          /*
            Rekod ahli dicari dahulu kerana yuran dikunci pada `members.id` dan
            bukan pada akaun. Akaun yang belum dipautkan tiada rekod yuran
            langsung — itu keadaan yang sah, bukan ralat.
          */
          const member = await fetchMyMemberLinked(userId);
          if (!active) return;

          if (!member) {
            setState({ step: 'tiada-rekod' });
            return;
          }

          const summary = await fetchYuranSummary(member.id);
          if (active) setState({ step: 'sedia', summary });
        } catch (caught) {
          if (active) {
            setState({ step: 'gagal', message: toMalayError(caught, 'Gagal memuatkan rekod yuran.') });
          }
        }
      })();

      return () => {
        active = false;
      };
    }, [user?.id]),
  );

  if (state.step === 'memuat') return <LoadingScreen />;

  if (state.step === 'tiada-rekod') {
    return (
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Kewangan" title="Yuran" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="wallet-outline"
            title="Belum ada rekod yuran"
            description="Akaun anda belum dipadankan dengan rekod ahli. Hubungi pentadbir untuk memautkannya."
          />
        </View>
      </Screen>
    );
  }

  if (state.step === 'gagal') {
    return (
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Kewangan" title="Yuran" onBackPress={goBack} />
        <View className="px-gutter pt-6">
          <Notice tone="negative" message={state.message} />
        </View>
      </Screen>
    );
  }

  const { tertunggak, kredit, years } = state.summary;
  const settled = tertunggak === 0;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Kewangan"
        title="Yuran"
        subtitle="Yuran keahlian RM30 setahun"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {/*
          Warna membawa makna: hijau bermakna tiada apa yang perlu dibuat, merah
          bermakna ada. Kredit dipapar hijau kerana ia juga bermakna tiada apa
          yang perlu dibuat — cuma dengan sebab yang berbeza.
        */}
        <Card tone={settled ? 'primary' : 'surface'}>
          <Text className={`text-sm ${settled ? 'text-white/70' : 'text-ink-muted'}`}>
            {settled ? 'Status yuran' : 'Jumlah tertunggak'}
          </Text>

          {settled ? (
            <>
              <Text className="mt-2 text-stat font-bold text-white">Lunas</Text>
              <Text className="mt-2 text-sm text-white/70">
                {kredit > 0
                  ? 'Anda mempunyai kredit ' + ringgit(kredit) + ' yang akan ditolak daripada caj akan datang.'
                  : 'Tiada tunggakan. Terima kasih.'}
              </Text>
            </>
          ) : (
            <>
              <Text className="mt-2 text-stat-lg font-bold text-negative">{ringgit(tertunggak)}</Text>
              <Text className="mt-2 text-sm text-ink-muted">
                Merangkumi baki permulaan dan yuran tahunan yang belum dijelaskan.
              </Text>
            </>
          )}
        </Card>

        <View className="pb-8">
          <SectionTitle
            title="Pecahan Tahun"
            caption="Baris 2025 ialah baki permulaan — hutang terkumpul sebelum sistem ini."
          />

          {years.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="Tiada rekod lagi"
              description="Yuran anda akan muncul di sini sebaik ia direkodkan oleh Bendahari."
            />
          ) : (
            <View className="gap-2">
              {years.map((row) => {
                const outstanding = row.baki > 0;
                return (
                  <View key={row.year} className="rounded-field border border-line bg-surface p-4">
                    <View className="flex-row items-center gap-3">
                      <Text className="text-base font-bold text-ink">{row.year}</Text>
                      {row.is_opening_balance ? <Badge label="Baki permulaan" tone="info" /> : null}
                      <View className="flex-1" />
                      <Badge
                        label={row.baki > 0 ? ringgit(row.baki) : row.baki < 0 ? 'Kredit' : 'Lunas'}
                        tone={outstanding ? 'negative' : 'positive'}
                      />
                    </View>

                    <View className="mt-3 flex-row justify-between">
                      <Cell label="Dicaj" value={ringgit(row.amount_due)} />
                      <Cell label="Dibayar" value={ringgit(row.total_paid)} />
                      <Cell label="Baki" value={ringgit(Math.max(row.baki, 0))} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs text-ink-muted">{label}</Text>
      <Text className="mt-0.5 text-sm font-semibold text-ink">{value}</Text>
    </View>
  );
}
