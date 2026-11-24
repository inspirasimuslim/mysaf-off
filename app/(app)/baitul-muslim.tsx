import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Linking, Pressable, Text, View } from 'react-native';

import { MBM, MBM_SERIF, MbmDivider, MbmGoldButton, MbmFramedImage, MbmGreen, MbmHeading } from '@/components/mbm-ui';
import { ScreenHeader } from '@/components/screen-header';
import { Screen } from '@/components/ui/screen';
import { MBM_CONTACTS } from '@/lib/mbm-borang';
import { useGoBack } from '@/lib/navigation';

type IconName = keyof typeof Ionicons.glyphMap;

const STEPS: { icon: IconName; text: string }[] = [
  { icon: 'document-text-outline', text: 'Isi borang & Semakan kelayakan pemohon' },
  { icon: 'chatbubbles-outline', text: 'Taaruf & istikharah' },
  { icon: 'moon-outline', text: 'Persediaan ke Ijab Qabul' },
];

const TESTIMONI = [
  {
    image: require('@/assets/images/mbm-keluarga1.jpg'),
    ratio: 700 / 685,
    text: 'Anak-anak sangat bahagia apabila berjumpa dengan ‘circle usrah’ dari anak kawan baba dan mama. Peluang untuk izinkan salah seorang untuk lebih aktif bersama jemaah juga lebih terbuka luas atas asbab faham tujuan dan matlamat jemaah',
  },
  {
    image: require('@/assets/images/mbm-keluarga2.jpg'),
    ratio: 669 / 700,
    text: 'Secara individu, berkahwin dengan ahli ikhwan, saya merasakan saya berkahwin dengan orang yang sentiasa berusaha menjadi orang yg bertanggungjawab dan berakhlak.',
  },
];

const AJK = [
  'Ahmad Fatihi b Makhtar',
  'Nurul Farihah bt Mad Rozali',
  'Mohd Ridhuwan b Che Musa',
  'Nur Farah Syazwani bt Mohd Zurhan',
  'Mohd Aidil Hanan b Jusoh',
  'Muhamad Zarif b Ilias',
  'Nurul Jannah bt Mohd A’seri',
  'Muhammad Akiff b Mohamad (wakil I-GEM)',
  'Munirah bt Abdul Salam (wakil I-GEM)',
];

