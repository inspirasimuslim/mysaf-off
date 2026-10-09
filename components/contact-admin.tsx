import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { toWhatsAppNumber } from '@/lib/phone';
import { fetchSuperAdminContacts, type SuperAdminContact } from '@/lib/temp-password';
import { useColors } from '@/lib/theme';

/**
 * Senarai Super Admin yang boleh dihubungi, sebagai helaian bawah.
 *
 * Dikongsi oleh skrin log masuk DAN skrin "tempoh tamat" di dalam app, kerana
 * kedua-duanya membawa orang ke jalan buntu yang sama: dia tidak boleh masuk,
 * dan penyelesaiannya ialah bercakap dengan manusia.
 *
 * Kenalan dibaca melalui `list_super_admin_contacts()`, satu-satunya fungsi
 * dalam projek ini yang `anon` boleh panggil — kerana skrin log masuk belum
 * mempunyai sesi, dan nombor bantuan yang hanya kelihatan selepas log masuk
 * tidak membantu sesiapa yang benar-benar memerlukannya.
 */

const MAX_SHEET_WIDTH = 560;

export function ContactAdminLink({ label = 'Hubungi Admin' }: { label?: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={10}
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-center gap-2 py-3 active:opacity-70">
        <Ionicons name="help-buoy-outline" size={16} color={colors.primary} />
        <Text className="text-sm font-semibold text-primary">{label}</Text>
      </Pressable>

      <ContactAdminSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ContactAdminSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [contacts, setContacts] = useState<SuperAdminContact[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Dibaca semasa helaian dibuka dan bukan semasa skrin dipasang: kebanyakan
  // pembukaan skrin log masuk tidak berakhir di sini, dan permintaan rangkaian
  // yang tiada siapa minta hanya melambatkan skrin pertama.
  useEffect(() => {
    if (!visible) return;
    let active = true;

    setFailed(false);
    void (async () => {
      try {
        const rows = await fetchSuperAdminContacts();
        if (active) setContacts(rows);
      } catch {
        if (active) setFailed(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [visible]);

  const openWhatsApp = useCallback((contact: SuperAdminContact) => {
    const number = toWhatsAppNumber(contact.no_tel);
    if (!number) return;
    void Linking.openURL('https://wa.me/' + number);
  }, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="w-full self-center rounded-t-card bg-surface px-gutter pt-6"
          style={{ maxWidth: MAX_SHEET_WIDTH, paddingBottom: insets.bottom + 20 }}>
          <Text className="text-lg font-bold text-ink">Hubungi Admin</Text>
          <Text className="mt-1 text-sm text-ink-muted">
            Ketuk nama untuk menghubungi melalui WhatsApp.
          </Text>

          <ScrollView className="mt-4" style={{ maxHeight: 320 }}>
            {failed ? (
              <Text className="py-6 text-center text-sm text-ink-muted">
                Gagal memuatkan senarai. Semak talian internet anda dan cuba lagi.
              </Text>
            ) : contacts === null ? (
              <View className="py-8">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : contacts.length === 0 ? (
              <Text className="py-6 text-center text-sm text-ink-muted">
                Tiada nombor Super Admin direkodkan lagi.
              </Text>
            ) : (
              <View className="gap-2">
                {contacts.map((contact, index) => {
                  const number = toWhatsAppNumber(contact.no_tel);
                  return (
                    <Pressable
                      key={contact.full_name + index}
                      accessibilityRole="button"
                      accessibilityLabel={'WhatsApp ' + contact.full_name}
                      disabled={!number}
                      onPress={() => openWhatsApp(contact)}
                      className={`flex-row items-center gap-3 rounded-field border border-line p-4 ${
                        number ? 'active:opacity-70' : 'opacity-60'
                      }`}>
                      <View className="h-10 w-10 items-center justify-center rounded-pill bg-primary-soft">
                        <Ionicons name="logo-whatsapp" size={20} color={colors.primary} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-ink">{contact.full_name}</Text>
                        <Text className="mt-0.5 text-xs text-ink-muted">
                          {contact.no_tel ?? 'Tiada nombor telefon'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <View className="mt-4">
            <Button label="Tutup" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
