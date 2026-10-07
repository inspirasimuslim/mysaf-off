import { LegalPage, type LegalSection } from '@/components/legal-page';
import { POLICY_UPDATED, SUPPORT_EMAIL } from '@/constants/legal';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Cara memohon padam akaun',
    body: [
      '1. Buka aplikasi MySAFF (atau versi web) dan log masuk.',
      '2. Pergi ke Tetapan > Padam Akaun.',
      '3. Tulis sebab (pilihan) dan tekan "Hantar Permintaan Padam".',
      SUPPORT_EMAIL
        ? 'Jika anda tidak dapat log masuk, hantar emel kepada ' + SUPPORT_EMAIL + ' daripada emel yang didaftarkan.'
        : 'Jika anda tidak dapat log masuk, hubungi pentadbir persatuan.',
    ],
  },
  {
    heading: 'Apa yang dipadam',
    body: [
      'Selepas permintaan diproses oleh pentadbir, akaun log masuk anda dan data peribadi (nama, emel, telefon, nombor kad pengenalan, alamat, maklumat pekerjaan, keluarga, kesihatan dan gambar) dipadam atau dianonimkan.',
    ],
  },
  {
    heading: 'Apa yang mungkin disimpan',
    body: [
      'Rekod kewangan persatuan (yuran dan sumbangan) dan statistik kehadiran boleh disimpan tanpa identiti peribadi untuk tujuan audit dan perakaunan.',
    ],
  },
];

export default function PadamAkaunScreen() {
  return <LegalPage title="Padam Akaun MySAFF" updated={POLICY_UPDATED} sections={SECTIONS} />;
}
