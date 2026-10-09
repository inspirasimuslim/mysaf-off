import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import type { UsrahMonthRecord } from '@/lib/usrah';
import { KAWASAN_USRAH_OPTIONS, MONTH_NAMES, dateLabel } from '@/types/database';
import { useColors } from '@/lib/theme';

/**
 * Satu bulan dalam Sejarah Kehadiran Usrah — dikongsi oleh skrin ahli dan
 * skrin pembetulan admin supaya kedua-duanya membaca rekod yang sama dengan
 * cara yang sama.
 *
 * Butiran (kawasan, tempat, tarikh) hanya dipapar untuk bulan HADIR. Bulan
 * tidak hadir atau tiada rekod cukup dengan statusnya.
 */

function kawasanLabel(code: string): string {
  return KAWASAN_USRAH_OPTIONS.find((option) => option.value === code)?.label ?? code;
}

function status(record: UsrahMonthRecord): { label: string; tone: 'positive' | 'neutral' | 'warn' } {
  if (record.attended === true) {
    return record.source === 'program_ganti'
      ? { label: 'Hadir · Program ganti', tone: 'warn' }
      : { label: 'Hadir', tone: 'positive' };
  }
  if (record.attended === false) return { label: 'Tidak Hadir', tone: 'neutral' };
  return { label: 'Tiada Rekod', tone: 'neutral' };
}

export function UsrahMonthRecordRow({
  record,
  onEdit,
  showRecordedBy = false,
}: {
  record: UsrahMonthRecord;
  /** Admin sahaja: butang "Edit" pada setiap baris. */
  onEdit?: () => void;
  /** Admin sahaja: papar sama ada rekod dari imbasan QR atau manual. */
  showRecordedBy?: boolean;
}) {
  const colors = useColors();
  const { label, tone } = status(record);
  const attended = record.attended === true;

  return (
    <View className="rounded-field border border-line bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <Text className={`text-base font-bold ${attended ? 'text-ink' : 'text-ink-muted'}`}>
          {MONTH_NAMES[record.month - 1]}
        </Text>
        <View className="flex-1" />
        <Badge label={label} tone={tone} />
        {onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Edit kehadiran ' + MONTH_NAMES[record.month - 1]}
            onPress={onEdit}
            hitSlop={8}
            className="flex-row items-center gap-1 active:opacity-70">
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text className="text-sm font-semibold text-primary">Edit</Text>
          </Pressable>
        ) : null}
      </View>

      {attended ? (
        <View className="mt-3 gap-1.5">
          <Detail
            icon="map-outline"
            text={record.kawasanAttended ? kawasanLabel(record.kawasanAttended) : 'Tiada rekod kawasan'}
            muted={!record.kawasanAttended}
          />
          {record.locationText ? <Detail icon="location-outline" text={record.locationText} /> : null}
          {record.attendedDate ? <Detail icon="calendar-outline" text={dateLabel(record.attendedDate)} /> : null}
        </View>
      ) : null}

      {showRecordedBy && record.recordedBy ? (
        <Text className="mt-2 text-xs text-ink-faint">
          {record.recordedBy === 'admin' ? 'Direkod / dibetulkan oleh admin' : 'Imbasan QR atau import'}
        </Text>
      ) : null}
    </View>
  );
}

function Detail({ icon, text, muted = false }: { icon: keyof typeof Ionicons.glyphMap; text: string; muted?: boolean }) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-2">
      <Ionicons name={icon} size={15} color={muted ? colors.inkFaint : colors.inkMuted} />
      <Text className={`flex-1 text-sm ${muted ? 'text-ink-faint' : 'text-ink'}`}>{text}</Text>
    </View>
  );
}
