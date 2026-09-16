import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';

import { SaveShareButtons } from '@/components/save-share-buttons';
import { Notice } from '@/components/ui/notice';
import { Colors } from '@/constants/theme';
import { toMalayError } from '@/lib/errors';
import type { DeliveryMode } from '@/lib/file-delivery';
import { deliverImage, fileSlug, imageDeliveryMessage } from '@/lib/image-share';

const THUMB_BOX = 80;
const THUMB_QR = 64;
const MODAL_MAX_WIDTH = 420;
const MODAL_MAX_QR = 300;

/** Lebar imej kod QR yang disimpan — cukup tajam untuk diimbas semula dari galeri. */
const QR_IMAGE_WIDTH = 1080;

type Props = {
  token: string;
  eventName: string;
  subtitle?: string;
  /** Kod dipudarkan — contoh: admin sudah mematikan kod QR. */
  dimmed?: boolean;
  /** Kandungan tambahan di bawah baris thumbnail — status, togol admin. */
  children?: ReactNode;
};

/**
 * Kad kod QR kehadiran yang PADAT: thumbnail kecil, ketik untuk besarkan.
 *
 * Kod QR penuh saiz memakan separuh skrin sedangkan ia hanya perlu besar pada
 * saat diimbas atau disimpan. Modal memapar kod saiz penuh bersama butang
 * Simpan/Kongsi — hanya kad putih kod itu yang ditangkap sebagai imej.
 *
 * Dikongsi oleh skrin butiran admin dan skrin butiran ahli.
 */
export function EventQrCard({ token, eventName, subtitle, dimmed = false, children }: Props) {
  const { width } = useWindowDimensions();
  const qrSize = Math.max(160, Math.min(MODAL_MAX_QR, width - 120));

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<DeliveryMode | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openModal = useCallback(() => {
    setSaveNotice(null);
    setSaveError(null);
    setOpen(true);
  }, []);

  // Tidak ditutup di tengah tangkapan — imej perlu View yang masih dipasang.
  const close = useCallback(() => {
    if (!saving) setOpen(false);
  }, [saving]);

  const qrRef = useRef<View>(null);
  const saveQr = useCallback(
    async (mode: DeliveryMode) => {
      const view = qrRef.current;
      if (saving || !view) return;

      setSaveError(null);
      setSaveNotice(null);
      setSaving(mode);
      try {
        /*
          `captureRef` di web MENGABAIKAN `width` bila `height` tiada — imej keluar
          pada saiz skrin, terlalu kecil untuk diimbas semula dengan yakin.
          Kedua-duanya dihantar, mengikut nisbah kad sebenar, diukur pada saat
          tangkapan dan bukan melalui `onLayout` (tidak dijamin sudah berjalan).
        */
        const measured = await new Promise<{ width: number; height: number }>((resolve) =>
          view.measure((_x, _y, w, h) => resolve({ width: w, height: h })),
        );
        const size = measured.width
          ? { width: QR_IMAGE_WIDTH, height: Math.round((QR_IMAGE_WIDTH * measured.height) / measured.width) }
          : {};
        const uri = await captureRef(qrRef, {
          format: 'jpg',
          quality: 1,
          ...size,
          result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
        });
        const result = await deliverImage(uri, 'kod-qr-' + fileSlug(eventName) + '.jpg', 'Kod QR ' + eventName, mode);
        setSaveNotice(imageDeliveryMessage(result));
      } catch (caught) {
        console.warn('[event-qr-card] simpan kod QR gagal:', caught);
        setSaveError(toMalayError(caught, 'Gagal menyimpan kod QR. Cuba ambil screenshot skrin ini.'));
      } finally {
        setSaving(null);
      }
    },
    [eventName, saving],
  );

  return (
    <>
      <View className="overflow-hidden rounded-card border border-line bg-surface">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Besarkan kod QR kehadiran"
          onPress={openModal}
          className="flex-row items-center gap-4 p-3 active:opacity-70">
          <View
            style={{ width: THUMB_BOX, height: THUMB_BOX, opacity: dimmed ? 0.35 : 1 }}
            className="items-center justify-center rounded-field border border-line bg-white">
            <QRCode value={token} size={THUMB_QR} color={Colors.ink} backgroundColor={Colors.white} />
          </View>

          <View className="flex-1">
            <Text className="text-base font-semibold text-ink">Kod QR Kehadiran</Text>
            {subtitle ? <Text className="mt-0.5 text-xs text-ink-muted">{subtitle}</Text> : null}
            <View className="mt-1.5 flex-row items-center gap-1">
              <Ionicons name="expand-outline" size={14} color={Colors.primary} />
              <Text className="text-xs font-semibold text-primary">Ketik untuk besarkan</Text>
            </View>
          </View>
        </Pressable>

        {children ? <View className="gap-2 border-t border-line px-3 py-2.5">{children}</View> : null}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View className="flex-1 items-center justify-center bg-black/60 px-gutter">
          {/* Ketuk di luar kad untuk tutup. */}
          <Pressable accessibilityRole="button" accessibilityLabel="Tutup" className="absolute inset-0" onPress={close} />

          <View className="w-full rounded-card bg-surface p-card" style={{ maxWidth: MODAL_MAX_WIDTH }}>
            <View className="flex-row items-center gap-3">
              <Text className="flex-1 text-lg font-bold text-ink" numberOfLines={1}>
                Kod QR Kehadiran
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tutup"
                hitSlop={10}
                disabled={saving !== null}
                onPress={close}
                className="h-9 w-9 items-center justify-center rounded-pill border border-line bg-surface active:opacity-70">
                <Ionicons name="close" size={18} color={Colors.ink} />
              </Pressable>
            </View>

            <View className="items-center pt-4">
              {/*
                Sudut bulat pada pembalut SAHAJA: View yang ditangkap mesti segi
                empat tepat, kerana JPEG tiada ketelusan.
              */}
              <View style={{ borderRadius: 16, overflow: 'hidden' }}>
                <View
                  ref={qrRef}
                  collapsable={false}
                  style={{ backgroundColor: Colors.white, padding: 20, alignItems: 'center', maxWidth: qrSize + 40 }}>
                  <QRCode value={token} size={qrSize} color={Colors.ink} backgroundColor={Colors.white} />
                  {/* Nama acara ikut dalam imej supaya kod dalam galeri boleh dikenal pasti. */}
                  <Text
                    // `lineHeight` + ruang bawah eksplisit: tangkapan html2canvas (web) memotong
                    // separuh bawah teks bila tinggi baris dibiar kepada pelayar.
                    style={{ marginTop: 12, paddingBottom: 4, lineHeight: 20, color: Colors.ink }}
                    className="text-center text-sm font-semibold"
                    numberOfLines={2}>
                    {eventName}
                  </Text>
                </View>
              </View>
            </View>

            <View className="gap-3 pt-4">
              <SaveShareButtons
                kind="image"
                webLabel="Simpan/Screenshot Kod QR"
                busy={saving}
                onPress={(mode) => void saveQr(mode)}
              />
              {saveNotice ? <Notice tone="positive" message={saveNotice} /> : null}
              {saveError ? <Notice tone="negative" message={saveError} /> : null}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
