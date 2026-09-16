import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { toMalayError } from '@/lib/errors';
import {
  createGatewayBill,
  paymentStatusLabel,
  paymentStatusTone,
  refreshGatewayPayment,
  type GatewayKind,
  type GatewayStatus,
} from '@/lib/toyyibpay';

/**
 * Bayaran online ToyyibPay — satu aliran untuk PIPIS dan Yuran.
 *
 * `useOnlinePayment` memegang keadaan (amaun, sedang membayar, mesej) supaya
 * borang di atas dan butang "Semak status" dalam sejarah di bawah berkongsi
 * satu mesej. Skrin hanya membekalkan jenis bayaran, route deep link, dan cara
 * memuat semula datanya sendiri.
 */

type PaymentNotice = { tone: 'positive' | 'negative' | 'warn'; message: string };

export const PENDING_MESSAGE = 'Bayaran sedang diproses. Semak semula sebentar lagi.';

export function useOnlinePayment({
  kind,
  returnPath,
  reload,
  formatAmount,
}: {
  kind: GatewayKind;
  /** Route app untuk kembali, cth. 'pipis' atau 'yuran'. */
  returnPath: string;
  reload: () => Promise<void>;
  formatAmount: (amount: number) => string;
}) {
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [notice, setNotice] = useState<PaymentNotice | null>(null);

  const parsedAmount = Math.round(Number.parseFloat(amount) * 100) / 100;
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 1;

  /** Tanya pelayan (yang bertanya ToyyibPay), kemudian muat semula angka. */
  const verifyAndReload = useCallback(
    async (reference: string) => {
      let status: GatewayStatus | 'unknown' = 'unknown';
      try {
        status = await refreshGatewayPayment(reference);
      } catch {
        // Webhook masih boleh menyelesaikannya — paparan tetap dimuat semula.
      }
      await reload();
      return status;
    },
    [reload],
  );

  async function pay() {
    if (!amountValid || paying) return;
    setPaying(true);
    setNotice(null);

    try {
      const returnUrl = Linking.createURL(returnPath);
      const bill = await createGatewayBill(kind, parsedAmount, returnUrl);

      /*
        Sesi auth dan bukan pelayar biasa: ia menutup sendiri bila ToyyibPay
        mengalihkan kembali ke deep link app. Apa pun cara ahli kembali —
        dialih, tutup, batal — status disemak semula dengan pelayan.
      */
      await WebBrowser.openAuthSessionAsync(bill.payment_url, returnUrl);

      const status = await verifyAndReload(bill.reference);
      if (status === 'success') {
        setAmount('');
        setNotice({ tone: 'positive', message: 'Terima kasih! Bayaran ' + formatAmount(bill.amount) + ' telah diterima.' });
      } else if (status === 'failed') {
        setNotice({ tone: 'negative', message: 'Bayaran tidak berjaya. Tiada amaun direkodkan.' });
      } else {
        setNotice({ tone: 'warn', message: PENDING_MESSAGE });
      }
    } catch (caught) {
      setNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal memulakan bayaran online.') });
    } finally {
      setPaying(false);
    }
  }

  async function check(reference: string) {
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

  return { amount, setAmount, parsedAmount, amountValid, paying, checking, notice, pay, check, formatAmount };
}

export type OnlinePayment = ReturnType<typeof useOnlinePayment>;

export function OnlinePaymentForm({
  payment,
  caption,
  hasPending,
}: {
  payment: OnlinePayment;
  caption: string;
  hasPending: boolean;
}) {
  const { amount, setAmount, parsedAmount, amountValid, paying, notice, pay, formatAmount } = payment;

  return (
    <View>
      <SectionTitle title="Bayar Online (ToyyibPay)" caption={caption} />
      <View className="gap-4">
        {notice ? <Notice tone={notice.tone} message={notice.message} /> : null}
        {!notice && hasPending ? <Notice tone="warn" message={PENDING_MESSAGE} /> : null}

        <TextField
          label="Amaun (RM)"
          placeholder="30.00"
          value={amount}
          onChangeText={(value) => setAmount(value.replace(/[^\d.]/g, '').slice(0, 9))}
          editable={!paying}
          keyboardType="decimal-pad"
          error={amount.length > 0 && !amountValid ? 'Amaun minimum ialah RM1.00.' : null}
        />

        <Button
          label={amountValid ? 'Bayar ' + formatAmount(parsedAmount) : 'Bayar'}
          onPress={pay}
          loading={paying}
          disabled={!amountValid || paying}
        />
      </View>
    </View>
  );
}

/** Lencana status untuk baris gateway; tiada apa-apa untuk baris lain. */
export function GatewayStatusBadge({ method, status }: { method: string; status: GatewayStatus }) {
  if (method !== 'gateway') return null;
  return <Badge label={paymentStatusLabel(status)} tone={paymentStatusTone(status)} />;
}

/** Pautan "Semak status" untuk baris gateway yang masih pending. */
export function CheckStatusLink({
  payment,
  method,
  status,
  reference,
}: {
  payment: OnlinePayment;
  method: string;
  status: GatewayStatus;
  reference: string | null;
}) {
  if (method !== 'gateway' || status !== 'pending' || !reference) return null;

  return (
    <Pressable onPress={() => payment.check(reference)} disabled={payment.checking !== null} className="mt-2 self-start">
      <Text className="text-sm font-semibold text-primary">
        {payment.checking === reference ? 'Menyemak…' : 'Semak status'}
      </Text>
    </Pressable>
  );
}
