import { LegalPage, type LegalSection } from '@/components/legal-page';
import { POLICY_UPDATED, SUPPORT_EMAIL } from '@/constants/legal';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Tentang MySAFF',
    body: [
      'MySAFF ialah aplikasi untuk ahli berdaftar persatuan bagi mengurus keahlian dan aktiviti: usrah, program, yuran, sumbangan, direktori ahli, pengumuman dan bisnes ahli. Aplikasi ini dikendalikan oleh Sakura Digital Resources bagi pihak persatuan, dan hanya boleh digunakan oleh ahli yang akaunnya didaftarkan oleh pentadbir.',
    ],
  },
  {
    heading: 'Data yang kami kumpul',
    body: [
      'Maklumat akaun dan keahlian: nama, emel, nombor telefon, nombor kad pengenalan, generasi, alamat, maklumat pendidikan, pekerjaan, perniagaan dan keluarga yang anda isi dalam profil.',
      'Maklumat kesihatan (pilihan): jika anda mengisinya di tab Kesihatan, ia hanya boleh dilihat oleh anda dan pentadbir yang berkenaan untuk tujuan kebajikan.',
      'Rekod kewangan persatuan: status yuran, sumbangan, infaq Tabung Zakat dan bayaran. Kami tidak menyimpan nombor kad bank atau kata laluan perbankan anda; pembayaran dalam talian diproses oleh penyedia pembayaran pihak ketiga. Satu pengecualian: jika permohonan bantuan anda diluluskan dan anda memilih menghantar gambar kod QR DuitNow, gambar itu (yang boleh mengandungi maklumat akaun penerima) disimpan secara persendirian dan hanya boleh dilihat oleh anda dan pentadbir Tabung Zakat.',
      'Permohonan bantuan (pilihan): jika anda memohon bantuan zakat atau kebajikan, kami menyimpan maklumat yang anda isi dalam borang (contohnya status, tempat tinggal, pendapatan, tanggungan, sebab keperluan), status permohonan, sejarah tindakan dan catatan dalaman pentadbir. Maklumat ini sensitif dan hanya boleh dilihat oleh anda dan pentadbir Tabung Zakat.',
      'Mesej: mesej Maklum Balas yang anda hantar kepada jabatan, dan mesej Bantuan Kaunseling. Perbualan kaunseling hanya boleh dibaca oleh anda dan kaunselor aktif yang anda hubungi; pentadbir kebajikan hanya melihat bilangan ahli yang menghubungi kaunselor, bukan identiti atau kandungan. Kami juga mencatat ketikan anda pada butang hubungi kaunselor (WhatsApp, telefon atau mesej dalam aplikasi).',
      'Maklumat orang lain: apabila anda mengisi maklumat pasangan, anak, ibu bapa atau adik-beradik dalam profil atau permohonan bantuan, anda mengesahkan anda berhak memberikannya. Kami menggunakannya hanya untuk tujuan keahlian dan kebajikan yang dinyatakan di sini.',
      'Lokasi tepat: hanya ketika anda mengesahkan kehadiran program atau usrah, bagi menyemak anda berada di lokasi program. Lokasi tidak dijejak di latar belakang.',
      'Kamera dan galeri: kamera untuk mengimbas kod QR kehadiran; galeri untuk memilih gambar (kod QR, gambar profil, poster bisnes dan gambar program) dan menyimpan gambar ke peranti anda.',
      'Maklumat teknikal asas seperti tarikh log masuk dan log aktiviti pentadbir untuk keselamatan.',
    ],
  },
  {
    heading: 'Bagaimana data digunakan',
    body: [
      'Data digunakan semata-mata untuk mengurus keahlian dan aktiviti persatuan, memaparkan direktori kepada ahli lain, menghantar pengumuman, mengira kehadiran dan penarafan aktiviti, menguruskan yuran, sumbangan dan infaq, menilai permohonan bantuan, serta membolehkan ahli berhubung dengan jabatan dan kaunselor.',
      'Kami tidak menjual data anda dan tidak memaparkan iklan pihak ketiga.',
    ],
  },
  {
    heading: 'Siapa boleh melihat data anda',
    body: [
      'Ahli lain hanya melihat maklumat direktori yang terhad (contohnya nama, generasi, gambar dan kenalan asas). Pentadbir melihat data mengikut kebenaran jabatan masing-masing. Data kesihatan, permohonan bantuan, mesej kaunseling dan maklumat sensitif lain mempunyai kawalan akses yang lebih ketat dan tidak dipaparkan kepada pentadbir lain.',
    ],
  },
  {
    heading: 'Pihak ketiga yang memproses data',
    body: [
      'Supabase (pangkalan data, pengesahan dan storan fail), Google Maps dan Google Places (paparan peta dan carian lokasi; teks carian anda dihantar kepada Google) dan ToyyibPay sebagai penyedia pembayaran dalam talian untuk yuran, sumbangan dan infaq (nama, emel, nombor telefon dan jumlah bayaran dihantar untuk memproses bil anda). Mereka memproses data hanya untuk menjalankan perkhidmatan ini. Data dihantar melalui sambungan disulitkan (HTTPS).',
    ],
  },
  {
    heading: 'Tempoh simpanan dan padam akaun',
    body: [
      'Data disimpan selagi anda ahli. Anda boleh memohon padam akaun melalui Tetapan > Padam Akaun dalam aplikasi, atau melalui halaman /padam-akaun. Selepas permintaan diproses, akaun log masuk dan data peribadi anda, termasuk mesej, permohonan bantuan dan gambar kod QR, dipadam atau dianonimkan. Rekod kewangan persatuan (yuran dan infaq) boleh disimpan tanpa identiti peribadi untuk tujuan audit dan perakaunan.',
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
