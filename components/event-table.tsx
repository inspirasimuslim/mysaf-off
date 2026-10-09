import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { View } from 'react-native';

import type { EventRowAction } from '@/components/event-list-row';
import { Badge } from '@/components/ui/badge';
import { CellText, DataTable, RowIconAction } from '@/components/ui/data-table';
import {
  USRAH_EVENT_STATUS_LABEL,
  dateRangeLabel,
  timeRangeLabel,
  usrahEventStatus,
  type UsrahEvent,
} from '@/types/database';
import { useColors } from '@/lib/theme';

const STATUS_TONE = { aktif: 'positive', tamat: 'neutral', nonaktif: 'warn' } as const;

/**
 * Padanan desktop bagi `EventListRow`: jadual acara dengan tindakan (eksport,
 * padam) sebagai ikon di hujung baris. `actions` ialah senarai yang sama yang
 * diberikan kepada `EventListRow` di mobile.
 */
export function EventTable({
  events,
  onPress,
  actionsFor,
  busyId,
}: {
  events: UsrahEvent[];
  onPress: (event: UsrahEvent) => void;
  actionsFor: (event: UsrahEvent) => EventRowAction[];
  busyId: string | null;
}) {
  const colors = useColors();
  return (
    <DataTable
      rows={events}
      keyOf={(event) => event.id}
      onRowPress={onPress}
      actionsWidth={120}
      columns={[
        {
          key: 'poster',
          header: '',
          width: 52,
          render: (event) => (
            <View className="h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-background">
              {event.poster_url ? (
                <Image source={{ uri: event.poster_url }} style={{ width: 32, height: 32 }} contentFit="cover" />
              ) : (
                <Ionicons name="image-outline" size={16} color={colors.inkFaint} />
              )}
            </View>
          ),
        },
        { key: 'nama', header: 'Nama', flex: 3, render: (event) => <CellText strong>{event.name}</CellText> },
        {
          key: 'tarikh',
          header: 'Tarikh',
          flex: 2,
          render: (event) => <CellText muted>{dateRangeLabel(event.start_date, event.end_date)}</CellText>,
        },
        {
          key: 'masa',
          header: 'Masa',
          width: 150,
          render: (event) => <CellText muted>{timeRangeLabel(event.start_time, event.end_time)}</CellText>,
        },
        {
          key: 'status',
          header: 'Status',
          width: 100,
          render: (event) => {
            const status = usrahEventStatus(event);
            return <Badge label={USRAH_EVENT_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
          },
        },
      ]}
      actions={(event) =>
        actionsFor(event).map((action) => (
          <RowIconAction
            key={action.key}
            icon={action.icon}
            label={action.label}
            destructive={action.destructive}
            busy={busyId === event.id}
            disabled={busyId !== null}
            onPress={action.onPress}
          />
        ))
      }
    />
  );
}