function Person({ name, role }: { name: string; role: string }) {
  return (
    <View style={{ borderWidth: 1, borderColor: MBM.gold, borderRadius: 12, padding: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <Text style={{ color: '#fff', fontSize: 13, textAlign: 'center' }}>{name}</Text>
      <Text style={{ color: MBM.goldLight, fontSize: 11.5, marginTop: 2 }}>{role}</Text>
    </View>
  );
}

/**
 * Majlis Baitul Muslim (MBM) — halaman utama dalam app (menggantikan pautan Canva).
 * Kandungan teks disalin daripada bahan asal tanpa ubah.
 */
export default function BaitulMuslimScreen() {
  const router = useRouter();
  const goBack = useGoBack();

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Majlis Baitul Muslim" onBackPress={goBack} />

      <MbmGreen>
        <View className="items-center px-6 pb-8 pt-6">
          <View
            style={{
              width: 230,
              height: 210,
              borderTopLeftRadius: 115,
              borderTopRightRadius: 115,
              overflow: 'hidden',
              borderWidth: 3,
              borderColor: MBM.gold,
              backgroundColor: MBM.ivory,
            }}>
            <Image
              source={require('@/assets/images/mbm-cincin.jpg')}
              accessibilityLabel="Sepasang cincin emas"
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </View>
          <Text
            accessibilityRole="header"
            style={{ fontFamily: MBM_SERIF, fontSize: 32, lineHeight: 38, color: '#fff', textAlign: 'center', marginTop: 18 }}>
            Majlis Baitul Muslim Ikhwan
          </Text>
        </View>
      </MbmGreen>

      <View style={{ backgroundColor: MBM.ivory }} className="px-6 py-8">
        <MbmHeading>Matlamat MBM Ikhwan</MbmHeading>
        <MbmDivider />
        <Text style={{ color: MBM.ink, fontSize: 14.5, lineHeight: 23, textAlign: 'center' }}>
          Majlis Baitul Muslim Ikhwan merupakan platform utama pembinaan keluarga sakinah untuk ahli Ikhwan dan memastikan kelangsungan komitmen ahli dengan jemaah
        </Text>
        <View
          style={{
            marginTop: 20,
            borderWidth: 1.5,
            borderColor: MBM.gold,
            borderRadius: 40,
            backgroundColor: '#fff',
            paddingVertical: 16,
            paddingHorizontal: 20,
          }}>
          <Text style={{ fontFamily: MBM_SERIF, fontSize: 18, lineHeight: 25, color: MBM.emerald, textAlign: 'center' }}>
            Langkah pertama membina ummah, mengekalkan risalah
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: '#fff' }} className="px-6 py-8">
        <MbmHeading>Proses MBM</MbmHeading>
        <MbmDivider />
        <View className="mt-2 gap-5">
          {STEPS.map((step) => (
            <View key={step.text} className="flex-row items-center gap-4">
              <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: MBM.emerald, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] }}>
                <View style={{ transform: [{ rotate: '-45deg' }] }}>
                  <Ionicons name={step.icon} size={22} color={MBM.goldLight} />
                </View>
              </View>
              <Text style={{ flex: 1, fontFamily: MBM_SERIF, fontSize: 17, color: MBM.emerald, marginLeft: 6 }}>{step.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <MbmGreen>
        <View className="px-6 py-8">
          <MbmHeading light>Di Ikhwan kami disatukan</MbmHeading>
          <MbmDivider />
          <View className="mt-3 gap-5">
            {TESTIMONI.map((item) => (
              <View key={item.text.slice(0, 20)} style={{ backgroundColor: MBM.rose, borderRadius: 40, borderWidth: 1.5, borderColor: MBM.gold, padding: 16, alignItems: 'center' }}>
                <MbmFramedImage source={item.image} ratio={item.ratio} label="Gambar keluarga" />
                <Text style={{ color: MBM.ink, fontSize: 13, lineHeight: 20, fontStyle: 'italic', textAlign: 'center', marginTop: 14 }}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>
      </MbmGreen>

      <View style={{ backgroundColor: MBM.ivory }} className="px-6 py-8">
        <View style={{ backgroundColor: '#fff', borderWidth: 2, borderColor: MBM.gold, borderRadius: 22, padding: 20 }}>
          <Text style={{ fontFamily: MBM_SERIF, fontSize: 24, lineHeight: 30, color: MBM.emerald, textAlign: 'center', textTransform: 'uppercase' }} accessibilityRole="header">
            Siapa yang layak memohon ?
          </Text>
          <MbmDivider />
          <Text style={{ color: MBM.ink, fontSize: 15, textAlign: 'center' }}>Ahli Ikhwan yang bersedia</Text>
          <Text style={{ color: MBM.emerald, fontWeight: '700', fontSize: 15, marginTop: 14, textTransform: 'uppercase' }}>Kami sediakan</Text>
          <View className="my-3 gap-3">
            {(
              [
                ['cash-outline', 'Insentif kewangan'],
                ['heart-outline', 'Bimbingan sehingga proses selesai'],
              ] as [IconName, string][]
            ).map(([icon, label]) => (
              <View key={label} className="flex-row items-center gap-3">
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: MBM.emerald, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={icon} size={17} color={MBM.goldLight} />
                </View>
                <Text style={{ color: MBM.ink, fontSize: 14, fontWeight: '600', flex: 1 }}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontFamily: MBM_SERIF, fontSize: 20, color: MBM.roseDeep, textAlign: 'center', textTransform: 'uppercase', marginVertical: 12 }}>
            Jom kami bantu anda
          </Text>
          <MbmGoldButton label="Daftar Sekarang" onPress={() => router.push('/(app)/baitul-muslim-daftar')} />
        </View>
      </View>

      <MbmGreen>
        <View className="px-6 py-8">
          <MbmHeading light>Jawatankuasa MBM</MbmHeading>
          <MbmDivider />
          <View className="mt-2 gap-3">
            <Person name="Ust Syahmun bin Yahaya" role="Pengerusi" />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Person name="Nik Mohd Kamal bin Ibrahim@Nik Hanafi" role="Timb. Pengerusi 1" />
              </View>
              <View className="flex-1">
                <Person name="Dr Nurul Khairani bt Ismail" role="Timb. Pengerusi 2" />
              </View>
            </View>
            <Person name="Nur Farhana bt Mohd Razali" role="Setiausaha" />
            <View style={{ borderWidth: 1, borderColor: MBM.gold, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <Text style={{ color: MBM.goldLight, fontSize: 11.5, marginBottom: 6 }}>Ahli Jawatankuasa</Text>
              {AJK.map((name) => (
                <Text key={name} style={{ color: '#DDEDE8', fontSize: 12.5, lineHeight: 22, textAlign: 'center' }}>
                  {name}
                </Text>
              ))}
            </View>
          </View>
        </View>
      </MbmGreen>

      <View style={{ backgroundColor: MBM.ivory }} className="px-6 py-8">
        <MbmHeading>Artikel berkaitan Baitul Muslim</MbmHeading>
        <MbmDivider />
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/(app)/baitul-muslim-big-rock')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: MBM.gold, borderRadius: 16, backgroundColor: '#fff' }}>
          <Ionicons name="document-text-outline" size={30} color={MBM.gold} />
          <Text style={{ flex: 1, color: MBM.emerald, fontWeight: '700', fontSize: 15 }}>Konsep The Big Rock dalam Proses Taaruf</Text>
          <Ionicons name="chevron-forward" size={18} color={MBM.emerald} />
        </Pressable>
      </View>

      <View style={{ backgroundColor: '#fff', borderTopWidth: 3, borderTopColor: MBM.gold }} className="px-6 py-6 pb-10">
        <Text style={{ fontFamily: MBM_SERIF, fontSize: 17, color: MBM.emerald, marginBottom: 10 }}>HUBUNGI</Text>
        <View className="flex-row flex-wrap" style={{ rowGap: 10 }}>
          {MBM_CONTACTS.map((contact) => (
            <Pressable
              key={contact.name}
              accessibilityRole="link"
              accessibilityLabel={'Telefon ' + contact.name}
              onPress={() => void Linking.openURL('tel:' + contact.phone.replace(/-/g, '')).catch(() => undefined)}
              style={{ width: '50%' }}>
              <Text style={{ color: MBM.ink, fontSize: 12.5 }}>{contact.name + ' : ' + contact.phone}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
