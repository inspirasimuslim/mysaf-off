import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import {
  GatewayStatusBadge,
  OnlinePaymentForm,
  PendingActions,
  pendingPayments,
  useOnlinePayment,
} from '@/components/online-payment';
import { ScreenHeader } from '@/components/screen-header';
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
import { displayAmount } from '@/lib/toyyibpay';
import { fetchZakatInfaqHistory, ringgitInfaq, summarizeZakatInfaq, type ZakatInfaqRow } from '@/lib/zakat-infaq';

/**
 * Infaq Tabung Zakat (migration 154), seperti dilihat ahli sendiri: bayar online melalui
 * ToyyibPay (tiada sasaran, tiada had minimum selain RM1) dan sejarah bayaran sendiri.
 * Jumlah hanya mengira bayaran yang telah disahkan pelayan.
 */

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; history: ZakatInfaqRow[] }
  | { step: 'tiada-rekod' }
  | { step: 'gagal'; message: string };

export default function InfaqZakatScreen() {
  const { user } = useAuth();
  const goBack = useGoBack();

  const [state, setState] = useState<State>({ step: 'memuat' });
  const memberIdRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const memberId = memberIdRef.current;
    if (!memberId) return;
    setState({ step: 'sedia', history: await fetchZakatInfaqHistory(memberId) });
  }, []);

  const payment = useOnlinePayment({ kind: 'zakat', returnPath: 'infaq-zakat', reload, formatAmount: ringgitInfaq });
  const { autoCheck } = payment;

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
          memberIdRef.current = member.id;
          const history = await fetchZakatInfaqHistory(member.id);
          if (!active) return;
          setState({ step: 'sedia', history });
          // Bil pending mungkin sudah selesai di ToyyibPay sejak kali terakhir dibuka.
          void autoCheck(pendingPayments(history).map((item) => item.reference));
        } catch (caught) {
          if (active) setState({ step: 'gagal', message: toMalayError(caught, 'Gagal memuatkan rekod infaq.') });
        }
      })();

      return () => {
        active = false;
      };
    }, [user?.id, autoCheck]),
  );

  if (state.step === 'memuat') return <LoadingScreen />;

  if (state.step === 'tiada-rekod' || state.step === 'gagal') {
    return (
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Lajnah Kebajikan" title="Infaq Tabung Zakat" onBackPress={goBack} />
        <View className="px-gutter pt-6">
          {state.step === 'gagal' ? (
            <Notice tone="negative" message={state.message} />
          ) : (
            <EmptyState
              icon="heart-outline"
              title="Akaun belum dipautkan"
              description="Akaun anda belum dipadankan dengan rekod ahli. Hubungi pentadbir untuk memautkannya."
            />
          )}
        </View>
      </Screen>
    );
  }

  const { history } = state;
  const summary = summarizeZakatInfaq(history);
  const pending = pendingPayments(history);

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Lajnah Kebajikan" title="Infaq Tabung Zakat" onBackPress={goBack} />

      <View className="gap-6 px-gutter pt-6">
        <Card tone="surface">
          <Text className="text-sm text-ink-muted">Jumlah infaq anda</Text>
          <Text className="mt-2 text-stat-lg font-bold text-ink">{ringgitInfaq(summary.jumlah)}</Text>
          <Text className="mt-2 text-sm text-ink-muted">
            {summary.bilangan > 0
              ? summary.bilangan + ' bayaran berjaya. Tiada sasaran — setiap infaq dihargai.'
              : 'Tiada sasaran — infaq sukarela, berapa pun amaunnya dihargai.'}
          </Text>
        </Card>

        <OnlinePaymentForm payment={payment} pending={pending} />

        <View className="pb-8">
          <SectionTitle title="Sejarah Infaq" />

          {history.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="Tiada rekod lagi"
              description="Infaq anda akan muncul di sini selepas bayaran dibuat."
            />
          ) : (
            <View className="gap-2">
              {history.map((row) => (
                <View key={row.id} className="rounded-field border border-line bg-surface p-4">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className={`text-base font-bold ${row.status === 'success' ? 'text-ink' : 'text-ink-muted'} ${
                        row.status === 'failed' ? 'line-through' : ''
                      }`}>
                      {ringgitInfaq(displayAmount(row))}
                    </Text>
                    <View className="flex-1" />
                    <GatewayStatusBadge method={row.method} status={row.status} />
                  </View>

                  <Text className="mt-2 text-xs text-ink-muted">
                    {new Date(row.created_at).toLocaleString('ms-MY')}
                    {row.note ? ' · ' + row.note : ''}
                  </Text>

                  <PendingActions
                    payment={payment}
                    method={row.method}
                    status={row.status}
                    reference={row.gateway_reference}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
