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
import {
  fetchPipisHistory,
  fetchPipisSummary,
  methodLabel,
  peratusLabel,
  ringgitPipis,
  type PipisContribution,
  type PipisSummary,
} from '@/lib/pipis';

/**
 * Sumbangan PIPIS ASET, seperti dilihat oleh ahli sendiri.
 *
 * Satu nombor besar di atas, kemudian sejarah setiap sumbangan. Tidak seperti
 * yuran, tiada apa yang perlu DIBUAT di skrin ini — PIPIS ialah sumbangan
 * sekali seumur hidup dan bukan hutang. Jadi nadanya ialah pengiktirafan dan
 * bukan tuntutan: 68% dipapar oren sebagai kemajuan, bukan merah sebagai
 * kegagalan.
 */

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; summary: PipisSummary; history: PipisContribution[] }
  | { step: 'tiada-rekod' }
  | { step: 'gagal'; message: string };

export default function PipisScreen() {
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
            Rekod ahli dicari dahulu kerana sumbangan dikunci pada `members.id`
            dan bukan pada akaun. Akaun yang belum dipautkan tiada rekod
            langsung — itu keadaan yang sah, bukan ralat.
          */
          const member = await fetchMyMemberLinked(userId);
          if (!active) return;

          if (!member) {
            setState({ step: 'tiada-rekod' });
            return;
          }

          const [summary, history] = await Promise.all([
            fetchPipisSummary(member.id),
            fetchPipisHistory(member.id),
          ]);
          if (active) setState({ step: 'sedia', summary, history });
        } catch (caught) {
          if (active) {
            setState({ step: 'gagal', message: toMalayError(caught, 'Gagal memuatkan rekod sumbangan.') });
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
        <ScreenHeader eyebrow="Ekonomi & Aset" title="PIPIS ASET" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="business-outline"
            title="Belum ada rekod sumbangan"
            description="Akaun anda belum dipadankan dengan rekod ahli. Hubungi pentadbir untuk memautkannya."
          />
        </View>
      </Screen>
    );
  }

  if (state.step === 'gagal') {
    return (
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Ekonomi & Aset" title="PIPIS ASET" onBackPress={goBack} />
        <View className="px-gutter pt-6">
          <Notice tone="negative" message={state.message} />
        </View>
      </Screen>
    );
  }

  const { summary, history } = state;
  const reached = summary.jumlah >= summary.sasaran;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Ekonomi & Aset"
        title="PIPIS ASET"
        subtitle="Sumbangan sekali seumur hidup RM5,000"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {/*
          Kad hijau pekat bila sasaran dicapai, kad putih dengan angka oren bila
          belum. Oren dan bukan merah dengan sengaja: belum cukup bukan satu
          kesalahan, dan skrin ini tidak menuntut apa-apa daripada sesiapa.
        */}
        <Card tone={reached ? 'primary' : 'surface'}>
          <Text className={`text-sm ${reached ? 'text-white/70' : 'text-ink-muted'}`}>
            {reached ? 'Sumbangan anda' : 'Jumlah sumbangan'}
          </Text>

          <Text
            className={`mt-2 text-stat-lg font-bold ${reached ? 'text-white' : 'text-warn'}`}>
            {ringgitPipis(summary.jumlah)}
          </Text>

          {reached ? (
            <>
              <Text className="mt-2 text-base font-semibold text-white">
                {summary.jumlah > summary.sasaran
                  ? 'Lebih RM5,000 — Terima kasih!'
                  : 'Cukup RM5,000 — Terima kasih!'}
              </Text>
              <Text className="mt-1 text-sm text-white/70">
                {peratusLabel(summary.peratus) + ' daripada sasaran RM5,000.'}
              </Text>
            </>
          ) : (
            <>
              <Text className="mt-2 text-base font-semibold text-ink">
                {'dari RM5,000 (' + peratusLabel(summary.peratus) + ')'}
              </Text>
              <ProgressBar peratus={summary.peratus} />
              <Text className="mt-2 text-sm text-ink-muted">
                {'Baki ke sasaran: ' + ringgitPipis(summary.sasaran - summary.jumlah) + '.'}
              </Text>
            </>
          )}
        </Card>

        <View className="pb-8">
          <SectionTitle
            title="Sejarah Sumbangan"
            caption="Setiap catatan direkod oleh Lajnah Ekonomi dan Aset."
          />

          {history.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="Tiada rekod lagi"
              description="Sumbangan anda akan muncul di sini sebaik ia direkodkan."
            />
          ) : (
            <View className="gap-2">
              {history.map((row) => (
                <View key={row.id} className="rounded-field border border-line bg-surface p-4">
                  <View className="flex-row items-center gap-3">
                    <Text className="text-base font-bold text-ink">{ringgitPipis(row.amount)}</Text>
                    <View className="flex-1" />
                    <Badge
                      label={methodLabel(row.method)}
                      tone={row.amount < 0 ? 'warn' : 'info'}
                    />
                  </View>

                  <Text className="mt-2 text-xs text-ink-muted">
                    {new Date(row.created_at).toLocaleDateString('ms-MY')}
                    {row.note ? ' · ' + row.note : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

/**
 * Bar kemajuan mudah — dihadkan pada 100% lebar walaupun peratusnya lebih.
 *
 * Ia hanya dilukis bila sasaran BELUM dicapai, jadi pengapitan itu tidak pernah
 * menyembunyikan apa-apa: kad "lebih RM5,000" menyatakan peratus sebenarnya
 * dengan perkataan dan tidak memerlukan bar yang melimpah keluar kadnya.
 */
function ProgressBar({ peratus }: { peratus: number }) {
  const width = Math.min(Math.max(peratus, 0), 100);

  return (
    <View className="mt-3 h-2 overflow-hidden rounded-pill bg-warn-soft">
      <View className="h-full rounded-pill bg-warn" style={{ width: `${width}%` }} />
    </View>
  );
}
