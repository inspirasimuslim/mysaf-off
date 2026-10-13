import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import {
  KATEGORI_LABEL,
  PEKERJAAN_OPTIONS,
  PENDAPATAN_OPTIONS,
  PENGAJIAN_OPTIONS,
  STATUS_LABEL,
  STATUS_TONE,
  TINDAKAN_LABEL,
  TOLAK_OPTIONS,
  addBantuanNote,
  approveBantuan,
  bantuanDocumentUrl,
  bantuanError,
  fetchBantuan,
  fetchBantuanDocuments,
  fetchBantuanHistory,
  fetchBantuanInfoRequests,
  fetchBantuanNotes,
  fetchBantuanPrevious,
  formatRM,
  formatTarikh,
  rejectBantuan,
  requestBantuanInfo,
  startBantuanReview,
  tujuanLabel,
  type BantuanApplication,
  type BantuanDocument,
  type BantuanHistory,
  type BantuanInfoRequest,
  type BantuanNote,
  type BantuanPrevious,
} from '@/lib/bantuan';
import { useKebajikanAccess } from '@/lib/department-access';
import { useGoBack } from '@/lib/navigation';
import { errorCode } from '@/lib/errors';

type ModalKind = 'info' | 'approve' | 'reject' | null;

function label<T extends string>(options: { value: T; label: string }[], value: string | null): string {
  return options.find((option) => option.value === value)?.label ?? (value ?? '—');
}

/**
 * Halaman semakan satu Permohonan Bantuan — admin LAJNAH KEBAJIKAN (migration 148).
 *
 * Setiap tindakan menghantar `versi` yang dilihat admin; jika admin lain telah
 * bertindak, pelayan menolak (40001) dan halaman dimuat semula secara automatik.
 * Admin tidak boleh membuka permohonan sendiri (RLS) dan pelayan menolak tindakan
 * ke atas permohonan sendiri. Kelulusan BUKAN pembayaran — jumlah terdahulu yang
 * dipaparkan ialah jumlah diluluskan, bukan jumlah dibayar.
 */
