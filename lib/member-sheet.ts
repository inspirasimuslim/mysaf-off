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
 * Lajur di hadapan fail eksport, tiada dalam fail asal.
 *
 * Nombor ahli ialah kunci kemas kini import. Tanpanya, fail eksport yang
 * disunting dan dimuat naik semula akan dinomborkan semula mengikut susunan —
 * dan data seseorang ditulis ke atas rekod orang lain.
 */
export const MEMBER_NUMBER_COLUMN = 'NomborAhli';

export type SheetCell = string | number;

/** Hasil `members_full_export()` — setiap kolum `members` kecuali pautan akaun dan avatar. */
export type MemberExportRow = Omit<Member, 'id' | 'user_id' | 'avatar_url'>;

/**
 * Satu rekod ahli → satu baris fail.
 *
 * Setiap nilai ditulis dalam bentuk yang `ahli-import` baca semula kepada nilai
 * yang SAMA: label status dan bukan kod dalaman, julat pendapatan seperti
 * tersimpan, generasi sebagai 'Ikhwan 07'. `status_pengajian` tiada lajur dalam
 * fail asal — import menyimpulkannya daripada status pekerjaan dan maklumat
 * institusi.
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
    NamaInstitusi: text(member.nama_institusi),
    AlamatInstitusi: text(member.alamat_institusi),
    TahunPengajian: text(member.tahun_pengajian),
    JurusanPengajian: text(member.jurusan_pengajian),
    PembiayaanPengajian: text(member.sumber_pembiayaan),
    NyatakanPembiayaan: text(member.pembiayaan_lain),
    TahapPendidikan: text(member.tahap_pendidikan),
    SektorPekerjaan: text(member.sektor_pekerjaan),
    JawatanPekerjaan: text(member.jawatan_pekerjaan),
    NamaMajikanSyarikat: text(member.nama_majikan),
    AlamatTempatBekerja: text(member.alamat_tempat_kerja),
    AnggaranPendapatan: text(member.anggaran_pendapatan_range),
    JenisPerniagaan: text(member.jenis_perniagaan),
    NyatakanJikaMBM: text(member.nama_pasangan),
    TahunBerkahwin: text(member.tahun_berkahwin),
    AnggaranPendapatanIsiRumah: text(member.anggaran_pendapatan_isi_rumah_range),
    BilTanggunganSelainKeluarga: count(member.bil_tanggungan_selain_keluarga),
    PekerjaanIbu: text(member.pekerjaan_ibu),
    PekerjaanBapa: text(member.pekerjaan_bapa),
    BilTanggunganIbuBapa: count(member.bil_tanggungan_ibu_bapa),
    BilTanggungan: '',
    JawatanIkhwan1: text(member.jawatan_ikhwan_1),
    JawatanIkhwan2: text(member.jawatan_ikhwan_2),
    JawatanIkhwan3: text(member.jawatan_ikhwan_3),
    JawatanPas1: text(member.jawatan_pas_1),
    JawatanPas2: text(member.jawatan_pas_2),
    JawatanPas3: text(member.jawatan_pas_3),
    NoKeahlianPas: text(member.no_keahlian_pas),
  };
}
