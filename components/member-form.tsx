import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipGroup } from '@/components/ui/chip-group';
import { IconButton } from '@/components/ui/icon-button';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { SectionTitle } from '@/components/ui/section-title';
import { Segmented } from '@/components/ui/segmented';
import { TabBar } from '@/components/ui/tab-bar';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors } from '@/constants/theme';
import {
  BUSINESS_MODE_OPTIONS,
  BUSINESS_SUBKATEGORI_OFFLINE_OPTIONS,
  BUSINESS_SUBKATEGORI_ONLINE_OPTIONS,
  EDUCATION_PERINGKAT_OPTIONS,
  JANTINA_OPTIONS,
  KAWASAN_USRAH_OPTIONS,
  NEGERI_OPTIONS,
  PENDAPATAN_RANGE_OPTIONS,
  SEBAB_PERKAHWINAN_OPTIONS,
  SEKTOR_PEKERJAAN_OPTIONS,
  STATUS_PEKERJAAN_TIDAK_BEKERJA_OPTIONS,
  STATUS_PENGAJIAN_ENTRY_OPTIONS,
  STATUS_PERKAHWINAN_OPTIONS,
  SUMBER_PEMBIAYAAN_OPTIONS,
  generationLabel,
  type BusinessSubKategori,
  type Generation,
  type Member,
  type MemberBusiness,
  type MemberBusinessDraft,
  type MemberEducation,
  type MemberEducationDraft,
  type MemberPickerRow,
  type Option,
  type School,
} from '@/types/database';

/**
 * Borang penuh satu rekod ahli — dikongsi oleh panel Admin dan skrin Profil.
 *
 * DUA kebenaran berlainan mengawal borang ini, dan ia sengaja TIDAK digabung:
 *
 * - `readOnly` — kebenaran DEPARTMENT. Admin yang hanya mempunyai `can_view`
 *   pada JABATAN DATA & SUMBER MANUSIA tidak boleh menyunting apa-apa, jadi
 *   seluruh borang dikunci dan butang Simpan tidak wujud. Padanannya di
 *   pangkalan data ialah policy `members_update`.
 *
 * - `canEditAdminColumns` — kebenaran KOLUM. Nombor ahli, generasi, emel dan
 *   status sekatan menjadi paparan sahaja untuk ahli biasa yang menyunting
 *   profilnya sendiri. Padanannya ialah trigger `members_guard_admin_columns`.
 *
 * Seorang ahli biasa mempunyai `readOnly = false` tetapi
 * `canEditAdminColumns = false`: dia menyunting medannya sendiri, cuma bukan
 * kolum yang menentukan identiti keahliannya. Menggabungkan kedua-dua konsep
 * akan menghapuskan keupayaan itu.
 *
 * Borang ini bukan lapisan kawalan — RLS dan trigger tetap penentu muktamad.
 */

export type ProfileTab = 'peribadi' | 'pendidikan' | 'pekerjaan' | 'perniagaan' | 'keluarga' | 'komitmen';

const PROFILE_TABS: Option<ProfileTab>[] = [
  { value: 'peribadi', label: 'Peribadi' },
  { value: 'pendidikan', label: 'Pendidikan' },
  { value: 'pekerjaan', label: 'Pekerjaan' },
  { value: 'perniagaan', label: 'Perniagaan' },
  { value: 'keluarga', label: 'Keluarga' },
  { value: 'komitmen', label: 'Komitmen' },
];

type Props = {
  member: Member;
  generations: Generation[];
  /** Calon pemilih pasangan (tab Keluarga) — daripada `list_members_picker()`. */
  spouseCandidates: MemberPickerRow[];
  /** Baris `member_businesses` sedia ada ahli ini — tab Perniagaan. */
  businesses: MemberBusiness[];
  /**
   * SEMUA sekolah (aktif + nonaktif) — dropdown tab Pendidikan. Sama sebab
   * `generations` bukan disempitkan kepada aktif sahaja di sini: sekolah
   * ahli ini mungkin sudah dinyahaktifkan selepas ditetapkan, dan borang
   * perlu tahu namanya untuk kekal memaparkannya (lihat `sekolahOptions`).
   */
  schools: School[];
  /** Baris `member_education` sedia ada ahli ini — tab Pendidikan. */
  education: MemberEducation[];
  canEditAdminColumns: boolean;
  /** Kunci SELURUH borang: pengguna boleh melihat rekod tetapi bukan menyuntingnya. */
  readOnly?: boolean;
  busy?: boolean;
  /**
   * Elemen di sebelah KANAN kad maklumat pada susun atur Profil — lencana
   * kedudukan. Tanpa ia, kad itu mengambil lebar penuh seperti sebelum ini,
   * jadi susun atur admin dan ahli yang belum berkedudukan tidak berubah.
   */
  headerAside?: ReactNode;
  /** Susun atur Profil sahaja: satu baris di bawah kad maklumat, di atas tab. */
  headerNote?: ReactNode;
  /** Dipanggil bila avatar diketuk. Tanpa ini, ikon kamera tidak dipapar. */
  onPickAvatar?: () => void;
  avatarBusy?: boolean;
  /**
   * Tab aktif — skrin Profil dan panel Admin memakai susun atur tab yang sama.
   *
   * Tab dikawal oleh pemanggil kerana borang dipasang semula selepas setiap
   * simpanan; keadaan dalaman akan melontar pengguna kembali ke tab pertama.
   */
  tabs: { value: ProfileTab; onChange: (next: ProfileTab) => void };
  /**
   * Bila diberi, butang Simpan dan suis Sekat TIDAK dilukis di tempat asalnya;
   * kedua-duanya diserahkan kepada pemanggil untuk disusun dalam panel
   * tindakannya bersama butang lain. Kedua-duanya tetap terikat pada draf
   * borang ini — sekatan masih berkuat kuasa hanya selepas Simpan.
   */
  actions?: (parts: { save: ReactNode; sekat: ReactNode }) => ReactNode;
  /**
   * Hanya medan `Member` yang berubah dihantar dalam `patch`. Baris
   * `member_businesses`/`member_education` dihantar berasingan dalam
   * `businesses`/`education` (draf penuh tab masing-masing — pemanggil
   * mendiff terhadap baris asal, lihat `lib/member-businesses.ts`/
   * `lib/member-education.ts`) kerana kedua-duanya table berasingan, bukan
   * medan `Member`.
   */
  onSave: (patch: Partial<Member>, businesses: MemberBusinessDraft[], education: MemberEducationDraft[]) => void;
};