export default function AdminBantuanDetailScreen() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const access = useKebajikanAccess();

  const [app, setApp] = useState<BantuanApplication | null | undefined>(undefined);
  const [docs, setDocs] = useState<BantuanDocument[]>([]);
  const [requests, setRequests] = useState<BantuanInfoRequest[]>([]);
  const [history, setHistory] = useState<BantuanHistory[]>([]);
  const [notes, setNotes] = useState<BantuanNote[]>([]);
  const [previous, setPrevious] = useState<BantuanPrevious[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState<ModalKind>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [mesejInfo, setMesejInfo] = useState('');
  const [jumlah, setJumlah] = useState('');
  const [alasanLulus, setAlasanLulus] = useState('');
  const [mesejLulus, setMesejLulus] = useState('');
  const [kategoriTolak, setKategoriTolak] = useState<string | null>(null);
  const [penjelasanTolak, setPenjelasanTolak] = useState('');
  const [alasanTolak, setAlasanTolak] = useState('');
  const [nota, setNota] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const row = await fetchBantuan(id);
      setApp(row);
      if (!row) return;
      const [documents, infoRequests, log, noteRows, before] = await Promise.all([
        fetchBantuanDocuments(id),
        fetchBantuanInfoRequests(id),
        fetchBantuanHistory(id),
        fetchBantuanNotes(id),
        fetchBantuanPrevious(id),
      ]);
      setDocs(documents);
      setRequests(infoRequests);
      setHistory(log);
      setNotes(noteRows);
      setPrevious(before);
    } catch (caught) {
      setApp((prev) => prev ?? null);
      setError(bantuanError(caught, 'Gagal memuatkan permohonan.'));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (access.canView) void load();
    }, [access.canView, load]),
  );

  const closeModal = () => {
    if (busy) return;
    setModal(null);
    setConfirmStep(false);
  };

  /** Jalankan tindakan; kegagalan persaingan (40001) memuat semula keadaan terkini. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
      setModal(null);
      setConfirmStep(false);
      setInfo(success);
      await load();
    } catch (caught) {
      setError(bantuanError(caught, 'Tindakan gagal. Sila cuba lagi.'));
      if (errorCode(caught) === '40001') {
        setModal(null);
        setConfirmStep(false);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (doc: BantuanDocument) => {
    setError(null);
    try {
      await Linking.openURL(await bantuanDocumentUrl(doc.storage_path));
    } catch (caught) {
      setError(bantuanError(caught, 'Dokumen tidak dapat dibuka.'));
    }
  };

  if (access.loading || app === undefined) return <LoadingScreen />;
  if (!access.canView) {
    return <NoAccessScreen title="Semakan Bantuan" description="Skrin ini khusus untuk admin LAJNAH KEBAJIKAN dan Super Admin." />;
  }

  if (!app) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Semakan Bantuan" onBackPress={goBack} />
        <View className="px-gutter">
          {error ? <Notice tone="negative" message={error} /> : null}
          <EmptyState
            icon="hand-left-outline"
            title="Permohonan tidak dijumpai"
            description="Permohonan ini tidak wujud, masih draf, atau ia permohonan anda sendiri. Permohonan sendiri mesti disemak oleh pentadbir lain yang diberi kuasa."
          />
        </View>
      </Screen>
    );
  }

  const canDecide = access.canEdit;
  const parsedJumlah = Number(jumlah.replace(',', '.'));
  const partial = app.jumlah_dimohon !== null && parsedJumlah > 0 && parsedJumlah < app.jumlah_dimohon;
  const decided = app.status === 'approved' || app.status === 'rejected';

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow={KATEGORI_LABEL[app.kategori]}
        title={app.no_rujukan ?? 'Permohonan'}
        subtitle={app.nama_pemohon ?? undefined}
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-12 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}
        {info ? <Notice tone="positive" message={info} /> : null}

        <View className="flex-row flex-wrap items-center gap-2">
          <Badge label={STATUS_LABEL[app.status]} tone={STATUS_TONE[app.status]} />
          {app.tahap_keperluan === 'mendesak' ? <Badge label="Mendesak (menurut pemohon)" tone="warn" /> : null}
        </View>

        {!canDecide ? <Notice tone="info" message="Anda mempunyai akses lihat sahaja. Tindakan semakan dan keputusan memerlukan kebenaran sunting." /> : null}

        {canDecide && app.status === 'submitted' ? (
          <Button label="Mulakan Semakan" loading={busy} onPress={() => void run(() => startBantuanReview(app.id, app.versi), 'Semakan dimulakan.')} />
        ) : null}
        {canDecide && app.status === 'under_review' ? (
          <View className="gap-3">
            <Button label="Minta Maklumat Tambahan" variant="secondary" onPress={() => setModal('info')} />
            <Button label="Luluskan" onPress={() => { setJumlah(app.jumlah_dimohon !== null ? String(app.jumlah_dimohon) : ''); setModal('approve'); }} />
            <Button label="Tolak" variant="danger" onPress={() => setModal('reject')} />
            <Text className="text-xs leading-4 text-ink-muted">
              Jika dana belum tersedia, biarkan status &ldquo;Dalam Semakan&rdquo; dan tulis catatan dalaman di bawah. Jangan melabel pemohon tidak layak semata-mata kerana kekurangan dana.
            </Text>
          </View>
        ) : null}
        {app.status === 'needs_information' ? <Notice tone="warn" message="Menunggu respons pemohon. Permohonan akan kembali ke senarai apabila dihantar semula." /> : null}

        {decided ? (
          <Card>
            <View className="gap-2">
              <Text className="text-base font-bold text-ink">{app.status === 'approved' ? 'Diluluskan' : 'Tidak Diluluskan'}</Text>
              {app.status === 'approved' ? (
                <Text className="text-sm text-ink">Jumlah diluluskan {formatRM(app.jumlah_diluluskan)} daripada {formatRM(app.jumlah_dimohon)} (kelulusan bukan bayaran).</Text>
              ) : (
                <Text className="text-sm text-ink">{label(TOLAK_OPTIONS, app.sebab_tolak_kategori)}</Text>
              )}
              <Text className="text-sm text-ink-muted">{app.status === 'approved' ? app.mesej_keputusan : app.sebab_tolak_penjelasan}</Text>
              <Text className="text-xs text-ink-muted">{formatTarikh(app.diputuskan_at)}</Text>
            </View>
          </Card>
        ) : null}

        <SectionTitle title="Pemohon" />
        <Card>
          <View className="gap-2">
            <Row label="Nama" value={app.nama_pemohon ?? '—'} />
            <Row label="Nombor ahli" value={app.nombor_ahli_salin ?? '—'} />
            <Row label="Telefon" value={app.telefon ?? '—'} />
            <Row label="Alamat" value={app.alamat ?? '—'} />
          </View>
        </Card>

        <SectionTitle title="Permohonan" />
        <Card>
          <View className="gap-2">
            <Row label="Tujuan" value={tujuanLabel(app.kategori, app.tujuan, app.tujuan_lain)} />
            <Row label="Jumlah dimohon" value={formatRM(app.jumlah_dimohon)} />
            <Row label="Keadaan" value={app.keadaan ?? '—'} />
            {app.tahap_keperluan === 'mendesak' ? <Row label="Sebab mendesak" value={app.sebab_mendesak ?? '—'} /> : null}
            {app.tarikh_diperlukan ? <Row label="Diperlukan pada" value={formatTarikh(app.tarikh_diperlukan)} /> : null}
          </View>
        </Card>

        <SectionTitle title="Isi rumah & kewangan" />
        <Card>
          <View className="gap-2">
            <Row label="Status pekerjaan" value={label(PEKERJAAN_OPTIONS, app.status_pekerjaan)} />
            <Row label="Jenis pendapatan" value={label(PENDAPATAN_OPTIONS, app.pendapatan_jenis)} />
            <Row label="Pendapatan isi rumah" value={app.pendapatan_isi_rumah === null ? 'Tidak dinyatakan' : formatRM(app.pendapatan_isi_rumah)} />
            {app.pendapatan_catatan ? <Row label="Catatan pendapatan" value={app.pendapatan_catatan} /> : null}
            <Row label="Bil. tanggungan" value={app.bil_tanggungan === null ? '—' : String(app.bil_tanggungan)} />
            <Row label="Keperluan asas" value={app.ringkasan_perbelanjaan ?? '—'} />
            <Row label="Bantuan lain" value={app.bantuan_lain_ada ? 'Ya' : app.bantuan_lain_ada === false ? 'Tidak' : '—'} />
            {app.bantuan_lain_ada ? (
              <>
                <Row label="Sumber" value={app.bantuan_lain_sumber ?? '—'} />
                <Row label="Amaun" value={app.bantuan_lain_amaun === null ? 'Tidak diketahui' : formatRM(app.bantuan_lain_amaun)} />
                <Row label="Kekerapan" value={app.bantuan_lain_kekerapan ?? '—'} />
              </>
            ) : null}
          </View>
        </Card>

        {app.kategori === 'pelajar' ? (
          <>
            <SectionTitle title="Maklumat pelajar" />
            <Card>
              <View className="gap-2">
                <Row label="Memohon sebagai" value={app.pelajar_hubungan_pemohon === 'penjaga' ? 'Penjaga' : 'Pelajar sendiri'} />
                <Row label="Nama pelajar" value={app.pelajar_nama ?? '—'} />
                {app.pelajar_hubungan_pemohon === 'penjaga' ? <Row label="Hubungan" value={app.pelajar_hubungan_ahli ?? '—'} /> : null}
                <Row label="Institusi" value={app.pelajar_institusi ?? '—'} />
                <Row label="Program" value={app.pelajar_program ?? '—'} />
                <Row label="Tahun / semester" value={app.pelajar_tahun_semester ?? '—'} />
                <Row label="Status pengajian" value={label(PENGAJIAN_OPTIONS, app.pelajar_status_pengajian)} />
                {app.pelajar_bantuan_sedia_ada ? <Row label="Bantuan sedia ada" value={app.pelajar_bantuan_sedia_ada} /> : null}
              </View>
            </Card>
          </>
        ) : null}

        <SectionTitle title="Dokumen sokongan" />
        {docs.length === 0 ? (
          <Card>
            <Text className="text-sm text-ink-muted">
              Tiada dokumen dimuat naik.{app.dokumen_tiada_sebab ? ' Sebab: ' + app.dokumen_tiada_sebab : ''}
            </Text>
          </Card>
        ) : (
          docs.map((doc) => (
            <Pressable key={doc.id} accessibilityRole="button" accessibilityLabel={'Buka ' + doc.nama_fail} onPress={() => void openDocument(doc)} className="active:opacity-70">
              <Card>
                <Text className="text-sm font-semibold text-primary" numberOfLines={1}>{doc.nama_fail}</Text>
                <Text className="text-xs text-ink-muted">Pautan dokumen sah seketika sahaja.</Text>
              </Card>
            </Pressable>
          ))
        )}

        {requests.length > 0 ? (
          <>
            <SectionTitle title="Maklumat tambahan" />
            {requests.map((request) => (
              <Card key={request.id}>
                <View className="gap-2">
                  <Text className="text-xs text-ink-muted">Diminta {formatTarikh(request.created_at)}</Text>
                  <Text className="text-sm text-ink">{request.mesej}</Text>
                  <Text className="text-sm text-ink-muted">
                    {request.responded_at ? 'Respons (' + formatTarikh(request.responded_at) + '): ' + request.respons : 'Belum dijawab.'}
                  </Text>
                </View>
              </Card>
            ))}
          </>
        ) : null}

        <SectionTitle title="Permohonan terdahulu" caption="Untuk semakan sahaja. Jumlah diluluskan bukan bermaksud telah dibayar." />
        <Card>
          <View className="gap-3">
            {previous.length === 0 ? <Text className="text-sm text-ink-muted">Tiada permohonan terdahulu dalam modul ini.</Text> : null}
            {previous.map((row) => (
              <View key={row.id} className="gap-0.5">
                <Text className="text-sm font-semibold text-ink">{row.no_rujukan} · {STATUS_LABEL[row.status]}</Text>
                <Text className="text-xs text-ink-muted">
                  {tujuanLabel(row.kategori, row.tujuan)} · dimohon {formatRM(row.jumlah_dimohon)}
                  {row.status === 'approved' ? ' · diluluskan ' + formatRM(row.jumlah_diluluskan) : ''}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <SectionTitle title="Catatan dalaman" caption="Tidak kelihatan kepada pemohon." />
        {notes.map((note) => (
          <Card key={note.id}>
            <View className="gap-1">
              <Text className="text-xs text-ink-muted">
                {note.penulis_nama ?? 'Admin'} · {formatTarikh(note.created_at)}
                {note.jenis === 'alasan_kelulusan' ? ' · alasan kelulusan' : note.jenis === 'alasan_penolakan' ? ' · alasan penolakan' : ''}
              </Text>
              <Text className="text-sm text-ink">{note.isi}</Text>
            </View>
          </Card>
        ))}
        {canDecide ? (
          <View className="gap-3">
            <TextField label="Tambah catatan dalaman" value={nota} onChangeText={setNota} multiline maxLength={3000} />
            <Button
              label="Simpan Catatan"
              variant="secondary"
              loading={busy}
              disabled={nota.trim().length < 2}
              onPress={() =>
                void run(async () => {
                  await addBantuanNote(app.id, nota.trim());
                  setNota('');
                }, 'Catatan disimpan.')
              }
            />
          </View>
        ) : null}

        <SectionTitle title="Sejarah tindakan" />
        <Card>
          <View className="gap-3">
            {history.map((item) => (
              <View key={item.id} className="gap-0.5">
                <Text className="text-sm font-semibold text-ink">{TINDAKAN_LABEL[item.tindakan] ?? item.tindakan}</Text>
                <Text className="text-xs text-ink-muted">
                  {item.actor_nama ?? 'Pemohon'} · {formatTarikh(item.created_at)}
                  {item.status_dari && item.status_ke && item.status_dari !== item.status_ke
                    ? ' · ' + STATUS_LABEL[item.status_dari as keyof typeof STATUS_LABEL] + ' → ' + STATUS_LABEL[item.status_ke as keyof typeof STATUS_LABEL]
                    : ''}
                </Text>
                {item.perubahan
                  ? Object.entries(item.perubahan).map(([key, value]) => (
                      <Text key={key} className="text-xs text-ink-muted">
                        {key}: {String(value.dari ?? '—')} → {String(value.kepada ?? '—')}
                      </Text>
                    ))
                  : null}
              </View>
            ))}
          </View>
        </Card>
      </View>

      {/* Minta maklumat tambahan */}
      <FormModal
        visible={modal === 'info'}
        title="Minta Maklumat Tambahan"
        description="Terangkan dengan jelas maklumat atau dokumen yang diperlukan. Pemohon akan melihat mesej ini."
        onClose={closeModal}
        dismissable={!busy}
        footer={
          <Button
            label="Hantar Permintaan"
            loading={busy}
            disabled={mesejInfo.trim().length < 10}
            onPress={() => void run(() => requestBantuanInfo(app.id, app.versi, mesejInfo.trim()).then(() => setMesejInfo('')), 'Permintaan dihantar kepada pemohon.')}
          />
        }>
        <TextField label="Maklumat yang diperlukan *" value={mesejInfo} onChangeText={setMesejInfo} multiline maxLength={2000} />
      </FormModal>

      {/* Luluskan — borang kemudian ringkasan pengesahan */}
      <FormModal
        visible={modal === 'approve'}
        title={confirmStep ? 'Sahkan Kelulusan' : 'Luluskan Permohonan'}
        description={confirmStep ? 'Semak ringkasan sebelum mengesahkan. Keputusan ini muktamad.' : 'Kelulusan sebahagian dibenarkan. Kelulusan bukan pembayaran.'}
        onClose={closeModal}
        dismissable={!busy}
        footer={
          confirmStep ? (
            <View className="gap-3">
              <Button label="Sahkan & Luluskan" loading={busy} onPress={() => void run(() => approveBantuan(app.id, app.versi, parsedJumlah, alasanLulus.trim(), mesejLulus.trim()), 'Permohonan diluluskan.')} />
              <Button label="Kembali" variant="secondary" disabled={busy} onPress={() => setConfirmStep(false)} />
            </View>
          ) : (
            <Button
              label="Semak Ringkasan"
              disabled={!(parsedJumlah > 0 && (app.jumlah_dimohon === null || parsedJumlah <= app.jumlah_dimohon)) || alasanLulus.trim().length < 5 || mesejLulus.trim().length < 5}
              onPress={() => setConfirmStep(true)}
            />
          )
        }>
        {confirmStep ? (
          <View className="gap-3">
            <Row label="Jumlah dimohon" value={formatRM(app.jumlah_dimohon)} />
            <Row label="Jumlah diluluskan" value={formatRM(parsedJumlah)} />
            {partial ? <Notice tone="warn" message="Jumlah kurang daripada dimohon. Pastikan mesej kepada pemohon menjelaskan perkara ini." /> : null}
            <Row label="Mesej kepada pemohon" value={mesejLulus.trim()} />
            <Row label="Alasan dalaman" value={alasanLulus.trim()} />
          </View>
        ) : (
          <View className="gap-4">
            <TextField label={'Jumlah diluluskan (RM) * — dimohon ' + formatRM(app.jumlah_dimohon)} value={jumlah} onChangeText={(v) => setJumlah(v.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" maxLength={10} />
            <TextField label="Alasan kelulusan (dalaman) *" value={alasanLulus} onChangeText={setAlasanLulus} multiline maxLength={3000} />
            <TextField label="Mesej ringkas kepada pemohon *" value={mesejLulus} onChangeText={setMesejLulus} multiline maxLength={2000} />
          </View>
        )}
      </FormModal>

      {/* Tolak */}
      <FormModal
        visible={modal === 'reject'}
        title={confirmStep ? 'Sahkan Penolakan' : 'Tolak Permohonan'}
        description={confirmStep ? 'Semak ringkasan sebelum mengesahkan. Keputusan ini muktamad.' : 'Beri penjelasan yang sopan dan boleh difahami pemohon.'}
        onClose={closeModal}
        dismissable={!busy}
        footer={
          confirmStep ? (
            <View className="gap-3">
              <Button label="Sahkan & Tolak" variant="danger" loading={busy} onPress={() => void run(() => rejectBantuan(app.id, app.versi, kategoriTolak ?? '', penjelasanTolak.trim(), alasanTolak), 'Permohonan ditolak.')} />
              <Button label="Kembali" variant="secondary" disabled={busy} onPress={() => setConfirmStep(false)} />
            </View>
          ) : (
            <Button label="Semak Ringkasan" disabled={!kategoriTolak || penjelasanTolak.trim().length < 10} onPress={() => setConfirmStep(true)} />
          )
        }>
        {confirmStep ? (
          <View className="gap-3">
            <Row label="Sebab" value={label(TOLAK_OPTIONS, kategoriTolak)} />
            <Row label="Penjelasan kepada pemohon" value={penjelasanTolak.trim()} />
            {alasanTolak.trim() ? <Row label="Alasan dalaman" value={alasanTolak.trim()} /> : null}
          </View>
        ) : (
          <View className="gap-4">
            <PickerField label="Kategori sebab *" value={kategoriTolak} options={TOLAK_OPTIONS} onChange={setKategoriTolak} placeholder="Sila pilih" />
            <TextField label="Penjelasan kepada pemohon *" value={penjelasanTolak} onChangeText={setPenjelasanTolak} multiline maxLength={2000} />
            <TextField label="Alasan dalaman (pilihan)" value={alasanTolak} onChangeText={setAlasanTolak} multiline maxLength={3000} />
          </View>
        )}
      </FormModal>
    </Screen>
  );
}

function Row({ label: name, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="text-sm text-ink-muted">{name}</Text>
      <Text className="flex-1 text-right text-sm font-semibold text-ink">{value}</Text>
    </View>
  );
}
