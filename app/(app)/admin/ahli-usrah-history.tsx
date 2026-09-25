import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { UsrahMonthRecordRow } from '@/components/usrah-month-record';
import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { OptionalDateField } from '@/components/ui/optional-date-field';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  adminSetUsrahAttendance,
  fetchUsrahYearRecords,
  usrahYearOptions,
  type UsrahMonthRecord,
} from '@/lib/usrah';
import { KAWASAN_USRAH_OPTIONS, MONTH_NAMES } from '@/types/database';

/**
 * Rekod / betulkan kehadiran usrah SEORANG ahli — LAJNAH TARBIAH.
 *
 * Dibuka dari ahli-detail. Setiap bulan boleh ditanda hadir atau tidak, dengan
 * kawasan, tempat dan tarikh. Penulisan melalui `admin_set_usrah_attendance()`,
 * yang menyemak kebenaran di pelayan dan merekodkannya dalam Log Aktiviti.
 */

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

type Draft = {
  month: number;
  hadir: 'hadir' | 'tidak';
  kawasan: string | null;
  lokasi: string;
  /** 'YYYY-MM-DD' atau '' */
  tarikh: string;
};

const YEAR_OPTIONS = usrahYearOptions();

const HADIR_OPTIONS = [
  { value: 'hadir' as const, label: 'Hadir' },
  { value: 'tidak' as const, label: 'Tidak hadir' },
];

export default function AhliUsrahHistoryScreen() {
  const goBack = useGoBack();
  const params = useLocalSearchParams<{ id?: string; nama?: string; nombor?: string }>();
  const { loading: accessLoading, canView, canEdit } = useUsrahAccess();

  const memberId = params.id ?? null;
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [months, setMonths] = useState<UsrahMonthRecord[] | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      setMonths(await fetchUsrahYearRecords(memberId, Number(year)));
    } catch (caught) {
      setMonths([]);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan kehadiran usrah.') });
    }
  }, [memberId, year]);

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView) return;
      void load();
    }, [accessLoading, canView, load]),
  );

  const openEdit = (record: UsrahMonthRecord) => {
    setBanner(null);
    setDraft({
      month: record.month,
      // Bulan tanpa rekod dibuka sebagai "Hadir" — sebab paling lazim admin masuk ke sini.
      hadir: record.attended === false ? 'tidak' : 'hadir',
      kawasan: record.kawasanAttended,
      lokasi: record.locationText ?? '',
      tarikh: record.attendedDate ?? '',
    });
  };

  const save = async () => {
    if (!draft || !memberId || saving) return;
    setSaving(true);
    try {
      const attended = draft.hadir === 'hadir';
      await adminSetUsrahAttendance({
        memberId,
        year: Number(year),
        month: draft.month,
        attended,
        kawasanAttended: attended ? draft.kawasan : null,
        locationText: attended ? draft.lokasi.trim() || null : null,
        attendedDate: attended ? draft.tarikh || null : null,
      });
      setBanner({ tone: 'positive', message: 'Kehadiran ' + MONTH_NAMES[draft.month - 1] + ' ' + year + ' disimpan.' });
      setDraft(null);
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan kehadiran.') });
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  if (accessLoading) return <LoadingScreen />;
  if (!canView || !memberId) {
    return (
      <NoAccessScreen
        title="Kehadiran Usrah"
        description="Rekod kehadiran usrah memerlukan kebenaran melihat pada department LAJNAH TARBIAH."
      />
    );
  }

  const hadir = (months ?? []).filter((record) => record.attended === true).length;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow={params.nombor ? 'Ahli ' + params.nombor : 'Panel Admin'}
          title={params.nama?.trim() || 'Ahli'}
          subtitle="Kehadiran Usrah"
          onBackPress={goBack}
        />

        <View className="gap-4 px-gutter pb-8 pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <PickerField
            label="Tahun"
            value={year}
            options={YEAR_OPTIONS}
            clearable={false}
            onChange={(next) => {
              if (!next || next === year) return;
              setMonths(null);
              setYear(next);
            }}
          />

          {months === null ? (
            <Text className="text-sm text-ink-muted">Memuatkan…</Text>
          ) : (
            <>
              <Text className="text-sm text-ink-muted">
                {'Hadir ' + hadir + ' daripada 12 bulan pada ' + year + '.'}
                {canEdit ? '' : ' Anda hanya boleh melihat — menyunting memerlukan kebenaran LAJNAH TARBIAH.'}
              </Text>
              <View className="gap-2">
                {months.map((record) => (
                  <UsrahMonthRecordRow
                    key={record.month}
                    record={record}
                    showRecordedBy
                    onEdit={canEdit ? () => openEdit(record) : undefined}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      </Screen>

      <FormModal
        visible={draft !== null}
        title={draft ? MONTH_NAMES[draft.month - 1] + ' ' + year : ''}
        description="Rekod ini ditanda sebagai dimasukkan oleh admin."
        onClose={() => setDraft(null)}
        dismissable={!saving}
        footer={
          <Button label="Simpan" loading={saving} disabled={saving} onPress={() => void save()} />
        }>
        {draft ? (
          <>
            <Segmented
              label="Status"
              value={draft.hadir}
              options={HADIR_OPTIONS}
              onChange={(next) => setDraft({ ...draft, hadir: next })}
              disabled={saving}
            />

            {draft.hadir === 'hadir' ? (
              <>
                <PickerField
                  label="Kawasan dihadiri"
                  value={draft.kawasan}
                  options={KAWASAN_USRAH_OPTIONS}
                  onChange={(next) => setDraft({ ...draft, kawasan: next })}
                  placeholder="Tiada rekod kawasan"
                  disabled={saving}
                />
                <TextField
                  label="Nama tempat (pilihan)"
                  placeholder="Contoh: Surau Taman Melawati"
                  value={draft.lokasi}
                  onChangeText={(value) => setDraft({ ...draft, lokasi: value })}
                  editable={!saving}
                  autoCapitalize="words"
                />
                <OptionalDateField
                  label="Tarikh (pilihan)"
                  value={draft.tarikh}
                  onChange={(value) => setDraft({ ...draft, tarikh: value })}
                  disabled={saving}
                />
              </>
            ) : (
              <Text className="text-sm text-ink-muted">
                Kawasan, tempat dan tarikh dikosongkan bagi bulan yang ditanda tidak hadir.
              </Text>
            )}
          </>
        ) : null}
      </FormModal>
    </>
  );
}
