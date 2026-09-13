import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { ImportError, parseWorkbook, summarise, type ParseResult } from '@/lib/ahli-import';
import { useMemberAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { countMembers, importMembers } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { useTemplateDownload } from '@/lib/template-download';
import { generationLabel } from '@/types/database';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Baris pratonton yang dipapar sekaligus — senarai penuh 300+ baris tidak perlu dilukis. */
const PREVIEW_LIMIT = 25;
/** Isu yang dipapar sekaligus; selebihnya diringkaskan sebagai kiraan. */
const ISSUE_LIMIT = 20;

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

type Done = { inserted: number; withEmail: number; withoutEmail: number };

/**
 * Baca fail yang dipilih sebagai base64.
 *
 * Di web `expo-document-picker` sudah memulangkan base64 terus. Di peranti ia
 * hanya memberi URI, jadi `expo-file-system` dimuatkan secara dinamik — modul
 * itu tidak menyokong web, jadi import statik akan memecahkan `expo start --web`.
 */
async function readAsBase64(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (asset.base64) {
    // Buang awalan data: URI jika ada, supaya SheetJS menerima base64 tulen.
    const comma = asset.base64.indexOf(',');
    return asset.base64.startsWith('data:') && comma >= 0 ? asset.base64.slice(comma + 1) : asset.base64;
  }

  const { File } = await import('expo-file-system');
  return await new File(asset.uri).base64();
}

export default function AhliUploadScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = useMemberAccess();

  const [banner, setBanner] = useState<Banner>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [existing, setExisting] = useState<number | null>(null);

  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<Done | null>(null);

  const template = useTemplateDownload('ahli', setBanner);

  // Jumlah rekod sedia ada dibaca awal supaya amaran "akan menimpa" boleh dipapar
  // sebelum pengguna menekan Sahkan, bukan selepasnya.
  useEffect(() => {
    if (accessLoading || !canEdit) return;
    let active = true;

    void (async () => {
      try {
        const count = await countMembers();
        if (active) setExisting(count);
      } catch {
        // Kiraan ini hanya hiasan amaran — kegagalannya tidak menghalang import.
        if (active) setExisting(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessLoading, canEdit]);

  const pickFile = useCallback(async () => {
    if (picking) return;

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
      const next = parseWorkbook(base64);

      setFileName(asset.name);
      setParsed(next);

      const errors = next.issues.filter((issue) => issue.level === 'ralat').length;
      setBanner({
        tone: errors ? 'info' : 'positive',
        message: errors
          ? next.members.length + ' baris sedia diimport, ' + errors + ' baris ditolak. Semak senarai isu di bawah.'
          : next.members.length + ' baris berjaya dibaca. Semak pratonton sebelum mengesahkan.',
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
  }, [picking]);

  const confirmImport = useCallback(async () => {
    if (!parsed || importing) return;

    setBanner(null);
    setImporting(true);
    setProgress(0);

    try {
      const inserted = await importMembers(parsed.members, ({ done: count }) => setProgress(count));
      const stats = summarise(parsed.members);

      setDone({ inserted, withEmail: stats.withEmail, withoutEmail: stats.withoutEmail });
      setParsed(null);
      setExisting(await countMembers().catch(() => inserted));
    } catch (caught) {
      setBanner({
        tone: 'negative',
        message:
          toMalayError(caught, 'Import gagal.') +
          ' ' +
          progress +
          ' daripada ' +
          parsed.members.length +
          ' baris sempat direkod sebelum ia terhenti.',
      });
    } finally {
      setImporting(false);
    }
  }, [importing, parsed, progress]);

  if (accessLoading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Muat Naik Ahli" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Muat naik senarai ahli memerlukan kebenaran menyunting pada department JABATAN DATA & SUMBER MANUSIA."
          />
        </View>
      </Screen>
    );
  }

  const stats = parsed ? summarise(parsed.members) : null;
  const errors = parsed?.issues.filter((issue) => issue.level === 'ralat') ?? [];
  const warnings = parsed?.issues.filter((issue) => issue.level === 'amaran') ?? [];

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Muat Naik Ahli"
        subtitle={fileName ?? 'Import senarai ahli dari fail Excel'}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {/* --- Langkah 1: pilih fail ---------------------------------------- */}
        {!done ? (
          <View>
            <SectionTitle
              title="1. Pilih fail Excel"
              caption="Fail .xlsx dengan pengepala asal (UserName, Generasi, Email dan lain-lain), atau fail eksport Senarai Ahli yang membawa lajur NomborAhli."
            />
            <View className="gap-3">
              <SaveShareButtons
                kind="file"
                variant="ghost"
                webLabel="Muat Turun Template"
                nativeCaption="Template Excel"
                busy={template.busy}
                disabled={picking || importing}
                onPress={(mode) => void template.download(mode)}
              />
              <Button
                label={parsed ? 'Tukar Fail' : 'Pilih Fail .xlsx'}
                variant={parsed ? 'secondary' : 'primary'}
                loading={picking}
                disabled={picking || importing}
                onPress={() => void pickFile()}
              />
            </View>
          </View>
        ) : null}

        {/* --- Langkah 2: pratonton ----------------------------------------- */}
        {parsed && stats ? (
          <>
            <View>
              <SectionTitle
                title="2. Pratonton"
                caption={
                  parsed.hasMemberNumbers
                    ? 'Nombor ahli diambil daripada lajur NomborAhli dalam fail.'
                    : 'Nombor ahli diberikan mengikut generasi i01 → i27, kemudian nama A–Z.'
                }
              />

              <Card>
                <View className="gap-2">
                  <Line label="Baris dalam fail" value={String(parsed.totalRows)} />
                  <Line label="Sedia diimport" value={String(stats.total)} />
                  <Line label="Ada emel" value={String(stats.withEmail)} />
                  <Line label="Tiada emel" value={String(stats.withoutEmail)} />
                  {errors.length ? <Line label="Ditolak" value={String(errors.length)} tone="negative" /> : null}
                </View>
              </Card>
            </View>

            {/*
              Tanpa NomborAhli, nombor 0001.. diberi semula mengikut susunan dan
              upsert menulis ke atas rekod yang kebetulan memegang nombor itu —
              bukan orang yang sama. Amaran ini merah kerana kesilapannya senyap:
              import "berjaya", tetapi data ahli sudah bertukar tuan.
            */}
            {existing ? (
              parsed.hasMemberNumbers ? (
                <Notice
                  tone="warn"
                  message={
                    'Pangkalan data sudah mempunyai ' +
                    existing +
                    ' rekod ahli. Baris dengan NomborAhli yang sama akan DIKEMAS KINI, bukan diduplikasi.'
                  }
                />
              ) : (
                <Notice
                  tone="negative"
                  message={
                    'Fail ini TIADA lajur NomborAhli. Nombor diberi semula mengikut generasi dan nama, dan akan MENIMPA ' +
                    Math.min(existing, stats.total) +
                    ' rekod sedia ada yang bernombor sama walaupun orangnya berbeza. Untuk mengemas kini data sedia ada, gunakan "Muat Turun Semua Data Ahli" di Senarai Ahli, sunting fail itu, dan muat naik semula.'
                  }
                />
              )
            ) : null}

            {errors.length ? (
              <View>
                <SectionTitle
                  title={'Baris ditolak (' + errors.length + ')'}
                  caption="Baris ini TIDAK akan diimport. Betulkan fail sumber jika ia sepatutnya masuk."
                />
                <View className="gap-2">
                  {errors.slice(0, ISSUE_LIMIT).map((issue, index) => (
                    <IssueLine key={index} row={issue.row} name={issue.name} message={issue.message} tone="negative" />
                  ))}
                  {errors.length > ISSUE_LIMIT ? (
                    <Text className="text-sm text-ink-muted">
                      ...dan {errors.length - ISSUE_LIMIT} baris ditolak yang lain.
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {warnings.length ? (
              <View>
                <SectionTitle
                  title={'Amaran (' + warnings.length + ')'}
                  caption="Baris ini TETAP diimport, tetapi nilainya patut disemak selepas import."
                />
                <View className="gap-2">
                  {warnings.slice(0, ISSUE_LIMIT).map((issue, index) => (
                    <IssueLine key={index} row={issue.row} name={issue.name} message={issue.message} tone="warn" />
                  ))}
                  {warnings.length > ISSUE_LIMIT ? (
                    <Text className="text-sm text-ink-muted">
                      ...dan {warnings.length - ISSUE_LIMIT} amaran yang lain.
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View>
              <SectionTitle
                title={'Senarai ahli (' + stats.total + ')'}
                caption={'Memaparkan ' + Math.min(PREVIEW_LIMIT, stats.total) + ' baris pertama.'}
              />
              <View className="gap-2">
                {parsed.members.slice(0, PREVIEW_LIMIT).map((member) => (
                  <View
                    key={member.nombor_ahli}
                    className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-4">
                    <Text className="w-12 text-sm font-bold text-primary">{member.nombor_ahli}</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                        {member.full_name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-muted">{generationLabel(member.generasi)}</Text>
                    </View>
                    <Badge label={member.email ? 'Ada emel' : 'Tiada emel'} tone={member.email ? 'positive' : 'neutral'} />
                  </View>
                ))}
                {stats.total > PREVIEW_LIMIT ? (
                  <Text className="text-sm text-ink-muted">...dan {stats.total - PREVIEW_LIMIT} ahli yang lain.</Text>
                ) : null}
              </View>
            </View>

            <View>
              <SectionTitle
                title="3. Sahkan"
                caption={
                  importing
                    ? progress + ' daripada ' + stats.total + ' baris direkod...'
                    : 'Selepas disahkan, ' + stats.total + ' rekod akan ditulis ke pangkalan data.'
                }
              />
              <Button
                label="Sahkan Import"
                loading={importing}
                disabled={importing || stats.total === 0}
                onPress={() => void confirmImport()}
              />
            </View>
          </>
        ) : null}

        {/* --- Langkah 3: ringkasan ----------------------------------------- */}
        {done ? (
          <>
            <Notice tone="positive" message={'Import selesai. ' + done.inserted + ' rekod ahli telah direkod.'} />

            <Card>
              <View className="gap-2">
                <Line label="Rekod diimport" value={String(done.inserted)} />
                <Line label="Ada emel (boleh dapat akaun)" value={String(done.withEmail)} tone="positive" />
                <Line label="Tiada emel" value={String(done.withoutEmail)} />
                {existing !== null ? <Line label="Jumlah ahli kini" value={String(existing)} /> : null}
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

function Line({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  const valueClass =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink';

  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="flex-1 text-sm text-ink-muted">{label}</Text>
      <Text className={`text-base font-bold ${valueClass}`}>{value}</Text>
    </View>
  );
}

function IssueLine({
  row,
  name,
  message,
  tone,
}: {
  row: number;
  name: string;
  message: string;
  tone: 'negative' | 'warn';
}) {
  const box = tone === 'negative' ? 'bg-negative-soft' : 'bg-warn-soft';
  const text = tone === 'negative' ? 'text-negative' : 'text-warn';

  return (
    <View className={`rounded-field p-3 ${box}`}>
      <Text className={`text-xs font-semibold ${text}`}>
        {row > 0 ? 'Baris ' + row + ' · ' : ''}
        {name}
      </Text>
      <Text className={`mt-1 text-xs leading-4 ${text}`}>{message}</Text>
    </View>
  );
}
