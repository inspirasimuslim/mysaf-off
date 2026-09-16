import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/lib/auth-context';
import { toMalayError } from '@/lib/errors';
import { fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import {
  createPipisBill,
  displayAmount,
  fetchPipisHistory,
  fetchPipisSummary,
  methodLabel,
  paymentStatusLabel,
  peratusLabel,
  refreshPipisPayment,
  ringgitPipis,
  type PipisContribution,
  type PipisSummary,
} from '@/lib/pipis';

/**
 * Sumbangan PIPIS ASET, seperti dilihat oleh ahli sendiri.
 *
 * Satu nombor besar di atas, pilihan untuk menyumbang terus secara online, dan
 * sejarah setiap sumbangan. PIPIS ialah sumbangan sekali seumur hidup dan bukan
 * hutang, jadi nadanya pengiktirafan dan bukan tuntutan: 68% dipapar oren
 * sebagai kemajuan, bukan merah sebagai kegagalan.
 *
 * Bayaran online TIDAK menambah jumlah di app. Jumlah hanya naik bila pelayan
 * sudah mengesahkan bayaran dengan ToyyibPay — skrin ini sekadar memuat semula
 * dan memberitahu ahli jika pengesahan itu belum tiba.
 */

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; summary: PipisSummary; history: PipisContribution[] }
  | { step: 'tiada-rekod' }
  | { step: 'gagal'; message: string };

type PaymentNotice = { tone: 'positive' | 'negative' | 'warn' | 'info'; message: string };

const PENDING_MESSAGE = 'Bayaran sedang diproses. Semak semula sebentar lagi.';

export default function PipisScreen() {
  const { user } = useAuth();
  const goBack = useGoBack();

  const [state, setState] = useState<State>({ step: 'memuat' });
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [notice, setNotice] = useState<PaymentNotice | null>(null);
  const memberIdRef = useRef<string | null>(null);

  const reload = useCallback(async (memberId: string) => {
    const [summary, history] = await Promise.all([
      fetchPipisSummary(memberId),
      fetchPipisHistory(memberId),
    ]);
    setState({ step: 'sedia', summary, history });
  }, []);

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

          memberIdRef.current = member.id;
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

  const parsedAmount = Number.parseFloat(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 1;

  /** Tanya pelayan (yang bertanya ToyyibPay), kemudian muat semula angka. */
  const verifyAndReload = useCallback(
    async (reference: string) => {
      const memberId = memberIdRef.current;
      let status: Awaited<ReturnType<typeof refreshPipisPayment>> = 'unknown';
      try {
        status = await refreshPipisPayment(reference);
      } catch {
        // Webhook masih boleh menyelesaikannya — paparan di bawah tetap dimuat semula.
      }
      if (memberId) await reload(memberId);
      return status;
    },
    [reload],
  );

  async function handlePay() {
    if (!amountValid || paying) return;
    setPaying(true);
    setNotice(null);

    try {
      const returnUrl = Linking.createURL('pipis');
      const bill = await createPipisBill(Math.round(parsedAmount * 100) / 100, returnUrl);

      /*
        Sesi auth dan bukan pelayar biasa: ia menutup sendiri bila ToyyibPay
        mengalihkan kembali ke deep link app. Apa pun cara ahli kembali —
        dialih, tutup, batal — status disemak semula dengan pelayan.
      */
      await WebBrowser.openAuthSessionAsync(bill.payment_url, returnUrl);

      const status = await verifyAndReload(bill.reference);
      if (status === 'success') {
        setAmount('');
        setNotice({ tone: 'positive', message: 'Terima kasih! Sumbangan ' + ringgitPipis(bill.amount) + ' telah diterima.' });
      } else if (status === 'failed') {
        setNotice({ tone: 'negative', message: 'Bayaran tidak berjaya. Tiada amaun ditolak daripada rekod anda.' });
      } else {
        setNotice({ tone: 'warn', message: PENDING_MESSAGE });
      }
    } catch (caught) {
      setNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal memulakan bayaran online.') });
    } finally {
      setPaying(false);
    }
  }

  async function handleCheck(reference: string) {
    if (checking) return;
    setChecking(reference);
    try {
      const status = await verifyAndReload(reference);
      setNotice(
        status === 'success'
          ? { tone: 'positive', message: 'Bayaran disahkan. Terima kasih!' }
          : status === 'failed'
            ? { tone: 'negative', message: 'Bayaran ini tidak berjaya.' }
            : { tone: 'warn', message: PENDING_MESSAGE },
      );
    } catch (caught) {
      setNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal menyemak status bayaran.') });
    } finally {
      setChecking(null);
    }
  }

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
  const hasPending = history.some((row) => row.method === 'gateway' && row.status === 'pending');

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

        <View>
          <SectionTitle
            title="Bayar Online (ToyyibPay)"
            caption="FPX atau kad. Masukkan sebarang amaun, minimum RM1."
          />
          <View className="gap-4">
            {notice ? <Notice tone={notice.tone} message={notice.message} /> : null}
            {!notice && hasPending ? <Notice tone="warn" message={PENDING_MESSAGE} /> : null}

            <TextField
              label="Amaun (RM)"
              placeholder="100.00"
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^\d.]/g, '').slice(0, 9))}
              editable={!paying}
              keyboardType="decimal-pad"
              error={amount.length > 0 && !amountValid ? 'Amaun minimum ialah RM1.00.' : null}
            />

            <Button
              label={amountValid ? 'Bayar ' + ringgitPipis(Math.round(parsedAmount * 100) / 100) : 'Bayar'}
              onPress={handlePay}
              loading={paying}
              disabled={!amountValid || paying}
            />
          </View>
        </View>

        <View className="pb-8">
          <SectionTitle
            title="Sejarah Sumbangan"
            caption="Rekod Lajnah Ekonomi dan Aset serta bayaran online anda."
          />

          {history.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="Tiada rekod lagi"
              description="Sumbangan anda akan muncul di sini sebaik ia direkodkan."
            />
          ) : (
            <View className="gap-2">
              {history.map((row) => {
                const gateway = row.method === 'gateway';
                const unconfirmed = row.status !== 'success';
                const shown = displayAmount(row);

                return (
                  <View key={row.id} className="rounded-field border border-line bg-surface p-4">
                    <View className="flex-row items-center gap-2">
                      <Text
                        className={`text-base font-bold ${unconfirmed ? 'text-ink-muted' : 'text-ink'} ${
                          row.status === 'failed' ? 'line-through' : ''
                        }`}>
                        {ringgitPipis(shown)}
                      </Text>
                      <View className="flex-1" />
                      {gateway ? (
                        <Badge
                          label={paymentStatusLabel(row.status)}
                          tone={row.status === 'success' ? 'positive' : row.status === 'failed' ? 'negative' : 'warn'}
                        />
                      ) : null}
                      <Badge label={methodLabel(row.method)} tone={row.amount < 0 ? 'warn' : 'info'} />
                    </View>

                    <Text className="mt-2 text-xs text-ink-muted">
                      {new Date(row.created_at).toLocaleDateString('ms-MY')}
                      {row.note ? ' · ' + row.note : ''}
                    </Text>

                    {gateway && row.status === 'pending' && row.gateway_reference ? (
                      <Pressable
                        onPress={() => handleCheck(row.gateway_reference as string)}
                        disabled={checking !== null}
                        className="mt-2 self-start">
                        <Text className="text-sm font-semibold text-primary">
                          {checking === row.gateway_reference ? 'Menyemak…' : 'Semak status'}
                        </Text>
                      </Pressable>
                    ) : null}
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
