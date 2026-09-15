import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ActionRow } from '@/components/ui/action-row';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import {
  useDepartmentAccess,
  useGenerasiAccess,
  useMemberAccess,
  usePipisAccess,
  useProgramAccess,
  useUsrahAccess,
  useYuranAccess,
} from '@/lib/department-access';
import { useGoBack } from '@/lib/navigation';
import { ORG_CHART_DEPARTMENT } from '@/lib/org-chart';
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
 *
 * Setiap department ialah satu seksyen yang boleh ditutup, tertutup secara
 * lalai: Super Admin melihat enam seksyen dan lima belas kad, dan senarai
 * terbuka sepenuhnya memaksa tatal jauh untuk sampai ke Bendahari. Kiraan kad
 * pada kepala seksyen memberitahu isinya tanpa perlu membuka. Pengecualian —
 * admin yang hanya memegang SATU department mendapat seksyennya terbuka, kerana
 * tiada apa-apa lagi untuk dikemaskan dan satu ketukan tambahan hanyalah beban.
 */
export default function AdminHubScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const memberAccess = useMemberAccess();
  const usrahAccess = useUsrahAccess();
  const programAccess = useProgramAccess();
  const yuranAccess = useYuranAccess();
  const pipisAccess = usePipisAccess();
  // SETIAUSAHA — bukan JABATAN SETIAUSAHA (`programAccess`). Dua department.
  const orgChartAccess = useDepartmentAccess(ORG_CHART_DEPARTMENT);
  const generasiAccess = useGenerasiAccess();

  const superAdmin = isSuperAdmin();
  /*
    Setiap department dimuat berasingan. Seksyen dipasang hanya selepas
    kesemuanya selesai — jika tidak, seksyen pertama yang siap dipasang ketika
    kiraan masih satu, terbuka, dan kekal terbuka selepas yang lain menyusul.
  */
  const accessLoading =
    permissionsLoading ||
    [memberAccess, usrahAccess, programAccess, yuranAccess, pipisAccess, orgChartAccess, generasiAccess].some(
      (access) => access.loading,
    );
  const visibleSections = [
    superAdmin,
    memberAccess.canView,
    usrahAccess.canView,
    programAccess.canView,
    yuranAccess.canView,
    pipisAccess.canView,
    orgChartAccess.canEdit,
    generasiAccess.canView,
  ].filter(Boolean).length;
  const nothingAvailable = visibleSections === 0;
  const openByDefault = visibleSections === 1;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Pentadbiran"
        title="Hub Admin"
        subtitle="Pilih bahagian yang ingin diurus"
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pt-6">
        {accessLoading ? null : (
        <>
        {/*
          Ketiga-tiga skrin ini menolak bukan-Super Admin dengan skrin "Tiada
          akses" mereka sendiri (`departments.tsx` termasuk — ia menyemak
          `isSuperAdmin()` sebelum memapar senarai). Kad disembunyikan supaya
          admin department tidak dihantar ke pintu yang pasti menolaknya.
        */}
        {superAdmin ? (
          <CollapsibleSection
            variant="plain"
            title="Organisasi"
            caption="Struktur department dan pemegang jawatan."
            count={7}
            defaultOpen={openByDefault}>
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

            {/*
              Pasangan kepada Provision, dan di sebelahnya atas sebab yang sama:
              ia menetapkan kata laluan yang diketahui umum kepada ratusan akaun
              sekaligus. Provision menyentuh ahli yang BELUM ada akaun; yang ini
              menyentuh ahli yang ada akaun tetapi belum pernah masuk.
            */}
            <ActionRow
              icon="refresh-outline"
              title="Reset Akaun Belum Login"
              subtitle="Reset kata laluan dan tempoh untuk ahli yang belum berjaya log masuk kali pertama"
              onPress={() => router.push('/(app)/admin/bulk-reset-unlogged')}
            />

            <ActionRow
              icon="document-text-outline"
              title="Log Aktiviti Admin"
              subtitle="Jejak tindakan admin merentasi sistem — siapa, apa dan bila"
              onPress={() => router.push('/(app)/admin/activity-log')}
            />
          </CollapsibleSection>
        ) : null}

        {/*
          Modul ahli dimiliki oleh JABATAN DATA & SUMBER MANUSIA, bukan oleh
          peranan Super Admin — jadi ia muncul untuk sesiapa yang memegang
          kebenaran department itu, termasuk admin biasa.
        */}
        {memberAccess.canView ? (
          <CollapsibleSection
            variant="plain"
            title="Data & Sumber Manusia"
            caption="Urus rekod keahlian."
            count={memberAccess.canEdit ? 2 : 1}
            defaultOpen={openByDefault}>
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
          </CollapsibleSection>
        ) : null}

        {/*
          Modul usrah dimiliki oleh LAJNAH TARBIAH — department yang berbeza
          daripada modul ahli di atas, jadi seorang admin boleh melihat satu
          bahagian tanpa yang satu lagi.
        */}
        {usrahAccess.canView ? (
          <CollapsibleSection
            variant="plain"
            title="Tarbiah"
            caption="Urus rekod kehadiran usrah."
            count={usrahAccess.canEdit ? 2 : 1}
            defaultOpen={openByDefault}>
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
          </CollapsibleSection>
        ) : null}

        {/*
          Program am berkongsi table dan kod QR dengan usrah, tetapi bukan
          pemiliknya: ia milik JABATAN SETIAUSAHA, dan kehadirannya TIDAK masuk
          ke grid dua belas bulan Lajnah Tarbiah. Kad berasingan kerana kedua-dua
          modul boleh dipegang secara berasingan.
        */}
        {programAccess.canView ? (
          <CollapsibleSection
            variant="plain"
            title="Setiausaha"
            caption="Urus program dan kehadirannya."
            count={2}
            defaultOpen={openByDefault}>
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
          </CollapsibleSection>
        ) : null}

        {/*
          Carta organisasi dimiliki oleh department SETIAUSAHA — BUKAN JABATAN
          SETIAUSAHA di atas walaupun namanya hampir sama. Dua department dalam
          seed data, dua seksyen. Hanya can_edit kerana carta sudah boleh
          dilihat oleh semua ahli dari tab Ahli.
        */}
        {orgChartAccess.canEdit ? (
          <CollapsibleSection
            variant="plain"
            title="Setiausaha Agung"
            caption="Department SETIAUSAHA — carta organisasi."
            count={1}
            defaultOpen={openByDefault}>
            <ActionRow
              icon="git-network-outline"
              title="Carta Organisasi"
              subtitle="Tetapkan pemegang jawatan, tambah atau padam bahagian dan jawatan, susun semula"
              onPress={() => router.push('/(app)/admin/org-chart-manage')}
            />
          </CollapsibleSection>
        ) : null}

        {/*
          Penarafan aktiviti dimiliki oleh LAJNAH PEMBANGUNAN GENERASI. Admin
          sahaja — tiada pautan dari mana-mana skrin ahli.
        */}
        {generasiAccess.canView ? (
          <CollapsibleSection
            variant="plain"
            title="Pembangunan Generasi"
            caption="Penarafan aktiviti ahli dan generasi."
            count={1}
            defaultOpen={openByDefault}>
            <ActionRow
              icon="trophy-outline"
              title="Penarafan Ahli dan Generasi"
              subtitle="Ahli paling aktif, generasi terbaik dan ahli paling tidak aktif mengikut tempoh"
              onPress={() => router.push('/(app)/admin/aktiviti-terbaik')}
            />
          </CollapsibleSection>
        ) : null}

        {/*
          Yuran dimiliki oleh BENDAHARI — department ketiga yang berasingan
          daripada modul ahli dan usrah. Seorang admin boleh memegang satu
          tanpa yang lain, jadi kadnya berdiri sendiri.
        */}
        {yuranAccess.canView ? (
          <CollapsibleSection
            variant="plain"
            title="Bendahari"
            caption="Urus yuran keahlian dan pembayaran lain."
            count={2}
            defaultOpen={openByDefault}>
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
          </CollapsibleSection>
        ) : null}

        {/*
          PIPIS ASET dimiliki oleh LAJNAH EKONOMI DAN ASET dan bukan oleh
          BENDAHARI, walaupun kedua-duanya menyentuh wang: yuran ialah hutang
          keahlian, PIPIS ialah dana aset. Dua department, dua kad.
        */}
        {pipisAccess.canView ? (
          <CollapsibleSection
            variant="plain"
            title="Ekonomi & Aset"
            caption="Urus sumbangan PIPIS ASET."
            count={1}
            defaultOpen={openByDefault}>
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
          </CollapsibleSection>
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
        </>
        )}
      </View>
    </Screen>
  );
}
