import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { cleanText, type Ngo, type NgoInput } from '@/lib/ngo';

type Props = {
  visible: boolean;
  /** NGO yang disunting; `null` = NGO baharu. */
  ngo: Ngo | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: NgoInput) => void;
};

/**
 * Borang tambah / sunting NGO (nama, nama penuh, tahun penubuhan, perihal).
 * Borang dipasang hanya ketika dibuka, jadi nilainya sentiasa bermula daripada
 * NGO semasa (tiada nilai tertinggal daripada pembukaan sebelumnya).
 */
export function NgoFormModal(props: Props) {
  return props.visible ? <NgoFormBody key={props.ngo?.id ?? 'baru'} {...props} /> : null;
}

function NgoFormBody({ visible, ngo, busy, error, onClose, onSubmit }: Props) {
  const [nama, setNama] = useState(ngo?.nama ?? '');
  const [namaPenuh, setNamaPenuh] = useState(ngo?.nama_penuh ?? '');
  const [tahun, setTahun] = useState(ngo?.tahun_penubuhan ? String(ngo.tahun_penubuhan) : '');
  const [perihal, setPerihal] = useState(ngo?.perihal ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const cleanName = cleanText(nama);
    if (!cleanName) {
      setLocalError('Sila isi nama NGO.');
      return;
    }
    let year: number | null = null;
    if (tahun.trim()) {
      year = Number(tahun.trim());
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        setLocalError('Tahun penubuhan tidak sah (1900–2100).');
        return;
      }
    }
    setLocalError(null);
    onSubmit({
      nama: cleanName,
      nama_penuh: cleanText(namaPenuh),
      perihal: perihal.trim() ? perihal.trim() : null,
      tahun_penubuhan: year,
    });
  };

  return (
    <FormModal
      visible={visible}
      title={ngo ? 'Sunting NGO' : 'Tambah NGO'}
      dismissable={!busy}
      onClose={onClose}
      footer={<Button label="Simpan" loading={busy} disabled={busy} onPress={submit} />}>
      <View className="gap-3">
        {localError || error ? <Notice tone="negative" message={(localError ?? error) as string} /> : null}
        <TextField label="Nama (singkatan)" value={nama} onChangeText={setNama} placeholder="Contoh: IMAN" editable={!busy} />
        <TextField label="Nama penuh" value={namaPenuh} onChangeText={setNamaPenuh} placeholder="Contoh: Ikatan Inspirasi Muslim Nasional" editable={!busy} />
        <TextField label="Tahun penubuhan" value={tahun} onChangeText={setTahun} keyboardType="number-pad" maxLength={4} placeholder="Contoh: 2015" editable={!busy} />
        <TextField label="Perihal" value={perihal} onChangeText={setPerihal} multiline editable={!busy} />
      </View>
    </FormModal>
  );
}
