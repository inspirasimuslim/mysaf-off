import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { toMalayError } from '@/lib/errors';
import {
  fetchHealthAccess,
  fetchMemberHealth,
  fetchRaisLajnahKebajikan,
  saveMemberHealth,
  type HealthAccess,
} from '@/lib/member-health';
import { toWhatsAppNumber } from '@/lib/phone';
import {
  JENIS_MASALAH_KESIHATAN_OPTIONS,
  type JenisMasalahKesihatan,
  type MemberHealthIssue,
  type Option,
  type RaisLajnahKebajikan,
} from '@/types/database';

/**
 * Tab Kesihatan — DATA SENSITIF.
 *
 * Sengaja komponen berdikari (memuat dan menyimpan sendiri, butang Simpan
 * sendiri) dan BUKAN sebahagian daripada `MemberForm.onSave`: akses tab ini
 * berbeza daripada tab lain (pemilik + admin LAJNAH KEBAJIKAN + Super Admin,
 * bukan admin JABATAN DATA), jadi ia tidak boleh berkongsi laluan simpan atau
 * draf yang sama. Tiada kaitan dengan Dashboard Kelengkapan Data atau Excel.
 * RLS (`can_view_health`/`can_edit_health`) ialah penentu muktamad.
 */

type Row = {
  id?: string;
  jenis_masalah: JenisMasalahKesihatan | null;
  nama_penyakit: string | null;
  ada_temujanji_hospital: boolean | null;
  keterangan_lain: string | null;
};

const BLANK_ROW: Row = {
  jenis_masalah: null,
  nama_penyakit: null,
  ada_temujanji_hospital: null,
  keterangan_lain: null,
};

type YaTidak = 'ya' | 'tidak';
const YA_TIDAK_OPTIONS: Option<YaTidak>[] = [
  { value: 'ya', label: 'Ya' },
  { value: 'tidak', label: 'Tidak' },
];

function toRow(issue: MemberHealthIssue): Row {
  return {
    id: issue.id,
    jenis_masalah: issue.jenis_masalah,
    nama_penyakit: issue.nama_penyakit,
    ada_temujanji_hospital: issue.ada_temujanji_hospital,
    keterangan_lain: issue.keterangan_lain,
  };
}

type Props = { memberId: string };

