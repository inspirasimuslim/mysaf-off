import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { NaqibHubSection } from '@/components/naqib-hub-section';
import { ScreenHeader } from '@/components/screen-header';
import { ActionRow } from '@/components/ui/action-row';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import {
  useDepartmentAccess,
  useGenerasiAccess,
  useKebajikanAccess,
  useMemberAccess,
  usePerkaderanAccess,
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
  const { isSuperAdmin, isActiveNaqib, loading: permissionsLoading } = usePermissions();
  const memberAccess = useMemberAccess();
  const usrahAccess = useUsrahAccess();
  const programAccess = useProgramAccess();
  const yuranAccess = useYuranAccess();
  const pipisAccess = usePipisAccess();
  // SETIAUSAHA — bukan JABATAN SETIAUSAHA (`programAccess`). Dua department.
  const orgChartAccess = useDepartmentAccess(ORG_CHART_DEPARTMENT);
  const generasiAccess = useGenerasiAccess();
  const perkaderanAccess = usePerkaderanAccess();
  const kebajikanAccess = useKebajikanAccess();

  const superAdmin = isSuperAdmin();
  const naqib = isActiveNaqib();

  /*
    Setiap department dimuat berasingan. Seksyen dipasang hanya selepas
    kesemuanya selesai — jika tidak, seksyen pertama yang siap dipasang ketika
    kiraan masih satu, terbuka, dan kekal terbuka selepas yang lain menyusul.
    `NaqibHubSection` menguruskan bacaan kumpulan/sesinya SENDIRI (lihat
    komponen itu) — Hub tidak perlu menunggunya untuk memaparkan seksyen lain.
  */
  const accessLoading =
    permissionsLoading ||
    [
      memberAccess,
      usrahAccess,
      programAccess,
      yuranAccess,
      pipisAccess,
      orgChartAccess,
      generasiAccess,
      perkaderanAccess,
      kebajikanAccess,
    ].some((access) => access.loading);
  const visibleSections = [
    superAdmin,
    memberAccess.canView,
    usrahAccess.canView,
    programAccess.canView,
    yuranAccess.canView,
    pipisAccess.canView,
    orgChartAccess.canView,
    generasiAccess.canView,
    perkaderanAccess.canView,
    kebajikanAccess.canView,
    naqib,
  ].filter(Boolean).length;
  const nothingAvailable = visibleSections === 0;
  const openByDefault = visibleSections === 1;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Pentadbiran"
        title="Hub Admin"
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
            count={8}
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
              icon="school-outline"
              title="Senarai Sekolah"
              subtitle="Tambah, sunting, aktif/nonaktif dan padam sekolah (dropdown tab Pendidikan)"
              onPress={() => router.push('/(app)/admin/senarai-sekolah')}
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
              icon="chatbubble-ellipses-outline"
              title="Maklum Balas Aplikasi"
              subtitle="Baca maklum balas yang dihantar ahli"
              onPress={() => router.push('/(app)/admin/app-feedback')}
            />

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
            count={memberAccess.canEdit ? 3 : 2}
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

            <ActionRow
              icon="stats-chart-outline"
              title="Statistik Kelengkapan Data"
              subtitle="Peratus kelengkapan profil ahli mengikut kategori, eksport laporan"
              onPress={() => router.push('/(app)/admin/statistik-kelengkapan-data')}
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
            count={usrahAccess.canEdit ? 5 : 3}
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

            <ActionRow
              icon="people-outline"
              title="Kumpulan Usrah"
              subtitle="Urus kumpulan usrah setiap kawasan, ahli dan naqibnya"
              onPress={() => router.push('/(app)/admin/kumpulan-usrah')}
            />

            <ActionRow
              icon="stats-chart-outline"
              title="Statistik Tarbiah"
              subtitle="Kehadiran usrah bulanan mengikut kawasan dan generasi, taburan ahli"
              onPress={() => router.push('/(app)/admin/statistik-tarbiah')}
            />

            {usrahAccess.canEdit ? (
              <ActionRow
                icon="cloud-upload-outline"
                title="Muat Naik Usrah"
                subtitle="Import kehadiran usrah bulanan dari fail Excel"
                onPress={() => router.push('/(app)/admin/usrah-upload')}
              />
            ) : null}

            {usrahAccess.canEdit ? (
              <ActionRow
                icon="cloud-upload-outline"
                title="Muat Naik Kumpulan Usrah"
                subtitle="Import senarai kumpulan, ahli dan naqib dari fail Excel"
                onPress={() => router.push('/(app)/admin/kumpulan-usrah-upload')}
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
            count={programAccess.canEdit ? 3 : 2}
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

            {programAccess.canEdit ? (
              <ActionRow
                icon="ribbon-outline"
                title="Rais / Raisah"
                subtitle="Lantik atau tukar Rais dan Raisah Generasi serta Usrah Kawasan"
                onPress={() => router.push('/(app)/admin/rais-lantikan')}
              />
            ) : null}
          </CollapsibleSection>
        ) : null}

        {/*
          Carta organisasi dan Ahli Diputihkan dimiliki oleh department
          SETIAUSAHA — BUKAN JABATAN SETIAUSAHA di atas walaupun namanya
          hampir sama. Dua department dalam seed data, dua seksyen.
          Seksyen terbuka pada can_view (bukan can_edit sahaja seperti dulu):
          Ahli Diputihkan ada mod paparan-sahaja, jadi admin can_view perlu
          nampak seksyen ini. Carta Organisasi sendiri kekal can_edit sahaja
          kerana paparannya sudah terbuka kepada semua ahli dari tab Ahli.
        */}
        {orgChartAccess.canView ? (
          <CollapsibleSection
            variant="plain"
            title="Setiausaha Agung"
            count={orgChartAccess.canEdit ? 2 : 1}
            defaultOpen={openByDefault}>
            {orgChartAccess.canEdit ? (
              <ActionRow
                icon="git-network-outline"
                title="Carta Organisasi"
                subtitle="Tetapkan pemegang jawatan, tambah atau padam bahagian dan jawatan, susun semula"
                onPress={() => router.push('/(app)/admin/org-chart-manage')}
              />
            ) : null}

            <ActionRow
              icon="person-remove-outline"
              title="Ahli Diputihkan"
              subtitle={
                orgChartAccess.canEdit
                  ? 'Rekod sejarah ahli yang dibuang secara rasmi'
                  : 'Rekod sejarah ahli yang dibuang secara rasmi (paparan sahaja)'
              }
              onPress={() => router.push('/(app)/admin/ahli-diputihkan')}
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

        {/* Data kesihatan ahli — LAJNAH KEBAJIKAN sahaja (bukan JABATAN DATA). */}
        {kebajikanAccess.canView ? (
          <CollapsibleSection variant="plain" title="Kebajikan" count={1} defaultOpen={openByDefault}>
            <ActionRow
              icon="medkit-outline"
              title="Eksport Data Kesihatan"
              subtitle="Muat turun masalah kesihatan yang direkodkan ahli (sensitif)"
              onPress={() => router.push('/(app)/admin/eksport-kesihatan')}
            />
          </CollapsibleSection>
        ) : null}

        {/*
          Usrah Sekolah (Naqib/Naqibah) dimiliki oleh LAJNAH PERKADERAN.
          "Naqib/Naqibah" (lantikan) perlukan can_edit; "Pantauan Usrah
          Sekolah" (semak semua kumpulan + eksport) cukup dengan can_view.
        */}
        {perkaderanAccess.canView ? (
          <CollapsibleSection
            variant="plain"
            title="Perkaderan"
            count={perkaderanAccess.canEdit ? 3 : 2}
            defaultOpen={openByDefault}>
            {perkaderanAccess.canEdit ? (
              <ActionRow
                icon="ribbon-outline"
                title="Naqib/Naqibah"
                subtitle="Lantik naqib dan urus lantikan sedia ada"
                onPress={() => router.push('/(app)/admin/naqib-assignments')}
              />
            ) : null}
            <ActionRow
              icon="school-outline"
              title="Pantauan Usrah Sekolah"
              subtitle={
                perkaderanAccess.canEdit
                  ? 'Semak semua kumpulan dan muat turun laporan kehadiran'
                  : 'Semak semua kumpulan dan muat turun laporan (paparan sahaja)'
              }
              onPress={() => router.push('/(app)/admin/perkaderan-groups')}
            />

            <ActionRow
              icon="stats-chart-outline"
              title="Statistik Perkaderan"
              subtitle="Naqib mengikut sekolah dan kekerapan usrah mengikut bulan"
              onPress={() => router.push('/(app)/admin/statistik-perkaderan')}
            />
          </CollapsibleSection>
        ) : null}

        {naqib ? <NaqibHubSection defaultOpen={openByDefault} /> : null}

        {/*
          Yuran dimiliki oleh BENDAHARI — department ketiga yang berasingan
          daripada modul ahli dan usrah. Seorang admin boleh memegang satu
          tanpa yang lain, jadi kadnya berdiri sendiri.
        */}
        {yuranAccess.canView ? (
          <CollapsibleSection
            variant="plain"
            title="Bendahari"
            count={4}
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

            <ActionRow
              icon="people-circle-outline"
              title="Bayaran Kumpulan"
              subtitle={
                yuranAccess.canEdit
                  ? 'Rekod bayaran yuran satu generasi sekali gus, dan urus sejarah batch'
                  : 'Semak sejarah bayaran kumpulan (paparan sahaja)'
              }
              onPress={() => router.push('/(app)/admin/yuran-group-payment')}
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

            <ActionRow
              icon="stats-chart-outline"
              title="Statistik Yuran"
              subtitle="Kutipan bulanan dan tunggakan mengikut generasi"
              onPress={() => router.push('/(app)/admin/statistik-yuran')}
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
            count={3}
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

            <ActionRow
              icon="stats-chart-outline"
              title="Statistik PIPIS"
              subtitle="Kutipan mengikut bulan dan generasi, terkumpul vs baki"
              onPress={() => router.push('/(app)/admin/statistik-pipis')}
            />

            {/* Iklan perniagaan ahli — department yang sama (LAJNAH EKONOMI DAN ASET). */}
            <ActionRow
              icon="storefront-outline"
              title="Iklan Perniagaan"
              subtitle={
                pipisAccess.canEdit
                  ? 'Semak, lulus atau tolak iklan bisnes yang dihantar ahli'
                  : 'Lihat iklan bisnes yang menunggu semakan (paparan sahaja)'
              }
              onPress={() => router.push('/(app)/admin/semakan-iklan')}
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
