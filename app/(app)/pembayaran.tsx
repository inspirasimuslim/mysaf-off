import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { fetchAdhocPayments } from '@/lib/adhoc-payments';
import { useAuth } from '@/lib/auth-context';
import { fetchMyMemberLinked } from '@/lib/members';
import { fetchPipisSummary, peratusLabel, ringgitPipis, type PipisSummary } from '@/lib/pipis';
import { fetchYuranSummary, ringgit, type YuranSummary } from '@/lib/yuran';
import type { AdhocPaymentType } from '@/types/database';

/**
 * Segala hal wang seorang ahli, di satu tempat.
 *
 * Menggantikan tab Kehadiran yang tidak pernah dibina. Kehadiran sudah pun
 * dijawab di tempat lain — jalur usrah di skrin Utama dan kod QR di tab Scan —
 * manakala wang bertaburan: yuran di dalam skrin Utama, PIPIS di sebelahnya,
 * dan infaq tidak di mana-mana.
 *
 * Tiga bahagian dengan SIFAT yang berbeza, dan itu sengaja kelihatan:
 * dua kad pertama ialah AKAUN ahli itu sendiri (ada nombor, ada status),
 * manakala senarai di bawahnya ialah PAPAN NOTIS (tiada nombor peribadi —
 * hanya arahan cara membayar).
 */
export default function PembayaranScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [yuran, setYuran] = useState<YuranSummary | null>(null);
  const [pipis, setPipis] = useState<PipisSummary | null>(null);
  const [adhoc, setAdhoc] = useState<AdhocPaymentType[]>([]);

  /*
    Kegagalan bacaan MENYEMBUNYIKAN bahagiannya dan bukan memaparkan ralat —
    keputusan yang sama seperti skrin Utama. Ahli yang akaunnya belum dipautkan
    kepada rekod ahli tiada baki untuk dipapar, dan itu keadaan yang sah.
  */
  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const userId = user?.id ?? null;
        if (!userId) return;

        try {
          const member = await fetchMyMemberLinked(userId);
          if (!active || !member) return;

          const [yuranSummary, pipisSummary] = await Promise.all([
            fetchYuranSummary(member.id),
            fetchPipisSummary(member.id),
          ]);

          if (active) {
            setYuran(yuranSummary);
            setPipis(pipisSummary);
          }
        } catch {
          if (active) {
            setYuran(null);
            setPipis(null);
          }
        }
      })();

      void (async () => {
        try {
          const rows = await fetchAdhocPayments();
          if (active) setAdhoc(rows);
        } catch {
          if (active) setAdhoc([]);
        }
      })();

      return () => {
        active = false;
      };
    }, [user?.id]),
  );

  const yuranSettled = yuran !== null && yuran.tertunggak === 0;
  const pipisReached = pipis !== null && pipis.jumlah >= pipis.sasaran;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Kewangan"
        title="Pembayaran"
        subtitle="Yuran, sumbangan dan infaq"
      />

      <View className="gap-8 px-gutter pt-6">
        <View>
          <SectionTitle title="Akaun Anda" />
          <View className="gap-4">
            {/*
              Kad penuh lebar dan bukan dua separuh seperti di skrin Utama. Di
              sana kedua-duanya bersaing dengan enam bahagian lain untuk
              perhatian; di sini merekalah sebab ahli membuka skrin, jadi
              nombornya diberi ruang untuk dibaca.
            */}
            <SummaryCard
              icon={<Ionicons name="calendar-outline" size={16} color="#0F5132" />}
              title="Yuran Tahunan"
              highlight={yuranSettled}
              value={
                yuran === null ? '—' : yuranSettled ? 'Lunas' : ringgit(yuran.tertunggak)
              }
              caption={
                yuran === null
                  ? 'Rekod belum dimuatkan.'
                  : yuranSettled
                    ? yuran.kredit > 0
                      ? 'Tiada tunggakan. Kredit ' + ringgit(yuran.kredit) + '.'
                      : 'Tiada tunggakan. Terima kasih.'
                    : 'Tertunggak — termasuk baki permulaan dan yuran tahunan.'
              }
              onPress={() => router.push('/(app)/yuran')}
            />

            <SummaryCard
              icon={<MaterialCommunityIcons name="sprout" size={16} color="#0F5132" />}
              title="Sumbangan PIPIS ASET"
              highlight={pipisReached}
              value={
                pipis === null
                  ? '—'
                  : ringgitPipis(pipis.jumlah) + ' (' + peratusLabel(pipis.peratus) + ')'
              }
              caption={
                pipis === null
                  ? 'Rekod belum dimuatkan.'
                  : pipis.jumlah > pipis.sasaran
                    ? 'Lebih RM5,000 — terima kasih!'
                    : pipisReached
                      ? 'Cukup RM5,000 — terima kasih!'
                      : 'Baki ke sasaran ' + ringgitPipis(pipis.sasaran - pipis.jumlah) + '.'
              }
              onPress={() => router.push('/(app)/pipis')}
            />
          </View>
        </View>

        <View className="pb-8">
          <SectionTitle title="Pembayaran & Infaq Lain" />

          {adhoc.length === 0 ? (
            <EmptyState
              icon="qr-code-outline"
              title="Tiada pembayaran lain"
              description="Tabung dan infaq yang dibuka oleh Bendahari akan muncul di sini."
            />
          ) : (
            <View className="gap-2">
              {adhoc.map((row) => (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  accessibilityLabel={row.title}
                  onPress={() =>
                    router.push({ pathname: '/(app)/adhoc-payment-info', params: { id: row.id } })
                  }
                  className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-4 active:opacity-70">
                  <View className="h-11 w-11 items-center justify-center rounded-pill bg-primary-soft">
                    <Ionicons name="qr-code-outline" size={20} color="#0F5132" />
                  </View>

                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
                      {row.title}
                    </Text>
                    {row.description ? (
                      <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
                        {row.description}
                      </Text>
                    ) : null}
                  </View>

                  {/*
                    Baris tidak aktif hanya boleh dilihat oleh Bendahari — RLS
                    menapisnya untuk ahli biasa. Lencana itu memberitahunya
                    bahawa dia sedang melihat sesuatu yang orang lain tidak nampak.
                  */}
                  {row.is_active ? null : <Badge label="Tidak aktif" tone="neutral" />}
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

/**
 * Kad ringkasan satu modul.
 *
 * Kad sentiasa neutral. Status selesai ditandakan dengan tick hijau kecil di
 * sebelah nilai, bukan dengan menghijaukan seluruh kad. Kotak ikon sama saiz
 * dan bentuk dengan kad di skrin Utama (h-8 w-8, sudut xl).
 */
function SummaryCard({
  icon,
  title,
  value,
  caption,
  highlight,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  caption: string;
  /** Selesai/lunas — papar tick hijau. */
  highlight: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} className="active:opacity-70">
      <Card tone="surface">
        <View className="flex-row items-center gap-3">
          <View className="h-8 w-8 items-center justify-center rounded-xl bg-primary-soft">{icon}</View>
          <Text className="flex-1 text-lg font-bold text-ink" numberOfLines={2}>
            {title}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </View>

        <View className="mt-3 flex-row items-center gap-2">
          <Text className="text-2xl font-bold text-ink">{value}</Text>
          {highlight ? <Ionicons name="checkmark-circle" size={22} color="#2E9E63" /> : null}
        </View>
        <Text className="mt-1 text-sm text-ink-muted">{caption}</Text>
      </Card>
    </Pressable>
  );
}
