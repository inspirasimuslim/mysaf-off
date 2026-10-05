import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { GenerationChip } from '@/components/ui/generation-chip';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { toMalayError } from '@/lib/errors';
import { fetchMemberDirectory } from '@/lib/members';
import { fetchMbmCouples } from '@/lib/mbm';
import { useGoBack } from '@/lib/navigation';
import type { DirectoryMember, MbmCouple } from '@/types/database';

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; rows: MbmCouple[] }
  | { step: 'gagal'; message: string };

/**
 * Senarai Pasangan MBM — dibuka oleh SEMUA ahli daripada tab Ahli.
 *
 * `list_mbm_couples()` hanya memulangkan pasangan yang pautannya SAH dua hala
 * (kedua-dua belah `spouse_member_id` menunjuk kepada satu sama lain), dan
 * hanya lapan field terhad — NRIC, alamat dan medan sensitif lain tidak
 * pernah sampai ke skrin ini.
 */
export default function AhliMbmScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const [state, setState] = useState<State>({ step: 'memuat' });
  const [directory, setDirectory] = useState<DirectoryMember[]>([]);

  /* Direktori melengkapkan avatar + profil; kegagalan senyap (kad tetap dipapar tanpa gambar). */
  useEffect(() => {
    void fetchMemberDirectory()
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }, []);

  const openProfile = useCallback(
    (nama: string, generasi: string | null) => {
      const match = directory.find((row) => row.full_name === nama);
      router.push({
        pathname: '/(app)/ahli-view',
        params: {
          nama,
          generasi: match?.generasi ?? generasi ?? '',
          emel: match?.email ?? '',
          tel: match?.no_tel ?? '',
          avatar: match?.avatar_url ?? '',
          pekerjaan: match?.status_pekerjaan ?? '',
          perkahwinan: match?.status_perkahwinan ?? '',
        },
      });
    },
    [directory, router],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const rows = await fetchMbmCouples();
        if (active) setState({ step: 'sedia', rows });
      } catch (caught) {
        if (active) {
          setState({ step: 'gagal', message: toMalayError(caught, 'Gagal memuatkan senarai Pasangan MBM.') });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const body = useCallback(() => {
    if (state.step === 'memuat') return <LoadingScreen />;

    if (state.step === 'gagal') {
      return (
        <View className="px-gutter pt-6">
          <Notice tone="negative" message={state.message} />
        </View>
      );
    }

    if (!state.rows.length) {
      return (
        <EmptyState
          icon="heart-outline"
          title="Tiada Pasangan MBM direkodkan"
          description="Pasangan dipaparkan di sini selepas kedua-dua belah dipautkan dalam borang profil masing-masing."
        />
      );
    }

    return (
      <View className="gap-3 px-gutter pb-8 pt-4">
        {state.rows.map((row, index) => (
          <CoupleCard
            key={row.nama_suami + ':' + row.nama_isteri + ':' + index}
            row={row}
            directory={directory}
            onOpen={openProfile}
          />
        ))}
      </View>
    );
  }, [state, directory, openProfile]);

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Direktori"
        title="Pasangan MBM"
        subtitle={state.step === 'sedia' ? state.rows.length + ' pasangan' : undefined}
        onBackPress={goBack}
      />

      {body()}
    </Screen>
  );
}

/** Satu kad setiap pasangan — suami di atas, isteri di bawah (avatar, tekan untuk profil), butiran ringkas di penjuru. */
function CoupleCard({
  row,
  directory,
  onOpen,
}: {
  row: MbmCouple;
  directory: DirectoryMember[];
  onOpen: (nama: string, generasi: string | null) => void;
}) {
  const avatarOf = (nama: string) => directory.find((member) => member.full_name === nama)?.avatar_url ?? null;
  return (
    <View className="gap-3 rounded-card border border-line bg-surface p-4">
      <View className="gap-2">
        <Spouse nama={row.nama_suami} generasi={row.generasi_suami} avatarUrl={avatarOf(row.nama_suami)} onOpen={onOpen} />
        <View className="h-px bg-line" />
        <Spouse nama={row.nama_isteri} generasi={row.generasi_isteri} avatarUrl={avatarOf(row.nama_isteri)} onOpen={onOpen} />
      </View>

      {row.tahun_berkahwin || row.bil_anak !== null ? (
        <View className="gap-1.5 border-t border-line pt-3">
          {row.tahun_berkahwin ? (
            <DetailRow icon="calendar-outline" text={'Berkahwin ' + row.tahun_berkahwin} />
          ) : null}
          {row.bil_anak !== null ? (
            <DetailRow icon="people-outline" text={row.bil_anak + ' orang anak'} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Spouse({
  nama,
  generasi,
  avatarUrl,
  onOpen,
}: {
  nama: string;
  generasi: string | null;
  avatarUrl: string | null;
  onOpen: (nama: string, generasi: string | null) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Buka profil ' + nama}
      onPress={() => onOpen(nama, generasi)}
      className="flex-row items-center gap-3 active:opacity-70">
      <MemberAvatar fullName={nama} avatarUrl={avatarUrl} size={38} />
      <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
        {nama}
      </Text>
      <GenerationChip code={generasi} />
    </Pressable>
  );
}

function DetailRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Ionicons name={icon} size={14} color={Colors.inkFaint} style={{ marginTop: 2 }} />
      <Text className="flex-1 text-sm leading-5 text-ink-muted">{text}</Text>
    </View>
  );
}
