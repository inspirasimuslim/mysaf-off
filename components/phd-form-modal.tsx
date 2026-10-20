import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { ImageUploadRow } from '@/components/business-ad-image-slot';
import { ImageUploadError, pickImage } from '@/lib/image-upload';
import { cleanPhdText, PERINGKAT_OPTIONS, phdImageUrl, type Peringkat, type PhdGraduate, type PhdInput } from '@/lib/phd';
import { toMalayError } from '@/lib/errors';
import { fetchMembersForPicker } from '@/lib/members';
import { generationLabel, type MemberPickerRow } from '@/types/database';

const norm = (value: string | null | undefined) => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

type Props = {
  visible: boolean;
  /** Rekod yang disunting; `null` = tambah baharu. */
  graduate: PhdGraduate | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  /** `photoUri` = gambar baharu dipilih; `removePhoto` = buang gambar sedia ada. */
  onSubmit: (input: PhdInput, photoUri: string | null, removePhoto: boolean) => void;
};

/**
 * Borang tambah / sunting pemegang PhD. Dipasang hanya ketika dibuka supaya nilai
 * sentiasa bermula daripada rekod semasa (tiada nilai tertinggal daripada pembukaan lepas).
 */
export function PhdFormModal(props: Props) {
  return props.visible ? <PhdFormBody key={props.graduate?.id ?? 'baru'} {...props} /> : null;
}

function PhdFormBody({ visible, graduate, busy, error, onClose, onSubmit }: Props) {
  const [peringkat, setPeringkat] = useState<Peringkat>(graduate?.peringkat ?? 'phd');
  const [nama, setNama] = useState(graduate?.nama ?? '');
  const [generasi, setGenerasi] = useState(graduate?.generasi ?? '');
  const [candidates, setCandidates] = useState<MemberPickerRow[] | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [bidang, setBidang] = useState(graduate?.bidang ?? '');
  const [universiti, setUniversiti] = useState(graduate?.universiti ?? '');
  const [tahun, setTahun] = useState(graduate?.tahun_tamat ? String(graduate.tahun_tamat) : '');
  const [tajuk, setTajuk] = useState(graduate?.tajuk_tesis ?? '');
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  /*
    Nama + generasi kini dipilih daripada senarai ahli (dropdown carian, sama seperti
    `MemberPickerField` di skrin lain) — tiada lagi taip bebas. Table masih menyimpan
    nama/generasi sebagai teks (tiada lajur `member_id`), jadi rekod sedia ada dipadankan
    semula kepada ahli melalui nama (+ generasi jika ada) semasa borang dibuka.
  */
  useEffect(() => {
    let alive = true;
    fetchMembersForPicker()
      .then((rows) => {
        if (!alive) return;
        setCandidates(rows);
        if (graduate) {
          const sameName = rows.filter((row) => norm(row.full_name) === norm(graduate.nama));
          const match =
            sameName.find((row) => norm(row.generasi) === norm(graduate.generasi)) ?? (sameName.length === 1 ? sameName[0] : null);
          if (match) setMemberId(match.id);
        }
      })
      .catch((caught) => {
        if (!alive) return;
        setCandidates([]);
        setLocalError(toMalayError(caught, 'Gagal memuatkan senarai ahli.'));
      });
    return () => {
      alive = false;
    };
  }, [graduate]);

  const chooseMember = (id: string | null) => {
    setMemberId(id);
    const member = candidates?.find((row) => row.id === id) ?? null;
    if (member) {
      setNama(member.full_name);
      setGenerasi(member.generasi ?? '');
      setLocalError(null);
    } else {
      setNama('');
      setGenerasi('');
    }
  };

  // Rekod lama yang namanya tiada dalam senarai ahli — dikekalkan selagi admin tidak memilih ahli lain.
  const unmatchedLegacy = graduate !== null && memberId === null && candidates !== null && norm(nama) === norm(graduate.nama) && nama.trim() !== '';

  const existingUrl = graduate?.gambar_path && !removePhoto ? phdImageUrl(graduate.gambar_path) : null;
  const previewUri = newPhoto ?? existingUrl;

  const choose = async () => {
    try {
      const uri = await pickImage([4, 5]);
      if (uri) {
        setNewPhoto(uri);
        setRemovePhoto(false);
        setLocalError(null);
      }
    } catch (caught) {
      setLocalError(caught instanceof ImageUploadError ? caught.message : toMalayError(caught, 'Gagal memilih gambar.'));
    }
  };

  const submit = () => {
    const cleanName = cleanPhdText(nama);
    if (!cleanName) {
      setLocalError('Sila pilih ahli.');
      return;
    }
    let year: number | null = null;
    if (tahun.trim()) {
      year = Number(tahun.trim());
      if (!Number.isInteger(year) || year < 1950 || year > 2100) {
        setLocalError('Tahun tamat tidak sah.');
        return;
      }
    }
    setLocalError(null);
    onSubmit(
      {
        peringkat,
        nama: cleanName,
        generasi: cleanPhdText(generasi)?.toLowerCase() ?? null,
        bidang: cleanPhdText(bidang),
        universiti: cleanPhdText(universiti),
        tahun_tamat: year,
        tajuk_tesis: tajuk.trim() ? tajuk.trim() : null,
      },
      newPhoto,
      removePhoto && !newPhoto,
    );
  };

  return (
    <FormModal
      visible={visible}
      title={graduate ? 'Sunting Pencapaian' : 'Tambah Pencapaian'}
      dismissable={!busy}
      onClose={onClose}
      footer={<Button label="Simpan" loading={busy} disabled={busy} onPress={submit} />}>
      <View className="gap-3">
        {localError || error ? <Notice tone="negative" message={(localError ?? error) as string} /> : null}
        <Segmented label="Peringkat" value={peringkat} options={PERINGKAT_OPTIONS} onChange={setPeringkat} disabled={busy} />
        <MemberPickerField
          label="Nama ahli"
          value={memberId}
          candidates={candidates ?? []}
          onChange={chooseMember}
          placeholder={candidates === null ? 'Memuatkan senarai ahli…' : 'Cari & pilih ahli'}
          disabled={busy || candidates === null}
        />
        {unmatchedLegacy ? (
          <Text className="text-sm text-ink-muted">
            Rekod semasa: {nama}
            {generasi ? ' · ' + generationLabel(generasi) : ''} (tiada dalam senarai ahli — pilih ahli untuk menukar)
          </Text>
        ) : memberId ? (
          <Text className="text-sm text-ink-muted">Generasi: {generasi ? generationLabel(generasi) : '—'}</Text>
        ) : null}
        <TextField label={peringkat === 'phd' ? 'Bidang PhD' : 'Bidang Sarjana'} value={bidang} onChangeText={setBidang} placeholder="Contoh: Kejuruteraan Awam" editable={!busy} />
        <TextField label="Universiti" value={universiti} onChangeText={setUniversiti} editable={!busy} />
        <TextField label="Tahun tamat" value={tahun} onChangeText={setTahun} keyboardType="number-pad" maxLength={4} placeholder="Contoh: 2025" editable={!busy} />
        <TextField label="Tajuk penyelidikan (pilihan)" value={tajuk} onChangeText={setTajuk} multiline editable={!busy} />
        <ImageUploadRow
          label="Gambar (potret)"
          previewUri={previewUri}
          aspectRatio={4 / 5}
          onChoose={() => void choose()}
          onRemove={
            previewUri
              ? () => {
                  setNewPhoto(null);
                  setRemovePhoto(true);
                }
              : undefined
          }
          disabled={busy}
        />
      </View>
    </FormModal>
  );
}
