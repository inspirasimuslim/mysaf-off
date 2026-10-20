import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { ImageUploadRow } from '@/components/business-ad-image-slot';
import { ImageUploadError, pickImage } from '@/lib/image-upload';
import { cleanPhdText, PERINGKAT_OPTIONS, phdImageUrl, type Peringkat, type PhdGraduate, type PhdInput } from '@/lib/phd';
import { toMalayError } from '@/lib/errors';

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
  const [bidang, setBidang] = useState(graduate?.bidang ?? '');
  const [universiti, setUniversiti] = useState(graduate?.universiti ?? '');
  const [tahun, setTahun] = useState(graduate?.tahun_tamat ? String(graduate.tahun_tamat) : '');
  const [tajuk, setTajuk] = useState(graduate?.tajuk_tesis ?? '');
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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
      setLocalError('Sila isi nama.');
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
        <TextField label="Nama" value={nama} onChangeText={setNama} editable={!busy} />
        <TextField label="Generasi (pilihan)" value={generasi} onChangeText={setGenerasi} placeholder="Contoh: i21" autoCapitalize="none" editable={!busy} />
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
