import {
  STATUS_PEKERJAAN_OPTIONS,
  STATUS_PERKAHWINAN_OPTIONS,
  generationLabel,
  optionLabel,
  type Member,
} from '@/types/database';

/**
 * Bentuk fail keahlian — dikongsi oleh eksport penuh dan template muat naik.
 *
 * Modul ini SENGAJA bebas daripada React Native, seperti `ahli-import`, supaya
 * pemetaan eksport boleh diuji pusingan penuh (eksport → baca semula) di Node.
 */

/**
 * Lajur fail keahlian asal, dalam susunan asal fail yang diimport pertama kali.
 *
 * `NoTel2`, `Pekerjaan`, `Role` dan `BilTanggungan` tiada tempat dalam skema
 * (lihat `IGNORED_COLUMNS` dalam `ahli-import`) tetapi dikekalkan sebagai lajur
 * kosong: fail yang sama bentuk dengan asalnya boleh dibandingkan bersebelahan
 * tanpa perlu menyusun semula lajur.
 */
export const AHLI_COLUMNS = [
  'UserName',
  'Jantina',
  'Alamat',
  'AlamatSemasa',
  'Email',
  'NoTel',
  'NoTel2',
  'KawasanUsrah',
  'Nric',
  'Pekerjaan',
  'Role',
  'Disekat',
  'Sekolah',
  'Generasi',
  'StatusPerkahwinan',
  'StatusBelajarBekerja',
  'BilAnak',
  'NamaInstitusi',
  'AlamatInstitusi',
  'TahunPengajian',
  'JurusanPengajian',
  'PembiayaanPengajian',
  'NyatakanPembiayaan',
  'TahapPendidikan',
  'SektorPekerjaan',
  'JawatanPekerjaan',
  'NamaMajikanSyarikat',
  'AlamatTempatBekerja',
  'AnggaranPendapatan',
  'JenisPerniagaan',
  'NyatakanJikaMBM',
  'TahunBerkahwin',
  'AnggaranPendapatanIsiRumah',
  'BilTanggunganSelainKeluarga',
  'PekerjaanIbu',
  'PekerjaanBapa',
  'BilTanggunganIbuBapa',
  'BilTanggungan',
  'JawatanIkhwan1',
  'JawatanIkhwan2',
  'JawatanIkhwan3',
  'JawatanPas1',
  'JawatanPas2',
  'JawatanPas3',
  'NoKeahlianPas',
] as const;

/**
 * Lajur di HUJUNG fail eksport, tiada dalam fail asal dan tiada dalam template.
 *
 * Ketiga-tiganya bacaan sahaja — import tidak pernah menulisnya, jadi fail
 * eksport yang disunting dan dimuat naik semula tidak akan merosakkan apa-apa
 * walaupun admin mengubah nilainya.
 *
 */
export const MEMBER_READONLY_COLUMNS = ['Kemaskini Terakhir Oleh Ahli', 'Tarikh Daftar'] as const;

/**
 * Lajur di hadapan fail eksport, tiada dalam fail asal.
 *
 * Nombor ahli ialah kunci kemas kini import. Tanpanya, fail eksport yang
 * disunting dan dimuat naik semula akan dinomborkan semula mengikut susunan —
 * dan data seseorang ditulis ke atas rekod orang lain.
 */
export const MEMBER_NUMBER_COLUMN = 'NomborAhli';

export type SheetCell = string | number;

/**
 * Hasil `members_full_export()`.
 *
 * Setiap kolum `members` kecuali pautan akaun, avatar dan keadaan kata laluan
 * (`must_change_password`, `temp_password_expires_at`) — yang terakhir itu
 * keadaan akaun dan bukan data keahlian, jadi ia tidak pernah keluar.
 *
 * `created_at` ditambah di sini dan bukan pada `Member`: skrin lain membaca
 * `members` tanpa memilih kolum itu, jadi meletakkannya pada jenis kongsi akan
 * menjanjikan medan yang tidak selalu ada.
 *
 * `sekolah_id` (FK) DIGANTIKAN `sekolah` (teks, nama sekolah) di sini —
 * `members_full_export()` menyelesaikannya melalui JOIN kepada `schools`
 * di pelayan supaya lajur eksport kekal nama yang boleh dibaca, bukan uuid.
 */
export type MemberExportRow = Omit<Member, 'id' | 'user_id' | 'avatar_url' | 'sekolah_id'> & {
  created_at: string | null;
  sekolah: string | null;
};

