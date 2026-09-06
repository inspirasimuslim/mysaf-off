import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors } from '@/constants/theme';
import {
  JANTINA_OPTIONS,
  KAWASAN_USRAH_OPTIONS,
  PENDAPATAN_RANGE_OPTIONS,
  STATUS_PEKERJAAN_OPTIONS,
  STATUS_PENGAJIAN_OPTIONS,
  STATUS_PERKAHWINAN_OPTIONS,
  generationLabel,
  type Generation,
  type Member,
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

type Props = {
  member: Member;
  generations: Generation[];
  canEditAdminColumns: boolean;
  /** Kunci SELURUH borang: pengguna boleh melihat rekod tetapi bukan menyuntingnya. */
  readOnly?: boolean;
  busy?: boolean;
  /** Dipanggil bila avatar diketuk. Tanpa ini, ikon kamera tidak dipapar. */
  onPickAvatar?: () => void;
  avatarBusy?: boolean;
  /** Hanya medan yang benar-benar berubah dihantar. */
  onSave: (patch: Partial<Member>) => void;
};

const AVATAR_SIZE = 96;

/*
  Medan setiap seksyen yang boleh ditutup. Kiraan medan berisi dipapar pada
  kepala seksyen supaya keadaan tertutup masih memberitahu ada apa di dalam —
  tanpa itu, empat seksyen tertutup kelihatan sama sahaja walau satu penuh dan
  satu lagi kosong.
*/
const PENDIDIKAN_FIELDS = [
  'tahap_pendidikan', 'sekolah', 'status_pengajian', 'nama_institusi', 'alamat_institusi',
  'tahun_pengajian', 'jurusan_pengajian', 'sumber_pembiayaan', 'pembiayaan_lain',
] as const satisfies readonly (keyof Member)[];

const PEKERJAAN_FIELDS = [
  'status_pekerjaan', 'sektor_pekerjaan', 'jawatan_pekerjaan', 'nama_majikan',
  'alamat_tempat_kerja', 'anggaran_pendapatan_range', 'jenis_perniagaan',
] as const satisfies readonly (keyof Member)[];

const KELUARGA_FIELDS = [
  'status_perkahwinan', 'nama_pasangan', 'tahun_berkahwin', 'bil_anak',
  'anggaran_pendapatan_isi_rumah_range', 'bil_tanggungan_selain_keluarga',
  'pekerjaan_ibu', 'pekerjaan_bapa', 'bil_tanggungan_ibu_bapa',
] as const satisfies readonly (keyof Member)[];

const JAWATAN_FIELDS = [
  'jawatan_ikhwan_1', 'jawatan_ikhwan_2', 'jawatan_ikhwan_3',
  'jawatan_pas_1', 'jawatan_pas_2', 'jawatan_pas_3', 'no_keahlian_pas',
] as const satisfies readonly (keyof Member)[];

function countFilled(member: Member, keys: readonly (keyof Member)[]): number {
  return keys.filter((key) => {
    const value = member[key];
    return value !== null && value !== undefined && value !== '';
  }).length;
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
  canEditAdminColumns,
  readOnly = false,
  busy = false,
  onPickAvatar,
  avatarBusy = false,
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
    Rekod yang kawasan usrahnya belum dinormalkan akan hilang nilainya bila
    dropdown tidak mengenali kod itu. Nilai asing ditambah sebagai pilihan
    supaya ia kekal terpapar sehingga admin memilih penggantinya.
  */
  const usrahOptions = useMemo<Option<string>[]>(() => {
    const current = draft.kawasan_usrah;
    if (!current || KAWASAN_USRAH_OPTIONS.some((option) => option.value === current)) {
      return KAWASAN_USRAH_OPTIONS;
    }
    return [...KAWASAN_USRAH_OPTIONS, { value: current, label: current + ' (tidak dikenali)' }];
  }, [draft.kawasan_usrah]);

  /** Medan yang berubah sahaja — mengelak menulis semula kolum yang tidak disentuh. */
  const patch = useMemo(() => {
    const changed: Partial<Member> = {};
    (Object.keys(draft) as (keyof Member)[]).forEach((key) => {
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

  return (
    <View className="gap-6">
      {/* --- Avatar ----------------------------------------------------------- */}
      <View className="items-center">
        <Pressable
          accessibilityRole={canPickAvatar ? 'button' : 'image'}
          accessibilityLabel={canPickAvatar ? 'Tukar gambar profil' : member.full_name}
          disabled={!canPickAvatar || avatarBusy}
          onPress={onPickAvatar}
          className={canPickAvatar ? 'active:opacity-70' : ''}>
          <MemberAvatar fullName={draft.full_name} avatarUrl={draft.avatar_url} size={AVATAR_SIZE} />

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

      {/* --- Identiti keahlian ------------------------------------------------ */}
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

          {canEditAdminColumns ? (
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

      {/* --- Peribadi -------------------------------------------------------- */}
      <View>
        <SectionTitle title="Maklumat Peribadi" />
        <View className="gap-4">
          <TextField
            label="Nama penuh"
            value={draft.full_name}
            onChangeText={(value) => set('full_name', value)}
            editable={!locked}
            autoCapitalize="characters"
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
        </View>
      </View>

      <CollapsibleSection title="Pendidikan" caption="Butiran institusi muncul selepas status pengajian dipilih." filled={countFilled(draft, PENDIDIKAN_FIELDS)}>
        {field('Tahap pendidikan tertinggi', 'tahap_pendidikan')}
        {field('Sekolah', 'sekolah')}

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
      </CollapsibleSection>

      <CollapsibleSection title="Pekerjaan" caption="Butiran tambahan muncul mengikut status pekerjaan yang dipilih." filled={countFilled(draft, PEKERJAAN_FIELDS)}>
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
      </CollapsibleSection>

      <CollapsibleSection title="Keluarga" caption="Butiran pasangan muncul selepas status berkahwin dipilih." filled={countFilled(draft, KELUARGA_FIELDS)}>
        <PickerField
          label="Status perkahwinan"
          value={draft.status_perkahwinan}
          options={STATUS_PERKAHWINAN_OPTIONS}
          onChange={(next) => set('status_perkahwinan', next)}
          disabled={locked}
        />

        {married ? (
          <>
            {field('Nama pasangan', 'nama_pasangan')}
            {field('Tahun berkahwin', 'tahun_berkahwin')}
            {numberField('Bilangan anak', 'bil_anak')}
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
      </CollapsibleSection>

      <CollapsibleSection title="Jawatan" caption="Jawatan dalam Ikhwan dan PAS, jika ada." filled={countFilled(draft, JAWATAN_FIELDS)}>
        {field('Jawatan Ikhwan 1', 'jawatan_ikhwan_1')}
        {field('Jawatan Ikhwan 2', 'jawatan_ikhwan_2')}
        {field('Jawatan Ikhwan 3', 'jawatan_ikhwan_3')}
        {field('Jawatan PAS 1', 'jawatan_pas_1')}
        {field('Jawatan PAS 2', 'jawatan_pas_2')}
        {field('Jawatan PAS 3', 'jawatan_pas_3')}
        {field('No. keahlian PAS', 'no_keahlian_pas')}
      </CollapsibleSection>

      {/*
        Tiada butang Simpan langsung bila borang dikunci — memaparkannya sebagai
        "disabled" masih mengisyaratkan simpanan mungkin berjaya suatu ketika,
        sedangkan kebenaran department tidak akan berubah di skrin ini.
      */}
      {readOnly ? null : (
        <>
          {!draft.full_name.trim() ? (
            <Notice tone="negative" message="Nama penuh tidak boleh dikosongkan." />
          ) : null}

          <Button
            label="Simpan Perubahan"
            loading={busy}
            disabled={busy || !dirty || !draft.full_name.trim()}
            onPress={() => onSave(patch)}
          />
        </>
      )}
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
