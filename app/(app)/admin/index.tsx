import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ActionRow } from '@/components/ui/action-row';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import {
  useMemberAccess,
  usePipisAccess,
  useProgramAccess,
  useUsrahAccess,
  useYuranAccess,
} from '@/lib/department-access';
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
  const usrahAccess = useUsrahAccess();
  const programAccess = useProgramAccess();
  const yuranAccess = useYuranAccess();
  const pipisAccess = usePipisAccess();

  const superAdmin = isSuperAdmin();
  const nothingAvailable =
    !superAdmin &&
    !memberAccess.canView &&
    !usrahAccess.canView &&
    !programAccess.canView &&
    !yuranAccess.canView &&
    !pipisAccess.canView;

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
                icon="layers-outline"
                title="Generasi"
                subtitle="Tambah, aktif/nonaktif dan padam generasi"
                onPress={() => router.push('/(app)/admin/generasi')}
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

              {/*
                Bukan di bawah "Data & Sumber Manusia" walaupun ia menyentuh
                rekod ahli: operasi ini mencipta AKAUN secara pukal dengan kata
                laluan yang diketahui umum, dan itu keputusan peringkat
                organisasi, bukan kerja penyelenggaraan rekod.
              */}
              <ActionRow
                icon="key-outline"
                title="Provision Akaun Ahli"
                subtitle="Cipta akaun log masuk untuk ahli yang belum ada akaun"
                onPress={() => router.push('/(app)/admin/provision-accounts')}
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
          Modul usrah dimiliki oleh LAJNAH TARBIAH — department yang berbeza
          daripada modul ahli di atas, jadi seorang admin boleh melihat satu
          bahagian tanpa yang satu lagi.
        */}
        {usrahAccess.canView ? (
          <View>
            <SectionTitle title="Tarbiah" caption="Urus rekod kehadiran usrah." />
            <View className="gap-4">
              <ActionRow
                icon="qr-code-outline"
                title="Program Usrah"
                subtitle={
                  usrahAccess.canEdit
                    ? 'Cipta sesi usrah, jana kod QR dan muat turun laporan tahunan'
                    : 'Semak sesi usrah dan muat turun laporan (paparan sahaja)'
                }
                onPress={() => router.push('/(app)/admin/usrah-events')}
              />

              {usrahAccess.canEdit ? (
                <ActionRow
                  icon="cloud-upload-outline"
                  title="Muat Naik Usrah"
                  subtitle="Import kehadiran usrah bulanan dari fail Excel"
                  onPress={() => router.push('/(app)/admin/usrah-upload')}
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {/*
          Program am berkongsi table dan kod QR dengan usrah, tetapi bukan
          pemiliknya: ia milik JABATAN SETIAUSAHA, dan kehadirannya TIDAK masuk
          ke grid dua belas bulan Lajnah Tarbiah. Kad berasingan kerana kedua-dua
          modul boleh dipegang secara berasingan.
        */}
        {programAccess.canView ? (
          <View>
            <SectionTitle title="Setiausaha" caption="Urus program dan kehadirannya." />
            <View className="gap-4">
              <ActionRow
                icon="calendar-outline"
                title="Program"
                subtitle={
                  programAccess.canEdit
                    ? 'Cipta program, jana kod QR dan eksport kehadiran setiap program'
                    : 'Semak program dan eksport kehadiran (paparan sahaja)'
                }
                onPress={() => router.push('/(app)/admin/program-events')}
              />

              <ActionRow
                icon="megaphone-outline"
                title="Pengumuman"
                subtitle={
                  programAccess.canEdit
                    ? 'Cipta dan urus pengumuman yang dipapar di skrin Utama ahli'
                    : 'Semak pengumuman (paparan sahaja)'
                }
                onPress={() => router.push('/(app)/admin/announcements')}
              />
            </View>
          </View>
        ) : null}

        {/*
          Yuran dimiliki oleh BENDAHARI — department ketiga yang berasingan
          daripada modul ahli dan usrah. Seorang admin boleh memegang satu
          tanpa yang lain, jadi kadnya berdiri sendiri.
        */}
        {yuranAccess.canView ? (
          <View>
            <SectionTitle title="Bendahari" caption="Urus yuran keahlian dan pembayaran lain." />
            <View className="gap-4">
              <ActionRow
                icon="wallet-outline"
                title="Yuran"
                subtitle={
                  yuranAccess.canEdit
                    ? 'Semak baki, rekod bayaran, jana yuran tahunan dan eksport laporan'
                    : 'Semak baki dan eksport laporan (paparan sahaja)'
                }
                onPress={() => router.push('/(app)/admin/yuran-list')}
              />

              {/*
                Pembayaran adhoc berkongsi department dengan Yuran tetapi bukan
                bentuknya: ia papan notis tanpa lejar — tiada baki, tiada siapa
                yang direkod sebagai sudah membayar. Kad berasingan supaya
                perbezaan itu tidak hilang di bawah satu nama.
              */}
              <ActionRow
                icon="qr-code-outline"
                title="Pembayaran Adhoc"
                subtitle={
                  yuranAccess.canEdit
                    ? 'Cipta tabung/infaq, muat naik kod QR DuitNow dan urus paparannya'
                    : 'Semak senarai tabung dan infaq (paparan sahaja)'
                }
                onPress={() => router.push('/(app)/admin/adhoc-payment-list')}
              />
            </View>
          </View>
        ) : null}

        {/*
          PIPIS ASET dimiliki oleh LAJNAH EKONOMI DAN ASET dan bukan oleh
          BENDAHARI, walaupun kedua-duanya menyentuh wang: yuran ialah hutang
          keahlian, PIPIS ialah dana aset. Dua department, dua kad.
        */}
        {pipisAccess.canView ? (
          <View>
            <SectionTitle title="Ekonomi & Aset" caption="Urus sumbangan PIPIS ASET." />
            <View className="gap-4">
              <ActionRow
                icon="business-outline"
                title="PIPIS ASET"
                subtitle={
                  pipisAccess.canEdit
                    ? 'Semak sumbangan, rekod pelarasan, import fail dan eksport laporan'
                    : 'Semak sumbangan dan eksport laporan (paparan sahaja)'
                }
                onPress={() => router.push('/(app)/admin/pipis-list')}
              />
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
