import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { OptionalImageSlot } from '@/components/business-ad-image-slot';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/lib/auth-context';
import {
  MAX_ADS_PER_MEMBER,
  POSTER_ASPECT_RATIO,
  businessAdError,
  countMyActiveAds,
  fetchBusinessAd,
  fetchBusinessDirectory,
  resubmitBusinessAd,
  submitBusinessAd,
  uploadBusinessImage,
} from '@/lib/business-ads';
import { pickImage, takePhoto } from '@/lib/image-upload';
import { fetchMyMemberLinked } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { toWhatsAppNumber } from '@/lib/phone';
import type { Member } from '@/types/database';

/**
 * Hantar iklan bisnes untuk semakan Lajnah Ekonomi — ATAU sunting & hantar
 * semula iklan DITOLAK sendiri (dibuka dengan param `id` daripada
 * `bisnes-info.tsx`).
 *
 * Sehingga 3 gambar setiap iklan (keputusan 2026-10-03, migration 107):
 * Gambar 1 (poster) WAJIB, khas untuk paparan dashboard/carousel/"Semua
 * Iklan" — nisbah tetap `POSTER_ASPECT_RATIO` (1024×550). Gambar 2/3
 * PILIHAN, bebas orientation, hanya dipaparkan dalam galeri skrin detail
 * (`bisnes-info.tsx`/`admin/iklan-detail.tsx`) — TIDAK PERNAH pada
 * dashboard/carousel. Setiap gambar dimuat naik DAHULU ke
 * `business-ads/<member_id>_<epoch>.jpg` (dikecilkan JPEG sebelum muat
 * naik), kemudian `submit_business_ad()`/`resubmit_business_ad()` menyemak
 * had dan mencipta/mengemaskini SATU baris dengan ketiga-tiga URL. Jika RPC
 * menolak (queue penuh, had 3/ahli), fail yang sudah dimuat naik tertinggal
 * tanpa baris — sama kesan seperti muat naik lain yang dibatalkan; ahli
 * tidak boleh memadamnya semula kerana nama fail mengandungi epoch.
 *
 * Mod sunting: gambar/nama/penerangan/cta/whatsapp iklan ditolak diprafill.
 * Gambar SEDIA ADA (`existing...Url`, URL jauh) dipaparkan terus — ahli
 * hanya perlu pilih gambar baharu (`...Uri`, tempatan) jika mahu
 * menukarnya; jika tidak, gambar asal dikekalkan tanpa muat naik semula.
 * Membuang Gambar 2/3 sedia ada (butang "Buang Gambar Ini") menghantar
 * `null` eksplisit supaya ia benar-benar dibuang, bukan kekal tersimpan.
 */
