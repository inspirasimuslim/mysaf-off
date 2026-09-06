import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ActionRow } from '@/components/ui/action-row';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { useMemberAccess } from '@/lib/department-access';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';

/**
 * Hub Admin — satu-satunya pintu masuk ke panel pentadbiran.
 *
 * Skrin ini TIDAK memperkenalkan peraturan akses baharu. Setiap kad hanya
 * mengulangi semakan yang sudah dikuatkuasakan oleh skrin destinasinya:
 * skrin Super Admin menyemak `isSuperAdmin()` sendiri, dan modul ahli menyemak
 * kebenaran department melalui `useMemberAccess()`. Menyembunyikan kad di sini
 * hanyalah supaya pengguna tidak menemui pintu yang akan menolaknya — RLS di
 * Supabase tetap penentu muktamad.
 */
export default function AdminHubScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { isSuperAdmin } = usePermissions();
  const memberAccess = useMemberAccess();

  const superAdmin = isSuperAdmin();
  const nothingAvailable = !superAdmin && !memberAccess.canView;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Pentadbiran"
        title="Hub Admin"
        subtitle="Pilih bahagian yang ingin diurus"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {/*
          Ketiga-tiga skrin ini menolak bukan-Super Admin dengan skrin "Tiada
          akses" mereka sendiri (`departments.tsx` termasuk — ia menyemak
          `isSuperAdmin()` sebelum memapar senarai). Kad disembunyikan supaya
          admin department tidak dihantar ke pintu yang pasti menolaknya.
        */}
        {superAdmin ? (
          <View>
            <SectionTitle title="Organisasi" caption="Struktur department dan pemegang jawatan." />
            <View className="gap-4">
              <ActionRow
                icon="business-outline"
                title="Department"
                subtitle="Tambah, aktif/nonaktif dan padam department"
                onPress={() => router.push('/(app)/admin/departments')}
              />

              <ActionRow
                icon="shield-outline"
                title="Lantik Admin"
                subtitle="Lantik admin dan tetapkan kebenaran department"
                onPress={() => router.push('/(app)/admin/admins')}
              />

              <ActionRow
                icon="shield-checkmark-outline"
                title="Super Admin"
                subtitle="Lantik atau turunkan pangkat Super Admin"
                onPress={() => router.push('/(app)/admin/super-admins')}
              />
            </View>
          </View>
        ) : null}

        {/*
          Modul ahli dimiliki oleh JABATAN DATA & SUMBER MANUSIA, bukan oleh
          peranan Super Admin — jadi ia muncul untuk sesiapa yang memegang
          kebenaran department itu, termasuk admin biasa.
        */}
        {memberAccess.canView ? (
          <View>
            <SectionTitle title="Data & Sumber Manusia" caption="Urus rekod keahlian." />
            <View className="gap-4">
              <ActionRow
                icon="people-outline"
                title="Senarai Ahli"
                subtitle={
                  memberAccess.canEdit
                    ? 'Cari, semak dan sunting rekod ahli'
                    : 'Cari dan semak rekod ahli (paparan sahaja)'
                }
                onPress={() => router.push('/(app)/admin/ahli-list')}
              />

              {memberAccess.canEdit ? (
                <ActionRow
                  icon="cloud-upload-outline"
                  title="Muat Naik Ahli"
                  subtitle="Import senarai ahli dari fail Excel"
                  onPress={() => router.push('/(app)/admin/ahli-upload')}
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {/*
          Admin tanpa sebarang kebenaran department masih melepasi guard
          `admin/_layout.tsx`, jadi hub boleh berakhir kosong — beritahu sebabnya
          dan bukan biarkan skrin lompang.
        */}
        {nothingAvailable ? (
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada bahagian tersedia"
            description="Akaun anda belum diberikan kebenaran pada mana-mana department. Hubungi Super Admin untuk capaian."
          />
        ) : null}
      </View>
    </Screen>
  );
}
