import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ImageUploadRow } from '@/components/business-ad-image-slot';
import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/lib/auth-context';
import {
  businessAdError,
  fetchBusinessAdAdmin,
  POSTER_ASPECT_RATIO,
  updateBusinessAdAdmin,
  uploadBusinessImage,
  type AdminBusinessAd,
} from '@/lib/business-ads';
import { EKONOMI_DEPARTMENT, useDepartmentAccess } from '@/lib/department-access';
import { pickImage } from '@/lib/image-upload';
import { fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { toWhatsAppNumber } from '@/lib/phone';
import type { Member } from '@/types/database';

/**
 * Admin menyunting iklan bisnes mana-mana status (migration 146) — contohnya
 * menukar poster atau maklumat iklan yang sedang dipaparkan.
 *
 * Status dan tempoh paparan TIDAK berubah (iklan aktif kekal aktif dalam
 * carousel). Gambar baharu dimuat naik bawah ID ADMIN sendiri — storage RLS
 * menuntutnya; gambar yang tidak disentuh kekal URL asalnya. Dibuka daripada
 * butang "Sunting Iklan" di `iklan-detail.tsx`.
 */
export default function AdminIklanEditScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const { loading: accessLoading, canEdit } = useDepartmentAccess(EKONOMI_DEPARTMENT);

  const [ad, setAd] = useState<AdminBusinessAd | null>(null);
  const [adminMember, setAdminMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Nilai gambar: URL jauh (tidak diubah) atau URI tempatan (pilihan baharu).
  const [posterUri, setPosterUri] = useState<string | null>(null);
  const [gambar2Uri, setGambar2Uri] = useState<string | null>(null);
  const [gambar3Uri, setGambar3Uri] = useState<string | null>(null);
  const [nama, setNama] = useState('');
  const [penerangan, setPenerangan] = useState('');
  const [cta, setCta] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !user?.id || !canEdit) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const [row, me] = await Promise.all([fetchBusinessAdAdmin(id), fetchMyMemberLinked(user.id)]);
        if (!active) return;
        setAdminMember(me);
        setAd(row);
        if (row) {
          setPosterUri(row.url_poster);
          setGambar2Uri(row.url_gambar_2 ?? null);
          setGambar3Uri(row.url_gambar_3 ?? null);
          setNama(row.nama_bisnes);
          setPenerangan(row.penerangan ?? '');
          setCta(row.teks_cta ?? '');
          setWhatsapp(row.no_whatsapp);
        }
      } catch (caught) {
        if (active) setLoadError(businessAdError(caught, 'Gagal memuatkan iklan.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, user?.id, canEdit]);

  const chooseInto = async (setUri: (uri: string) => void) => {
    setError(null);
    try {
      const uri = await pickImage();
      if (uri) setUri(uri);
    } catch (caught) {
      setError(businessAdError(caught, 'Gagal memilih gambar.'));
    }
  };

  const save = async () => {
    if (!ad || !adminMember || saving) return;
    setError(null);

    const waNumber = toWhatsAppNumber(whatsapp);
    if (nama.trim().length < 2) return setError('Nama bisnes mesti sekurang-kurangnya 2 aksara.');
    if (!posterUri) return setError('Poster tidak boleh dikosongkan.');
    if (!waNumber) return setError('Sila masukkan nombor WhatsApp yang sah.');

    setSaving(true);
    try {
      // Hanya gambar yang BERUBAH dimuat naik; yang sama dengan URL asal dihantar semula apa adanya.
      const resolve = (uri: string | null, original: string | null | undefined) =>
        !uri ? Promise.resolve(null) : uri === original ? Promise.resolve(uri) : uploadBusinessImage(adminMember.id, uri);
      const [url, urlGambar2, urlGambar3] = await Promise.all([
        resolve(posterUri, ad.url_poster) as Promise<string>,
        resolve(gambar2Uri, ad.url_gambar_2),
        resolve(gambar3Uri, ad.url_gambar_3),
      ]);

      await updateBusinessAdAdmin(
        ad.id,
        {
          nama_bisnes: nama.trim(),
          url_poster: url,
          url_gambar_2: urlGambar2,
          url_gambar_3: urlGambar3,
          penerangan: penerangan.trim(),
          teks_cta: cta.trim(),
          no_whatsapp: waNumber,
        },
        { url_poster: ad.url_poster, url_gambar_2: ad.url_gambar_2, url_gambar_3: ad.url_gambar_3 },
      );
      router.back();
    } catch (caught) {
      setError(businessAdError(caught, 'Gagal menyimpan perubahan. Sila cuba lagi.'));
    } finally {
      setSaving(false);
    }
  };

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <NoAccessScreen
        title="Sunting Iklan"
        description="Skrin ini khusus untuk admin LAJNAH EKONOMI DAN ASET dan Super Admin dengan kebenaran sunting."
      />
    );
  }

  if (loadError || !ad) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Sunting Iklan" onBackPress={goBack} />
        <View className="px-gutter">
          {loadError ? (
            <Notice tone="negative" message={loadError} />
          ) : (
            <EmptyState icon="storefront-outline" title="Iklan tidak dijumpai" description="Iklan ini mungkin telah dipadam." />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Lajnah Ekonomi dan Aset"
        title="Sunting Iklan"
        subtitle={ad.nama_pemilik}
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-8 pt-5">
        {!adminMember ? (
          <Notice tone="warn" message="Akaun anda belum dipautkan kepada rekod ahli, jadi gambar baharu tidak boleh dimuat naik." />
        ) : null}

        <Notice
          tone="info"
          message="Status dan tempoh paparan iklan tidak berubah. Iklan yang sedang aktif kekal aktif dengan maklumat baharu."
        />

        <ImageUploadRow
          label="Gambar 1 — Utama (dipaparkan di Dashboard)"
          previewUri={posterUri}
          aspectRatio={POSTER_ASPECT_RATIO}
          onChoose={() => void chooseInto(setPosterUri)}
          disabled={saving}
        />
        <ImageUploadRow
          label="Gambar 2 (Pilihan)"
          previewUri={gambar2Uri}
          onChoose={() => void chooseInto(setGambar2Uri)}
          onRemove={() => setGambar2Uri(null)}
          disabled={saving}
        />
        <ImageUploadRow
          label="Gambar 3 (Pilihan)"
          previewUri={gambar3Uri}
          onChoose={() => void chooseInto(setGambar3Uri)}
          onRemove={() => setGambar3Uri(null)}
          disabled={saving}
        />

        <TextField label="Nama Bisnes" value={nama} onChangeText={setNama} maxLength={80} editable={!saving} />
        <TextField
          label="Penerangan (pilihan)"
          value={penerangan}
          onChangeText={setPenerangan}
          multiline
          maxLength={1000}
          editable={!saving}
        />
        <TextField
          label="Teks Butang (pilihan)"
          value={cta}
          onChangeText={setCta}
          placeholder="cth: Tempah Sekarang"
          maxLength={40}
          editable={!saving}
        />
        <TextField
          label="No. WhatsApp"
          value={whatsapp}
          onChangeText={setWhatsapp}
          keyboardType="phone-pad"
          editable={!saving}
        />

        {error ? <Notice tone="negative" message={error} /> : null}

        <Button label="Simpan Perubahan" onPress={() => void save()} loading={saving} disabled={!adminMember} />
      </View>
    </Screen>
  );
}
