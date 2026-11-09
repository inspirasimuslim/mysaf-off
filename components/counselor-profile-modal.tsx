import { useState } from 'react';
import { Text, View } from 'react-native';

import { ImageUploadRow } from '@/components/business-ad-image-slot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import {
  counselorImageUrl,
  PROFILE_LIMITS,
  type CounselorAdminRow,
  type CounselorProfileInput,
} from '@/lib/counseling';
import { formatTarikh } from '@/lib/bantuan';
import { toMalayError } from '@/lib/errors';
import { ImageUploadError, pickImage } from '@/lib/image-upload';

type Props = {
  /** Kaunselor yang disunting; `null` = tutup. */
  counselor: CounselorAdminRow | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: CounselorProfileInput, photoUri: string | null, removePhoto: boolean) => void;
  /** Tindakan lain: dikendalikan oleh skrin induk (tutup helaian ini dahulu, kemudian sahkan). */
  onDeactivate: () => void;
  onDelete: () => void;
};

/** Dipasang hanya ketika dibuka supaya nilai sentiasa bermula daripada rekod semasa. */
export function CounselorProfileModal(props: Props) {
  return props.counselor ? <Body key={props.counselor.id} {...props} counselor={props.counselor} /> : null;
}

function Body({ counselor, busy, error, onClose, onSubmit, onDeactivate, onDelete }: Props & { counselor: CounselorAdminRow }) {
  const [nama, setNama] = useState(counselor.nama_penuh ?? '');
  const [pendidikan, setPendidikan] = useState(counselor.pendidikan ?? '');
  const [pekerjaan, setPekerjaan] = useState(counselor.pekerjaan ?? '');
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const existingUrl = counselor.gambar_path && !removePhoto ? counselorImageUrl(counselor.gambar_path) : null;
  const previewUri = newPhoto ?? existingUrl;

  const choose = async () => {
    try {
      const uri = await pickImage([1, 1]);
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
    if (pendidikan.trim().length > PROFILE_LIMITS.pendidikan) {
      setLocalError('Latar belakang pendidikan terlalu panjang.');
      return;
    }
    setLocalError(null);
    onSubmit({ nama_penuh: nama.trim(), pendidikan: pendidikan.trim(), pekerjaan: pekerjaan.trim() }, newPhoto, removePhoto && !newPhoto);
  };

  return (
    <FormModal
      visible
      title={'Profil Kaunselor'}
      dismissable={!busy}
      onClose={onClose}
      footer={<Button label="Simpan" loading={busy} disabled={busy} onPress={submit} />}>
      <View className="gap-3">
        <View className="gap-1 rounded-field bg-primary-tint p-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-semibold text-ink-muted">Status</Text>
            <Badge label={counselor.aktif ? 'Aktif' : 'Tidak aktif'} tone={counselor.aktif ? 'positive' : 'neutral'} />
          </View>
          <Text className="text-sm text-ink-muted">
            {'Dilantik ' + formatTarikh(counselor.appointed_at) + (counselor.removed_at ? ' · Tidak aktif sejak ' + formatTarikh(counselor.removed_at) : '')}
          </Text>
        </View>
        {localError || error ? <Notice tone="negative" message={(localError ?? error) as string} /> : null}
        <TextField
          label={'Nama penuh (kosongkan untuk guna nama ahli: ' + counselor.full_name + ')'}
          value={nama}
          onChangeText={setNama}
          maxLength={PROFILE_LIMITS.nama}
          editable={!busy}
        />
        <TextField
          label="Latar belakang pendidikan (satu kelayakan setiap baris)"
          value={pendidikan}
          onChangeText={setPendidikan}
          placeholder={'Contoh:\nSarjana Muda Kaunseling (UM)\nKaunselor Berdaftar (KB00000)'}
          multiline
          maxLength={PROFILE_LIMITS.pendidikan}
          editable={!busy}
        />
        <TextField label="Pekerjaan / jawatan semasa" value={pekerjaan} onChangeText={setPekerjaan} maxLength={PROFILE_LIMITS.pekerjaan} editable={!busy} />
        <ImageUploadRow
          label="Gambar profil (segi empat sama, dimampatkan automatik)"
          previewUri={previewUri}
          aspectRatio={1}
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
        <View className="gap-2 border-t border-line pt-4">
          <Text className="text-xs font-semibold text-ink-muted">Tindakan lain</Text>
          {counselor.aktif ? <Button label="Nyahaktif" variant="danger" size="sm" disabled={busy} onPress={onDeactivate} /> : null}
          <Button label="Padam" variant="danger" size="sm" disabled={busy} onPress={onDelete} />
        </View>
      </View>
    </FormModal>
  );
}

