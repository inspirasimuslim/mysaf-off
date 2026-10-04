import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { ImageUploadRow } from '@/components/business-ad-image-slot';
import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/lib/auth-context';
import {
  businessAdError,
  fetchMemberPhoneForBusinessAd,
  POSTER_ASPECT_RATIO,
  submitBusinessAdAdmin,
  uploadBusinessImage,
} from '@/lib/business-ads';
import { EKONOMI_DEPARTMENT, useDepartmentAccess } from '@/lib/department-access';
import { pickImage } from '@/lib/image-upload';
import { fetchMembersForPicker, fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { toWhatsAppNumber } from '@/lib/phone';
import type { Member, MemberPickerRow } from '@/types/database';

const DEFAULT_DURATION = '30';

/**
 * Admin Lajnah Ekonomi menghantar iklan bisnes BAGI PIHAK ahli lain
 * (migration 108, diminta 2026-10-03) — untuk ahli yang tidak mahir
 * aplikasi, admin boleh cari & pilih ahli pemilik, muat naik gambar, dan
 * iklan terus AKTIF (tiada langkah Lulus berasingan, tiada had queue/3-ahli
 * seperti penghantaran ahli sendiri — lihat migration 108 untuk sebab).
 *
 * Gambar dimuat naik bawah ID ADMIN sendiri (bukan ID ahli dipilih) — RLS
 * storage menuntut ini; `submit_business_ad_admin()` mengesahkan perkara
 * sama di sisi DB. Dibuka daripada butang "+ Tambah Iklan" di `semakan-iklan.tsx`.
 *
 * Medan WhatsApp (migration 109, susulan 2026-10-03): lalai = no_tel ahli
 * yang DIPILIH (`get_member_phone_for_business_ad()`, diisi semula setiap
 * kali `ownerId` bertukar), tetapi medan itu kekal boleh disunting terus —
 * admin menaip nombor lain (cth. nombor khusus bisnes) menimpanya sebelum
 * hantar, sama corak prafill nombor sendiri di `bisnes-upload.tsx`.
 */
export default function AdminIklanTambahScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { user } = useAuth();
  const { loading: accessLoading, canEdit } = useDepartmentAccess(EKONOMI_DEPARTMENT);

  const [adminMember, setAdminMember] = useState<Member | null>(null);
  const [candidates, setCandidates] = useState<MemberPickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [posterUri, setPosterUri] = useState<string | null>(null);
  const [gambar2Uri, setGambar2Uri] = useState<string | null>(null);
  const [gambar3Uri, setGambar3Uri] = useState<string | null>(null);
  const [nama, setNama] = useState('');
  const [penerangan, setPenerangan] = useState('');
  const [cta, setCta] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [durasi, setDurasi] = useState(DEFAULT_DURATION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !canEdit) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const [me, picker] = await Promise.all([fetchMyMemberLinked(user.id), fetchMembersForPicker()]);
        if (!active) return;
        setAdminMember(me);
        setCandidates(picker);
      } catch (caught) {
        if (active) setLoadError(businessAdError(caught, 'Gagal memuatkan senarai ahli.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id, canEdit]);

  // Skrin ini kekal dalam stack navigasi (admin boleh tambah iklan beberapa
  // kali berturutan) — reset borang setiap kali difokus semula supaya iklan
  // seterusnya tidak mewarisi gambar/teks iklan sebelum ini.
  useFocusEffect(
    useCallback(() => {
      setOwnerId(null);
      setPosterUri(null);
      setGambar2Uri(null);
      setGambar3Uri(null);
      setNama('');
      setPenerangan('');
      setCta('');
      setWhatsapp('');
      setDurasi(DEFAULT_DURATION);
      setError(null);
    }, []),
  );

  const chooseInto = async (setUri: (uri: string) => void) => {
    setError(null);
    try {
      const uri = await pickImage();
      if (uri) setUri(uri);
    } catch (caught) {
      setError(businessAdError(caught, 'Gagal memilih gambar.'));
    }
  };

  const handleOwnerChange = (next: string | null) => {
    setOwnerId(next);
    if (!next) return;
    void (async () => {
      try {
        const phone = await fetchMemberPhoneForBusinessAd(next);
        setWhatsapp(phone ?? '');
      } catch {
        // Carian nombor gagal — bukan kritikal, admin boleh taip sendiri.
      }
    })();
  };

  const submit = async () => {
    if (submitting || !adminMember) return;
    setError(null);

    if (!ownerId) return setError('Sila pilih ahli pemilik bisnes.');
    const waNumber = toWhatsAppNumber(whatsapp);
    if (nama.trim().length < 2) return setError('Nama bisnes mesti sekurang-kurangnya 2 aksara.');
    if (!posterUri) return setError('Sila pilih gambar poster.');
    if (!waNumber) return setError('Sila masukkan nombor WhatsApp.');
    const days = Number(durasi);
    if (!Number.isInteger(days) || days < 1 || days > 365) return setError('Durasi mesti nombor bulat 1 hingga 365 hari.');

    setSubmitting(true);
    try {
      // Ketiga-tiga gambar dimuat naik bawah ID ADMIN sendiri — lihat komen
      // besar di atas fail ini (RLS storage menuntut ini, bukan ID ahli dipilih).
      const [url, urlGambar2, urlGambar3] = await Promise.all([
        uploadBusinessImage(adminMember.id, posterUri),
        gambar2Uri ? uploadBusinessImage(adminMember.id, gambar2Uri) : Promise.resolve(null),
        gambar3Uri ? uploadBusinessImage(adminMember.id, gambar3Uri) : Promise.resolve(null),
      ]);
      await submitBusinessAdAdmin({
        member_id: ownerId,
        nama_bisnes: nama.trim(),
        url_poster: url,
        url_gambar_2: urlGambar2,
        url_gambar_3: urlGambar3,
        penerangan: penerangan.trim(),
        teks_cta: cta.trim(),
        no_whatsapp: waNumber,
        durasi_hari: days,
      });
      router.replace('/(app)/admin/semakan-iklan');
    } catch (caught) {
      setError(businessAdError(caught, 'Gagal menghantar iklan. Sila cuba lagi.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (accessLoading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <NoAccessScreen
        title="Tambah Iklan"
        description="Skrin ini khusus untuk admin LAJNAH EKONOMI DAN ASET dan Super Admin dengan kebenaran sunting."
      />
    );
  }

  if (loading) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Lajnah Ekonomi dan Aset"
        title="Tambah Iklan (Admin)"
        subtitle="Bagi pihak ahli — iklan terus aktif, tiada had queue"
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-8 pt-5">
        {!adminMember ? (
          <Notice tone="warn" message="Akaun anda belum dipautkan kepada rekod ahli, jadi iklan tidak boleh dihantar." />
        ) : null}

        {loadError ? <Notice tone="negative" message={loadError} /> : null}

        <Notice
          tone="info"
          message="Iklan yang dihantar di sini terus berstatus AKTIF (bukan Pending) dan tidak dikira dalam had queue/3-iklan setiap ahli."
        />

        <MemberPickerField label="Ahli Pemilik Bisnes" value={ownerId} candidates={candidates} onChange={handleOwnerChange} />

        <ImageUploadRow
          label="Gambar 1 — Utama (dipaparkan di Dashboard)"
          previewUri={posterUri}
          aspectRatio={POSTER_ASPECT_RATIO}
          onChoose={() => void chooseInto(setPosterUri)}
          disabled={submitting}
        />
        <Notice tone="info" message="Reka Gambar 1 pada nisbah 1024×550px (landskap) sebelum dimuat naik." />

        <ImageUploadRow
          label="Gambar 2 (Pilihan)"
          previewUri={gambar2Uri}
          onChoose={() => void chooseInto(setGambar2Uri)}
          onRemove={() => setGambar2Uri(null)}
          disabled={submitting}
        />

        <ImageUploadRow
          label="Gambar 3 (Pilihan)"
          previewUri={gambar3Uri}
          onChoose={() => void chooseInto(setGambar3Uri)}
          onRemove={() => setGambar3Uri(null)}
          disabled={submitting}
        />

        <TextField label="Nama Bisnes" value={nama} onChangeText={setNama} maxLength={80} editable={!submitting} />
        <TextField
          label="Penerangan (pilihan)"
          value={penerangan}
          onChangeText={setPenerangan}
          multiline
          maxLength={1000}
          editable={!submitting}
        />
        <TextField
          label="Teks Butang (pilihan)"
          value={cta}
          onChangeText={setCta}
          placeholder="cth: Tempah Sekarang"
          maxLength={40}
          editable={!submitting}
        />
        <TextField
          label="No. WhatsApp (lalai: nombor ahli dipilih — tukar jika perlu)"
          value={whatsapp}
          onChangeText={setWhatsapp}
          keyboardType="phone-pad"
          editable={!submitting}
        />
        <TextField
          label="Durasi paparan (hari, 1–365)"
          value={durasi}
          onChangeText={setDurasi}
          keyboardType="number-pad"
          editable={!submitting}
        />

        {error ? <Notice tone="negative" message={error} /> : null}

        <Button label="Hantar & Aktifkan" onPress={() => void submit()} loading={submitting} disabled={!adminMember} />
      </View>
    </Screen>
  );
}
