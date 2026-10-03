import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

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
  uploadBusinessPoster,
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
 * Poster dimuat naik DAHULU ke `business-ads/<member_id>_<epoch>.jpg`
 * (dikecilkan ke 1080px JPEG sebelum muat naik, jadi jauh di bawah had 5MB),
 * kemudian `submit_business_ad()`/`resubmit_business_ad()` menyemak had dan
 * mencipta/mengemaskini baris. Jika RPC menolak (queue penuh, had 3/ahli),
 * fail yang sudah dimuat naik tertinggal tanpa baris — sama kesan seperti
 * muat naik lain yang dibatalkan; ahli tidak boleh memadamnya semula kerana
 * nama fail mengandungi epoch.
 *
 * Mod sunting: gambar/nama/penerangan/cta/whatsapp iklan ditolak diprafill.
 * Poster SEDIA ADA (`existingPosterUrl`, URL jauh) dipaparkan terus — ahli
 * hanya perlu pilih gambar baharu (`posterUri`, tempatan) jika mahu
 * menukarnya; jika tidak, poster asal dikekalkan tanpa muat naik semula.
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
      setNama('');
      setPenerangan('');
      setCta('');
      setError(null);
    }, [id]),
  );

  const choose = async (source: 'galeri' | 'kamera') => {
    setError(null);
    try {
      const uri = source === 'kamera' ? await takePhoto() : await pickImage();
      if (uri) setPosterUri(uri);
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
      const url = posterUri ? await uploadBusinessPoster(member.id, posterUri) : (existingPosterUrl as string);
      const input = {
        nama_bisnes: nama.trim(),
        url_poster: url,
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

        {previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={{ width: '100%', aspectRatio: POSTER_ASPECT_RATIO, borderRadius: 20 }}
            contentFit="contain"
            accessibilityLabel="Pratonton poster"
          />
        ) : null}

        <Notice tone="info" message="Reka poster anda pada nisbah 1024×550px (landskap) sebelum dimuat naik supaya kelihatan penuh dan tidak terpotong." />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              label={previewUri ? 'Tukar Gambar' : 'Pilih Gambar Poster'}
              variant="secondary"
              onPress={() => void choose('galeri')}
              disabled={submitting}
            />
          </View>
          {Platform.OS !== 'web' ? (
            <View className="flex-1">
              <Button
                label="Ambil Gambar"
                variant="secondary"
                onPress={() => void choose('kamera')}
                disabled={submitting}
              />
            </View>
          ) : null}
        </View>

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
