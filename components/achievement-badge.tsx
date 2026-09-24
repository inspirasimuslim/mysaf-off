import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { RANK_GOLD } from '@/constants/theme';
import type { MyActivityRank } from '@/lib/activity-rank';

/*
  Lencana pencapaian — satu-satunya tempat dalam app di mana seseorang melihat
  kedudukannya sendiri secara penuh.

  Gradient hijau gelap ialah warna jenama, bukan warna baharu; emas dipakai
  HANYA pada nombor kedudukan dan pingat, supaya mata jatuh pada satu perkara.
  Kilauan pepenjuru itu satu lapisan gradient lutsinar, bukan animasi: ia
  memberi permukaan itu rasa "lencana" tanpa apa-apa yang berjalan pada thread
  UI setiap bingkai.
*/
const BADGE_GRADIENT = ['#4A3B6B', '#6B5B95'] as const;
const SHINE = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0)'] as const;

/** Tanda semantik (berjaya) kekal hijau, lebih cerah daripada `positive`: pada latar gelap, #16A34A hilang. */
const TICK = '#4ADE80';
const CROSS = 'rgba(255,255,255,0.38)';

type Item = { label: string; done: boolean };

/*
  Label sengaja satu atau dua perkataan. Lencana ini hidup dalam lajur selebar
  kira-kira 140px di sebelah kad maklumat, dan "Kehadiran Usrah (7 bulan)" tidak
  muat di situ tanpa dipotong — jadi ia dipendekkan, bukan dibiarkan terpotong.
*/
function items(rank: MyActivityRank): Item[] {
  return [
    { label: 'Yuran', done: rank.yuran_lunas },
    { label: 'PIPIS', done: rank.pipis_sumbang },
    { label: 'Usrah ' + rank.usrah_bulan + 'b', done: rank.usrah_bulan > 0 },
    { label: 'Jawatan Org', done: rank.ada_jawatan_org },
    { label: 'Jawatan PAS', done: rank.ada_jawatan_pas },
  ];
}

/**
 * Lencana pencapaian — lajur kanan di Profil, di sebelah kad maklumat.
 *
 * Nombor kedudukan sengaja kekal besar sementara segala-galanya mengecil:
 * dalam ruang sekecil ini, satu perkara sahaja boleh menjadi perkara utama,
 * dan lima tanda semak itu penjelasannya, bukan pesaingnya.
 */
export function AchievementBadge({ rank }: { rank: MyActivityRank }) {
  return (
    <LinearGradient
      colors={BADGE_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1, borderRadius: 20, padding: 12, overflow: 'hidden' }}>
      {/*
        Kilauan pepenjuru ialah satu lapisan gradient lutsinar, bukan animasi:
        ia memberi permukaan itu rasa "lencana" tanpa apa-apa yang berjalan pada
        thread UI setiap bingkai.
      */}
      <LinearGradient
        colors={SHINE}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        pointerEvents="none"
      />

      <View className="flex-row items-center gap-1.5">
        <Ionicons name="medal" size={14} color={RANK_GOLD} />
        <Text className="text-[10px] font-semibold uppercase" style={{ color: 'rgba(255,255,255,0.65)' }}>
          Ranking
        </Text>
      </View>

      <View className="mt-0.5 flex-row items-baseline gap-1">
        <Text className="text-2xl font-bold" style={{ color: RANK_GOLD }} numberOfLines={1}>
          {'#' + rank.rank}
        </Text>
        <Text className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }} numberOfLines={1}>
          {'/' + rank.total_ahli}
        </Text>
      </View>

      <View className="mt-2.5 gap-1.5">
        {items(rank).map((item) => (
          <View key={item.label} className="flex-row items-center gap-1.5">
            <Ionicons
              name={item.done ? 'checkmark-circle' : 'close-circle'}
              size={13}
              color={item.done ? TICK : CROSS}
            />
            <Text
              className="flex-1 text-[11px]"
              style={{ color: item.done ? '#FFFFFF' : 'rgba(255,255,255,0.55)' }}
              numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}