export function MemberHealthTab({ memberId }: Props) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<HealthAccess>({ view: false, edit: false });
  const [original, setOriginal] = useState<MemberHealthIssue[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'positive' | 'negative'; message: string } | null>(null);
  const [rais, setRais] = useState<RaisLajnahKebajikan | null>(null);
  const [raisLoaded, setRaisLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const nextAccess = await fetchHealthAccess(memberId);
        if (!active) return;
        setAccess(nextAccess);
        if (nextAccess.view) {
          const issues = await fetchMemberHealth(memberId);
          if (!active) return;
          setOriginal(issues);
          setRows(issues.map(toRow));
        }
      } catch (caught) {
        if (active) setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan maklumat kesihatan.') });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [memberId]);

  const adaMasalah = rows.length > 0;
  const perluKenalan = rows.some((row) => row.jenis_masalah === 'tidak_mahu_nyatakan');

  // Kenalan Rais hanya dimuat bila benar-benar diperlukan.
  useEffect(() => {
    if (!perluKenalan || raisLoaded) return;
    let active = true;
    void (async () => {
      try {
        const result = await fetchRaisLajnahKebajikan();
        if (active) setRais(result);
      } catch {
        if (active) setRais(null);
      } finally {
        if (active) setRaisLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [perluKenalan, raisLoaded]);

  const update = (index: number, patchRow: Partial<Row>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patchRow } : row)));
  };

  const dirty = useMemo(() => {
    const strip = (list: Row[]) => JSON.stringify(list);
    return strip(rows) !== strip(original.map(toRow));
  }, [rows, original]);

  const incomplete = rows.some((row) => row.jenis_masalah === null);

  const save = useCallback(async () => {
    if (saving || incomplete) return;
    setBanner(null);
    setSaving(true);
    try {
      await saveMemberHealth(
        memberId,
        original,
        rows.map((row) => ({
          id: row.id,
          jenis_masalah: row.jenis_masalah as JenisMasalahKesihatan,
          nama_penyakit: row.nama_penyakit,
          ada_temujanji_hospital: row.ada_temujanji_hospital,
          keterangan_lain: row.keterangan_lain,
        })),
      );
      const fresh = await fetchMemberHealth(memberId);
      setOriginal(fresh);
      setRows(fresh.map(toRow));
      setBanner({ tone: 'positive', message: 'Maklumat kesihatan telah disimpan.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan maklumat kesihatan.') });
    } finally {
      setSaving(false);
    }
  }, [incomplete, memberId, original, rows, saving]);

  const locked = saving || !access.edit;

  const notice = <Notice tone="warn" message="Maklumat kesihatan ini untuk kegunaan Lajnah Kebajikan sahaja." />;

  if (loading) {
    return (
      <View className="gap-4">
        {notice}
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!access.view) {
    return (
      <View className="gap-4">
        {notice}
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}
        <Notice tone="info" message="Anda tiada kebenaran melihat maklumat kesihatan ahli ini." />
      </View>
    );
  }

  const raisNumber = rais ? toWhatsAppNumber(rais.no_tel) : null;
  const konsultasi = (
    <Notice
      tone="info"
      message={
        rais
          ? 'Sila hubungi AJK Lajnah Kebajikan untuk konsultasi peribadi: ' + rais.nama + '.'
          : 'Sila hubungi AJK Lajnah Kebajikan untuk konsultasi peribadi.'
      }
    />
  );

  const cards = rows.map((row, index) => {
    const jenis = row.jenis_masalah;
    const adaButiran = jenis !== null && jenis !== 'tiada' && jenis !== 'tidak_mahu_nyatakan';

    return (
      <Card key={row.id ?? 'baharu-' + index} className="gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-ink">Masalah {index + 1}</Text>
          {access.edit ? (
            <IconButton
              icon="trash-outline"
              accessibilityLabel={'Padam masalah kesihatan ' + (index + 1)}
              tone="danger"
              disabled={saving}
              onPress={() => setRows((current) => current.filter((_, i) => i !== index))}
            />
          ) : null}
        </View>

        <PickerField
          label="Jenis Masalah"
          value={jenis}
          options={JENIS_MASALAH_KESIHATAN_OPTIONS}
          clearable={false}
          onChange={(next) => {
            if (!next) return;
            update(index, {
              jenis_masalah: next,
              // Medan bergantung pada jenis — tukar jenis melepaskan yang tidak relevan.
              keterangan_lain: next === 'lain_lain' ? row.keterangan_lain : null,
              ...(next === 'tiada' || next === 'tidak_mahu_nyatakan'
                ? { nama_penyakit: null, ada_temujanji_hospital: null }
                : {}),
            });
          }}
          disabled={locked}
        />

        {jenis === 'tidak_mahu_nyatakan' ? (
          <View className="gap-3">
            {konsultasi}
            {raisNumber ? (
              <Button
                label={'WhatsApp ' + (rais?.nama ?? 'AJK Lajnah Kebajikan')}
                variant="secondary"
                onPress={() => void Linking.openURL('https://wa.me/' + raisNumber)}
              />
            ) : null}
          </View>
        ) : null}

        {jenis === 'lain_lain' ? (
          <TextField
            label="Nyatakan kategori"
            value={row.keterangan_lain ?? ''}
            onChangeText={(value) => update(index, { keterangan_lain: value.trim() === '' ? null : value })}
            editable={!locked}
            autoCorrect={false}
          />
        ) : null}

        {adaButiran ? (
          <>
            <TextField
              label="Nyatakan Nama Penyakit/Kondisi"
              value={row.nama_penyakit ?? ''}
              onChangeText={(value) => update(index, { nama_penyakit: value.trim() === '' ? null : value })}
              editable={!locked}
              autoCorrect={false}
            />
            <PickerField
              label="Ada Temujanji Hospital?"
              value={row.ada_temujanji_hospital === null ? null : row.ada_temujanji_hospital ? 'ya' : 'tidak'}
              options={YA_TIDAK_OPTIONS}
              onChange={(next) => update(index, { ada_temujanji_hospital: next === null ? null : next === 'ya' })}
              disabled={locked}
            />
          </>
        ) : null}
      </Card>
    );
  });

  return (
    <View className="gap-4">
      {notice}
      {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}
      {!access.edit ? <Notice tone="info" message="Anda hanya mempunyai akses Lihat untuk maklumat ini." /> : null}

      <Segmented
        value={adaMasalah ? 'ada' : 'tiada'}
        options={[
          { value: 'ada', label: 'Ada Masalah Kesihatan' },
          { value: 'tiada', label: 'Tiada Masalah Kesihatan' },
        ]}
        onChange={(next) => {
          const ada = next === 'ada';
          if (ada === adaMasalah) return;
          setRows(ada ? [{ ...BLANK_ROW }] : []);
        }}
        disabled={locked}
      />

      {adaMasalah ? (
        <>
          {cards}
          {access.edit ? (
            <Button
              label="Tambah"
              variant="secondary"
              disabled={saving}
              onPress={() => setRows((current) => [...current, { ...BLANK_ROW }])}
            />
          ) : null}
        </>
      ) : null}

      {incomplete ? <Notice tone="warn" message="Sila pilih Jenis Masalah bagi setiap entri." /> : null}

      {access.edit ? (
        <Button
          label="Simpan Kesihatan"
          loading={saving}
          disabled={!dirty || incomplete || saving}
          onPress={() => void save()}
        />
      ) : null}
    </View>
  );
}
