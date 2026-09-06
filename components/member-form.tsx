import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import {
  JANTINA_OPTIONS,
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
  /** Hanya medan yang benar-benar berubah dihantar. */
  onSave: (patch: Partial<Member>) => void;
};

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

  return (
    <View className="gap-6">
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
              subtitle="Ahli yang disekat kekal dalam sistem tetapi ditanda tidak aktif."
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
          {field('Kawasan usrah', 'kawasan_usrah')}
          {field('Alamat tetap', 'alamat')}
          {field('Alamat semasa', 'alamat_semasa')}
        </View>
      </View>

      {/* --- Pendidikan ------------------------------------------------------ */}
      <View>
        <SectionTitle title="Pendidikan" caption="Butiran institusi muncul selepas status pengajian dipilih." />
        <View className="gap-4">
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
        </View>
      </View>

      {/* --- Pekerjaan ------------------------------------------------------- */}
      <View>
        <SectionTitle title="Pekerjaan" caption="Butiran tambahan muncul mengikut status pekerjaan yang dipilih." />
        <View className="gap-4">
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
        </View>
      </View>

      {/* --- Keluarga -------------------------------------------------------- */}
      <View>
        <SectionTitle title="Keluarga" caption="Butiran pasangan muncul selepas status berkahwin dipilih." />
        <View className="gap-4">
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
        </View>
      </View>

      {/* --- Jawatan --------------------------------------------------------- */}
      <View>
        <SectionTitle title="Jawatan" caption="Jawatan dalam Ikhwan dan PAS, jika ada." />
        <View className="gap-4">
          {field('Jawatan Ikhwan 1', 'jawatan_ikhwan_1')}
          {field('Jawatan Ikhwan 2', 'jawatan_ikhwan_2')}
          {field('Jawatan Ikhwan 3', 'jawatan_ikhwan_3')}
          {field('Jawatan PAS 1', 'jawatan_pas_1')}
          {field('Jawatan PAS 2', 'jawatan_pas_2')}
          {field('Jawatan PAS 3', 'jawatan_pas_3')}
          {field('No. keahlian PAS', 'no_keahlian_pas')}
        </View>
      </View>

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
