import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipGroup } from '@/components/ui/chip-group';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Segmented } from '@/components/ui/segmented';
import { SelectRow } from '@/components/ui/select-row';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/lib/auth-context';
import {
  BANK_LAIN,
  BANK_OPTIONS,
  KATEGORI_LABEL,
  KENALAN_LK,
  MAKLUMAT_PENTING,
  MESEJ_SELEPAS_HANTAR,
  PEMBIAYAAN_OPTIONS,
  PENGAKUAN_TEKS,
  SEBAB_OPTIONS,
  STATUS_DIRI_OPTIONS,
  TAHAP_PENDIDIKAN_BEKERJA,
  TAHAP_PENDIDIKAN_BELAJAR,
  TINGGAL_DI_OPTIONS,
  bantuanError,
  fetchBantuan,
  fetchBantuanInfoRequests,
  newId,
  saveBantuanDraft,
  submitBantuan,
  tajukBorang,
  waLink,
  type BantuanApplication,
  type BantuanForm,
  type BantuanInfoRequest,
  type BantuanKategori,
  type KenalanLK,
} from '@/lib/bantuan';
import { fetchGenerations, fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { useColors } from '@/lib/theme';

/**
 * Borang Permohonan Bantuan Zakat — SATU halaman (migration 148).
 *
 * Dua variasi mengikut `kategori`: `belajar` dan `bekerja` (Bekerja/Berkahwin).
 * Hanya medan yang berkaitan dipaparkan; nilai medan yang disembunyikan tidak
 * dihantar (`toPayload` mengosongkannya) supaya data lapuk tidak tertinggal.
 *
 * Draf disimpan ke pelayan melalui `bantuan_save_draft` (ID dijana di sini, jadi
 * simpan berulang/klik berganda tidak mencipta permohonan berganda). Nama,
 * telefon dan generasi diprafill daripada profil tetapi hanya disalin ke
 * permohonan — profil utama tidak diubah. Semakan sebenar ada di pelayan
 * (`bantuan_validate`); semakan di sini hanya untuk maklum balas awal.
 *
 * Semasa status "Perlu Maklumat Tambahan", borang yang sama dibuka semula untuk
 * pembetulan dengan ruang respons tambahan dan butang "Hantar Semula".
 *
 * Selepas hantar, skrin terima kasih memaparkan tempoh semakan dan kenalan LK.
 */

type FormState = {
  nama_pemohon: string;
  telefon: string;
  generasi: string;
  status_diri: string;
  status_diri_lain: string;
  tempat_menetap: string;
  tahap_pendidikan: string;
  tahap_pendidikan_lain: string;
  tinggal_di: string;
  tinggal_di_lain: string;
  tahun_pengajian: string;
  pembiayaan: string[];
  pembiayaan_lain: string;
  pekerjaan: string;
  pendapatan_pemohon: string;
  pendapatan_keluarga: string;
  pekerjaan_ibu: string;
  pekerjaan_bapa: string;
  bil_tanggungan: string;
  anak_ke: string;
  bil_adik_beradik: string;
  bil_anak: string;
  sebab_keperluan: string[];
  sebab_lain: string;
  penerangan: string;
  pernah_terima: boolean | null;
  bank_nama_pemegang: string;
  bank_pilihan: string;
  bank_lain: string;
  bank_no_akaun: string;
  pengakuan_setuju: boolean;
};

function emptyState(): FormState {
  return {
    nama_pemohon: '',
    telefon: '',
    generasi: '',
    status_diri: '',
    status_diri_lain: '',
    tempat_menetap: '',
    tahap_pendidikan: '',
    tahap_pendidikan_lain: '',
    tinggal_di: '',
    tinggal_di_lain: '',
    tahun_pengajian: '',
    pembiayaan: [],
    pembiayaan_lain: '',
    pekerjaan: '',
    pendapatan_pemohon: '',
    pendapatan_keluarga: '',
    pekerjaan_ibu: '',
    pekerjaan_bapa: '',
    bil_tanggungan: '',
    anak_ke: '',
    bil_adik_beradik: '',
    bil_anak: '',
    sebab_keperluan: [],
    sebab_lain: '',
    penerangan: '',
    pernah_terima: null,
    bank_nama_pemegang: '',
    bank_pilihan: '',
    bank_lain: '',
    bank_no_akaun: '',
    pengakuan_setuju: false,
  };
}

function fromApplication(app: BantuanApplication): FormState {
  const text = (value: string | number | null | undefined) => (value === null || value === undefined ? '' : String(value));
  const bank = app.bank_nama ?? '';
  const bankDikenali = BANK_OPTIONS.includes(bank) && bank !== BANK_LAIN;
  return {
    nama_pemohon: text(app.nama_pemohon),
    telefon: text(app.telefon),
    generasi: text(app.generasi),
    status_diri: text(app.status_diri),
    status_diri_lain: text(app.status_diri_lain),
    tempat_menetap: text(app.tempat_menetap),
    tahap_pendidikan: text(app.tahap_pendidikan),
    tahap_pendidikan_lain: text(app.tahap_pendidikan_lain),
    tinggal_di: text(app.tinggal_di),
    tinggal_di_lain: text(app.tinggal_di_lain),
    tahun_pengajian: text(app.tahun_pengajian),
    pembiayaan: app.pembiayaan ?? [],
    pembiayaan_lain: text(app.pembiayaan_lain),
    pekerjaan: text(app.pekerjaan),
    pendapatan_pemohon: text(app.pendapatan_pemohon),
    pendapatan_keluarga: text(app.pendapatan_keluarga),
    pekerjaan_ibu: text(app.pekerjaan_ibu),
    pekerjaan_bapa: text(app.pekerjaan_bapa),
    bil_tanggungan: text(app.bil_tanggungan),
    anak_ke: text(app.anak_ke),
    bil_adik_beradik: text(app.bil_adik_beradik),
    bil_anak: text(app.bil_anak),
    sebab_keperluan: app.sebab_keperluan ?? [],
    sebab_lain: text(app.sebab_lain),
    penerangan: text(app.penerangan),
    pernah_terima: app.pernah_terima,
    bank_nama_pemegang: text(app.bank_nama_pemegang),
    bank_pilihan: bank === '' ? '' : bankDikenali ? bank : BANK_LAIN,
    bank_lain: bank === '' || bankDikenali ? '' : bank,
    bank_no_akaun: text(app.bank_no_akaun),
    pengakuan_setuju: app.pengakuan_setuju,
  };
}

/** Medan yang dipaparkan bergantung pada kategori dan status diri. */
function visibility(kategori: BantuanKategori, statusDiri: string) {
  const belajar = kategori === 'belajar';
  const berkahwin = statusDiri === 'berkahwin';
  const bujang = statusDiri === 'bujang';
  return {
    belajar,
    pekerjaanIbuBapa: belajar || bujang,
    adikBeradik: belajar || bujang,
    kedudukanAnak: belajar,
    bilAnak: !belajar && (berkahwin || statusDiri === 'lain_lain'),
  };
}

function toPayload(kategori: BantuanKategori, state: FormState): BantuanForm {
  const v = visibility(kategori, state.status_diri);
  const text = (value: string) => value.trim();
  const when = (show: boolean, value: string) => (show ? text(value) : '');
  const bank = state.bank_pilihan === BANK_LAIN ? text(state.bank_lain) : state.bank_pilihan;
  return {
    kategori,
    nama_pemohon: text(state.nama_pemohon),
    telefon: text(state.telefon),
    generasi: state.generasi,
    status_diri: state.status_diri,
    status_diri_lain: when(state.status_diri === 'lain_lain', state.status_diri_lain),
    tempat_menetap: text(state.tempat_menetap),
    tahap_pendidikan: state.tahap_pendidikan,
    tahap_pendidikan_lain: when(state.tahap_pendidikan === 'lain_lain', state.tahap_pendidikan_lain),
    tinggal_di: v.belajar ? state.tinggal_di : '',
    tinggal_di_lain: when(v.belajar && state.tinggal_di === 'lain_lain', state.tinggal_di_lain),
    tahun_pengajian: when(v.belajar, state.tahun_pengajian),
    pembiayaan: v.belajar ? state.pembiayaan : [],
    pembiayaan_lain: when(v.belajar && state.pembiayaan.includes('lain_lain'), state.pembiayaan_lain),
    pekerjaan: text(state.pekerjaan),
    pendapatan_pemohon: when(!v.belajar, state.pendapatan_pemohon),
    pendapatan_keluarga: text(state.pendapatan_keluarga),
    pekerjaan_ibu: when(v.pekerjaanIbuBapa, state.pekerjaan_ibu),
    pekerjaan_bapa: when(v.pekerjaanIbuBapa, state.pekerjaan_bapa),
    bil_tanggungan: state.bil_tanggungan,
    anak_ke: v.kedudukanAnak ? state.anak_ke : '',
    bil_adik_beradik: v.adikBeradik ? state.bil_adik_beradik : '',
    bil_anak: v.bilAnak ? state.bil_anak : '',
    sebab_keperluan: state.sebab_keperluan,
    sebab_lain: when(state.sebab_keperluan.includes('lain_lain'), state.sebab_lain),
    penerangan: text(state.penerangan),
    pernah_terima: state.pernah_terima,
    bank_nama_pemegang: text(state.bank_nama_pemegang),
    bank_nama: bank,
    bank_no_akaun: state.bank_no_akaun.replace(/\D/g, ''),
    pengakuan_setuju: state.pengakuan_setuju,
  };
}

function rangeOptions(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ value: String(from + i), label: String(from + i) }));
}

