import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import {
  KATEGORI_LABEL,
  MESEJ_DILULUSKAN,
  STATUS_LABEL,
  STATUS_TONE,
  SEBAB_OPTIONS,
  TINDAKAN_LABEL,
  TOLAK_OPTIONS,
  bantuanError,
  fetchBantuan,
  fetchBantuanHistory,
  fetchBantuanInfoRequests,
  markBantuanSeen,
  uploadBantuanQr,
  formatRM,
  formatTarikh,
  optionLabels,
  type BantuanApplication,
  type BantuanHistory,
  type BantuanInfoRequest,
} from '@/lib/bantuan';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';

/**
 * Butiran Permohonan Bantuan untuk PEMOHON (migration 148).
 *
 * Hanya medan yang sesuai dilihat ahli: catatan dalaman, alasan dalaman dan
 * perbezaan pindaan berada dalam table lain yang ahli tiada akses (RLS), jadi
 * tiada apa yang perlu disembunyikan di sini. Status "Diluluskan" TIDAK pernah
 * menyebut "dibayar" atau menjanjikan tarikh bayaran.
 */
export default function BantuanInfoScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [app, setApp] = useState<BantuanApplication | null | undefined>(undefined);
  const [requests, setRequests] = useState<BantuanInfoRequest[]>([]);
  const [history, setHistory] = useState<BantuanHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [qrInfo, setQrInfo] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      void tick; // muat semula selepas QR dihantar
      let active = true;
      void (async () => {
        try {
          const row = await fetchBantuan(id);
          if (!active) return;
          setApp(row);
          if (!row) return;
          // Keputusan dianggap dilihat sebaik butiran dibuka (padam notifikasi di Utama).
          if (row.status === 'approved' || row.status === 'rejected') void markBantuanSeen(id).catch(() => undefined);
          const [infoRequests, log] = await Promise.all([fetchBantuanInfoRequests(id), fetchBantuanHistory(id)]);
          if (!active) return;
          setRequests(infoRequests);
          setHistory(log.filter((item) => item.terlihat_ahli));
          setError(null);
        } catch (caught) {
          if (active) {
            setApp((prev) => prev ?? null);
            setError(bantuanError(caught, 'Gagal memuatkan permohonan.'));
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [id, tick]),
  );

  const hantarQr = async () => {
    if (!id || uploading) return;
    setError(null);
    setQrInfo(null);
    try {
      const uri = await pickImage();
      if (!uri) return;
      setUploading(true);
      await uploadBantuanQr(id, uri);
      setQrInfo('Kod QR diterima. Terima kasih.');
      setTick((value) => value + 1);
    } catch (caught) {
      setError(bantuanError(caught, 'Gambar QR gagal dimuat naik. Sila cuba lagi.'));
    } finally {
      setUploading(false);
    }
  };

  if (app === undefined) return <LoadingScreen />;

  if (!app) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Permohonan Zakat" onBackPress={goBack} />
        <View className="px-gutter">
          {error ? <Notice tone="negative" message={error} /> : (
            <EmptyState icon="hand-left-outline" title="Permohonan tidak dijumpai" description="Permohonan ini tidak wujud atau bukan milik anda." />
          )}
        </View>
      </Screen>
    );
  }

  const openRequest = [...requests].reverse().find((request) => !request.responded_at) ?? null;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow={KATEGORI_LABEL[app.kategori]}
        title={app.no_rujukan ?? 'Draf'}
        subtitle={optionLabels(SEBAB_OPTIONS, app.sebab_keperluan, app.sebab_lain)}
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-10 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}

        <View className="flex-row items-center gap-3">
          <Badge label={STATUS_LABEL[app.status]} tone={STATUS_TONE[app.status]} />
          {app.dihantar_at ? <Text className="text-xs text-ink-muted">Dihantar {formatTarikh(app.pertama_dihantar_at ?? app.dihantar_at)}</Text> : null}
        </View>

        {app.status === 'submitted' || app.status === 'under_review' ? (
          <Notice tone="info" message="Permohonan anda sedang menunggu atau dalam semakan Lajnah Kebajikan. Anda akan melihat kemas kini di sini." />
        ) : null}

        {app.status === 'approved' ? (
          <Card>
            <View className="gap-2">
              <Text className="text-base font-bold text-positive">Diluluskan</Text>
              <Text className="text-sm leading-5 text-ink">{MESEJ_DILULUSKAN}</Text>
              <Text className="text-sm text-ink">
                Jumlah diluluskan: <Text className="font-bold">{formatRM(app.jumlah_diluluskan)}</Text>
              </Text>
              {app.mesej_keputusan ? <Text className="text-sm leading-5 text-ink-muted">{app.mesej_keputusan}</Text> : null}
            </View>
          </Card>
        ) : null}

        {app.status === 'approved' ? (
          <Card>
            <View className="gap-3">
              <Text className="text-base font-bold text-ink">Kod QR penerimaan</Text>
              {qrInfo ? <Notice tone="positive" message={qrInfo} /> : null}
              <Text className="text-sm leading-5 text-ink-muted">
                {app.qr_path
                  ? 'Kod QR anda telah dihantar (' + formatTarikh(app.qr_dihantar_at) + '). Anda boleh menggantikannya jika perlu.'
                  : 'Hantar tangkap layar atau gambar kod QR DuitNow akaun anda. Hanya jawatankuasa zakat LK boleh melihatnya, dan ia hanya diminta selepas permohonan diluluskan.'}
              </Text>
              <Button
                label={app.qr_path ? 'Ganti Gambar QR' : 'Pilih Gambar QR'}
                variant={app.qr_path ? 'secondary' : 'primary'}
                loading={uploading}
                onPress={() => void hantarQr()}
              />
            </View>
          </Card>
        ) : null}

        {app.status === 'rejected' ? (
          <Card>
            <View className="gap-2">
              <Text className="text-base font-bold text-negative">Tidak Diluluskan</Text>
              <Text className="text-sm text-ink-muted">
                {TOLAK_OPTIONS.find((option) => option.value === app.sebab_tolak_kategori)?.label ?? ''}
              </Text>
              {app.sebab_tolak_penjelasan ? <Text className="text-sm leading-5 text-ink">{app.sebab_tolak_penjelasan}</Text> : null}
            </View>
          </Card>
        ) : null}

        {app.status === 'needs_information' && openRequest ? (
          <Card>
            <View className="gap-3">
              <Text className="text-base font-bold text-warn">Maklumat tambahan diperlukan</Text>
              <Text className="text-sm leading-5 text-ink">{openRequest.mesej}</Text>
              <Button label="Kemas Kini & Hantar Semula" onPress={() => router.push({ pathname: '/(app)/bantuan-borang', params: { id: app.id } })} />
            </View>
          </Card>
        ) : null}

        <SectionTitle title="Maklumat permohonan" />
        <Card>
          <View className="gap-2">
            <Row label="Pemohon" value={app.nama_pemohon ?? '—'} />
            <Row label="Telefon" value={app.telefon ?? '—'} />
            <Row label="Sebab keperluan" value={optionLabels(SEBAB_OPTIONS, app.sebab_keperluan, app.sebab_lain)} />
            <Row label="Penerangan" value={app.penerangan ?? '—'} />
          </View>
        </Card>

        {requests.length > 0 ? (
          <>
            <SectionTitle title="Permintaan maklumat tambahan" />
            {requests.map((request) => (
              <Card key={request.id}>
                <View className="gap-2">
                  <Text className="text-xs text-ink-muted">{formatTarikh(request.created_at)}</Text>
                  <Text className="text-sm text-ink">{request.mesej}</Text>
                  {request.responded_at ? (
                    <Text className="text-sm text-ink-muted">Respons anda ({formatTarikh(request.responded_at)}): {request.respons}</Text>
                  ) : null}
                </View>
              </Card>
            ))}
          </>
        ) : null}

        <SectionTitle title="Garis masa" />
        <Card>
          <View className="gap-3">
            {history.length === 0 ? <Text className="text-sm text-ink-muted">Belum ada tindakan.</Text> : null}
            {history.map((item) => (
              <View key={item.id}>
                <Text className="text-sm font-semibold text-ink">{TINDAKAN_LABEL[item.tindakan] ?? item.tindakan}</Text>
                <Text className="text-xs text-ink-muted">{formatTarikh(item.created_at)}</Text>
              </View>
            ))}
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="text-sm text-ink-muted">{label}</Text>
      <Text className="flex-1 text-right text-sm font-semibold text-ink">{value}</Text>
    </View>
  );
}
