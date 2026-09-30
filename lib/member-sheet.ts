import {
  BIDANG_KERAJAAN_OPTIONS,
  BIDANG_KHUSUS_SWASTA_OPTIONS,
  JENIS_KERJA_SENDIRI_OPTIONS,
  KUMPULAN_BIDANG_SWASTA_OPTIONS,
  SEBAB_PERKAHWINAN_OPTIONS,
  SEKTOR_PEKERJAAN_OPTIONS,
  STATUS_PEKERJAAN_OPTIONS,
  STATUS_PERKAHWINAN_OPTIONS,
  generationLabel,
  optionLabel,
  type Member,
  type Option,
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
 * Hanya lajur yang benar-benar ada isi (eksport) DAN dibaca `ahli-import`.
 * 20 lajur legasi yang sentiasa kosong (`NoTel2`, `Pekerjaan`, `Role`,
 * `BilTanggungan`, 7 lajur pendidikan flat, 9 lajur rombak 6-tab) dibuang
 * 2026-09-30 — fail lama yang masih membawanya tetap boleh dimuat naik
 * (lajur tidak dikenali diabaikan). `StatusBelajarBekerja` dinamakan semula
 * `StatusPekerjaan`; import masih menerima nama lama.
 */
export const AHLI_COLUMNS = [
  'UserName',
  'Jantina',
  'Alamat',
  'AlamatSemasa',
  'Email',
  'NoTel',
  'KawasanUsrah',
  'Nric',
  'Disekat',
  'Sekolah',
  'Generasi',
  'StatusPerkahwinan',
  'StatusPekerjaan',
  'BilAnak',
  'SektorPekerjaan',
  'JawatanPekerjaan',
  'NamaMajikanSyarikat',
  'AnggaranPendapatan',
  'NyatakanJikaMBM',
  'TahunBerkahwin',
  'JawatanIkhwan1',
  'JawatanIkhwan2',
  'JawatanPas1',
  'JawatanPas2',
  'NoKeahlianPas',
] as const;

/**
 * Lajur eksport SAHAJA (selepas `AHLI_COLUMNS`) — data yang wujud dalam borang
 * tetapi tidak dibaca import, supaya pemuatnaikan semula tidak menimpanya
 * (lihat pengecualian dalam `ParsedMember`). Bukan sebahagian template.
 *
 * `JawatanCartaOrganisasi` datang daripada `org_positions`, sumber yang sama
 * dengan profil/direktori.
 */
export const MEMBER_EXPORT_ONLY_COLUMNS = [
  'NamaPanggilan',
  'NegeriTempatKerja',
  'BidangKerajaan',
  'BidangKerajaanLain',
  'KumpulanBidangSwasta',
  'BidangKhususSwasta',
  'BidangKhususSwastaLain',
  'JenisKerjaSendiri',
  'NamaPekerjaanSendiri',
  'BidangPekerjaanLama',
  'SebabBerakhirPerkahwinan',
  'CenderungBaitulMuslim',
  'JawatanIkhwanAktif',
  'JawatanPasAktif',
  'JawatanCartaOrganisasi',
] as const;

/**
 * Lajur di HUJUNG fail eksport, tiada dalam fail asal dan tiada dalam template.
 *
 * Bacaan sahaja — import tidak pernah menulisnya, jadi fail eksport yang
 * disunting dan dimuat naik semula tidak akan merosakkan apa-apa walaupun
 * admin mengubah nilainya.
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
export type MemberExportRow = Omit<Member, 'id' | 'user_id' | 'avatar_url' | 'sekolah_id' | 'spouse_member_id'> & {
  created_at: string | null;
  sekolah: string | null;
  /** "{jawatan} - {bahagian}" daripada carta organisasi, format sama dengan direktori. */
  jawatan: string | null;
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
/** Kod -> label penuh, atau kosong (`optionLabel` memulangkan '—' untuk null — tidak sesuai untuk sel Excel). */
function label<T extends string>(options: Option<T>[], value: T | null | undefined): string {
  return value ? optionLabel(options, value) : '';
}

const BIDANG_KHUSUS_SWASTA_FLAT = Object.values(BIDANG_KHUSUS_SWASTA_OPTIONS).flat();

/** true -> 'Ya', false -> 'Tidak', tidak dijawab -> kosong. */
function yesNo(value: boolean | null | undefined): string {
  return value === null || value === undefined ? '' : value ? 'Ya' : 'Tidak';
}

export function memberToSheetRow(member: MemberExportRow): Record<string, SheetCell> {
  const text = (value: string | null | undefined) => value ?? '';
  const count = (value: number | null) => (value === null ? '' : value);

  return {
    [MEMBER_NUMBER_COLUMN]: text(member.nombor_ahli),
    UserName: member.full_name,
    Jantina: text(member.jantina),
    Alamat: text(member.alamat),
    AlamatSemasa: text(member.alamat_semasa),
    Email: text(member.email),
    NoTel: text(member.no_tel),
    KawasanUsrah: text(member.kawasan_usrah),
    Nric: text(member.nric),
    Disekat: member.disekat ? 'TRUE' : 'FALSE',
    Sekolah: text(member.sekolah),
    Generasi: member.generasi ? generationLabel(member.generasi) : '',
    StatusPerkahwinan: label(STATUS_PERKAHWINAN_OPTIONS, member.status_perkahwinan),
    StatusPekerjaan: label(STATUS_PEKERJAAN_OPTIONS, member.status_pekerjaan),
    BilAnak: count(member.bil_anak),
    SektorPekerjaan: label(SEKTOR_PEKERJAAN_OPTIONS, member.sektor_pekerjaan),
    JawatanPekerjaan: text(member.jawatan_pekerjaan),
    NamaMajikanSyarikat: text(member.nama_majikan),
    AnggaranPendapatan: text(member.anggaran_pendapatan_range),
    // `nama_pasangan` sudah diselesaikan pelayan: nama ahli pasangan bila `spouse_member_id` terisi.
    NyatakanJikaMBM: text(member.nama_pasangan),
    TahunBerkahwin: text(member.tahun_berkahwin),
    JawatanIkhwan1: text(member.jawatan_ikhwan_1),
    JawatanIkhwan2: text(member.jawatan_ikhwan_2),
    JawatanPas1: text(member.jawatan_pas_1),
    JawatanPas2: text(member.jawatan_pas_2),
    NoKeahlianPas: text(member.no_keahlian_pas),

    // Lajur eksport sahaja (`MEMBER_EXPORT_ONLY_COLUMNS`) — import tidak membacanya.
    NamaPanggilan: text(member.nama_panggilan),
    NegeriTempatKerja: text(member.negeri_tempat_kerja),
    BidangKerajaan: label(BIDANG_KERAJAAN_OPTIONS, member.bidang_kerajaan),
    BidangKerajaanLain: text(member.bidang_kerajaan_lain_teks),
    KumpulanBidangSwasta: label(KUMPULAN_BIDANG_SWASTA_OPTIONS, member.kumpulan_bidang_swasta),
    BidangKhususSwasta: label(BIDANG_KHUSUS_SWASTA_FLAT, member.bidang_khusus_swasta),
    BidangKhususSwastaLain: text(member.bidang_khusus_swasta_lain_teks),
    JenisKerjaSendiri: label(JENIS_KERJA_SENDIRI_OPTIONS, member.jenis_kerja_sendiri),
    NamaPekerjaanSendiri: text(member.bidang_kerja_sendiri_lain_teks),
    BidangPekerjaanLama: text(member.bidang_pekerjaan_lama),
    SebabBerakhirPerkahwinan: label(SEBAB_PERKAHWINAN_OPTIONS, member.sebab_bercerai_kematian),
    CenderungBaitulMuslim: yesNo(member.cenderung_baitul_muslim),
    JawatanIkhwanAktif: member.jawatan_ikhwan_aktif ? 'TRUE' : 'FALSE',
    JawatanPasAktif: member.jawatan_pas_aktif ? 'TRUE' : 'FALSE',
    JawatanCartaOrganisasi: text(member.jawatan),

    // Dua lajur bacaan sahaja di hujung fail.
    'Kemaskini Terakhir Oleh Ahli': dateOnly(member.self_updated_at),
    'Tarikh Daftar': dateOnly(member.created_at),
  };
}