const TANGGUNGAN_OPTIONS = rangeOptions(0, 20);
const BIL_ANAK_OPTIONS = rangeOptions(0, 20);
const SAUDARA_OPTIONS = rangeOptions(1, 20);

/** Maklum balas awal sahaja — pelayan mengesahkan semula semuanya. */
function problemOf(kategori: BantuanKategori, state: FormState): string | null {
  const v = visibility(kategori, state.status_diri);
  const len = (value: string) => value.trim().length;
  if (len(state.nama_pemohon) < 2) return 'Sila isi nama penuh.';
  if (!/^[0-9+ -]{8,20}$/.test(state.telefon.trim())) return 'Sila isi nombor telefon yang sah.';
  if (!state.generasi) return 'Sila pilih generasi.';
  if (!state.status_diri) return 'Sila pilih status.';
  if (state.status_diri === 'lain_lain' && len(state.status_diri_lain) < 2) return 'Sila nyatakan status anda.';
  if (len(state.tempat_menetap) < 3) return 'Sila isi tempat menetap terkini.';
  if (v.belajar && !state.tahap_pendidikan) return 'Sila pilih tahap pendidikan.';
  if (state.tahap_pendidikan === 'lain_lain' && len(state.tahap_pendidikan_lain) < 2) return 'Sila nyatakan tahap pendidikan.';
  if (v.belajar) {
    if (!state.tinggal_di) return 'Sila pilih tempat tinggal semasa belajar.';
    if (state.tinggal_di === 'lain_lain' && len(state.tinggal_di_lain) < 2) return 'Sila nyatakan tempat tinggal anda.';
    if (len(state.tahun_pengajian) < 1) return 'Sila isi tahun pengajian.';
    if (state.pembiayaan.length === 0) return 'Sila pilih sekurang-kurangnya satu sumber pembiayaan pelajaran.';
    if (state.pembiayaan.includes('lain_lain') && len(state.pembiayaan_lain) < 2) return 'Sila nyatakan sumber pembiayaan lain.';
  } else {
    if (len(state.pekerjaan) < 2) return 'Sila isi pekerjaan anda.';
    if (state.pendapatan_pemohon.trim() === '') return 'Sila isi pendapatan bulanan anda (boleh RM0).';
  }
  if (state.pendapatan_keluarga.trim() === '') return 'Sila isi pendapatan keluarga (boleh RM0).';
  if (v.pekerjaanIbuBapa && (len(state.pekerjaan_ibu) < 2 || len(state.pekerjaan_bapa) < 2)) return 'Sila isi pekerjaan ibu dan bapa.';
  if (state.bil_tanggungan === '') return 'Sila pilih bilangan tanggungan keluarga.';
  if (v.kedudukanAnak && (state.anak_ke === '' || state.bil_adik_beradik === '')) return 'Sila pilih kedudukan anak dan bilangan adik beradik.';
  if (v.kedudukanAnak && Number(state.anak_ke) > Number(state.bil_adik_beradik)) return 'Kedudukan anak tidak boleh melebihi bilangan adik beradik.';
  if (!v.belajar && v.adikBeradik && state.bil_adik_beradik === '') return 'Sila pilih bilangan adik beradik.';
  if (v.bilAnak && state.status_diri === 'berkahwin' && state.bil_anak === '') return 'Sila pilih bilangan anak (boleh 0).';
  if (state.sebab_keperluan.length === 0) return 'Sila pilih sekurang-kurangnya satu sebab keperluan.';
  if (state.sebab_keperluan.includes('lain_lain') && len(state.sebab_lain) < 2) return 'Sila nyatakan sebab keperluan lain.';
  if (len(state.penerangan) < 20) return 'Sila terangkan tujuan keperluan dengan lebih lanjut (sekurang-kurangnya 20 aksara).';
  if (state.pernah_terima === null) return 'Sila nyatakan sama ada anda pernah menerima bantuan zakat sebelum ini.';
  if (len(state.bank_nama_pemegang) < 2) return 'Sila isi nama pemegang akaun.';
  if (!state.bank_pilihan) return 'Sila pilih bank.';
  if (state.bank_pilihan === BANK_LAIN && len(state.bank_lain) < 2) return 'Sila isi nama bank.';
  if (!/^[0-9]{6,20}$/.test(state.bank_no_akaun.replace(/\D/g, ''))) return 'Sila isi nombor akaun bank yang sah (6 hingga 20 digit).';
  if (!state.pengakuan_setuju) return 'Sila tandakan pengakuan sebelum menghantar.';
  return null;
}

