import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { SectionTitle } from '@/components/ui/section-title';
import { TabBar } from '@/components/ui/tab-bar';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors } from '@/constants/theme';
import {
  JANTINA_OPTIONS,
  KAWASAN_USRAH_OPTIONS,
  PENDAPATAN_RANGE_OPTIONS,
  SEKOLAH_OPTIONS,
  STATUS_PEKERJAAN_OPTIONS,
  STATUS_PENGAJIAN_OPTIONS,
  STATUS_PERKAHWINAN_OPTIONS,
  generationLabel,
  type Generation,
  type Member,
  type MemberPickerRow,
  type Option,
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

export type ProfileTab = 'diri' | 'pendidikan' | 'pekerjaan' | 'keluarga' | 'jawatan';

const PROFILE_TABS: Option<ProfileTab>[] = [
  { value: 'diri', label: 'Maklumat Diri' },
  { value: 'pendidikan', label: 'Pendidikan' },
  { value: 'pekerjaan', label: 'Pekerjaan' },
  { value: 'keluarga', label: 'Keluarga' },
  { value: 'jawatan', label: 'Jawatan' },
];

type Props = {
  member: Member;
  generations: Generation[];
  /** Calon pemilih pasangan (tab Keluarga, status 'berkahwin_mbm') — daripada `list_members_picker()`. */
  spouseCandidates: MemberPickerRow[];
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
  /** Hanya medan yang benar-benar berubah dihantar. */
  onSave: (patch: Partial<Member>) => void;
};

const AVATAR_SIZE = 96;

/** Kapsyen di bawah tab bagi setiap seksyen selain Maklumat Diri. */
const CAPTIONS = {
  pendidikan: 'Butiran institusi muncul selepas status pengajian dipilih.',
  pekerjaan: 'Butiran tambahan muncul mengikut status pekerjaan yang dipilih.',
  keluarga: 'Butiran pasangan muncul selepas status berkahwin dipilih.',
  jawatan: 'Jawatan dalam Ikhwan dan PAS, jika ada.',
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

/** Kunci medan yang disimpan sebagai nombor. */
const NUMERIC_FIELDS = ['bil_anak', 'bil_tanggungan_selain_keluarga', 'bil_tanggungan_ibu_bapa'] as const;
type NumericField = (typeof NUMERIC_FIELDS)[number];

/** Kunci medan teks bebas. */
type TextFieldKey = {
  [K in keyof Member]: Member[K] extends string | null ? K : never;
}[keyof Member];

export function MemberForm({
  member,
  generations,
  spouseCandidates,
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
  const sekolahOptions = useMemo(() => withUnrecognised(SEKOLAH_OPTIONS, draft.sekolah), [draft.sekolah]);

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

  const dirty = Object.keys(patch).length > 0;

  const studying = draft.status_pengajian === 'sedang_belajar' || draft.status_pengajian === 'sudah_tamat';
  const working =
    draft.status_pekerjaan === 'bekerja' ||
    draft.status_pekerjaan === 'bekerja_dan_belajar' ||
    draft.status_pekerjaan === 'pesara';
  const inBusiness = draft.status_pekerjaan === 'berniaga_usahawan';
  const married =
    draft.status_perkahwinan === 'berkahwin_mbm' || draft.status_perkahwinan === 'berkahwin_bukan_mbm';

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

  const pendidikanFields = (
    <>
      {field('Tahap pendidikan tertinggi', 'tahap_pendidikan')}
      <PickerField
        label="Sekolah"
        value={draft.sekolah}
        options={sekolahOptions}
        onChange={(next) => set('sekolah', next)}
        disabled={locked}
      />

      <PickerField
        label="Status pengajian"
        value={draft.status_pengajian}
        options={STATUS_PENGAJIAN_OPTIONS}
        onChange={(next) => set('status_pengajian', next)}
        disabled={locked}
      />

      {studying ? (
        <>
          {field('Nama institusi', 'nama_institusi')}
          {field('Alamat institusi', 'alamat_institusi')}
          {field('Tahun pengajian', 'tahun_pengajian')}
          {field('Jurusan pengajian', 'jurusan_pengajian')}
          {field('Sumber pembiayaan', 'sumber_pembiayaan')}
          {field('Nyatakan pembiayaan lain', 'pembiayaan_lain')}
        </>
      ) : null}
    </>
  );

  const pekerjaanFields = (
    <>
      <PickerField
        label="Status pekerjaan"
        value={draft.status_pekerjaan}
        options={STATUS_PEKERJAAN_OPTIONS}
        onChange={(next) => set('status_pekerjaan', next)}
        disabled={locked}
      />

      {working ? (
        <>
          {field('Sektor pekerjaan', 'sektor_pekerjaan')}
          {field('Jawatan', 'jawatan_pekerjaan')}
          {field('Nama majikan / syarikat', 'nama_majikan')}
          {field('Alamat tempat kerja', 'alamat_tempat_kerja')}
        </>
      ) : null}

      {inBusiness ? (
        <>
          {field('Jenis perniagaan', 'jenis_perniagaan')}
          {field('Nama syarikat', 'nama_majikan')}
          {field('Alamat tempat perniagaan', 'alamat_tempat_kerja')}
        </>
      ) : null}

      {working || inBusiness ? (
        <PickerField
          label="Anggaran pendapatan sebulan"
          value={draft.anggaran_pendapatan_range}
          options={PENDAPATAN_RANGE_OPTIONS}
          onChange={(next) => set('anggaran_pendapatan_range', next)}
          disabled={locked}
        />
      ) : null}
    </>
  );

  const keluargaFields = (
    <>
      <PickerField
        label="Status perkahwinan"
        value={draft.status_perkahwinan}
        options={STATUS_PERKAHWINAN_OPTIONS}
        onChange={(next) =>
          setDraft((current) => ({
            ...current,
            status_perkahwinan: next,
            // Pasangan ahli hanya bermakna bila status MBM — tukar keluar
            // daripada MBM melepaskan pautan supaya ia tidak tersangkut senyap.
            spouse_member_id: next === 'berkahwin_mbm' ? current.spouse_member_id : null,
          }))
        }
        disabled={locked}
      />

      {married ? (
        <>
          {draft.status_perkahwinan === 'berkahwin_mbm' ? (
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

      <PickerField
        label="Anggaran pendapatan isi rumah"
        value={draft.anggaran_pendapatan_isi_rumah_range}
        options={PENDAPATAN_RANGE_OPTIONS}
        onChange={(next) => set('anggaran_pendapatan_isi_rumah_range', next)}
        disabled={locked}
      />
      {numberField('Bilangan tanggungan selain keluarga', 'bil_tanggungan_selain_keluarga')}
      {field('Pekerjaan ibu', 'pekerjaan_ibu')}
      {field('Pekerjaan bapa', 'pekerjaan_bapa')}
      {numberField('Bilangan tanggungan ibu bapa', 'bil_tanggungan_ibu_bapa')}
    </>
  );

  const jawatanFields = (
    <>
      {field('Jawatan Ikhwan 1', 'jawatan_ikhwan_1')}
      {field('Jawatan Ikhwan 2', 'jawatan_ikhwan_2')}
      {field('Jawatan Ikhwan 3', 'jawatan_ikhwan_3')}
      {field('Jawatan PAS 1', 'jawatan_pas_1')}
      {field('Jawatan PAS 2', 'jawatan_pas_2')}
      {field('Jawatan PAS 3', 'jawatan_pas_3')}
      {field('No. keahlian PAS', 'no_keahlian_pas')}
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
        onPress={() => onSave(patch)}
      />
    </>
  );

  /* --- Kepala tetap + tab -------------------------------------------------------
     Satu draf untuk semua tab: suntingan di "Pendidikan" tidak hilang bila
     pengguna beralih ke "Keluarga", dan satu butang Simpan menghantar kesemuanya.
     Kepala dibaca daripada rekod tersimpan, bukan draf, supaya ia tidak berubah
     sebelum simpanan berjaya. */
  const caption = tabs.value === 'diri' ? null : CAPTIONS[tabs.value];

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
        {tabs.value === 'diri' ? (
          <>
            {canEditAdminColumns ? keahlian : null}
            {peribadiFields}
          </>
        ) : null}
        {tabs.value === 'pendidikan' ? pendidikanFields : null}
        {tabs.value === 'pekerjaan' ? pekerjaanFields : null}
        {tabs.value === 'keluarga' ? keluargaFields : null}
        {tabs.value === 'jawatan' ? jawatanFields : null}
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
