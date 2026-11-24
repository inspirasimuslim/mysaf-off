import { Text, View } from 'react-native';

import { MBM, MBM_SERIF, MbmDivider, MbmFramedImage, MbmGreen, MbmHeading } from '@/components/mbm-ui';
import { ScreenHeader } from '@/components/screen-header';
import { Screen } from '@/components/ui/screen';
import { useGoBack } from '@/lib/navigation';

const TOPIK = [
  {
    title: 'Visi Perkahwinan (Vision for Marriage)',
    body: 'Membincangkan tujuan utama perkahwinan, matlamat jangka panjang, serta apakah hala tuju dan ikatan yang ingin dibina bersama sebagai pasangan suami isteri.',
  },
  {
    title: 'Kefahaman Agama (Religious Understanding)',
    body: 'Menyelaraskan pegangan terhadap Al-Quran dan Sunnah, serta bagaimana nilai-nilai keagamaan akan memandu kehidupan harian dan rumah tangga',
  },
  {
    title: 'Perancangan dan Matlamat Hidup (Life Plans and Goals)',
    body: 'Berkongsi perancangan peribadi mahupun kolektif untuk tempoh beberapa tahun ke hadapan bagi memastikan kedua-dua pihak bergerak ke arah yang sama.',
  },
  {
    title: 'Jangkaan Keluarga (Family Expectations)',
    body: 'Membincangkan persepsi mengenai kehidupan berkeluarga dan pendekatan atau prinsip yang ingin diterapkan dalam mendidik anak-anak.',
  },
  {
    title: 'Pengurusan Kewangan (Financial Management)',
    body: 'Mengadakan perbincangan yang telus mengenai cara menguruskan wang, nafkah, serta perancangan kewangan isi rumah',
  },
];

/** Konsep The Big Rock dalam Proses Taaruf — artikel MBM (teks disalin daripada bahan asal tanpa ubah). */
export default function BaitulMuslimBigRockScreen() {
  const goBack = useGoBack();

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Konsep The Big Rock" onBackPress={goBack} />

      <MbmGreen>
        <View className="items-center px-6 pb-8 pt-6">
          <Text
            accessibilityRole="header"
            style={{ fontFamily: MBM_SERIF, fontSize: 22, lineHeight: 28, color: '#fff', textAlign: 'center', marginBottom: 14 }}>
            Memahami Konsep Taaruf dan The Big Rock dalam Proses Taaruf
          </Text>
          <MbmFramedImage
            source={require('@/assets/images/mbm-bigrock.jpg')}
            ratio={762 / 805}
            label="Balang berisi Big Rocks, Small Rocks dan Sand"
            maxWidth={330}
          />
        </View>
      </MbmGreen>

      <View style={{ backgroundColor: MBM.ivory }} className="px-6 py-8">
        <View style={{ backgroundColor: MBM.rose, borderLeftWidth: 5, borderLeftColor: MBM.roseDeep, borderRadius: 18, padding: 16 }}>
          <Text style={{ color: MBM.ink, fontSize: 14, lineHeight: 23 }}>
            Taaruf secara asasnya merujuk kepada proses berkenalan antara dua individu. Walau bagaimanapun, taaruf yang matang dan berasaskan ajaran Islam bukanlah satu proses berkenalan secara random, berlandaskan emosi semata-mata, atau tanpa hala tuju. Taaruf yang disyorkan adalah proses yang berstruktur dan bersistem untuk membantu mengurangkan rasa cemas (anxiety), mengelakkan kekecewaan (heartbreak), serta memelihara batasan syarak
          </Text>
        </View>

        <View className="mt-8">
          <MbmHeading>Mengapa Perlu &ldquo;Big Rocks&rdquo; Dahulu?</MbmHeading>
          <MbmDivider />
          <Text style={{ color: MBM.ink, fontSize: 14.5, lineHeight: 23 }}>
            Jika sebuah bekas diisi dengan pasir terlebih dahulu, tiada ruang lagi yang tinggal untuk batu besar. Begitu juga dalam perkahwinan; jika topik-topik kecil, hobi, atau elemen romantik diutamakan terlebih dahulu sebelum perkara asas diselesaikan, pasangan mungkin akan menyedari di kemudian hari bahawa matlamat utama hidup mereka sebenarnya tidak selari. Justeru, topik-topik &ldquo;Big Rocks&rdquo; perlu dibincangkan terlebih dahulu.
          </Text>
        </View>

        <View className="mt-8">
          <MbmHeading>Topik-topik utama &ldquo;Big Rocks&rdquo; merangkumi:</MbmHeading>
          <MbmDivider />
          {TOPIK.map((item, index) => (
            <View
              key={item.title}
              className="flex-row gap-3 py-4"
              style={index < TOPIK.length - 1 ? { borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: MBM.gold } : undefined}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: MBM.emerald, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: MBM.goldLight, fontFamily: MBM_SERIF, fontSize: 17 }}>{index + 1}</Text>
              </View>
              <View className="flex-1">
                <Text style={{ fontFamily: MBM_SERIF, fontSize: 16, color: MBM.emerald, marginBottom: 3 }}>{item.title}</Text>
                <Text style={{ color: MBM.ink, fontSize: 13.5, lineHeight: 21 }}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: MBM.emerald, borderWidth: 2, borderColor: MBM.gold, borderRadius: 22, padding: 20, marginTop: 24 }}>
          <Text style={{ fontFamily: MBM_SERIF, fontSize: 20, color: MBM.goldLight, marginBottom: 6 }}>Kesimpulan</Text>
          <Text style={{ color: '#fff', fontSize: 13.5, lineHeight: 22 }}>
            Proses taaruf bukanlah satu jaminan bahawa persetujuan untuk berkahwin pasti berlaku, sebaliknya ia adalah ruang penilaian awal yang ikhlas untuk melihat keserasian dan kesediaan kedua-dua belah pihak. Dengan mengutamakan perbincangan topik-topik &ldquo;Big Rocks&rdquo; di peringkat awal, bakal pasangan dapat membina ikatan atas asas dan prinsip yang kukuh. Elemen perhubungan seperti persefahaman dan komunikasi yang baik akan dapat dibina dengan lebih mudah dan berpanjangan selepas asas yang penting ini diselesaikan.
          </Text>
        </View>

        <View style={{ borderWidth: 1.5, borderColor: MBM.gold, borderRadius: 30, paddingVertical: 9, paddingHorizontal: 16, marginTop: 18, alignSelf: 'flex-start' }}>
          <Text selectable style={{ color: MBM.emerald, fontSize: 12, fontWeight: '700' }}>
            Sumber Rujukan : https://www.youtube.com/watch?v=iymP9jRa1yU
          </Text>
        </View>
      </View>
    </Screen>
  );
}
