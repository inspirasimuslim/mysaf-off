import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Notice } from '@/components/ui/notice';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { toMalayError } from '@/lib/errors';
import {
  cancelGatewayPayment,
  createGatewayBill,
  displayAmount,
  paymentStatusLabel,
  paymentStatusTone,
  refreshGatewayPayment,
  type GatewayAwareRow,
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

/** Had semakan automatik setiap kali skrin dibuka — setiap satu memanggil ToyyibPay. */
const AUTO_CHECK_LIMIT = 5;

/** Had masa setiap panggilan rangkaian — tiada spinner yang boleh berputar selama-lamanya. */
const NETWORK_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(label + ' mengambil masa terlalu lama. Semak sambungan internet dan cuba lagi.')),
      NETWORK_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
  const router = useRouter();
  /** Web sahaja: `toyyibpay-callback` mengalihkan pelayar kembali dengan `?payment=…&ref=…`. */
  const returned = useLocalSearchParams<{ payment?: string; ref?: string }>();
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [notice, setNotice] = useState<PaymentNotice | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  /** Rujukan yang sedang dibatalkan — dipapar pada baris itu, bukan dalam dialog. */
  const [cancelling, setCancelling] = useState<string | null>(null);
  const cancellingRef = useRef(false);
  const autoChecking = useRef(false);

  const parsedAmount = Math.round(Number.parseFloat(amount) * 100) / 100;
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 1;

  /** Tanya pelayan (yang bertanya ToyyibPay), kemudian muat semula angka. */
  const verifyAndReload = useCallback(
    async (reference: string) => {
      let status: GatewayStatus | 'unknown' = 'unknown';
      try {
        status = await withTimeout(refreshGatewayPayment(reference), 'Semakan status');
      } catch {
        // Webhook masih boleh menyelesaikannya — paparan tetap dimuat semula.
      }
      await withTimeout(reload(), 'Muat semula');
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
    /** Web: halaman sedang beralih ke ToyyibPay — butang kekal dikunci. */
    let leaving = false;

    try {
      // Web: `https://<origin>/pipis`; native: `mysafoff://pipis`.
      const returnUrl = Linking.createURL(returnPath);
      const bill = await createGatewayBill(kind, parsedAmount, returnUrl);

      /*
        Web: tab yang SAMA dialihkan ke ToyyibPay. `openAuthSessionAsync` di web
        membuka popup SELEPAS panggilan rangkaian di atas — pelayar mudah alih
        menyekatnya kerana ia bukan lagi sebahagian daripada ketikan. Selepas
        membayar, `toyyibpay-callback` mengesahkan status dan mengalihkan
        pelayar kembali ke skrin ini; kesan `returned` di atas menyambung.
      */
      if (Platform.OS === 'web') {
        leaving = true;
        window.location.assign(bill.payment_url);
        return;
      }

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
      if (!leaving) setPaying(false);
    }
  }

  /*
    Web: kembali daripada ToyyibPay (muat semula penuh halaman). Status disemak
    semula dengan pelayan — parameter URL hanya petunjuk rujukan, bukan bukti —
    dan kemudian dibuang dari URL supaya muat semula tidak mengulang mesej.
  */
  const returnedRef = Platform.OS === 'web' && typeof returned.ref === 'string' ? returned.ref : null;
  const handledReturn = useRef<string | null>(null);
  useEffect(() => {
    if (!returnedRef || handledReturn.current === returnedRef) return;
    handledReturn.current = returnedRef;
    router.setParams({ payment: undefined, ref: undefined });

    void (async () => {
      setNotice({ tone: 'info', message: 'Menyemak status bayaran anda…' });
      try {
        const status = await verifyAndReload(returnedRef);
        setNotice(
          status === 'success'
            ? { tone: 'positive', message: 'Terima kasih! Bayaran anda telah diterima.' }
            : status === 'failed'
              ? { tone: 'negative', message: 'Bayaran tidak berjaya. Tiada amaun direkodkan.' }
              : { tone: 'warn', message: 'Bayaran belum disahkan oleh ToyyibPay. Tekan "Semak status" sebentar lagi.' },
        );
      } catch (caught) {
        setNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal menyemak status bayaran.') });
      }
    })();
  }, [returnedRef, router, verifyAndReload]);

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

  /*
    Dialog DITUTUP SEBELUM sebarang panggilan rangkaian. Versi asal menutupnya
    dalam `finally` — selepas RPC DAN muat semula — sambil mengunci "Kembali"
    (busy). Mana-mana panggilan yang lambat atau tergantung meninggalkan dialog
    terbuka tanpa jalan keluar. Kemajuan kini dipapar pada baris itu sendiri
    ("Membatalkan…"), dan setiap panggilan dihadkan masa.
  */
  async function cancel(reference: string | null = confirmCancel) {
    setConfirmCancel(null);
    if (!reference || cancellingRef.current) return;
    cancellingRef.current = true;
    setCancelling(reference);
    try {
      await withTimeout(cancelGatewayPayment(kind, reference), 'Pembatalan');
      setNotice({ tone: 'info', message: 'Bayaran dibatalkan.' });
    } catch (caught) {
      console.error('Batal bayaran gagal', reference, caught);
      setNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal membatalkan bayaran.') });
    } finally {
      // Muat semula dalam kedua-dua kes: bil itu mungkin baru sahaja disahkan oleh webhook.
      await withTimeout(reload(), 'Muat semula').catch((caught) => console.error('Muat semula gagal', caught));
      cancellingRef.current = false;
      setCancelling(null);
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

type PendingSource = GatewayAwareRow & {
  method: string;
  gateway_reference: string | null;
  created_at: string;
};

export type PendingPayment = { reference: string; amount: number; created_at: string };

/** Bil pending, terbaharu dahulu — untuk banner dan semakan automatik. */
export function pendingPayments(rows: PendingSource[]): PendingPayment[] {
  return rows
    .filter((row) => row.method === 'gateway' && row.status === 'pending' && row.gateway_reference)
    .map((row) => ({
      reference: row.gateway_reference as string,
      amount: displayAmount(row),
      created_at: row.created_at,
    }));
}

export function OnlinePaymentForm({
  payment,
  caption,
  pending,
}: {
  payment: OnlinePayment;
  caption?: string;
  /** Semua bil pending, terbaharu dahulu. */
  pending: PendingPayment[];
}) {
  const latest = pending[0] ?? null;
  const { amount, setAmount, parsedAmount, amountValid, paying, notice, pay, formatAmount } = payment;

  return (
    <View>
      <SectionTitle title="Bayar Online (ToyyibPay)" caption={caption} />
      <View className="gap-4">
        {notice ? <ToastBanner tone={notice.tone} message={notice.message} /> : null}

        {latest ? (
          <View>
            {/*
              Amaun, tarikh dan bilangan dinyatakan. Tanpanya, membatalkan satu bil
              sementara bil pending yang lebih lama masih wujud memaparkan banner
              yang SAMA semula — kelihatan seperti pembatalan tidak berlaku.
            */}
            <Notice
              tone="warn"
              message={
                'Bayaran ' +
                formatAmount(latest.amount) +
                ' (' +
                new Date(latest.created_at).toLocaleDateString('ms-MY') +
                ') sedang diproses. Semak semula sebentar lagi.' +
                (pending.length > 1 ? ' ' + (pending.length - 1) + ' lagi bil belum selesai dalam sejarah di bawah.' : '')
              }
            />
            <PendingActions payment={payment} method="gateway" status="pending" reference={latest.reference} />
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
        onConfirm={() => void payment.cancel()}
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

  const busy = payment.checking !== null || payment.cancelling !== null;

  return (
    <View className="mt-2 flex-row items-center gap-5">
      <Pressable onPress={() => payment.check(reference)} disabled={busy} hitSlop={8}>
        <Text className="text-sm font-semibold text-primary">
          {payment.checking === reference ? 'Menyemak…' : 'Semak status'}
        </Text>
      </Pressable>
      <Pressable onPress={() => payment.requestCancel(reference)} disabled={busy} hitSlop={8}>
        <Text className="text-sm font-semibold text-negative">
          {payment.cancelling === reference ? 'Membatalkan…' : 'Batalkan'}
        </Text>
      </Pressable>
    </View>
  );
}
