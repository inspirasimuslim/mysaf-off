import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Colors } from '@/constants/theme';
import { useGoBack } from '@/lib/navigation';
import { toWhatsAppNumber } from '@/lib/phone';
import {
  directoryPekerjaanLabel,
  directoryPerkahwinanLabel,
  generationLabel,
  type StatusPekerjaan,
  type StatusPerkahwinan,
} from '@/types/database';

const AVATAR_SIZE = 88;

/**
 * Paparan ahli untuk pengguna tanpa akses admin.
 *
 * Data datang melalui parameter laluan dan bukan bacaan baharu: pemanggil sudah
 * memegang kelapan-lapan medan direktori, jadi membacanya semula hanya menambah
 * permintaan tanpa mendedahkan apa-apa yang lebih. Kerana itu juga skrin ini
 * tidak boleh memapar apa-apa di luar direktori — tiada NRIC, alamat mahupun
 * pendapatan untuk dipapar walaupun tersilap diminta.
 *
 * Paparan sahaja: tiada borang, tiada butang simpan.
 */
export default function AhliViewScreen() {
  const goBack = useGoBack();
  const params = useLocalSearchParams<{
    nama?: string;
    generasi?: string;
    emel?: string;
    tel?: string;
    avatar?: string;
    pekerjaan?: string;
    perkahwinan?: string;
  }>();

  const fullName = params.nama?.trim() || 'Ahli';
  const generasi = params.generasi?.trim() || null;
  const email = params.emel?.trim() || null;
  const phone = params.tel?.trim() || null;
  const avatarUrl = params.avatar?.trim() || null;
  const pekerjaan = (params.pekerjaan?.trim() || null) as StatusPekerjaan | null;
  const perkahwinan = (params.perkahwinan?.trim() || null) as StatusPerkahwinan | null;

  const whatsApp = toWhatsAppNumber(phone);

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Direktori" title="Ahli" onBackPress={goBack} />

      <View className="gap-6 px-gutter pt-6">
        <Card>
          <View className="items-center gap-3">
            <MemberAvatar fullName={fullName} avatarUrl={avatarUrl} size={AVATAR_SIZE} />
            <Text className="text-center text-xl font-bold text-ink">{fullName}</Text>
            <Text className="text-sm text-ink-muted">{generationLabel(generasi)}</Text>
          </View>
        </Card>

        <View>
          <SectionTitle title="Hubungi" />
          <View className="gap-4">
            <InfoRow icon="mail-outline" label="Emel" value={email} />

            <InfoRow icon="call-outline" label="No. telefon" value={phone}>
              {/*
                Butang hanya muncul bila nombor benar-benar boleh dihubungi —
                butang mati yang membuka pautan rosak lebih mengelirukan
                daripada tiada butang langsung.
              */}
              {whatsApp ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'WhatsApp ' + fullName}
                  hitSlop={8}
                  onPress={() => void Linking.openURL('https://wa.me/' + whatsApp)}
                  className="h-10 w-10 items-center justify-center rounded-pill bg-positive-soft active:opacity-70">
                  <Ionicons name="logo-whatsapp" size={20} color={Colors.positive} />
                </Pressable>
              ) : null}
            </InfoRow>
          </View>
        </View>

        <View className="pb-8">
          <SectionTitle title="Maklumat Ringkas" />
          <View className="gap-4">
            <InfoRow icon="briefcase-outline" label="Status pekerjaan" value={directoryPekerjaanLabel(pekerjaan)} />
            <InfoRow icon="heart-outline" label="Status perkahwinan" value={directoryPerkahwinanLabel(perkahwinan)} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

function InfoRow({
  icon,
  label,
  value,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-4 rounded-card border border-line bg-surface p-card">
      <View className="h-11 w-11 items-center justify-center rounded-pill bg-primary-soft">
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>

      <View className="flex-1">
        <Text className="text-sm text-ink-muted">{label}</Text>
        <Text className={`mt-0.5 text-base font-semibold ${value ? 'text-ink' : 'text-ink-faint'}`}>
          {value || '—'}
        </Text>
      </View>

      {children}
    </View>
  );
}
