import { View } from "react-native";

import { ToggleRow } from "@/components/ui/toggle-row";

export type EventNotiValue = {
  baharu: boolean;
  peringatan: boolean;
  perubahan: boolean;
};

export const EVENT_NOTI_DEFAULT: EventNotiValue = {
  baharu: true,
  peringatan: true,
  perubahan: true,
};

/**
 * Suis notifikasi push + loceng untuk program/usrah (3 suis) dan pengumuman (tanpa peringatan,
 * kerana pengumuman tiada masa mula). Penerima: semua ahli aktif; usrah kawasan -> ahli kawasan itu.
 */
export function EventNotificationToggles({
  value,
  onChange,
  disabled,
  withReminder = true,
  showNew = true,
  newLabel = "Beritahu ahli bila dicipta",
}: {
  value: EventNotiValue;
  onChange: (next: EventNotiValue) => void;
  disabled?: boolean;
  withReminder?: boolean;
  /** Suis "bila dicipta" hanya bermakna semasa mencipta; sorok ketika menyunting. */
  showNew?: boolean;
  newLabel?: string;
}) {
  return (
    <View collapsable={false} className="gap-3">
      {showNew ? (
        <ToggleRow
          icon="notifications-outline"
          title={newLabel}
          subtitle={
            value.baharu
              ? "Ahli menerima notifikasi sebaik sahaja ini dicipta."
              : "Tiada notifikasi semasa dicipta."
          }
          value={value.baharu}
          onValueChange={(baharu) => onChange({ ...value, baharu })}
          disabled={disabled}
        />
      ) : null}
      {withReminder ? (
        <ToggleRow
          icon="alarm-outline"
          title="Peringatan sebelum bermula"
          subtitle={
            value.peringatan
              ? "Dihantar 24 jam dan 2 jam sebelum bermula."
              : "Tiada peringatan."
          }
          value={value.peringatan}
          onValueChange={(peringatan) => onChange({ ...value, peringatan })}
          disabled={disabled}
        />
      ) : null}
      <ToggleRow
        icon="create-outline"
        title={
          withReminder
            ? "Beritahu perubahan atau pembatalan"
            : "Beritahu bila dikemas kini"
        }
        subtitle={
          value.perubahan
            ? withReminder
              ? "Ahli dimaklumkan jika masa, lokasi atau nama berubah, atau program dibatalkan."
              : "Ahli dimaklumkan jika tajuk, penerangan atau poster berubah."
            : "Perubahan tidak dimaklumkan."
        }
        value={value.perubahan}
        onValueChange={(perubahan) => onChange({ ...value, perubahan })}
        disabled={disabled}
      />
    </View>
  );
}
