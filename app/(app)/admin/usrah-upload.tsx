import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ImportError } from '@/lib/ahli-import';
import { useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { fetchMembers } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { importUsrahAttendance } from '@/lib/usrah';
import {
  countAttended,
  countRecorded,
  parseUsrahWorkbook,
  summariseUsrah,
  type MemberLookupRow,
  type UsrahParseResult,
} from '@/lib/usrah-import';
import { generationLabel } from '@/types/database';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Baris pratonton yang dipapar sekaligus — senarai penuh 300+ baris tidak perlu dilukis. */
const PREVIEW_LIMIT = 25;
/** Nama tidak dipadankan yang dipapar sekaligus; selebihnya diringkaskan sebagai kiraan. */
const ISSUE_LIMIT = 20;

/** Julat tahun yang munasabah untuk rekod usrah. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

type Done = { year: number; members: number; rows: number; skipped: number };

/**
 * Baca fail yang dipilih sebagai base64.
 *
 * Di web `expo-document-picker` sudah memulangkan base64 terus. Di peranti ia
 * hanya memberi URI, jadi `expo-file-system` dimuatkan secara dinamik — modul
 * itu tidak menyokong web, jadi import statik akan memecahkan `expo start --web`.
 */
async function readAsBase64(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (asset.base64) {
    const comma = asset.base64.indexOf(',');
    return asset.base64.startsWith('data:') && comma >= 0 ? asset.base64.slice(comma + 1) : asset.base64;
  }

  const { File } = await import('expo-file-system');
  return await new File(asset.uri).base64();
}

export default function UsrahUploadScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = useUsrahAccess();

  const [banner, setBanner] = useState<Banner>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<UsrahParseResult | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  /** Senarai ahli untuk padanan nama — dibaca sekali, sebelum fail dipilih. */
  const [members, setMembers] = useState<MemberLookupRow[] | null>(null);

  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<Done | null>(null);

  /*
    Padanan dibuat terhadap Senarai Ahli, jadi senarai itu mesti ada SEBELUM
    fail dibaca — tanpa ia setiap baris akan dilaporkan sebagai tidak
    dipadankan, yang kelihatan seperti fail yang rosak.
  */
  useEffect(() => {
    if (accessLoading || !canEdit) return;
    let active = true;

    void (async () => {
      try {
        const rows = await fetchMembers();
        if (active) setMembers(rows.map(({ id, full_name, generasi }) => ({ id, full_name, generasi })));
      } catch (caught) {
        if (active) {
          setMembers(null);
          setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal membaca Senarai Ahli untuk padanan nama.') });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [accessLoading, canEdit]);

  const parsedYear = Number.parseInt(year, 10);
  const yearValid = Number.isFinite(parsedYear) && parsedYear >= MIN_YEAR && parsedYear <= MAX_YEAR;

  const pickFile = useCallback(async () => {
    if (picking || !members) return;

    setBanner(null);
    setDone(null);
    setPicking(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [XLSX_MIME],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) {
        setBanner({ tone: 'negative', message: 'Tiada fail dipilih.' });
        return;
      }

      const base64 = await readAsBase64(asset);
      const next = parseUsrahWorkbook(base64, members);

      setFileName(asset.name);
      setParsed(next);

      setBanner({
        tone: next.unmatched.length ? 'info' : 'positive',
        message: next.unmatched.length
          ? next.matched.length +
            ' nama dipadankan, ' +
            next.unmatched.length +
            ' tidak dipadankan. Baris yang tidak dipadankan akan dilangkau — semak senarainya di bawah.'
          : next.matched.length + ' nama berjaya dipadankan. Semak pratonton sebelum mengesahkan.',
      });
    } catch (caught) {
      setParsed(null);
      setFileName(null);
      setBanner({
        tone: 'negative',
        message:
          caught instanceof ImportError
            ? caught.message
            : toMalayError(caught, 'Gagal membaca fail. Pastikan ia fail .xlsx yang sah.'),
      });
    } finally {
      setPicking(false);
    }
  }, [members, picking]);

  const confirmImport = useCallback(async () => {
    if (!parsed || importing || !yearValid) return;

    setBanner(null);
    setImporting(true);
    setProgress(0);

    try {
      const rows = await importUsrahAttendance(parsed.matched, parsedYear, ({ done: count }) => setProgress(count));

      setDone({
        year: parsedYear,
        members: parsed.matched.length,
        rows,
        skipped: parsed.unmatched.length,
      });
      setParsed(null);
    } catch (caught) {
      setBanner({
        tone: 'negative',
        message: toMalayError(caught, 'Import gagal.') + ' ' + progress + ' baris sempat direkod sebelum ia terhenti.',
      });
    } finally {
      setImporting(false);
    }
  }, [importing, parsed, parsedYear, progress, yearValid]);

  if (accessLoading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Muat Naik Usrah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Muat naik kehadiran usrah memerlukan kebenaran menyunting pada department LAJNAH TARBIAH."
          />
        </View>
      </Screen>
    );
  }

  const stats = parsed ? summariseUsrah(parsed.matched) : null;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Muat Naik Usrah"
        subtitle={fileName ?? 'Import kehadiran usrah bulanan dari fail Excel'}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {/* --- Langkah 1: tahun ---------------------------------------------- */}
        {!done ? (
          <View>
            <SectionTitle
              title="1. Tahun rekod"
              caption="Kolum JAN hingga DIS dalam fail akan disimpan di bawah tahun ini."
            />
            <TextField
              label="Tahun"
              value={year}
              onChangeText={(value) => setYear(value.replace(/[^\d]/g, '').slice(0, 4))}
              editable={!importing}
              keyboardType="number-pad"
            />
            {!yearValid ? (
              <View className="pt-3">
                <Notice tone="negative" message={'Tahun mesti antara ' + MIN_YEAR + ' dan ' + MAX_YEAR + '.'} />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* --- Langkah 2: pilih fail ---------------------------------------- */}
        {!done ? (
          <View>
            <SectionTitle
              title="2. Pilih fail Excel"
              caption="Fail .xlsx dengan kolum NAMA, GENERASI dan JAN hingga DIS (0 = tidak hadir, 1 = hadir, kosong = belum ada rekod)."
            />
            <Button
              label={parsed ? 'Tukar Fail' : 'Pilih Fail .xlsx'}
              variant={parsed ? 'secondary' : 'primary'}
              loading={picking || members === null}
              disabled={picking || importing || members === null}
              onPress={() => void pickFile()}
            />
          </View>
        ) : null}

        {/* --- Langkah 3: pratonton ----------------------------------------- */}
        {parsed && stats ? (
          <>
            <View>
              <SectionTitle
                title="3. Pratonton"
                caption="Nama dipadankan mengikut generasi yang sama dahulu, kemudian nama sahaja jika ia unik."
              />

              <Card>
                <View className="gap-2">
                  <Line label="Baris dalam fail" value={String(parsed.totalRows)} />
                  <Line label="Ahli dipadankan" value={String(stats.members)} tone="positive" />
                  <Line label="Bulan berekod" value={String(stats.recorded)} />
                  <Line label="Bulan hadir" value={String(stats.attended)} />
                  {parsed.unmatched.length ? (
                    <Line label="Baris dilangkau" value={String(parsed.unmatched.length)} tone="negative" />
                  ) : null}
                </View>
              </Card>
            </View>

            {/*
              Nama yang tidak dipadankan dipapar sebagai amaran dan BUKAN sebagai
              penghalang: baris lain tetap boleh diimport, dan admin yang perlu
              membetulkan ejaan boleh membuatnya kemudian tanpa mengulang semula
              keseluruhan import.
            */}
            {parsed.unmatched.length ? (
              <View>
                <SectionTitle
                  title={'Tidak dipadankan (' + parsed.unmatched.length + ')'}
                  caption="Nama ini TIDAK ditemui dalam Senarai Ahli, jadi barisnya akan dilangkau. Import lain tetap diteruskan."
                />
                <View className="gap-2">
                  {parsed.unmatched.slice(0, ISSUE_LIMIT).map((issue, index) => (
                    <View key={index} className="rounded-field bg-warn-soft p-3">
                      <Text className="text-xs font-semibold text-warn">
                        Baris {issue.row} · {issue.name}
                        {issue.generasi ? ' · ' + generationLabel(issue.generasi) : ''}
                      </Text>
                      <Text className="mt-1 text-xs leading-4 text-warn">{issue.message}</Text>
                    </View>
                  ))}
                  {parsed.unmatched.length > ISSUE_LIMIT ? (
                    <Text className="text-sm text-ink-muted">
                      ...dan {parsed.unmatched.length - ISSUE_LIMIT} baris lain yang tidak dipadankan.
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View>
              <SectionTitle
                title={'Ahli dipadankan (' + stats.members + ')'}
                caption={'Memaparkan ' + Math.min(PREVIEW_LIMIT, stats.members) + ' baris pertama.'}
              />
              <View className="gap-2">
                {parsed.matched.slice(0, PREVIEW_LIMIT).map((match) => (
                  <View
                    key={match.memberId}
                    className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-4">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                        {match.fullName}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-muted">
                        {generationLabel(match.generasi)} · {countRecorded(match.months)} bulan berekod ·{' '}
                        {countAttended(match.months)} hadir
                      </Text>
                    </View>
                    {match.looseMatch ? <Badge label="Generasi lain" tone="warn" /> : null}
                  </View>
                ))}
                {stats.members > PREVIEW_LIMIT ? (
                  <Text className="text-sm text-ink-muted">...dan {stats.members - PREVIEW_LIMIT} ahli yang lain.</Text>
                ) : null}
              </View>
            </View>

            <View>
              <SectionTitle
                title="4. Sahkan"
                caption={
                  importing
                    ? progress + ' baris bulan direkod...'
                    : 'Kehadiran ' +
                      stats.members +
                      ' ahli bagi tahun ' +
                      (yearValid ? parsedYear : '—') +
                      ' akan ditulis. Rekod sedia ada bagi tahun yang sama akan DIKEMAS KINI, bukan diduplikasi.'
                }
              />
              <Button
                label="Sahkan Import"
                loading={importing}
                disabled={importing || stats.members === 0 || !yearValid}
                onPress={() => void confirmImport()}
              />
            </View>
          </>
        ) : null}

        {/* --- Langkah 4: ringkasan ----------------------------------------- */}
        {done ? (
          <>
            <Notice
              tone="positive"
              message={'Import selesai. Kehadiran ' + done.members + ' ahli bagi tahun ' + done.year + ' telah direkod.'}
            />

            <Card>
              <View className="gap-2">
                <Line label="Tahun" value={String(done.year)} />
                <Line label="Ahli direkod" value={String(done.members)} tone="positive" />
                <Line label="Baris bulan ditulis" value={String(done.rows)} />
                <Line
                  label="Baris diabaikan (tak match)"
                  value={String(done.skipped)}
                  tone={done.skipped ? 'negative' : 'default'}
                />
              </View>
            </Card>

            <Button label="Muat Naik Fail Lain" variant="secondary" onPress={() => void pickFile()} />
          </>
        ) : null}

        {!parsed && !done ? (
          <EmptyState
            icon="cloud-upload-outline"
            title="Belum ada fail"
            description="Pilih fail .xlsx untuk melihat pratonton. Tiada apa-apa ditulis ke pangkalan data sehingga anda menekan Sahkan Import."
          />
        ) : null}
      </View>
    </Screen>
  );
}

function Line({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  const valueClass = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink';

  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="flex-1 text-sm text-ink-muted">{label}</Text>
      <Text className={`text-base font-bold ${valueClass}`}>{value}</Text>
    </View>
  );
}
