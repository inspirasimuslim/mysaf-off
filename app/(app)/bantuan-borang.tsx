import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { OptionalDateField } from '@/components/ui/optional-date-field';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { SelectRow } from '@/components/ui/select-row';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/lib/auth-context';
import {
  KATEGORI_LABEL,
  KATEGORI_PENERANGAN,
  MAX_DOCUMENTS,
  PEKERJAAN_OPTIONS,
  PENDAPATAN_OPTIONS,
  PENGAJIAN_OPTIONS,
  TAHAP_OPTIONS,
  TUJUAN_OPTIONS,
  bantuanError,
  fetchBantuan,
  fetchBantuanDocuments,
  fetchBantuanInfoRequests,
  formatRM,
  newId,
  removeBantuanDocument,
  saveBantuanDraft,
  saveBantuanResponse,
  submitBantuan,
  tujuanLabel,
  uploadBantuanDocument,
  type BantuanApplication,
  type BantuanDocument,
  type BantuanForm,
  type BantuanInfoRequest,
  type BantuanKategori,
} from '@/lib/bantuan';
import { fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';

/**
 * Borang Permohonan Bantuan berperingkat (migration 148).
 *
 * Draf disimpan ke pelayan setiap kali menekan "Seterusnya"/"Simpan Draf" melalui
 * `bantuan_save_draft` (ID dijana di sini, jadi simpan berulang/klik berganda
 * tidak mencipta permohonan berganda). Maklumat hubungan diprafill daripada profil
 * tetapi hanya disalin ke permohonan — profil utama tidak diubah. Semakan sebenar
 * ada di pelayan (`bantuan_validate`); semakan di sini hanya untuk maklum balas awal.
 *
 * Semasa status "Perlu Maklumat Tambahan", borang yang sama dibuka semula untuk
 * pembetulan; langkah akhir menambah ruang respons dan butang "Hantar Semula".
 */

type TextKey =
  | 'tujuan' | 'tujuan_lain' | 'nama_pemohon' | 'nombor_ahli_salin' | 'telefon' | 'alamat' | 'keadaan'
  | 'jumlah_dimohon' | 'sebab_mendesak' | 'tarikh_diperlukan' | 'status_pekerjaan' | 'pendapatan_jenis'
  | 'pendapatan_isi_rumah' | 'pendapatan_catatan' | 'bil_tanggungan' | 'ringkasan_perbelanjaan'
  | 'bantuan_lain_sumber' | 'bantuan_lain_amaun' | 'bantuan_lain_kekerapan' | 'pelajar_hubungan_pemohon'
  | 'pelajar_nama' | 'pelajar_hubungan_ahli' | 'pelajar_institusi' | 'pelajar_program'
  | 'pelajar_tahun_semester' | 'pelajar_status_pengajian' | 'pelajar_bantuan_sedia_ada' | 'dokumen_tiada_sebab';

const TEXT_KEYS: TextKey[] = [
  'tujuan', 'tujuan_lain', 'nama_pemohon', 'nombor_ahli_salin', 'telefon', 'alamat', 'keadaan',
  'jumlah_dimohon', 'sebab_mendesak', 'tarikh_diperlukan', 'status_pekerjaan', 'pendapatan_jenis',
  'pendapatan_isi_rumah', 'pendapatan_catatan', 'bil_tanggungan', 'ringkasan_perbelanjaan',
  'bantuan_lain_sumber', 'bantuan_lain_amaun', 'bantuan_lain_kekerapan', 'pelajar_hubungan_pemohon',
  'pelajar_nama', 'pelajar_hubungan_ahli', 'pelajar_institusi', 'pelajar_program',
  'pelajar_tahun_semester', 'pelajar_status_pengajian', 'pelajar_bantuan_sedia_ada', 'dokumen_tiada_sebab',
];

type FormState = Record<TextKey, string> & {
  kategori: BantuanKategori | null;
  tahap_keperluan: 'biasa' | 'mendesak' | null;
  bantuan_lain_ada: boolean | null;
  dokumen_tiada: boolean;
  pengakuan_benar: boolean;
  pengakuan_proses: boolean;
  pengakuan_satu_kali: boolean;
};

function emptyState(): FormState {
  const base = {} as FormState;
  for (const key of TEXT_KEYS) base[key] = '';
  base.kategori = null;
  base.tahap_keperluan = null;
  base.bantuan_lain_ada = null;
  base.dokumen_tiada = false;
  base.pengakuan_benar = false;
  base.pengakuan_proses = false;
  base.pengakuan_satu_kali = false;
  return base;
}

function fromApplication(app: BantuanApplication): FormState {
  const state = emptyState();
  for (const key of TEXT_KEYS) {
    const value = app[key as keyof BantuanApplication];
    state[key] = value === null || value === undefined ? '' : String(value);
  }
  state.kategori = app.kategori;
  state.tahap_keperluan = app.tahap_keperluan;
  state.bantuan_lain_ada = app.bantuan_lain_ada;
  state.dokumen_tiada = app.dokumen_tiada;
  state.pengakuan_benar = app.pengakuan_benar;
  state.pengakuan_proses = app.pengakuan_proses;
  state.pengakuan_satu_kali = app.pengakuan_satu_kali;
  return state;
}

function toPayload(state: FormState): BantuanForm {
  const text = (key: TextKey) => (state[key].trim() === '' ? null : state[key].trim());
  const number = (key: TextKey) => {
    const raw = state[key].trim().replace(',', '.');
    return raw === '' ? null : Number(raw);
  };
  const pelajar = state.kategori === 'pelajar';
  return {
    kategori: state.kategori ?? undefined,
    tujuan: text('tujuan'),
    tujuan_lain: state.tujuan === 'lain_lain' ? text('tujuan_lain') : null,
    nama_pemohon: text('nama_pemohon'),
    nombor_ahli_salin: text('nombor_ahli_salin'),
    telefon: text('telefon'),
    alamat: text('alamat'),
    keadaan: text('keadaan'),
    jumlah_dimohon: number('jumlah_dimohon'),
    tahap_keperluan: state.tahap_keperluan,
    sebab_mendesak: state.tahap_keperluan === 'mendesak' ? text('sebab_mendesak') : null,
    tarikh_diperlukan: state.tahap_keperluan === 'mendesak' ? text('tarikh_diperlukan') : null,
    status_pekerjaan: text('status_pekerjaan'),
    pendapatan_jenis: text('pendapatan_jenis') as BantuanForm['pendapatan_jenis'],
    pendapatan_isi_rumah: state.pendapatan_jenis === 'tidak_pasti' ? null : number('pendapatan_isi_rumah'),
    pendapatan_catatan: text('pendapatan_catatan'),
    bil_tanggungan: number('bil_tanggungan'),
    ringkasan_perbelanjaan: text('ringkasan_perbelanjaan'),
    bantuan_lain_ada: state.bantuan_lain_ada,
    bantuan_lain_sumber: state.bantuan_lain_ada ? text('bantuan_lain_sumber') : null,
    bantuan_lain_amaun: state.bantuan_lain_ada ? number('bantuan_lain_amaun') : null,
    bantuan_lain_kekerapan: state.bantuan_lain_ada ? text('bantuan_lain_kekerapan') : null,
    pelajar_hubungan_pemohon: pelajar ? (text('pelajar_hubungan_pemohon') as BantuanForm['pelajar_hubungan_pemohon']) : null,
    pelajar_nama: pelajar ? text('pelajar_nama') : null,
    pelajar_hubungan_ahli: pelajar ? text('pelajar_hubungan_ahli') : null,
    pelajar_institusi: pelajar ? text('pelajar_institusi') : null,
    pelajar_program: pelajar ? text('pelajar_program') : null,
    pelajar_tahun_semester: pelajar ? text('pelajar_tahun_semester') : null,
    pelajar_status_pengajian: pelajar ? text('pelajar_status_pengajian') : null,
    pelajar_bantuan_sedia_ada: pelajar ? text('pelajar_bantuan_sedia_ada') : null,
    dokumen_tiada: state.dokumen_tiada,
    dokumen_tiada_sebab: state.dokumen_tiada ? text('dokumen_tiada_sebab') : null,
    pengakuan_benar: state.pengakuan_benar,
    pengakuan_proses: state.pengakuan_proses,
    pengakuan_satu_kali: state.pengakuan_satu_kali,
  };
}

type StepKey = 'kategori' | 'pemohon' | 'permohonan' | 'kewangan' | 'pelajar' | 'dokumen' | 'semak';

const STEP_LABEL: Record<StepKey, string> = {
  kategori: 'Kategori',
  pemohon: 'Maklumat Anda',
  permohonan: 'Permohonan',
  kewangan: 'Kewangan Ringkas',
  pelajar: 'Maklumat Pelajar',
  dokumen: 'Dokumen Sokongan',
  semak: 'Semak & Hantar',
};

const DOC_JENIS_OPTIONS = [
  { value: 'pendapatan' as const, label: 'Bukti / pengesahan pendapatan' },
  { value: 'bil' as const, label: 'Bil atau dokumen berkaitan bantuan' },
  { value: 'pengajian' as const, label: 'Pengesahan pengajian aktif' },
  { value: 'lain' as const, label: 'Lain-lain' },
];

export default function BantuanBorangScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();

  // ID dijana sekali — simpan berulang menyasarkan baris yang sama.
  const appIdRef = useRef<string>(params.id ?? newId());
  const appId = appIdRef.current;

  const [loading, setLoading] = useState(true);
  const [noMember, setNoMember] = useState(false);
  const [app, setApp] = useState<BantuanApplication | null>(null);
  const [state, setState] = useState<FormState>(emptyState());
  const [docs, setDocs] = useState<BantuanDocument[]>([]);
  const [openRequest, setOpenRequest] = useState<BantuanInfoRequest | null>(null);
  const [respons, setRespons] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docJenis, setDocJenis] = useState<BantuanDocument['jenis']>('pendapatan');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const resubmitting = app?.status === 'needs_information';

  const steps: StepKey[] =
    state.kategori === 'pelajar'
      ? ['kategori', 'pemohon', 'permohonan', 'kewangan', 'pelajar', 'dokumen', 'semak']
      : ['kategori', 'pemohon', 'permohonan', 'kewangan', 'dokumen', 'semak'];
  const step = steps[Math.min(stepIndex, steps.length - 1)] as StepKey;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    setSaved(null);
  };

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    void (async () => {
      try {
        const member = await fetchMyMemberLinked(user.id);
        if (!active) return;
        if (!member) {
          setNoMember(true);
          return;
        }
        if (params.id) {
          const existing = await fetchBantuan(params.id);
          if (!active) return;
          if (!existing || existing.member_id !== member.id) {
            setError('Permohonan tidak dijumpai.');
            return;
          }
          if (existing.status !== 'draft' && existing.status !== 'needs_information') {
            router.replace({ pathname: '/(app)/bantuan-info', params: { id: existing.id } });
            return;
          }
          setApp(existing);
          setState(fromApplication(existing));
          const [documents, requests] = await Promise.all([
            fetchBantuanDocuments(existing.id),
            existing.status === 'needs_information' ? fetchBantuanInfoRequests(existing.id) : Promise.resolve([]),
          ]);
          if (!active) return;
          setDocs(documents);
          const open = [...requests].reverse().find((request) => !request.responded_at) ?? null;
          setOpenRequest(open);
          setRespons(open?.respons ?? '');
        } else {
          // Prefill daripada profil — disalin ke permohonan sahaja.
          setState((prev) => ({
            ...prev,
            nama_pemohon: member.full_name ?? '',
            nombor_ahli_salin: member.nombor_ahli ?? '',
            telefon: member.no_tel ?? '',
            alamat: member.alamat_semasa ?? member.alamat ?? '',
          }));
        }
      } catch (caught) {
        if (active) setError(bantuanError(caught, 'Gagal memuatkan permohonan.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id, params.id, router]);

  /** Simpan draf ke pelayan. Memulangkan `true` jika berjaya. */
  const persist = useCallback(async (): Promise<boolean> => {
    if (!state.kategori) {
      setError('Sila pilih kategori bantuan.');
      return false;
    }
    try {
      const row = await saveBantuanDraft(appId, toPayload(state));
      setApp(row);
      return true;
    } catch (caught) {
      setError(bantuanError(caught, 'Gagal menyimpan draf. Sila cuba lagi.'));
      return false;
    }
  }, [appId, state]);

  const stepProblem = (key: StepKey): string | null => {
    const text = (k: TextKey) => state[k].trim();
    switch (key) {
      case 'kategori':
        return state.kategori ? null : 'Sila pilih kategori bantuan.';
      case 'pemohon':
        if (text('nama_pemohon').length < 2) return 'Sila isi nama pemohon.';
        if (!/^[0-9+ -]{8,20}$/.test(text('telefon'))) return 'Sila isi nombor telefon yang sah.';
        if (text('alamat').length < 5) return 'Sila isi alamat.';
        return null;
      case 'permohonan':
        if (!text('tujuan')) return 'Sila pilih tujuan bantuan.';
        if (state.tujuan === 'lain_lain' && text('tujuan_lain').length < 3) return 'Sila nyatakan tujuan bantuan.';
        if (text('keadaan').length < 20) return 'Sila terangkan keadaan anda (sekurang-kurangnya 20 aksara).';
        if (!(Number(text('jumlah_dimohon').replace(',', '.')) > 0)) return 'Sila isi anggaran jumlah yang diperlukan.';
        if (!state.tahap_keperluan) return 'Sila pilih tahap keperluan.';
        if (state.tahap_keperluan === 'mendesak' && text('sebab_mendesak').length < 5) return 'Sila nyatakan sebab keperluan mendesak.';
        return null;
      case 'kewangan':
        if (!text('status_pekerjaan')) return 'Sila pilih status pekerjaan.';
        if (!text('pendapatan_jenis')) return 'Sila pilih jenis pendapatan isi rumah.';
        if (state.pendapatan_jenis === 'tetap' && text('pendapatan_isi_rumah') === '') return 'Sila isi pendapatan bulanan isi rumah (boleh RM0).';
        if (state.pendapatan_jenis === 'tidak_pasti' && text('pendapatan_catatan').length < 5) return 'Sila jelaskan keadaan pendapatan yang tidak pasti.';
        if (text('bil_tanggungan') === '') return 'Sila isi bilangan tanggungan.';
        if (text('ringkasan_perbelanjaan').length < 5) return 'Sila isi ringkasan keperluan atau perbelanjaan asas.';
        if (state.bantuan_lain_ada === null) return 'Sila nyatakan sama ada anda menerima bantuan lain.';
        if (state.bantuan_lain_ada && text('bantuan_lain_sumber').length < 2) return 'Sila nyatakan sumber bantuan lain.';
        return null;
      case 'pelajar':
        if (!text('pelajar_hubungan_pemohon')) return 'Sila nyatakan sama ada anda pelajar atau penjaga.';
        if (text('pelajar_nama').length < 2) return 'Sila isi nama pelajar.';
        if (state.pelajar_hubungan_pemohon === 'penjaga' && text('pelajar_hubungan_ahli').length < 2) return 'Sila nyatakan hubungan pelajar dengan anda.';
        if (text('pelajar_institusi').length < 2) return 'Sila isi institusi pengajian.';
        if (text('pelajar_program').length < 2) return 'Sila isi program atau peringkat pengajian.';
        if (text('pelajar_tahun_semester').length < 1) return 'Sila isi tahun atau semester.';
        if (!text('pelajar_status_pengajian')) return 'Sila pilih status pengajian.';
        return null;
      case 'dokumen':
        if (docs.length === 0 && !state.dokumen_tiada) return 'Sila muat naik sekurang-kurangnya satu dokumen, atau tandakan "Dokumen belum tersedia".';
        if (docs.length === 0 && state.dokumen_tiada && text('dokumen_tiada_sebab').length < 5) return 'Sila nyatakan sebab dokumen belum tersedia.';
        return null;
      case 'semak':
        if (!(state.pengakuan_benar && state.pengakuan_proses && state.pengakuan_satu_kali)) return 'Sila tandakan semua pengakuan sebelum menghantar.';
        if (resubmitting && respons.trim().length < 5) return 'Sila tulis respons kepada permintaan maklumat tambahan.';
        return null;
    }
  };

  const next = async () => {
    if (busy) return;
    setError(null);
    const problem = stepProblem(step);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      if (await persist()) setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    } finally {
      setBusy(false);
    }
  };

  const back = async () => {
    setError(null);
    if (stepIndex === 0) return goBack();
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const saveDraft = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (await persist()) {
        if (resubmitting && respons.trim()) await saveBantuanResponse(appId, respons.trim());
        setSaved('Draf disimpan.');
      }
    } catch (caught) {
      setError(bantuanError(caught, 'Gagal menyimpan draf.'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    for (const key of steps) {
      const problem = stepProblem(key);
      if (problem) {
        setStepIndex(steps.indexOf(key));
        return setError(problem);
      }
    }
    setBusy(true);
    try {
      if (!(await persist())) return;
      await submitBantuan(appId, resubmitting ? respons.trim() : undefined);
      router.replace({ pathname: '/(app)/bantuan-info', params: { id: appId } });
    } catch (caught) {
      setError(bantuanError(caught, 'Gagal menghantar permohonan. Sila cuba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  const addDocument = async () => {
    if (uploading || busy) return;
    setError(null);
    if (docs.length >= MAX_DOCUMENTS) return setError('Maksimum ' + MAX_DOCUMENTS + ' dokumen bagi satu permohonan.');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0] as DocumentPicker.DocumentPickerAsset;
      if (asset.size !== undefined && asset.size > 25 * 1024 * 1024) {
        return setError('Fail terlalu besar. Pilih fail yang lebih kecil (maksimum 5 MB selepas dimampatkan).');
      }
      setUploading(true);
      if (!(await persist())) return;
      const doc = await uploadBantuanDocument(
        appId,
        {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? null,
          size: asset.size ?? null,
          webFile: asset.file,
        },
        docJenis,
      );
      setDocs((prev) => [...prev, doc]);
      set('dokumen_tiada', false);
    } catch (caught) {
      setError(bantuanError(caught, 'Gagal memuat naik dokumen.'));
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async (doc: BantuanDocument) => {
    if (uploading || busy) return;
    setError(null);
    try {
      await removeBantuanDocument(doc.id);
      setDocs((prev) => prev.filter((item) => item.id !== doc.id));
    } catch (caught) {
      setError(bantuanError(caught, 'Gagal membuang dokumen.'));
    }
  };

  if (loading) return <LoadingScreen />;
  if (noMember) {
    return (
      <NoAccessScreen
        title="Permohonan Bantuan"
        description="Akaun anda belum dipautkan kepada rekod ahli. Hubungi admin untuk dipautkan."
      />
    );
  }

  const tujuanOptions = state.kategori ? TUJUAN_OPTIONS[state.kategori] : [];
  const docEditableIds = new Set(resubmitting && openRequest ? docs.filter((d) => d.info_request_id === openRequest.id).map((d) => d.id) : docs.map((d) => d.id));
  const isLast = stepIndex >= steps.length - 1;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow={'Langkah ' + (stepIndex + 1) + ' daripada ' + steps.length}
        title={STEP_LABEL[step]}
        subtitle={app?.no_rujukan ?? (resubmitting ? 'Pembetulan permohonan' : 'Permohonan Bantuan')}
        onBackPress={() => void back()}
      />

      <View className="gap-4 px-gutter pb-10 pt-5">
        {resubmitting && openRequest ? (
          <Notice tone="warn" message={'Admin meminta maklumat tambahan: ' + openRequest.mesej} />
        ) : null}
        {error ? <Notice tone="negative" message={error} /> : null}
        {saved ? <Notice tone="positive" message={saved} /> : null}

        {step === 'kategori' ? (
          <View className="gap-3">
            <Text className="text-sm leading-5 text-ink-muted">
              Bantuan ini diberikan sekali sahaja (one-off) berdasarkan keperluan yang dinilai dan kemampuan organisasi. Permohonan tidak menjamin kelulusan.
            </Text>
            {(['keluarga', 'pelajar'] as BantuanKategori[]).map((kategori) => (
              <SelectRow
                key={kategori}
                title={KATEGORI_LABEL[kategori]}
                subtitle={KATEGORI_PENERANGAN[kategori]}
                selected={state.kategori === kategori}
                disabled={resubmitting || (app !== null && app.status !== 'draft')}
                onPress={() => {
                  if (state.kategori !== kategori) {
                    setState((prev) => ({ ...prev, kategori, tujuan: '', tujuan_lain: '' }));
                    setSaved(null);
                  }
                }}
              />
            ))}
          </View>
        ) : null}

        {step === 'pemohon' ? (
          <View className="gap-4">
            <Text className="text-sm leading-5 text-ink-muted">
              Maklumat ini diambil daripada profil anda. Anda boleh membetulkannya untuk permohonan ini — profil utama tidak berubah.
            </Text>
            <TextField label="Nama pemohon *" value={state.nama_pemohon} onChangeText={(v) => set('nama_pemohon', v)} maxLength={120} />
            <TextField label="Nombor ahli" value={state.nombor_ahli_salin} onChangeText={(v) => set('nombor_ahli_salin', v)} maxLength={30} />
            <TextField label="No. telefon *" value={state.telefon} onChangeText={(v) => set('telefon', v)} keyboardType="phone-pad" maxLength={20} />
            <TextField label="Alamat *" value={state.alamat} onChangeText={(v) => set('alamat', v)} multiline maxLength={300} />
          </View>
        ) : null}

        {step === 'permohonan' ? (
          <View className="gap-4">
            <PickerField
              label="Tujuan bantuan *"
              value={state.tujuan || null}
              options={tujuanOptions}
              onChange={(v) => set('tujuan', v ?? '')}
              placeholder="Sila pilih"
            />
            {state.tujuan === 'lain_lain' ? (
              <TextField label="Nyatakan tujuan *" value={state.tujuan_lain} onChangeText={(v) => set('tujuan_lain', v)} maxLength={120} />
            ) : null}
            <TextField
              label="Keadaan dan sebab memerlukan bantuan *"
              value={state.keadaan}
              onChangeText={(v) => set('keadaan', v)}
              multiline
              maxLength={2000}
              placeholder="Terangkan keadaan anda dengan ringkas dan jujur."
            />
            <TextField
              label="Anggaran jumlah diperlukan (RM) *"
              value={state.jumlah_dimohon}
              onChangeText={(v) => set('jumlah_dimohon', v.replace(/[^0-9.,]/g, ''))}
              keyboardType="decimal-pad"
              maxLength={10}
            />
            <Segmented label="Tahap keperluan *" value={state.tahap_keperluan} options={TAHAP_OPTIONS} onChange={(v) => set('tahap_keperluan', v)} />
            {state.tahap_keperluan === 'mendesak' ? (
              <>
                <Notice tone="info" message="Label mendesak ialah maklumat untuk semakan admin. Ia bukan kelulusan atau keutamaan automatik." />
                <TextField label="Sebab mendesak *" value={state.sebab_mendesak} onChangeText={(v) => set('sebab_mendesak', v)} multiline maxLength={500} />
                <OptionalDateField label="Tarikh diperlukan (jika berkaitan)" value={state.tarikh_diperlukan} onChange={(v) => set('tarikh_diperlukan', v)} />
              </>
            ) : null}
          </View>
        ) : null}

        {step === 'kewangan' ? (
          <View className="gap-4">
            <PickerField
              label="Status pekerjaan *"
              value={state.status_pekerjaan || null}
              options={PEKERJAAN_OPTIONS}
              onChange={(v) => set('status_pekerjaan', v ?? '')}
              placeholder="Sila pilih"
            />
            <Segmented label="Pendapatan bulanan isi rumah *" value={(state.pendapatan_jenis || null) as 'tetap' | 'tidak_tetap' | 'tidak_pasti' | null} options={PENDAPATAN_OPTIONS} onChange={(v) => set('pendapatan_jenis', v)} />
            {state.pendapatan_jenis === 'tidak_pasti' ? (
              <TextField
                label="Jelaskan keadaan pendapatan *"
                value={state.pendapatan_catatan}
                onChangeText={(v) => set('pendapatan_catatan', v)}
                multiline
                maxLength={500}
                placeholder="Cth: kerja kontrak, tiada pendapatan tetap bulan ini."
              />
            ) : (
              <>
                <TextField
                  label={state.pendapatan_jenis === 'tidak_tetap' ? 'Anggaran pendapatan bulanan (RM, pilihan)' : 'Jumlah pendapatan bulanan (RM) *'}
                  value={state.pendapatan_isi_rumah}
                  onChangeText={(v) => set('pendapatan_isi_rumah', v.replace(/[^0-9.,]/g, ''))}
                  keyboardType="decimal-pad"
                  maxLength={10}
                />
                <Text className="-mt-2 text-xs text-ink-muted">Isi 0 jika isi rumah tiada pendapatan. Jangan biarkan kosong jika anda sebenarnya tidak tahu.</Text>
              </>
            )}
            <TextField
              label="Bilangan tanggungan *"
              value={state.bil_tanggungan}
              onChangeText={(v) => set('bil_tanggungan', v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={2}
            />
            <TextField
              label="Ringkasan keperluan / perbelanjaan asas *"
              value={state.ringkasan_perbelanjaan}
              onChangeText={(v) => set('ringkasan_perbelanjaan', v)}
              multiline
              maxLength={1000}
              placeholder="Cth: makan minum, sewa, utiliti, ubat."
            />
            <Segmented
              label="Adakah anda sedang menerima bantuan lain? *"
              value={state.bantuan_lain_ada === null ? null : state.bantuan_lain_ada ? 'ya' : 'tidak'}
              options={[
                { value: 'ya', label: 'Ya' },
                { value: 'tidak', label: 'Tidak' },
              ]}
              onChange={(v) => set('bantuan_lain_ada', v === 'ya')}
            />
            {state.bantuan_lain_ada ? (
              <>
                <TextField label="Sumber bantuan *" value={state.bantuan_lain_sumber} onChangeText={(v) => set('bantuan_lain_sumber', v)} maxLength={120} />
                <TextField
                  label="Amaun (RM, jika diketahui)"
                  value={state.bantuan_lain_amaun}
                  onChangeText={(v) => set('bantuan_lain_amaun', v.replace(/[^0-9.,]/g, ''))}
                  keyboardType="decimal-pad"
                  maxLength={10}
                />
                <TextField label="Kekerapan (jika diketahui)" value={state.bantuan_lain_kekerapan} onChangeText={(v) => set('bantuan_lain_kekerapan', v)} maxLength={60} placeholder="Cth: bulanan" />
              </>
            ) : null}
          </View>
        ) : null}

        {step === 'pelajar' ? (
          <View className="gap-4">
            <Segmented
              label="Anda memohon sebagai *"
              value={(state.pelajar_hubungan_pemohon || null) as 'sendiri' | 'penjaga' | null}
              options={[
                { value: 'sendiri', label: 'Pelajar sendiri' },
                { value: 'penjaga', label: 'Penjaga' },
              ]}
              onChange={(v) => set('pelajar_hubungan_pemohon', v)}
            />
            <TextField label="Nama pelajar *" value={state.pelajar_nama} onChangeText={(v) => set('pelajar_nama', v)} maxLength={120} />
            {state.pelajar_hubungan_pemohon === 'penjaga' ? (
              <TextField label="Hubungan pelajar dengan anda *" value={state.pelajar_hubungan_ahli} onChangeText={(v) => set('pelajar_hubungan_ahli', v)} maxLength={60} placeholder="Cth: anak" />
            ) : null}
            <TextField label="Institusi pengajian *" value={state.pelajar_institusi} onChangeText={(v) => set('pelajar_institusi', v)} maxLength={160} />
            <TextField label="Program / peringkat pengajian *" value={state.pelajar_program} onChangeText={(v) => set('pelajar_program', v)} maxLength={160} />
            <TextField label="Tahun atau semester *" value={state.pelajar_tahun_semester} onChangeText={(v) => set('pelajar_tahun_semester', v)} maxLength={40} />
            <PickerField
              label="Status pengajian *"
              value={state.pelajar_status_pengajian || null}
              options={PENGAJIAN_OPTIONS}
              onChange={(v) => set('pelajar_status_pengajian', v ?? '')}
              placeholder="Sila pilih"
            />
            <TextField
              label="Biasiswa, pinjaman atau bantuan pendidikan sedia ada (jika ada)"
              value={state.pelajar_bantuan_sedia_ada}
              onChangeText={(v) => set('pelajar_bantuan_sedia_ada', v)}
              multiline
              maxLength={500}
            />
          </View>
        ) : null}

        {step === 'dokumen' ? (
          <View className="gap-4">
            <Text className="text-sm leading-5 text-ink-muted">
              Contoh: bukti pendapatan, bil atau pengesahan pengajian. Format PDF, JPG atau PNG, maksimum 5 MB setiap fail dan {MAX_DOCUMENTS} fail. Jangan muat naik salinan kad pengenalan atau nombor akaun bank.
            </Text>

            {docs.map((doc) => (
              <Card key={doc.id}>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{doc.nama_fail}</Text>
                    <Text className="text-xs text-ink-muted">{DOC_JENIS_OPTIONS.find((o) => o.value === doc.jenis)?.label}</Text>
                  </View>
                  {docEditableIds.has(doc.id) ? (
                    <Button label="Buang" variant="danger" size="sm" onPress={() => void removeDocument(doc)} disabled={uploading || busy} />
                  ) : (
                    <Badge label="Telah dihantar" tone="neutral" />
                  )}
                </View>
              </Card>
            ))}

            {docs.length < MAX_DOCUMENTS ? (
              <>
                <PickerField label="Jenis dokumen" value={docJenis} options={DOC_JENIS_OPTIONS} onChange={(v) => v && setDocJenis(v)} />
                <Button label={uploading ? 'Memuat naik…' : 'Tambah Dokumen'} variant="secondary" loading={uploading} onPress={() => void addDocument()} />
              </>
            ) : null}

            {docs.length === 0 ? (
              <>
                <SelectRow
                  title="Dokumen belum tersedia"
                  subtitle="Permohonan masih boleh dihantar untuk penelitian admin. Tiada penolakan automatik."
                  selected={state.dokumen_tiada}
                  onPress={() => set('dokumen_tiada', !state.dokumen_tiada)}
                />
                {state.dokumen_tiada ? (
                  <TextField label="Sebab dokumen belum tersedia *" value={state.dokumen_tiada_sebab} onChangeText={(v) => set('dokumen_tiada_sebab', v)} multiline maxLength={300} />
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {step === 'semak' ? (
          <View className="gap-4">
            <SectionTitle title="Ringkasan permohonan" caption="Semak maklumat sebelum menghantar." />
            <Card>
              <View className="gap-2">
                <Summary label="Kategori" value={state.kategori ? KATEGORI_LABEL[state.kategori] : '—'} />
                <Summary label="Tujuan" value={state.kategori ? tujuanLabel(state.kategori, state.tujuan || null, state.tujuan_lain || null) : '—'} />
                <Summary label="Jumlah dimohon" value={formatRM(Number(state.jumlah_dimohon.replace(',', '.')) || null)} />
                <Summary label="Tahap keperluan" value={state.tahap_keperluan === 'mendesak' ? 'Mendesak' : state.tahap_keperluan === 'biasa' ? 'Biasa' : '—'} />
                <Summary label="Pemohon" value={state.nama_pemohon || '—'} />
                <Summary label="Telefon" value={state.telefon || '—'} />
                <Summary label="Dokumen" value={docs.length > 0 ? docs.length + ' fail' : state.dokumen_tiada ? 'Belum tersedia' : '—'} />
              </View>
            </Card>

            {resubmitting ? (
              <TextField
                label="Respons kepada admin *"
                value={respons}
                onChangeText={(v) => {
                  setRespons(v);
                  setSaved(null);
                }}
                multiline
                maxLength={3000}
                placeholder="Jawab permintaan maklumat tambahan di atas."
              />
            ) : null}

            <SectionTitle title="Pengakuan" />
            <SelectRow title="Maklumat yang saya berikan adalah benar." selected={state.pengakuan_benar} onPress={() => set('pengakuan_benar', !state.pengakuan_benar)} />
            <SelectRow
              title="Saya bersetuju maklumat ini diproses oleh pegawai yang diberi kuasa bagi tujuan penilaian bantuan."
              selected={state.pengakuan_proses}
              onPress={() => set('pengakuan_proses', !state.pengakuan_proses)}
            />
            <SelectRow
              title="Saya memahami bantuan ini adalah sekali beri dan tertakluk kepada penilaian serta kemampuan organisasi."
              selected={state.pengakuan_satu_kali}
              onPress={() => set('pengakuan_satu_kali', !state.pengakuan_satu_kali)}
            />
          </View>
        ) : null}

        <View className="mt-2 gap-3">
          {isLast ? (
            <Button label={resubmitting ? 'Hantar Semula' : 'Hantar Permohonan'} loading={busy} onPress={() => void submit()} />
          ) : (
            <Button label="Seterusnya" loading={busy} onPress={() => void next()} />
          )}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button label="Kembali" variant="secondary" onPress={() => void back()} disabled={busy} />
            </View>
            {state.kategori ? (
              <View className="flex-1">
                <Button label="Simpan Draf" variant="ghost" onPress={() => void saveDraft()} disabled={busy} />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="text-sm text-ink-muted">{label}</Text>
      <Text className="flex-1 text-right text-sm font-semibold text-ink">{value}</Text>
    </View>
  );
}
