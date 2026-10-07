import { LegalPage, type LegalSection } from '@/components/legal-page';
import { POLICY_UPDATED, SUPPORT_EMAIL } from '@/constants/legal';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Tentang MySAFF',
    body: [
      'MySAFF ialah aplikasi untuk ahli berdaftar persatuan bagi mengurus keahlian dan aktiviti. Aplikasi ini dikendalikan oleh Sakura Digital Resources bagi pihak persatuan, dan hanya boleh digunakan oleh ahli yang akaunnya didaftarkan oleh pentadbir.',
    ],
  },
  {
    heading: 'Data yang kami kumpul',
    body: [
      'Maklumat akaun dan keahlian: nama, emel dan nombor telefon yang anda isi dalam profil.',
      'Kami tidak menyimpan nombor kad atau akaun bank anda; pembayaran dalam talian diproses oleh penyedia pembayaran pihak ketiga.',
      'Lokasi tepat: hanya ketika anda mengesahkan kehadiran program, bagi menyemak anda berada di lokasi program. Lokasi tidak dijejak di latar belakang.',
      'Kamera dan galeri: kamera untuk mengimbas kod QR kehadiran; galeri untuk memilih gambar (kod QR, gambar profil, poster bisnes dan gambar program) dan menyimpan gambar ke peranti anda.',
      'Maklumat teknikal asas seperti tarikh log masuk dan log aktiviti pentadbir untuk keselamatan.',
    ],
  },
  {
    heading: 'Bagaimana data digunakan',
    body: [
      'Data digunakan semata-mata untuk mengurus keahlian dan aktiviti persatuan, memaparkan direktori kepada ahli lain, menghantar pengumuman, mengira kehadiran dan penarafan aktiviti, serta menguruskan yuran dan sumbangan.',
      'Kami tidak menjual data anda dan tidak memaparkan iklan pihak ketiga.',
    ],
  },
  {
    heading: 'Siapa boleh melihat data anda',
    body: [
      'Ahli lain hanya melihat maklumat direktori yang terhad. Pentadbir melihat data mengikut kebenaran jabatan masing-masing. Maklumat sensitif mempunyai kawalan akses yang lebih ketat.',
    ],
  },
  {
    heading: 'Pihak ketiga yang memproses data',
    body: [
      'Supabase (pangkalan data, pengesahan dan storan fail), Google Maps (paparan peta) dan penyedia pembayaran dalam talian untuk yuran dan sumbangan. Mereka memproses data hanya untuk menjalankan perkhidmatan ini. Data dihantar melalui sambungan disulitkan (HTTPS).',
    ],
  },
  {
    heading: 'Tempoh simpanan dan padam akaun',
    body: [
      'Data disimpan selagi anda ahli. Anda boleh memohon padam akaun melalui Tetapan > Padam Akaun dalam aplikasi, atau melalui halaman /padam-akaun. Selepas permintaan diproses, akaun log masuk dan data peribadi anda dipadam atau dianonimkan. Rekod kewangan persatuan boleh disimpan tanpa identiti peribadi untuk tujuan audit dan perakaunan.',
    ],
  },
  {
    heading: 'Hak anda',
    body: [
      'Anda boleh melihat dan mengemas kini maklumat anda dalam aplikasi, serta memohon pembetulan atau pemadaman data. Kami mematuhi Akta Perlindungan Data Peribadi 2010 (Malaysia).',
    ],
  },
  {
    heading: 'Kanak-kanak',
    body: ['Aplikasi ini untuk ahli dewasa dan tidak ditujukan kepada kanak-kanak.'],
  },
  {
    heading: 'Perubahan dan hubungan',
    body: [
      'Dasar ini boleh dikemas kini dan tarikh terkini dipaparkan di atas.' +
        (SUPPORT_EMAIL
          ? ' Pertanyaan: ' + SUPPORT_EMAIL + '.'
          : ' Untuk pertanyaan, hubungi pentadbir persatuan melalui aplikasi.'),
    ],
  },
];

export default function DasarPrivasiScreen() {
  return <LegalPage title="Dasar Privasi MySAFF" updated={POLICY_UPDATED} sections={SECTIONS} />;
}