/**
 * Cap masa → tarikh yang boleh dibaca, atau kosong.
 *
 * Tarikh sahaja dan bukan jam: soalannya ialah "bila kali terakhir dia
 * menyentuh profilnya", dan jawapan kepada itu tidak pernah memerlukan minit.
 */
function dateOnly(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('ms-MY');
}

/**
 * Satu rekod ahli → satu baris fail.
 *
 * Setiap nilai ditulis dalam bentuk yang `ahli-import` baca semula kepada nilai
 * yang SAMA: label status dan bukan kod dalaman, julat pendapatan seperti
 * tersimpan, generasi sebagai 'Ikhwan 07'.
 */
export function memberToSheetRow(member: MemberExportRow): Record<string, SheetCell> {
  const text = (value: string | null) => value ?? '';
  const count = (value: number | null) => (value === null ? '' : value);

  return {
    [MEMBER_NUMBER_COLUMN]: text(member.nombor_ahli),
    UserName: member.full_name,
    Jantina: text(member.jantina),
    Alamat: text(member.alamat),
    AlamatSemasa: text(member.alamat_semasa),
    Email: text(member.email),
    NoTel: text(member.no_tel),
    NoTel2: '',
    KawasanUsrah: text(member.kawasan_usrah),
    Nric: text(member.nric),
    Pekerjaan: '',
    Role: '',
    Disekat: member.disekat ? 'TRUE' : 'FALSE',
    Sekolah: text(member.sekolah),
    Generasi: member.generasi ? generationLabel(member.generasi) : '',
    StatusPerkahwinan: member.status_perkahwinan
      ? optionLabel(STATUS_PERKAHWINAN_OPTIONS, member.status_perkahwinan)
      : '',
    StatusBelajarBekerja: member.status_pekerjaan ? optionLabel(STATUS_PEKERJAAN_OPTIONS, member.status_pekerjaan) : '',
    BilAnak: count(member.bil_anak),
    /*
      7 lajur di bawah bukan lagi kolum `Member` (rombak tab Pendidikan
      2026-09-29 — peringkat selepas SPM kini `member_education`, 1-ke-banyak,
      TIDAK disertakan dalam eksport ini) tetapi KEKAL dalam AHLI_COLUMNS
      sebagai lajur kosong, sama corak kolum legasi kosong sedia ada.
    */
    NamaInstitusi: '',
    AlamatInstitusi: '',
    TahunPengajian: '',
    JurusanPengajian: '',
    PembiayaanPengajian: '',
    NyatakanPembiayaan: '',
    TahapPendidikan: '',
    SektorPekerjaan: text(member.sektor_pekerjaan),
    JawatanPekerjaan: text(member.jawatan_pekerjaan),
    NamaMajikanSyarikat: text(member.nama_majikan),
    /*
      9 lajur di bawah bukan lagi kolum `Member` (rombak 6-tab
      2026-09-29 — lihat AGENTS.md) tetapi KEKAL dalam AHLI_COLUMNS sebagai
      lajur kosong, sama seperti `NoTel2`/`Pekerjaan`/`Role`/`BilTanggungan`
      sedia ada — bentuk fail eksport tidak berubah bilangan/susunan lajurnya.
    */
    AlamatTempatBekerja: '',
    AnggaranPendapatan: text(member.anggaran_pendapatan_range),
    JenisPerniagaan: '',
    NyatakanJikaMBM: text(member.nama_pasangan),
    TahunBerkahwin: text(member.tahun_berkahwin),
    AnggaranPendapatanIsiRumah: '',
    BilTanggunganSelainKeluarga: '',
    PekerjaanIbu: '',
    PekerjaanBapa: '',
    BilTanggunganIbuBapa: '',
    BilTanggungan: '',
    JawatanIkhwan1: text(member.jawatan_ikhwan_1),
    JawatanIkhwan2: text(member.jawatan_ikhwan_2),
    JawatanIkhwan3: '',
    JawatanPas1: text(member.jawatan_pas_1),
    JawatanPas2: text(member.jawatan_pas_2),
    JawatanPas3: '',
    NoKeahlianPas: text(member.no_keahlian_pas),

    // Dua lajur bacaan sahaja di hujung fail.
    'Kemaskini Terakhir Oleh Ahli': dateOnly(member.self_updated_at),
    'Tarikh Daftar': dateOnly(member.created_at),
  };
}