export default function BantuanBorangScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { user } = useAuth();
  const userId = user?.id;
  const params = useLocalSearchParams<{ id?: string; kategori?: string }>();

  // ID dijana sekali — simpan berulang menyasarkan baris yang sama.
  const appIdRef = useRef<string>(params.id ?? newId());
  const appId = appIdRef.current;

  const [loading, setLoading] = useState(true);
  const [noMember, setNoMember] = useState(false);
  const [app, setApp] = useState<BantuanApplication | null>(null);
  const [kategori, setKategori] = useState<BantuanKategori | null>(
    params.kategori === 'belajar' || params.kategori === 'bekerja' ? params.kategori : null,
  );
  const [state, setState] = useState<FormState>(emptyState());
  const [generasiOptions, setGenerasiOptions] = useState<{ value: string; label: string }[]>([]);
  const [openRequest, setOpenRequest] = useState<BantuanInfoRequest | null>(null);
  const [respons, setRespons] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [done, setDone] = useState<BantuanApplication | null>(null);

  const resubmitting = app?.status === 'needs_information';

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    setSaved(null);
  };

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      try {
        const [member, generations] = await Promise.all([fetchMyMemberLinked(userId), fetchGenerations()]);
        if (!active) return;
        setGenerasiOptions(generations.map((row) => ({ value: row.code, label: row.label })));
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
          setKategori(existing.kategori);
          setState(fromApplication(existing));
          if (existing.status === 'needs_information') {
            const requests = await fetchBantuanInfoRequests(existing.id);
            if (!active) return;
            const open = [...requests].reverse().find((request) => !request.responded_at) ?? null;
            setOpenRequest(open);
            setRespons(open?.respons ?? '');
          }
        } else if (kategori) {
          // Prefill daripada profil — disalin ke permohonan sahaja.
          setState((prev) => ({
            ...prev,
            nama_pemohon: member.full_name ?? '',
            telefon: member.no_tel ?? '',
            generasi: member.generasi ?? '',
          }));
        } else {
          router.replace('/(app)/bantuan');
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
    // `kategori` hanya dibaca untuk prefill borang baharu; ia tidak berubah selepas itu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, params.id, router]);

  const persist = useCallback(async (): Promise<boolean> => {
    if (!kategori) return false;
    try {
      const row = await saveBantuanDraft(appId, toPayload(kategori, state));
      setApp(row);
      return true;
    } catch (caught) {
      setError(bantuanError(caught, 'Gagal menyimpan draf. Sila cuba lagi.'));
      return false;
    }
  }, [appId, kategori, state]);

  const saveDraft = async () => {
    setError(null);
    setBusy(true);
    const ok = await persist();
    setBusy(false);
    if (ok) setSaved('Draf disimpan.');
  };

  const submit = async () => {
    if (!kategori) return;
    setError(null);
    const problem = problemOf(kategori, state);
    if (problem) {
      setError(problem);
      return;
    }
    if (resubmitting && respons.trim().length < 5) {
      setError('Sila tulis respons kepada permintaan maklumat tambahan.');
      return;
    }
    setBusy(true);
    try {
      if (!(await persist())) return;
      const row = await submitBantuan(appId, resubmitting ? respons.trim() : undefined);
      setDone(row);
    } catch (caught) {
      setError(bantuanError(caught, 'Gagal menghantar permohonan. Sila cuba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  const v = useMemo(() => visibility(kategori ?? 'belajar', state.status_diri), [kategori, state.status_diri]);

  if (loading) return <LoadingScreen />;

  if (noMember || !kategori) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Permohonan Zakat" onBackPress={goBack} />
        <View className="px-gutter pt-5">
          <Notice
            tone={error ? 'negative' : 'warn'}
            message={error ?? 'Akaun anda belum dipautkan kepada rekod ahli, jadi permohonan belum boleh dibuat.'}
          />
        </View>
      </Screen>
    );
  }

  if (done) {
    return <SelepasHantar kategori={kategori} noRujukan={done.no_rujukan} onSelesai={() => router.replace('/(app)/bantuan')} />;
  }

  const tahapOptions = v.belajar ? TAHAP_PENDIDIKAN_BELAJAR : TAHAP_PENDIDIKAN_BEKERJA;

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow={KATEGORI_LABEL[kategori]} title="Permohonan Zakat" subtitle={tajukBorang(kategori)} onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-12 pt-5">
        {resubmitting && openRequest ? <Notice tone="warn" message={'Admin meminta maklumat tambahan: ' + openRequest.mesej} /> : null}

        <Card>
          <View className="gap-2">
            <Text className="text-sm font-bold text-ink">Maklumat penting</Text>
            {MAKLUMAT_PENTING.map((line, index) => (
              <Text key={line} className="text-sm leading-5 text-ink-muted">
                {index + 1}. {line}
              </Text>
            ))}
          </View>
        </Card>

        {error ? <Notice tone="negative" message={error} /> : null}
        {saved ? <Notice tone="positive" message={saved} /> : null}

        <SectionTitle title="Maklumat diri" />
        <TextField
          label="Nama penuh *"
          value={state.nama_pemohon}
          onChangeText={(value) => set('nama_pemohon', value)}
          placeholder="cth: Aman Bin Abdullah"
          maxLength={120}
        />
        <TextField
          label="Nombor telefon terkini *"
          value={state.telefon}
          onChangeText={(value) => set('telefon', value)}
          keyboardType="phone-pad"
          maxLength={20}
        />
        <PickerField
          label="Generasi *"
          value={state.generasi || null}
          options={generasiOptions}
          onChange={(value) => set('generasi', value ?? '')}
          placeholder="Pilih generasi"
        />
        <Segmented label="Status *" value={state.status_diri || null} options={STATUS_DIRI_OPTIONS} onChange={(value) => set('status_diri', value)} />
        {state.status_diri === 'lain_lain' ? (
          <TextField label="Nyatakan status *" value={state.status_diri_lain} onChangeText={(value) => set('status_diri_lain', value)} maxLength={80} />
        ) : null}
        <TextField
          label="Tempat menetap terkini *"
          value={state.tempat_menetap}
          onChangeText={(value) => set('tempat_menetap', value)}
          placeholder="cth: Kota Bharu, Kelantan"
          maxLength={120}
        />

        <SectionTitle title={v.belajar ? 'Pengajian' : 'Pendidikan'} caption={v.belajar ? undefined : 'Isi jika anda bekerja sambil belajar.'} />
        <PickerField
          label={v.belajar ? 'Tahap pendidikan *' : 'Tahap pendidikan (jika bekerja sambil belajar)'}
          value={state.tahap_pendidikan || null}
          options={tahapOptions}
          onChange={(value) => set('tahap_pendidikan', value ?? '')}
          clearable={!v.belajar}
          clearLabel="Tidak berkenaan"
          placeholder="Pilih tahap pendidikan"
        />
        {state.tahap_pendidikan === 'lain_lain' ? (
          <TextField label="Nyatakan tahap pendidikan *" value={state.tahap_pendidikan_lain} onChangeText={(value) => set('tahap_pendidikan_lain', value)} maxLength={80} />
        ) : null}
        {v.belajar ? (
          <>
            <PickerField
              label="Tinggal di *"
              value={state.tinggal_di || null}
              options={TINGGAL_DI_OPTIONS}
              onChange={(value) => set('tinggal_di', value ?? '')}
              placeholder="Pilih tempat tinggal"
            />
            {state.tinggal_di === 'lain_lain' ? (
              <TextField label="Nyatakan tempat tinggal *" value={state.tinggal_di_lain} onChangeText={(value) => set('tinggal_di_lain', value)} maxLength={80} />
            ) : null}
            <TextField
              label="Tahun pengajian *"
              value={state.tahun_pengajian}
              onChangeText={(value) => set('tahun_pengajian', value)}
              placeholder="cth: Tahun 2 daripada 4"
              maxLength={60}
            />
            <ChipGroup
              label="Pembiayaan pelajaran * (boleh pilih lebih daripada satu)"
              values={state.pembiayaan}
              options={PEMBIAYAAN_OPTIONS}
              onChange={(values) => set('pembiayaan', values)}
            />
            {state.pembiayaan.includes('lain_lain') ? (
              <TextField label="Nyatakan pembiayaan lain *" value={state.pembiayaan_lain} onChangeText={(value) => set('pembiayaan_lain', value)} maxLength={80} />
            ) : null}
          </>
        ) : null}

        <SectionTitle title="Pekerjaan dan pendapatan" />
        <TextField
          label={v.belajar ? 'Pekerjaan (pilihan — jika ada)' : 'Pekerjaan *'}
          value={state.pekerjaan}
          onChangeText={(value) => set('pekerjaan', value)}
          placeholder={v.belajar ? 'cth: Kerja separuh masa di kedai' : 'cth: Berniaga'}
          maxLength={100}
        />
        {!v.belajar ? (
          <TextField
            label="Jumlah pendapatan bulanan anda (RM) *"
            value={state.pendapatan_pemohon}
            onChangeText={(value) => set('pendapatan_pemohon', value.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            maxLength={10}
          />
        ) : null}
        <TextField
          label="Jumlah pendapatan keluarga sebulan (RM) *"
          value={state.pendapatan_keluarga}
          onChangeText={(value) => set('pendapatan_keluarga', value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          maxLength={10}
        />
        <Text className="-mt-2 text-xs text-ink-muted">
          {v.belajar
            ? 'Jumlah pendapatan semua yang bekerja dalam keluarga. Isi 0 jika tiada pendapatan.'
            : 'Jumlah pendapatan semua yang bekerja dalam keluarga (cth: suami + isteri = 3000). Isi 0 jika tiada pendapatan.'}
        </Text>

        <SectionTitle title="Keluarga" />
        {v.pekerjaanIbuBapa ? (
          <>
            <TextField
              label="Pekerjaan ibu *"
              value={state.pekerjaan_ibu}
              onChangeText={(value) => set('pekerjaan_ibu', value)}
              placeholder="cth: Suri rumah"
              maxLength={100}
            />
            <TextField
              label="Pekerjaan bapa *"
              value={state.pekerjaan_bapa}
              onChangeText={(value) => set('pekerjaan_bapa', value)}
              placeholder="cth: Berniaga sendiri"
              maxLength={100}
            />
          </>
        ) : null}
        <PickerField
          label="Bilangan tanggungan keluarga *"
          value={state.bil_tanggungan || null}
          options={TANGGUNGAN_OPTIONS}
          onChange={(value) => set('bil_tanggungan', value ?? '')}
          placeholder="Pilih bilangan"
        />
        <Text className="-mt-2 text-xs text-ink-muted">Tanggungan yang ditanggung oleh ketua keluarga (cth: 5 orang — ibu, bapa, 2 anak dan isteri).</Text>
        {v.kedudukanAnak ? (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <PickerField
                label="Anak ke *"
                value={state.anak_ke || null}
                options={SAUDARA_OPTIONS}
                onChange={(value) => set('anak_ke', value ?? '')}
                placeholder="Pilih"
              />
            </View>
            <View className="flex-1">
              <PickerField
                label="Daripada (beradik) *"
                value={state.bil_adik_beradik || null}
                options={SAUDARA_OPTIONS}
                onChange={(value) => set('bil_adik_beradik', value ?? '')}
                placeholder="Pilih"
              />
            </View>
          </View>
        ) : null}
        {!v.belajar && v.adikBeradik ? (
          <PickerField
            label="Bilangan adik beradik *"
            value={state.bil_adik_beradik || null}
            options={SAUDARA_OPTIONS}
            onChange={(value) => set('bil_adik_beradik', value ?? '')}
            placeholder="Pilih bilangan"
          />
        ) : null}
        {v.bilAnak ? (
          <PickerField
            label={state.status_diri === 'berkahwin' ? 'Bilangan anak *' : 'Bilangan anak (jika ada)'}
            value={state.bil_anak || null}
            options={BIL_ANAK_OPTIONS}
            onChange={(value) => set('bil_anak', value ?? '')}
            placeholder="Pilih bilangan"
          />
        ) : null}

        <SectionTitle title="Keperluan" />
        <ChipGroup
          label="Sebab keperluan * (boleh pilih lebih daripada satu)"
          values={state.sebab_keperluan}
          options={SEBAB_OPTIONS}
          onChange={(values) => set('sebab_keperluan', values)}
        />
        {state.sebab_keperluan.includes('lain_lain') ? (
          <TextField label="Nyatakan sebab lain *" value={state.sebab_lain} onChangeText={(value) => set('sebab_lain', value)} maxLength={100} />
        ) : null}
        <TextField
          label="Terangkan lebih lanjut berkenaan tujuan keperluan *"
          value={state.penerangan}
          onChangeText={(value) => set('penerangan', value)}
          multiline
          maxLength={1500}
        />
        <Segmented
          label="Pernah menerima bantuan zakat daripada Ikhwan sebelum ini? *"
          value={state.pernah_terima === null ? null : state.pernah_terima ? 'ya' : 'tidak'}
          options={[
            { value: 'ya', label: 'Ya' },
            { value: 'tidak', label: 'Tidak' },
          ]}
          onChange={(value) => set('pernah_terima', value === 'ya')}
        />

        <SectionTitle title="Maklumat akaun bank" caption="Untuk penyaluran bantuan jika diluluskan. Hanya jawatankuasa zakat LK boleh melihatnya." />
        <TextField
          label="Nama pemegang akaun *"
          value={state.bank_nama_pemegang}
          onChangeText={(value) => set('bank_nama_pemegang', value)}
          maxLength={120}
        />
        <PickerField
          label="Nama bank *"
          value={state.bank_pilihan || null}
          options={BANK_OPTIONS.map((name) => ({ value: name, label: name }))}
          onChange={(value) => set('bank_pilihan', value ?? '')}
          placeholder="Pilih bank"
        />
        {state.bank_pilihan === BANK_LAIN ? (
          <TextField label="Nyatakan nama bank *" value={state.bank_lain} onChangeText={(value) => set('bank_lain', value)} maxLength={80} />
        ) : null}
        <TextField
          label="Nombor akaun bank *"
          value={state.bank_no_akaun}
          onChangeText={(value) => set('bank_no_akaun', value.replace(/[^0-9 -]/g, ''))}
          keyboardType="number-pad"
          maxLength={26}
        />

        <SectionTitle title="Pengakuan pemohon" />
        <SelectRow
          title="Setuju"
          subtitle={PENGAKUAN_TEKS}
          selected={state.pengakuan_setuju}
          onPress={() => set('pengakuan_setuju', !state.pengakuan_setuju)}
        />

        {resubmitting ? (
          <>
            <SectionTitle title="Respons kepada admin" />
            <TextField
              label="Respons anda *"
              value={respons}
              onChangeText={setRespons}
              multiline
              maxLength={3000}
              placeholder="Jawab permintaan maklumat tambahan di atas."
            />
          </>
        ) : null}

        <View className="gap-3 pt-2">
          <Button label={resubmitting ? 'Hantar Semula' : 'Hantar Permohonan'} loading={busy} onPress={() => void submit()} />
          <Button label="Simpan Draf" variant="secondary" onPress={() => void saveDraft()} disabled={busy} />
        </View>
      </View>
    </Screen>
  );
}

/** Skrin selepas hantar: tempoh semakan + kenalan LK mengikut jenis borang. */
function SelepasHantar({
  kategori,
  noRujukan,
  onSelesai,
}: {
  kategori: BantuanKategori;
  noRujukan: string | null;
  onSelesai: () => void;
}) {
  const kenalan = KENALAN_LK[kategori];
  const colors = useColors();
  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Tabung Zakat" title="Permohonan Dihantar" />
      <View className="gap-4 px-gutter pb-12 pt-5">
        <Card>
          <View className="items-center gap-2">
            <Ionicons name="checkmark-circle" size={44} color={colors.positive} />
            <Text className="text-center text-base font-bold text-ink">Terima kasih. Permohonan anda telah diterima.</Text>
            {noRujukan ? <Text className="text-sm text-ink-muted">No. rujukan: {noRujukan}</Text> : null}
            <Text className="text-center text-sm leading-5 text-ink">{MESEJ_SELEPAS_HANTAR}</Text>
          </View>
        </Card>

        <SectionTitle title="Untuk sebarang pertanyaan, hubungi LK" />
        <KenalanSeksyen tajuk="Muslimin" senarai={kenalan.muslimin} />
        <KenalanSeksyen tajuk="Muslimat" senarai={kenalan.muslimat} />

        <Button label="Selesai" onPress={onSelesai} />
      </View>
    </Screen>
  );
}

function KenalanSeksyen({ tajuk, senarai }: { tajuk: string; senarai: KenalanLK[] }) {
  const colors = useColors();
  return (
    <Card>
      <View className="gap-3">
        <Text className="text-sm font-bold text-ink">{tajuk}</Text>
        {senarai.map((orang) => (
          <Pressable
            key={orang.nama}
            accessibilityRole="link"
            accessibilityLabel={'Hubungi ' + orang.nama + ' melalui WhatsApp'}
            onPress={() => void Linking.openURL(waLink(orang.telefon))}
            className="flex-row items-center justify-between gap-3 active:opacity-70">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink">
                {orang.nama} ({orang.generasi})
              </Text>
              <Text className="text-sm text-ink-muted">{orang.telefon}</Text>
            </View>
            <Ionicons name="logo-whatsapp" size={22} color={colors.positive} />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
