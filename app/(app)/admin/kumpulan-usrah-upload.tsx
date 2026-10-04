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
import { ToastBanner } from '@/components/ui/toast';
import { ImportError } from '@/lib/ahli-import';
import { useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { importKumpulanUsrah } from '@/lib/kumpulan-usrah';
import {
  parseKumpulanUsrahWorkbook,
  summariseKumpulanUsrahGroups,
  type KumpulanUsrahParseResult,
  type MemberLookupRow,
} from '@/lib/kumpulan-usrah-import';
import { fetchMembers } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { useTemplateDownload } from '@/lib/template-download';
import { generationLabel, kawasanUsrahLabel } from '@/types/database';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Baris isu yang dipapar sekaligus; selebihnya diringkaskan sebagai kiraan. */
const ISSUE_LIMIT = 20;

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

type Done = {
  groupsCreated: number;
  membersAssigned: number;
  naqibAssigned: number;
  naqibSkipped: number;
  skipped: number;
};

/** Baca fail yang dipilih sebagai base64 — sama corak setiap skrin muat naik lain. */
async function readAsBase64(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (asset.base64) {
    const comma = asset.base64.indexOf(',');
    return asset.base64.startsWith('data:') && comma >= 0 ? asset.base64.slice(comma + 1) : asset.base64;
  }

  const { File } = await import('expo-file-system');
  return await new File(asset.uri).base64();
}

/**
 * Muat naik senarai Kumpulan Usrah (kawasan, kumpulan, ahli, naqib) — diminta
 * 2026-10-04. Satu baris Excel = satu ahli dalam satu kumpulan; kumpulan yang
 * belum wujud dicipta automatik semasa commit (lihat `importKumpulanUsrah()`).
 */
export default function KumpulanUsrahUploadScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = useUsrahAccess();

  const [banner, setBanner] = useState<Banner>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<KumpulanUsrahParseResult | null>(null);

  const [members, setMembers] = useState<MemberLookupRow[] | null>(null);

  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<Done | null>(null);

  const template = useTemplateDownload('kumpulan-usrah', setBanner);

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

  const pickFile = useCallback(async () => {
    if (picking || !members) return;

    setBanner(null);
    setDone(null);
    setPicking(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({ type: [XLSX_MIME], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) {
        setBanner({ tone: 'negative', message: 'Tiada fail dipilih.' });
        return;
      }

      const base64 = await readAsBase64(asset);
      const next = parseKumpulanUsrahWorkbook(base64, members);

      setFileName(asset.name);
      setParsed(next);

      setBanner({
        tone: next.unmatched.length ? 'info' : 'positive',
        message: next.unmatched.length
          ? next.matched.length + ' nama dipadankan, ' + next.unmatched.length + ' tidak dipadankan. Baris yang tidak dipadankan akan dilangkau — semak senarainya di bawah.'
          : next.matched.length + ' nama berjaya dipadankan. Semak pratonton sebelum mengesahkan.',
      });
    } catch (caught) {
      setParsed(null);
      setFileName(null);
      setBanner({
        tone: 'negative',
        message: caught instanceof ImportError ? caught.message : toMalayError(caught, 'Gagal membaca fail. Pastikan ia fail .xlsx yang sah.'),
      });
    } finally {
      setPicking(false);
    }
  }, [members, picking]);

  const confirmImport = useCallback(async () => {
    if (!parsed || importing) return;

    setBanner(null);
    setImporting(true);
    setProgress(0);

    try {
      const result = await importKumpulanUsrah(parsed.matched, ({ done: count }) => setProgress(count));

      setDone({ ...result, skipped: parsed.unmatched.length });
      setParsed(null);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Import gagal.') });
    } finally {
      setImporting(false);
    }
  }, [importing, parsed]);

  if (accessLoading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Muat Naik Kumpulan Usrah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Muat naik kumpulan usrah memerlukan kebenaran menyunting pada department LAJNAH TARBIAH."
          />
        </View>
      </Screen>
    );
  }

  const groups = parsed ? summariseKumpulanUsrahGroups(parsed.matched) : null;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Muat Naik Kumpulan Usrah"
        subtitle={fileName ?? 'Import senarai kumpulan, ahli dan naqib dari fail Excel'}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

        {!done ? (
          <View>
            <SectionTitle
              title="1. Pilih fail Excel"
              caption="Lajur: KAWASAN, KUMPULAN, NAMA, GENERASI, NAQIB (pilihan — 'YA' untuk naqib)."
            />
            <View className="gap-3">
              <SaveShareButtons
                kind="file"
                variant="secondary"
                webLabel="Muat Turun Template (.xlsx)"
                nativeCaption="Template Kumpulan Usrah (.xlsx)"
                busy={template.busy}
                onPress={(mode) => void template.download(mode)}
              />
              <Button label={fileName ?? 'Pilih Fail .xlsx'} variant="secondary" onPress={() => void pickFile()} loading={picking} disabled={!members} />
            </View>
          </View>
        ) : null}

        {parsed && groups ? (
          <View>
            <SectionTitle title="2. Pratonton Kumpulan" caption={groups.length + ' kumpulan akan dicipta/dikemas kini.'} />
            <View className="gap-2">
              {groups.slice(0, ISSUE_LIMIT).map((group) => (
                <Card key={group.kawasan + '|' + group.namaKumpulan}>
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">{group.namaKumpulan}</Text>
                      <Text className="text-xs text-ink-muted">{kawasanUsrahLabel(group.kawasan)}</Text>
                    </View>
                    <Badge label={group.jumlahAhli + ' ahli'} tone="neutral" />
                    {group.jumlahNaqib > 0 ? <Badge label={group.jumlahNaqib + ' naqib'} tone="primary" /> : null}
                  </View>
                </Card>
              ))}
              {groups.length > ISSUE_LIMIT ? (
                <Text className="px-1 text-xs text-ink-faint">+{groups.length - ISSUE_LIMIT} kumpulan lain.</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {parsed && parsed.unmatched.length > 0 ? (
          <View>
            <SectionTitle title="Baris Tidak Dipadankan" caption="Baris ini akan dilangkau — bukan ahli berdaftar atau tidak pasti." />
            <View className="gap-2">
              {parsed.unmatched.slice(0, ISSUE_LIMIT).map((row, index) => (
                <Notice
                  key={index}
                  tone="warn"
                  message={'Baris ' + row.row + ' — ' + row.name + (row.generasi ? ' (' + generationLabel(row.generasi) + ')' : '') + ': ' + row.message}
                />
              ))}
              {parsed.unmatched.length > ISSUE_LIMIT ? (
                <Text className="px-1 text-xs text-ink-faint">+{parsed.unmatched.length - ISSUE_LIMIT} baris lain tidak dipadankan.</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {parsed ? (
          <View className="gap-3 pb-8">
            <SectionTitle title="3. Sahkan Import" />
            {importing ? <Notice tone="info" message={'Memproses… ' + progress + ' baris selesai.'} /> : null}
            <Button label="Sahkan & Import" onPress={() => void confirmImport()} loading={importing} />
            <Button label="Batal" variant="secondary" onPress={() => setParsed(null)} disabled={importing} />
          </View>
        ) : null}

        {done ? (
          <View className="gap-3 pb-8">
            <ToastBanner
              tone="positive"
              message={
                done.groupsCreated +
                ' kumpulan baharu dicipta, ' +
                done.membersAssigned +
                ' ahli ditetapkan, ' +
                done.naqibAssigned +
                ' naqib dilantik.' +
                (done.naqibSkipped > 0 ? ' ' + done.naqibSkipped + ' naqib dilangkau (had 2/kumpulan tercapai).' : '') +
                (done.skipped > 0 ? ' ' + done.skipped + ' baris dilangkau (tidak dipadankan).' : '')
              }
            />
            <Button
              label="Muat Naik Fail Lain"
              variant="secondary"
              onPress={() => {
                setDone(null);
                setFileName(null);
                setBanner(null);
              }}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