const AVATAR_SIZE = 96;

/** Kapsyen di bawah tab bagi setiap seksyen selain Peribadi. */
const CAPTIONS = {
  pendidikan: 'Tambah setiap peringkat pendidikan selepas SPM secara berasingan, jika ada.',
  pekerjaan: 'Butiran tambahan muncul selepas suis "Sudah Bekerja" dihidupkan.',
  perniagaan: 'Maklumat ini akan digunakan untuk membantu mempromosikan perniagaan ahli dalam komuniti MySAFF. Isi selengkap mungkin untuk peluang publisiti percuma!',
  keluarga: 'Butiran pasangan muncul selepas status perkahwinan dipilih.',
  komitmen: 'Jawatan atau komitmen dalam Ikhwan dan PAS, jika ada.',
} as const;

/** Pilihan rasmi, ditambah nilai semasa sebagai "(tidak dikenali)" jika ia di luar senarai. */
function withUnrecognised(options: Option<string>[], current: string | null): Option<string>[] {
  if (!current || options.some((option) => option.value === current)) return options;
  return [...options, { value: current, label: current + ' (tidak dikenali)' }];
}

function usrahLabel(code: string | null): string | null {
  if (!code) return null;
  return KAWASAN_USRAH_OPTIONS.find((option) => option.value === code)?.label ?? code;
}