export default function BisnesUploadScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditMode = !!id;

  const [member, setMember] = useState<Member | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [posterUri, setPosterUri] = useState<string | null>(null);
  const [existingPosterUrl, setExistingPosterUrl] = useState<string | null>(null);
  const [gambar2Uri, setGambar2Uri] = useState<string | null>(null);
  const [existingGambar2Url, setExistingGambar2Url] = useState<string | null>(null);
  const [gambar3Uri, setGambar3Uri] = useState<string | null>(null);
  const [existingGambar3Url, setExistingGambar3Url] = useState<string | null>(null);
  const [nama, setNama] = useState('');
  const [penerangan, setPenerangan] = useState('');
  const [cta, setCta] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const [me, directory, editRow] = await Promise.all([
          fetchMyMemberLinked(user.id),
          fetchBusinessDirectory(),
          id ? fetchBusinessAd(id) : Promise.resolve(null),
        ]);
        if (!active) return;
        setMember(me);
        setActiveCount(countMyActiveAds(directory));

        if (id) {
          if (!editRow || !editRow.is_mine || editRow.status_paparan !== 'ditolak') {
            setLoadFailed(true);
          } else {
            setNama(editRow.nama_bisnes);
            setPenerangan(editRow.penerangan ?? '');
            setCta(editRow.teks_cta ?? '');
            setWhatsapp(editRow.no_whatsapp);
            setExistingPosterUrl(editRow.url_poster);
            setExistingGambar2Url(editRow.url_gambar_2 ?? null);
            setExistingGambar3Url(editRow.url_gambar_3 ?? null);
          }
        } else {
          setWhatsapp(me?.no_tel ?? '');
        }
      } catch (caught) {
        if (active) setError(businessAdError(caught, 'Gagal memuatkan maklumat anda.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id, id]);

  // Skrin ini boleh kekal dalam stack navigasi dan difokus semula (cth. ahli
  // menghantar iklan pertama, `router.replace` ke Bisnes Ahli, kemudian tekan
  // "Upload Bisnes" semula) — reset borang setiap kali difokus supaya tiada
  // gambar/teks daripada iklan pertama tertinggal pada iklan kedua. TIDAK
  // berkenaan dalam mod sunting (`id` hadir) — borang itu diprafill sekali
  // oleh effect di atas dan tidak boleh dikosongkan semula setiap fokus.
  useFocusEffect(
    useCallback(() => {
      if (id) return;
      setPosterUri(null);
      setGambar2Uri(null);
      setGambar3Uri(null);
      setNama('');
      setPenerangan('');
      setCta('');
      setError(null);
    }, [id]),
  );

  const chooseInto = async (source: 'galeri' | 'kamera', setUri: (uri: string) => void) => {
    setError(null);
    try {
      const uri = source === 'kamera' ? await takePhoto() : await pickImage();
      if (uri) setUri(uri);
    } catch (caught) {
      setError(businessAdError(caught, 'Gagal memilih gambar.'));
    }
  };

  const atLimit = !isEditMode && activeCount >= MAX_ADS_PER_MEMBER;

  const submit = async () => {
    if (submitting || !member) return;
    setError(null);

    const waNumber = toWhatsAppNumber(whatsapp);
    if (nama.trim().length < 2) return setError('Nama bisnes mesti sekurang-kurangnya 2 aksara.');
    if (!posterUri && !existingPosterUrl) return setError('Sila pilih gambar poster.');
    if (!waNumber) return setError('Sila masukkan nombor WhatsApp.');

    setSubmitting(true);
    try {
      // Muat naik gambar yang ditukar/ditambah dahulu; gambar sedia ada yang
      // tidak disentuh dikekalkan terus (tiada muat naik semula), dan gambar
      // 2/3 yang dibuang (butang "Buang Gambar Ini") menghantar `null`
      // eksplisit — lihat komen besar di atas fail ini.
      const [url, urlGambar2, urlGambar3] = await Promise.all([
        posterUri ? uploadBusinessImage(member.id, posterUri) : Promise.resolve(existingPosterUrl as string),
        gambar2Uri ? uploadBusinessImage(member.id, gambar2Uri) : Promise.resolve(existingGambar2Url),
        gambar3Uri ? uploadBusinessImage(member.id, gambar3Uri) : Promise.resolve(existingGambar3Url),
      ]);
      const input = {
        nama_bisnes: nama.trim(),
        url_poster: url,
        url_gambar_2: urlGambar2,
        url_gambar_3: urlGambar3,
        penerangan: penerangan.trim(),
        teks_cta: cta.trim(),
        no_whatsapp: waNumber,
      };
      if (id) {
        await resubmitBusinessAd(id, input);
      } else {
        await submitBusinessAd(input);
      }
      // `replace` supaya Back tidak kembali ke borang yang sudah dihantar.
      router.replace('/(app)/bisnes-ahli');
    } catch (caught) {
      setError(businessAdError(caught, 'Gagal menghantar iklan. Sila cuba lagi.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen />;

  if (isEditMode && loadFailed) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Edit Iklan" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="storefront-outline"
            title="Tidak boleh disunting"
            description="Hanya iklan anda sendiri yang berstatus Ditolak boleh disunting dan dihantar semula."
          />
        </View>
      </Screen>
    );
  }

  const previewUri = posterUri ?? existingPosterUrl;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Bisnes Ahli"
        title={isEditMode ? 'Edit Iklan' : 'Upload Bisnes'}
        subtitle="Iklan disemak Lajnah Ekonomi sebelum dipaparkan"
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-8 pt-5">
        {!member ? (
          <Notice tone="warn" message="Akaun anda belum dipautkan kepada rekod ahli, jadi iklan tidak boleh dihantar." />
        ) : null}

        {atLimit ? (
          <Notice
            tone="warn"
            message={
              'Anda sudah ada ' +
              MAX_ADS_PER_MEMBER +
              ' iklan menunggu/aktif (had setiap ahli). Tunggu salah satu tamat atau disemak sebelum menghantar yang baharu.'
            }
          />
        ) : (
          <Notice
            tone="info"
            message={
              isEditMode
                ? 'Hantar semula akan menukar status iklan ini kembali kepada Pending untuk disemak semula.'
                : 'Iklan baharu berstatus Pending sehingga diluluskan. Had: 3 iklan menunggu/aktif setiap ahli.'
            }
          />
        )}

        <Text className="text-sm font-semibold text-ink">Gambar 1 — Utama (dipaparkan di Dashboard)</Text>

        {previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={{ width: '100%', aspectRatio: POSTER_ASPECT_RATIO, borderRadius: 20 }}
            contentFit="contain"
            accessibilityLabel="Pratonton poster"
          />
        ) : null}

        <Notice tone="info" message="Reka Gambar 1 pada nisbah 1024×550px (landskap) sebelum dimuat naik — gambar ini sahaja dipaparkan di Dashboard & carousel, jadi kelihatan penuh dan tidak terpotong." />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              label={previewUri ? 'Tukar Gambar' : 'Pilih Gambar Utama'}
              variant="secondary"
              onPress={() => void chooseInto('galeri', setPosterUri)}
              disabled={submitting}
            />
          </View>
          {Platform.OS !== 'web' ? (
            <View className="flex-1">
              <Button
                label="Ambil Gambar"
                variant="secondary"
                onPress={() => void chooseInto('kamera', setPosterUri)}
                disabled={submitting}
              />
            </View>
          ) : null}
        </View>

        <OptionalImageSlot
          label="Gambar 2 — Pilihan (bebas orientation)"
          previewUri={gambar2Uri ?? existingGambar2Url}
          onChoose={() => void chooseInto('galeri', setGambar2Uri)}
          onTakePhoto={Platform.OS !== 'web' ? () => void chooseInto('kamera', setGambar2Uri) : undefined}
          onRemove={() => {
            setGambar2Uri(null);
            setExistingGambar2Url(null);
          }}
          disabled={submitting}
        />

        <OptionalImageSlot
          label="Gambar 3 — Pilihan (bebas orientation)"
          previewUri={gambar3Uri ?? existingGambar3Url}
          onChoose={() => void chooseInto('galeri', setGambar3Uri)}
          onTakePhoto={Platform.OS !== 'web' ? () => void chooseInto('kamera', setGambar3Uri) : undefined}
          onRemove={() => {
            setGambar3Uri(null);
            setExistingGambar3Url(null);
          }}
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
          label="No. WhatsApp"
          value={whatsapp}
          onChangeText={setWhatsapp}
          keyboardType="phone-pad"
          editable={!submitting}
        />

        {error ? <Notice tone="negative" message={error} /> : null}

        <Button
          label={isEditMode ? 'Hantar Semula' : 'Hantar untuk Semakan'}
          onPress={() => void submit()}
          loading={submitting}
          disabled={atLimit || !member}
        />
      </View>
    </Screen>
  );
}
