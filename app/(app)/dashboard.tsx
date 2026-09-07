import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { UsrahStrip } from '@/components/usrah-strip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { StatCard } from '@/components/ui/stat-card';
import { Colors } from '@/constants/theme';
import { displayName, useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions';

/** Em dash sebagai placeholder nilai yang belum ada. */
const DASH = '—';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { isAdmin } = usePermissions();

  const [banner, setBanner] = useState<Banner>(null);

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Assalamualaikum,"
        title={displayName(user)}
        subtitle={user?.email ?? undefined}
        /*
          Pintu masuk pentadbiran tidak wujud langsung dalam pokok komponen
          untuk ahli biasa — bukan sekadar disembunyikan. Ikon perisai sengaja
          berbeza daripada gear Tetapan di Profil supaya dua pintu itu tidak
          dikelirukan.
        */
        action={
          isAdmin()
            ? { icon: 'shield-half-outline', label: 'Hub Admin', onPress: () => router.push('/(app)/admin') }
            : undefined
        }
        onBellPress={() => setBanner({ tone: 'info', message: 'Tiada notifikasi baharu buat masa ini.' })}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {/* Ringkasan utama - satu maklumat besar sahaja. */}
        <Card tone="primary">
          <Text className="text-sm text-white/70">Kehadiran bulan ini</Text>
          <Text className="mt-2 text-stat-lg font-bold text-white/50">{DASH}</Text>
          <Text className="mt-2 text-sm text-white/70">Modul kehadiran belum disambung ke pangkalan data.</Text>
        </Card>

        {/*
          Pintasan Pantas — satu tindakan sahaja buat masa ini, dan sengaja
          begitu. Mengimbas kod QR ialah satu-satunya perkara yang setiap ahli
          buat pada skrin ini secara berkala, jadi ia mendapat butang penuh
          lebar dan bukan satu petak dalam grid ikon yang perlu dicari.
        */}
        <View>
          <SectionTitle title="Pintasan Pantas" caption="Rekod kehadiran usrah dengan mengimbas kod QR program." />
          <Button
            label="Scan QR"
            icon={<Ionicons name="qr-code-outline" size={20} color={Colors.white} />}
            onPress={() => router.push('/(app)/usrah-scan')}
          />
        </View>

        <UsrahStrip userId={user?.id ?? null} />

        <View>
          <SectionTitle title="Ringkasan" caption="Data akan dikemas kini secara automatik." />
          <View className="gap-4">
            <View className="flex-row gap-4">
              <StatCard className="flex-1" tone="positive" muted value={DASH} label="Hadir" />
              <StatCard className="flex-1" tone="negative" muted value={DASH} label="Tidak hadir" />
            </View>
            <View className="flex-row gap-4">
              <StatCard className="flex-1" tone="warn" muted value={DASH} label="Lewat" />
              <StatCard className="flex-1" tone="info" muted value={DASH} label="Aktiviti" />
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}
