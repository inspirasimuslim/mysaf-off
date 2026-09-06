import { Modal, Text, View } from 'react-native';

import { Button } from './button';

const MAX_WIDTH = 420;

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tindakan memusnahkan data — butang sahkan jadi merah. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Dialog sahkan merentas platform.
 *
 * `Alert.alert` daripada React Native TIDAK dipapar di web, sedangkan panel
 * Super Admin diuji melalui `expo start --web` — jadi dialog ini dibina
 * daripada `Modal` biasa supaya tingkah lakunya sama pada ketiga-tiga platform.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Sahkan',
  cancelLabel = 'Batal',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const close = () => {
    if (!busy) onCancel();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <View className="flex-1 items-center justify-center bg-black/40 px-gutter">
        <View className="w-full rounded-card bg-surface p-card" style={{ maxWidth: MAX_WIDTH }}>
          <Text className="text-lg font-bold text-ink">{title}</Text>
          <Text className="mt-2 text-sm leading-5 text-ink-muted">{message}</Text>

          <View className="mt-6 gap-3">
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              loading={busy}
              onPress={onConfirm}
            />
            <Button label={cancelLabel} variant="secondary" disabled={busy} onPress={close} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