/** Sub-kategori sah untuk satu mod perniagaan — 'kedua_dua' ialah gabungan Online + Offline (tanpa pendua). */
function subKategoriOptionsForMode(mode: MemberBusinessDraft['mode']): Option<BusinessSubKategori>[] {
  if (mode === 'online') return BUSINESS_SUBKATEGORI_ONLINE_OPTIONS;
  if (mode === 'offline') return BUSINESS_SUBKATEGORI_OFFLINE_OPTIONS;
  const seen = new Set<string>();
  return [...BUSINESS_SUBKATEGORI_ONLINE_OPTIONS, ...BUSINESS_SUBKATEGORI_OFFLINE_OPTIONS].filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

/** Baris `MemberBusiness` sedia ada → draf borang (buang medan yang bukan input pengguna). */
function toDraft(business: MemberBusiness): MemberBusinessDraft {
  return {
    id: business.id,
    mode: business.mode,
    sub_kategori: business.sub_kategori,
    nama_perniagaan: business.nama_perniagaan,
    negeri_operasi: business.negeri_operasi,
    anggaran_pendapatan_range: business.anggaran_pendapatan_range,
  };
}

const BLANK_BUSINESS: MemberBusinessDraft = {
  mode: 'online',
  sub_kategori: [],
  nama_perniagaan: null,
  negeri_operasi: null,
  anggaran_pendapatan_range: null,
};

/** Baris `MemberEducation` sedia ada → draf borang (buang medan yang bukan input pengguna). */
function toEducationDraft(entry: MemberEducation): MemberEducationDraft {
  return {
    id: entry.id,
    peringkat: entry.peringkat,
    jurusan: entry.jurusan,
    institusi: entry.institusi,
    status_pengajian: entry.status_pengajian,
    sumber_pembiayaan: entry.sumber_pembiayaan,
  };
}

const BLANK_EDUCATION: MemberEducationDraft = {
  peringkat: 'stpm',
  jurusan: null,
  institusi: null,
  status_pengajian: 'tamat',
  sumber_pembiayaan: null,
};

/** Kunci medan yang disimpan sebagai nombor. */
const NUMERIC_FIELDS = ['bil_anak'] as const;
type NumericField = (typeof NUMERIC_FIELDS)[number];

/** Kunci medan teks bebas. */
type TextFieldKey = {
  [K in keyof Member]: Member[K] extends string | null ? K : never;
}[keyof Member];

export function MemberForm({
  member,
  generations,
  spouseCandidates,
  businesses,
  schools,
  education,
  canEditAdminColumns,
  readOnly = false,
  busy = false,
  onPickAvatar,
  headerAside,
  headerNote,
  avatarBusy = false,
  tabs,
  actions,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<Member>(member);
  const [businessesDraft, setBusinessesDraft] = useState<MemberBusinessDraft[]>(() => businesses.map(toDraft));
  const [educationDraft, setEducationDraft] = useState<MemberEducationDraft[]>(() => education.map(toEducationDraft));

  /*
    Pasangan MBM vs Bukan MBM bukan kolum DB — ia ditentukan oleh medan mana
    (`spouse_member_id` atau `nama_pasangan`) yang ada nilai. Lalai MBM bila
    kedua-dua kosong (ahli baharu mengisi buat pertama kali).
  */
  const [pasanganMbm, setPasanganMbm] = useState<boolean>(!member.nama_pasangan);

  /* Satu kunci untuk setiap kawalan dalam borang. Menyimpan sedang berjalan
     dan tiada kebenaran menyunting menghasilkan keadaan UI yang sama, jadi
     kedua-duanya dikira sekali di sini dan bukan diulang pada setiap medan. */
  const locked = busy || readOnly;

  const set = useCallback(<K extends keyof Member>(key: K, value: Member[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const setText = useCallback(
    (key: TextFieldKey) => (value: string) => {
      // Rentetan kosong disimpan sebagai NULL supaya "tiada nilai" hanya ada satu bentuk.
      setDraft((current) => ({ ...current, [key]: value.trim() === '' ? null : value }));
    },
    [],
  );

  const setNumber = useCallback(
    (key: NumericField) => (value: string) => {
      const digits = value.replace(/[^\d]/g, '');
      setDraft((current) => ({ ...current, [key]: digits === '' ? null : Number.parseInt(digits, 10) }));
    },
    [],
  );

  const generationOptions = useMemo<Option<string>[]>(
    () =>
      generations
        // Generasi nonaktif kekal dipapar bila ahli ini sudah tergolong di dalamnya,
        // supaya nilai sedia ada tidak hilang senyap semasa disunting.
        .filter((row) => row.is_active || row.code === member.generasi)
        .map((row) => ({ value: row.code, label: row.label })),
    [generations, member.generasi],
  );

  /*
    Rekod yang nilainya belum dinormalkan (kawasan usrah, sekolah) akan hilang
    nilainya bila dropdown tidak mengenalinya. Nilai asing ditambah sebagai
    pilihan supaya ia kekal terpapar sehingga ahli atau admin memilih
    penggantinya — data tidak ditukar atau dikosongkan secara senyap.
  */
  const usrahOptions = useMemo(
    () => withUnrecognised(KAWASAN_USRAH_OPTIONS, draft.kawasan_usrah),
    [draft.kawasan_usrah],
  );
  /*
    `schools` membawa SEMUA sekolah (aktif + nonaktif) — sama corak
    `generationOptions` di atas. Sekolah nonaktif kekal dipapar bila ahli ini
    sudah ditetapkan padanya, supaya nilai sedia ada tidak hilang senyap
    menjadi kosong dalam dropdown.
  */
  const sekolahOptions = useMemo<Option<string>[]>(
    () =>
      schools
        .filter((school) => school.aktif || school.id === draft.sekolah_id)
        .map((school) => ({ value: school.id, label: school.nama })),
    [schools, draft.sekolah_id],
  );

  /*
    Ahli sendiri dibuang (seseorang tidak boleh jadi pasangan dirinya — dikuat
    kuasa juga oleh constraint `members_spouse_not_self`), dan calon disempitkan
    kepada jantina BERLAWANAN bila diketahui — pilihan yang lebih pantas dicari
    dalam senarai 300+ ahli. Jantina tidak diketahui tidak menyekat carian.
  */
  const spousePool = useMemo(() => {
    const others = spouseCandidates.filter((candidate) => candidate.id !== member.id);
    if (!draft.jantina) return others;
    return others.filter((candidate) => !candidate.jantina || candidate.jantina !== draft.jantina);
  }, [draft.jantina, member.id, spouseCandidates]);

  /**
   * Medan yang berubah sahaja — mengelak menulis semula kolum yang tidak disentuh.
   *
   * `avatar_url` DIKECUALIKAN kerana borang ini tidak memilikinya: gambar
   * dimuat naik oleh `uploadAvatar`, yang menulis kolum itu sendiri. Draf di
   * sini dibekukan pada saat borang dipasang, jadi tanpa pengecualian ini
   * setiap muat naik akan diikuti oleh satu `avatar_url: null` yang lapuk pada
   * simpanan berikutnya — gambar yang baru dinaikkan lenyap semula, dan butang
   * Simpan menyala walaupun pengguna belum menyunting apa-apa.
   */
  const patch = useMemo(() => {
    const changed: Partial<Member> = {};
    (Object.keys(draft) as (keyof Member)[]).forEach((key) => {
      if (key === 'avatar_url') return;
      if (draft[key] !== member[key]) changed[key] = draft[key] as never;
    });
    return changed;
  }, [draft, member]);

  /** Draf Perniagaan asal (dikira semula, bukan disimpan — `businesses` prop tidak berubah semasa hayat borang ini). */
  const originalBusinessesDraft = useMemo(() => businesses.map(toDraft), [businesses]);
  const businessesDirty = useMemo(
    () => JSON.stringify(businessesDraft) !== JSON.stringify(originalBusinessesDraft),
    [businessesDraft, originalBusinessesDraft],
  );

  /** Sama corak seperti Perniagaan — draf asal Pendidikan dikira semula, bukan disimpan. */
  const originalEducationDraft = useMemo(() => education.map(toEducationDraft), [education]);
  const educationDirty = useMemo(
    () => JSON.stringify(educationDraft) !== JSON.stringify(originalEducationDraft),
    [educationDraft, originalEducationDraft],
  );

  const dirty = Object.keys(patch).length > 0 || businessesDirty || educationDirty;

  const working = draft.status_pekerjaan === 'bekerja';
  const married = draft.status_perkahwinan === 'berkahwin' || draft.status_perkahwinan === 'pernah_berkahwin';
  const pernahBerkahwin = draft.status_perkahwinan === 'pernah_berkahwin';
  const adaPerniagaan = businessesDraft.length > 0;

  const field = (label: string, key: TextFieldKey, extra?: { multiline?: boolean; keyboardType?: 'phone-pad' }) => (
    <TextField
      label={label}
      value={draft[key] ?? ''}
      onChangeText={setText(key)}
      editable={!locked}
      autoCapitalize="sentences"
      autoCorrect={false}
      keyboardType={extra?.keyboardType}
    />
  );

  const numberField = (label: string, key: NumericField) => (
    <TextField
      label={label}
      value={draft[key] === null ? '' : String(draft[key])}
      onChangeText={setNumber(key)}
      editable={!locked}
      keyboardType="number-pad"
    />
  );

  const pendapatanNote = <Text className="text-xs text-ink-faint">Untuk rekod dalaman persatuan sahaja.</Text>;

  /* Ikon kamera hanya muncul bila borang boleh disunting DAN pemanggil
     menyediakan pengendali — paparan sahaja tidak sepatutnya mengisyaratkan
     gambar boleh ditukar. */
  const canPickAvatar = !readOnly && Boolean(onPickAvatar);

  /* --- Kepingan borang -------------------------------------------------------
     Setiap kepingan dibina sekali dan disusun oleh susun atur tab di bawah;
     tab memilih kepingan mana yang dipapar. */

  const avatar = (
    <View className="items-center">
      <Pressable
        accessibilityRole={canPickAvatar ? 'button' : 'image'}
        accessibilityLabel={canPickAvatar ? 'Tukar gambar profil' : member.full_name}
        disabled={!canPickAvatar || avatarBusy}
        onPress={onPickAvatar}
        className={canPickAvatar ? 'active:opacity-70' : ''}>
        {/* Dari prop dan bukan draf: gambar bukan medan borang, jadi nilai
            terkini datang daripada rekod, bukan daripada salinan beku draf. */}
        <MemberAvatar fullName={draft.full_name} avatarUrl={member.avatar_url} size={AVATAR_SIZE} />

        {canPickAvatar ? (
          <View className="absolute bottom-0 right-0 h-9 w-9 items-center justify-center rounded-pill border-2 border-surface bg-primary">
            {avatarBusy ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Ionicons name="camera" size={16} color={Colors.white} />
            )}
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  const keahlian = (
    <View>
      <SectionTitle
        title="Maklumat Keahlian"
        caption={
          readOnly
            ? 'Paparan sahaja — anda tiada kebenaran menyunting rekod ini.'
            : canEditAdminColumns
              ? 'Nombor ahli mesti unik dalam sistem.'
              : 'Medan ini ditetapkan oleh admin dan tidak boleh diubah sendiri.'
        }
      />
      <View className="gap-4">
        {canEditAdminColumns ? (
          <>
            <TextField
              label="Nombor ahli"
              value={draft.nombor_ahli ?? ''}
              onChangeText={setText('nombor_ahli')}
              editable={!locked}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <PickerField
              label="Generasi"
              value={draft.generasi}
              options={generationOptions}
              onChange={(next) => set('generasi', next)}
              disabled={locked}
            />
            <TextField
              label="Emel"
              value={draft.email ?? ''}
              onChangeText={setText('email')}
              editable={!locked}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </>
        ) : (
          <>
            <ReadOnlyField label="Nombor ahli" value={draft.nombor_ahli} />
            <ReadOnlyField label="Generasi" value={generationLabel(draft.generasi)} />
            <ReadOnlyField label="Emel" value={draft.email} />
            <ReadOnlyField label="Status sekatan" value={draft.disekat ? 'Disekat' : 'Aktif'} />
          </>
        )}

        {canEditAdminColumns && !actions ? (
          <ToggleRow
            icon="ban-outline"
            title="Sekat ahli"
            subtitle="Ahli disekat tidak boleh log masuk. Rekod kekal dalam sistem."
            value={draft.disekat}
            onValueChange={(next) => set('disekat', next)}
            disabled={locked}
          />
        ) : null}
      </View>
    </View>
  );

  const peribadiFields = (
    <>
      <TextField
        label="Nama penuh"
        value={draft.full_name}
        onChangeText={(value) => set('full_name', value)}
        editable={!locked}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <TextField
        label="Nama panggilan"
        value={draft.nama_panggilan ?? ''}
        onChangeText={setText('nama_panggilan')}
        editable={!locked}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <PickerField
        label="Jantina"
        value={draft.jantina}
        options={JANTINA_OPTIONS}
        onChange={(next) => set('jantina', next)}
        disabled={locked}
      />
      {field('No. kad pengenalan', 'nric')}
      {field('No. telefon', 'no_tel', { keyboardType: 'phone-pad' })}
      <PickerField
        label="Kawasan usrah"
        value={draft.kawasan_usrah}
        options={usrahOptions}
        onChange={(next) => set('kawasan_usrah', next)}
        disabled={locked}
      />
      {field('Alamat tetap', 'alamat')}
      {field('Alamat semasa', 'alamat_semasa')}
    </>
  );

  const updateEducation = (index: number, patchRow: Partial<MemberEducationDraft>) => {
    setEducationDraft((current) => current.map((row, i) => (i === index ? { ...row, ...patchRow } : row)));
  };

  const educationCards = educationDraft.map((row, index) => (
    <Card key={row.id ?? 'baharu-' + index} className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-ink">Tahap {index + 1}</Text>
        {!readOnly ? (
          <IconButton
            icon="trash-outline"
            accessibilityLabel={'Padam tahap pendidikan ' + (index + 1)}
            tone="danger"
            disabled={locked}
            onPress={() => setEducationDraft((current) => current.filter((_, i) => i !== index))}
          />
        ) : null}
      </View>

      <Segmented
        label="Peringkat"
        value={row.peringkat}
        options={EDUCATION_PERINGKAT_OPTIONS}
        onChange={(next) => updateEducation(index, { peringkat: next })}
        disabled={locked}
      />

      <TextField
        label="Jurusan / Bidang"
        value={row.jurusan ?? ''}
        onChangeText={(value) => updateEducation(index, { jurusan: value.trim() === '' ? null : value })}
        editable={!locked}
        autoCapitalize="sentences"
        autoCorrect={false}
      />

      <TextField
        label="Institusi"
        value={row.institusi ?? ''}
        onChangeText={(value) => updateEducation(index, { institusi: value.trim() === '' ? null : value })}
        editable={!locked}
        autoCapitalize="words"
        autoCorrect={false}
      />

      <Segmented
        label="Status Pengajian"
        value={row.status_pengajian}
        options={STATUS_PENGAJIAN_ENTRY_OPTIONS}
        onChange={(next) =>
          updateEducation(index, {
            status_pengajian: next,
            // Sumber pembiayaan hanya bermakna semasa sedang menjalani —
            // tukar balik ke "Tamat" melepaskannya, sama corak toggle-off lain.
            sumber_pembiayaan: next === 'sedang_menjalani' ? row.sumber_pembiayaan : null,
          })
        }
        disabled={locked}
      />

      {row.status_pengajian === 'sedang_menjalani' ? (
        <Segmented
          label="Sumber Pembiayaan Sekarang"
          value={row.sumber_pembiayaan}
          options={SUMBER_PEMBIAYAAN_OPTIONS}
          onChange={(next) => updateEducation(index, { sumber_pembiayaan: next })}
          disabled={locked}
        />
      ) : null}
    </Card>
  ));

  const pendidikanFields = (
    <>
      <PickerField
        label="Sekolah"
        value={draft.sekolah_id}
        options={sekolahOptions}
        onChange={(next) => set('sekolah_id', next)}
        disabled={locked}
      />

      <Text className="text-base font-semibold text-ink">Tahap Pendidikan (bermula selepas SPM)</Text>

      {educationCards}

      {!readOnly ? (
        <Button
          label="+ Tambah Tahap"
          variant="secondary"
          disabled={locked}
          onPress={() => setEducationDraft((current) => [...current, { ...BLANK_EDUCATION }])}
        />
      ) : null}
    </>
  );

  const pekerjaanFields = (
    <>
      <ToggleRow
        icon="briefcase-outline"
        title="Sudah Bekerja"
        subtitle="Hidupkan jika ahli ini sedang bekerja secara aktif."
        value={working}
        onValueChange={(next) =>
          setDraft((current) => ({
            ...current,
            // Bertukar OFF melepaskan 'bekerja' supaya ahli memilih semula
            // salah satu 3 status secara eksplisit — bukan diandaikan.
            status_pekerjaan: next ? 'bekerja' : null,
          }))
        }
        disabled={locked}
      />

      {working ? (
        <>
          <Segmented
            label="Sektor Pekerjaan"
            value={draft.sektor_pekerjaan}
            options={SEKTOR_PEKERJAAN_OPTIONS}
            onChange={(next) => set('sektor_pekerjaan', next)}
            disabled={locked}
          />
          {field('Apa jawatan atau bidang kerja anda?', 'jawatan_pekerjaan')}
          {field('Nama tempat kerja / majikan', 'nama_majikan')}
          <PickerField
            label="Negeri tempat kerja"
            value={draft.negeri_tempat_kerja}
            options={NEGERI_OPTIONS}
            onChange={(next) => set('negeri_tempat_kerja', next)}
            disabled={locked}
          />
          <View className="gap-2">
            <PickerField
              label="Anggaran pendapatan sebulan"
              value={draft.anggaran_pendapatan_range}
              options={PENDAPATAN_RANGE_OPTIONS}
              onChange={(next) => set('anggaran_pendapatan_range', next)}
              disabled={locked}
            />
            {pendapatanNote}
          </View>
        </>
      ) : (
        <PickerField
          label="Status Pekerjaan"
          value={draft.status_pekerjaan}
          options={STATUS_PEKERJAAN_TIDAK_BEKERJA_OPTIONS}
          onChange={(next) => set('status_pekerjaan', next)}
          disabled={locked}
        />
      )}
    </>
  );

  const updateBusiness = (index: number, patchRow: Partial<MemberBusinessDraft>) => {
    setBusinessesDraft((current) => current.map((row, i) => (i === index ? { ...row, ...patchRow } : row)));
  };

  const businessCards = businessesDraft.map((row, index) => {
    const subOptions = subKategoriOptionsForMode(row.mode);
    return (
      <Card key={row.id ?? 'baharu-' + index} className="gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-ink">Perniagaan {index + 1}</Text>
          {!readOnly ? (
            <IconButton
              icon="trash-outline"
              accessibilityLabel="Padam perniagaan ini"
              tone="danger"
              disabled={locked}
              onPress={() => setBusinessesDraft((current) => current.filter((_, i) => i !== index))}
            />
          ) : null}
        </View>

        <Segmented
          label="Mod"
          value={row.mode}
          options={BUSINESS_MODE_OPTIONS}
          onChange={(nextMode) =>
            updateBusiness(index, {
              mode: nextMode,
              // Sub-kategori disempitkan semula ikut mod baharu — pilihan luar
              // senarai mod baharu tidak boleh terus tersimpan secara senyap.
              sub_kategori: row.sub_kategori.filter((value) =>
                subKategoriOptionsForMode(nextMode).some((option) => option.value === value),
              ),
            })
          }
          disabled={locked}
        />

        <ChipGroup
          label="Sub-kategori"
          values={row.sub_kategori}
          options={subOptions}
          onChange={(next) => updateBusiness(index, { sub_kategori: next })}
          disabled={locked}
        />

        <TextField
          label="Nama Perniagaan"
          value={row.nama_perniagaan ?? ''}
          onChangeText={(value) => updateBusiness(index, { nama_perniagaan: value.trim() === '' ? null : value })}
          editable={!locked}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <PickerField
          label="Negeri Operasi"
          value={row.negeri_operasi}
          options={NEGERI_OPTIONS}
          onChange={(next) => updateBusiness(index, { negeri_operasi: next })}
          disabled={locked}
        />

        <View className="gap-2">
          <PickerField
            label="Anggaran Pendapatan Perniagaan"
            value={row.anggaran_pendapatan_range}
            options={PENDAPATAN_RANGE_OPTIONS}
            onChange={(next) => updateBusiness(index, { anggaran_pendapatan_range: next })}
            disabled={locked}
          />
          {pendapatanNote}
        </View>
      </Card>
    );
  });

  const perniagaanFields = (
    <>
      <ToggleRow
        icon="storefront-outline"
        title="Ada Perniagaan"
        subtitle="Hidupkan jika ahli ini memiliki sebarang perniagaan."
        value={adaPerniagaan}
        onValueChange={(next) => setBusinessesDraft(next ? [BLANK_BUSINESS] : [])}
        disabled={locked}
      />

      {adaPerniagaan ? (
        <>
          {businessCards}
          {!readOnly ? (
            <Button
              label="+ Tambah Perniagaan"
              variant="secondary"
              disabled={locked}
              onPress={() => setBusinessesDraft((current) => [...current, { ...BLANK_BUSINESS }])}
            />
          ) : null}
        </>
      ) : null}
    </>
  );

  const keluargaFields = (
    <>
      <Segmented
        label="Status Perkahwinan"
        value={draft.status_perkahwinan}
        options={STATUS_PERKAHWINAN_OPTIONS}
        onChange={(next) =>
          setDraft((current) => ({
            ...current,
            status_perkahwinan: next,
            // Bujang melepaskan semua butiran pasangan/anak/sebab — ia tidak
            // bermakna lagi bila status bertukar keluar daripada berkahwin.
            spouse_member_id: next === 'bujang' ? null : current.spouse_member_id,
            nama_pasangan: next === 'bujang' ? null : current.nama_pasangan,
            tahun_berkahwin: next === 'bujang' ? null : current.tahun_berkahwin,
            bil_anak: next === 'bujang' ? null : current.bil_anak,
            // Sebab hanya bermakna bila "Pernah Berkahwin".
            sebab_bercerai_kematian: next === 'pernah_berkahwin' ? current.sebab_bercerai_kematian : null,
          }))
        }
        disabled={locked}
      />

      {married ? (
        <>
          <Segmented
            label="Pasangan"
            value={pasanganMbm ? 'mbm' : 'bukan_mbm'}
            options={[
              { value: 'mbm', label: 'Pasangan (Ahli)' },
              { value: 'bukan_mbm', label: 'Pasangan (Bukan Ahli)' },
            ]}
            onChange={(next) => {
              const isMbm = next === 'mbm';
              setPasanganMbm(isMbm);
              // Tukar mod melepaskan medan mod SEBELUMNYA — pautan/nama lama
              // tidak sepatutnya tersangkut senyap di sebalik mod yang tidak dipaparkan lagi.
              setDraft((current) => ({
                ...current,
                spouse_member_id: isMbm ? current.spouse_member_id : null,
                nama_pasangan: isMbm ? null : current.nama_pasangan,
              }));
            }}
            disabled={locked}
          />

          {pasanganMbm ? (
            <MemberPickerField
              label="Pasangan (Ahli)"
              value={draft.spouse_member_id}
              candidates={spousePool}
              onChange={(next) => set('spouse_member_id', next)}
              disabled={locked}
            />
          ) : (
            field('Nama pasangan', 'nama_pasangan')
          )}

          {pernahBerkahwin ? (
            <Segmented
              label="Sebab"
              value={draft.sebab_bercerai_kematian}
              options={SEBAB_PERKAHWINAN_OPTIONS}
              onChange={(next) => set('sebab_bercerai_kematian', next)}
              disabled={locked}
            />
          ) : null}

          {field('Tahun berkahwin', 'tahun_berkahwin')}
          {numberField('Bilangan anak', 'bil_anak')}
          <TextField
            label="Nama anak"
            value={draft.nama_anak ?? ''}
            onChangeText={setText('nama_anak')}
            editable={!locked}
            autoCapitalize="sentences"
            autoCorrect={false}
            multiline
          />
        </>
      ) : null}
    </>
  );

  const komitmenFields = (
    <>
      <ToggleRow
        icon="people-outline"
        title="Ikhwan"
        subtitle="Hidupkan jika ahli ini ada jawatan atau komitmen dalam Ikhwan."
        value={draft.jawatan_ikhwan_aktif}
        onValueChange={(next) => set('jawatan_ikhwan_aktif', next)}
        disabled={locked}
      />
      {draft.jawatan_ikhwan_aktif ? (
        <>
          <Text className="text-sm text-ink-muted">Jawatan atau komitmen dalam Ikhwan.</Text>
          {field('Jawatan Ikhwan 1', 'jawatan_ikhwan_1')}
          {field('Jawatan Ikhwan 2', 'jawatan_ikhwan_2')}
        </>
      ) : null}

      <ToggleRow
        icon="flag-outline"
        title="PAS"
        subtitle="Hidupkan jika ahli ini ada jawatan atau komitmen dalam PAS."
        value={draft.jawatan_pas_aktif}
        onValueChange={(next) => set('jawatan_pas_aktif', next)}
        disabled={locked}
      />
      {draft.jawatan_pas_aktif ? (
        <>
          <Text className="text-sm text-ink-muted">Jawatan atau komitmen dalam PAS.</Text>
          {field('Jawatan PAS 1', 'jawatan_pas_1')}
          {field('Jawatan PAS 2', 'jawatan_pas_2')}
          {field('No. keahlian PAS', 'no_keahlian_pas')}
        </>
      ) : null}
    </>
  );

  /* Versi padat suis Sekat untuk panel tindakan — muat separuh lebar. */
  const sekatCompact = canEditAdminColumns ? (
    <View
      className={`h-11 flex-row items-center gap-2 rounded-field border pl-3 pr-2 ${
        draft.disekat ? 'border-negative bg-negative-soft' : 'border-line bg-surface'
      } ${locked ? 'opacity-60' : ''}`}>
      <Ionicons name="ban-outline" size={16} color={draft.disekat ? Colors.negative : Colors.inkMuted} />
      <Text
        className={`flex-1 text-sm font-semibold ${draft.disekat ? 'text-negative' : 'text-ink'}`}
        numberOfLines={1}>
        {draft.disekat ? 'Disekat' : 'Sekat Ahli'}
      </Text>
      <Switch
        accessibilityLabel="Sekat ahli"
        value={draft.disekat}
        onValueChange={(next) => set('disekat', next)}
        disabled={locked}
        trackColor={{ false: Colors.line, true: Colors.negative }}
        thumbColor={Colors.white}
        ios_backgroundColor={Colors.line}
      />
    </View>
  ) : null;

  /*
    Tiada butang Simpan langsung bila borang dikunci — memaparkannya sebagai
    "disabled" masih mengisyaratkan simpanan mungkin berjaya suatu ketika,
    sedangkan kebenaran department tidak akan berubah di skrin ini.
  */
  const saveButton = readOnly ? null : (
    <>
      {!draft.full_name.trim() ? <Notice tone="negative" message="Nama penuh tidak boleh dikosongkan." /> : null}
      {/* Suis Sekat dalam panel tindakan jauh dari medan lain — ingatkan ia belum berkuat kuasa. */}
      {actions && draft.disekat !== member.disekat ? (
        <Notice
          tone="info"
          message={
            (draft.disekat ? 'Sekatan' : 'Buka sekatan') + ' belum disimpan — tekan Simpan Perubahan untuk berkuat kuasa.'
          }
        />
      ) : null}

      <Button
        label="Simpan Perubahan"
        loading={busy}
        disabled={busy || !dirty || !draft.full_name.trim()}
        onPress={() => onSave(patch, businessesDraft, educationDraft)}
      />
    </>
  );

  /* --- Kepala tetap + tab -------------------------------------------------------
     Satu draf untuk semua tab: suntingan di "Pendidikan" tidak hilang bila
     pengguna beralih ke "Keluarga", dan satu butang Simpan menghantar kesemuanya.
     Kepala dibaca daripada rekod tersimpan, bukan draf, supaya ia tidak berubah
     sebelum simpanan berjaya. */
  const caption = tabs.value === 'peribadi' ? null : CAPTIONS[tabs.value];

  return (
    <View className="gap-6">
      <View className="gap-3">
        {avatar}
        <Text className="text-center text-xl font-bold text-ink">{member.full_name}</Text>
      </View>

      {/*
        Dua lajur bila ada lencana, satu lajur bila tiada. Nisbah 57/43
        memberi kad maklumat ruang untuk tiga baris teksnya dan meninggalkan
        lencana cukup lebar untuk nombor kedudukan serta lima labelnya.
        `items-stretch` supaya lencana setinggi kad di sebelahnya, bukan
        setinggi kandungannya sendiri.
      */}
      {headerAside ? (
        <View className="flex-row items-stretch gap-3">
          <Card className="gap-4" style={{ flex: 57 }}>
            <InfoRow icon="layers-outline" label="Generasi" value={generationLabel(member.generasi)} />
            <InfoRow icon="mail-outline" label="Emel" value={member.email} />
            <InfoRow icon="location-outline" label="Kawasan usrah" value={usrahLabel(member.kawasan_usrah)} />
          </Card>
          <View style={{ flex: 43 }}>{headerAside}</View>
        </View>
      ) : (
        <Card className="gap-4">
          <InfoRow icon="layers-outline" label="Generasi" value={generationLabel(member.generasi)} />
          <InfoRow icon="mail-outline" label="Emel" value={member.email} />
          <InfoRow icon="location-outline" label="Kawasan usrah" value={usrahLabel(member.kawasan_usrah)} />
        </Card>
      )}

      {headerNote}

      <View className="gap-2">
        <TabBar value={tabs.value} options={PROFILE_TABS} onChange={tabs.onChange} />
        {caption ? <Text className="text-sm text-ink-muted">{caption}</Text> : null}
      </View>

      <View className="gap-4">
        {tabs.value === 'peribadi' ? (
          <>
            {canEditAdminColumns ? keahlian : null}
            {peribadiFields}
          </>
        ) : null}
        {tabs.value === 'pendidikan' ? pendidikanFields : null}
        {tabs.value === 'pekerjaan' ? pekerjaanFields : null}
        {tabs.value === 'perniagaan' ? perniagaanFields : null}
        {tabs.value === 'keluarga' ? keluargaFields : null}
        {tabs.value === 'komitmen' ? komitmenFields : null}
      </View>

      {actions ? actions({ save: saveButton, sekat: sekatCompact }) : saveButton}
    </View>
  );
}

/** Medan paparan sahaja — bentuknya mengikut `TextField` supaya borang kekal sekata. */
function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink-muted">{label}</Text>
      <View className="h-14 flex-row items-center rounded-field border border-line bg-background px-4">
        <Text className={`flex-1 text-base ${value ? 'text-ink' : 'text-ink-faint'}`} numberOfLines={1}>
          {value || 'Tiada'}
        </Text>
      </View>
    </View>
  );
}

/** Baris ringkasan kepala profil — label kecil di atas nilai, ikon di kiri. */
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-pill bg-primary-soft">
        <Ionicons name={icon} size={16} color={Colors.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-xs text-ink-muted">{label}</Text>
        <Text className={`text-base ${value ? 'text-ink' : 'text-ink-faint'}`} numberOfLines={1}>
          {value || 'Tiada'}
        </Text>
      </View>
    </View>
  );
}
