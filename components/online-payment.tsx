import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Notice } from '@/components/ui/notice';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { toMalayError } from '@/lib/errors';
import {
  cancelGatewayPayment,
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
 * `useOnlinePayment` memegang keadaan (amaun, sedang membayar, mesej, dialog
 * batal) supaya borang di atas dan tindakan dalam sejarah di bawah berkongsi
 * satu mesej. Skrin hanya membekalkan jenis bayaran, route deep link, dan cara
 * memuat semula datanya sendiri.
 */

type PaymentNotice = { tone: 'positive' | 'negative' | 'warn' | 'info'; message: string };

export const PENDING_MESSAGE = 'Bayaran sedang diproses. Semak semula sebentar lagi.';

/** Had semakan automatik setiap kali skrin dibuka — setiap satu memanggil ToyyibPay. */
const AUTO_CHECK_LIMIT = 5;

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
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const autoChecking = useRef(false);

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

  /**
   * Semak semua bil pending secara senyap bila skrin dibuka.
   *
   * Bil yang sudah dibayar atau gagal di ToyyibPay (webhook lewat) terus
   * dikemas kini tanpa ahli menekan apa-apa. Bil yang ditinggalkan kekal
   * pending — itu yang butang "Batalkan" selesaikan.
   */
  const autoCheck = useCallback(
    async (references: string[]) => {
      if (autoChecking.current || references.length === 0) return;
      autoChecking.current = true;
      try {
        const results = await Promise.all(
          references.slice(0, AUTO_CHECK_LIMIT).map((reference) => refreshGatewayPayment(reference).catch(() => 'unknown' as const)),
        );
        if (results.some((status) => status === 'success' || status === 'failed')) {
          await reload();
        }
        if (results.includes('success')) {
          setNotice({ tone: 'positive', message: 'Bayaran online anda telah disahkan. Terima kasih!' });
        }
      } catch {
        // Semakan senyap — kegagalan tidak patut mengganggu paparan.
      } finally {
        autoChecking.current = false;
      }
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
        setNotice(null);
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
            : { tone: 'info', message: 'Tiada bayaran diterima untuk bil ini lagi.' },
      );
    } catch (caught) {
      setNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal menyemak status bayaran.') });
    } finally {
      setChecking(null);
    }
  }

  async function cancel() {
    const reference = confirmCancel;
    if (!reference || cancelling) return;
    setCancelling(true);
    try {
      await cancelGatewayPayment(kind, reference);
      await reload();
      setNotice({ tone: 'info', message: 'Bayaran dibatalkan.' });
    } catch (caught) {
      // Mungkin baru sahaja disahkan oleh webhook — muat semula supaya paparan jujur.
      await reload().catch(() => {});
      setNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal membatalkan bayaran.') });
    } finally {
      setCancelling(false);
      setConfirmCancel(null);
    }
  }

  return {
    amount,
    setAmount,
    parsedAmount,
    amountValid,
    paying,
    checking,
    notice,
    pay,
    check,
    autoCheck,
    formatAmount,
    confirmCancel,
    requestCancel: setConfirmCancel,
    cancelling,
    cancel,
  };
}

export type OnlinePayment = ReturnType<typeof useOnlinePayment>;

/** Rujukan bil pending, terbaharu dahulu — untuk banner dan semakan automatik. */
export function pendingReferences(
  rows: { method: string; status: GatewayStatus; gateway_reference: string | null }[],
): string[] {
  return rows
    .filter((row) => row.method === 'gateway' && row.status === 'pending' && row.gateway_reference)
    .map((row) => row.gateway_reference as string);
}

export function OnlinePaymentForm({
  payment,
  caption,
  pendingReference,
}: {
  payment: OnlinePayment;
  caption: string;
  /** Bil pending terbaharu, jika ada. */
  pendingReference: string | null;
}) {
  const { amount, setAmount, parsedAmount, amountValid, paying, notice, pay, formatAmount } = payment;

  return (
    <View>
      <SectionTitle title="Bayar Online (ToyyibPay)" caption={caption} />
      <View className="gap-4">
        {notice ? <Notice tone={notice.tone} message={notice.message} /> : null}

        {pendingReference ? (
          <View>
            <Notice tone="warn" message={PENDING_MESSAGE} />
            <PendingActions payment={payment} method="gateway" status="pending" reference={pendingReference} />
          </View>
        ) : null}

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

      <ConfirmDialog
        visible={payment.confirmCancel !== null}
        title="Batalkan bayaran ini?"
        message="Bil ini akan ditanda tidak berjaya. Jika anda sebenarnya sudah membayar, ia tetap akan direkodkan sebaik ToyyibPay mengesahkannya."
        confirmLabel="Batalkan"
        cancelLabel="Kembali"
        destructive
        busy={payment.cancelling}
        onConfirm={payment.cancel}
        onCancel={() => payment.requestCancel(null)}
      />
    </View>
  );
}

/** Lencana status untuk baris gateway; tiada apa-apa untuk baris lain. */
export function GatewayStatusBadge({ method, status }: { method: string; status: GatewayStatus }) {
  if (method !== 'gateway') return null;
  return <Badge label={paymentStatusLabel(status)} tone={paymentStatusTone(status)} />;
}

/** "Semak status · Batalkan" untuk baris gateway yang masih pending. */
export function PendingActions({
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

  const busy = payment.checking !== null || payment.cancelling;

  return (
    <View className="mt-2 flex-row items-center gap-5">
      <Pressable onPress={() => payment.check(reference)} disabled={busy} hitSlop={8}>
        <Text className="text-sm font-semibold text-primary">
          {payment.checking === reference ? 'Menyemak…' : 'Semak status'}
        </Text>
      </Pressable>
      <Pressable onPress={() => payment.requestCancel(reference)} disabled={busy} hitSlop={8}>
        <Text className="text-sm font-semibold text-negative">Batalkan</Text>
      </Pressable>
    </View>
  );
}
