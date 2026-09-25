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
import { usePipisAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { fetchMembers } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { importPipisContribution, ringgitPipis } from '@/lib/pipis';
import { parsePipisWorkbook, summarisePipis, type PipisParseResult } from '@/lib/pipis-import';
import { useTemplateDownload } from '@/lib/template-download';
import type { MemberLookupRow } from '@/lib/usrah-import';
import { generationLabel } from '@/types/database';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Baris pratonton yang dipapar sekaligus — senarai penuh 300+ baris tidak perlu dilukis. */
const PREVIEW_LIMIT = 20;
const ISSUE_LIMIT = 25;

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

type Done = { members: number; total: number };

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

/**
 * Import sumbangan PIPIS ASET daripada fail Excel.
 *
 * Tidak seperti import baki permulaan yuran, skrin ini BUKAN pemindahan sekali
 * sahaja: senarai sumbangan dikemas kini dari semasa ke semasa, dan fail yang
 * sama akan dimuat naik semula dengan angka yang lebih besar. Sebab itu setiap
 * larian MENGGANTIKAN rekod import ahli dan bukan menambahnya.
 */
export default function PipisUploadScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = usePipisAccess();

  const [banner, setBanner] = useState<Banner>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<PipisParseResult | null>(null);
  const [members, setMembers] = useState<MemberLookupRow[] | null>(null);

  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<Done | null>(null);

  const template = useTemplateDownload('pipis', setBanner);

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
          setBanner({
            tone: 'negative',
            message: toMalayError(caught, 'Gagal membaca Senarai Ahli untuk padanan nama.'),
          });
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
      const result = await DocumentPicker.getDocumentAsync({
        type: [XLSX_MIME],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets.length) return;

      const asset = result.assets[0] as DocumentPicker.DocumentPickerAsset;
      const base64 = await readAsBase64(asset);

      setFileName(asset.name);
      setParsed(parsePipisWorkbook(base64, members));
    } catch (caught) {
      setParsed(null);
      setBanner({
        tone: 'negative',
        message:
          caught instanceof ImportError ? caught.message : toMalayError(caught, 'Gagal membaca fail Excel.'),
      });
    } finally {
      setPicking(false);
    }
  }, [members, picking]);

  const runImport = useCallback(async () => {
    if (!parsed || importing || parsed.matched.length === 0) return;

    setBanner(null);
    setImporting(true);
    setProgress(0);

    try {
      /*
        Satu panggilan seorang ahli, bukan satu tulisan pukal. RPC itu memadam
        rekod import lama dan menulis yang baharu dalam satu transaksi bagi
        setiap ahli, jadi kegagalan di tengah meninggalkan ahli yang sudah
        selesai dalam keadaan yang sah dan boleh dijalankan semula.
      */
      for (const [index, row] of parsed.matched.entries()) {
        await importPipisContribution(row.memberId, row.amount);
        setProgress(index + 1);
      }

      const summary = summarisePipis(parsed.matched);
      setDone({ members: summary.members, total: summary.total });
      setBanner({
        tone: 'positive',
        message: 'Sumbangan diimport untuk ' + summary.members + ' ahli.',
      });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Import gagal di pertengahan.') });
    } finally {
      setImporting(false);
    }
  }, [importing, parsed]);

  if (accessLoading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Import Sumbangan PIPIS" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Import sumbangan memerlukan kebenaran menyunting pada department LAJNAH EKONOMI DAN ASET."
          />
        </View>
      </Screen>
    );
  }

  const summary = parsed ? summarisePipis(parsed.matched) : null;
  const nearMatches = parsed?.matched.filter((row) => row.nearMatch !== null) ?? [];

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Import Sumbangan PIPIS"
        subtitle="Padanan nama terhadap Senarai Ahli"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

        <View>
          <SectionTitle
            title="Fail Excel"
            caption="Kolum: NAMA, GENERASI, KAWASAN, STATUS, JUMLAH_SUMBANGAN."
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
              label={fileName ? 'Tukar Fail' : 'Pilih Fail .xlsx'}
              variant="secondary"
              loading={picking || members === null}
              disabled={picking || members === null || importing}
              onPress={() => void pickFile()}
            />
          </View>
          {fileName ? <Text className="pt-2 text-xs text-ink-muted">{fileName}</Text> : null}
        </View>

        {parsed && summary ? (
          <>
            <View>
              <SectionTitle title="Ringkasan" caption="Semak sebelum mengimport — tiada apa ditulis lagi." />
              <Card>
                <View className="gap-2">
                  <Line label="Baris dalam fail" value={String(parsed.totalRows)} />
                  <Line label="Dipadankan" value={String(summary.members)} />
                  <Line label="Tidak dipadankan" value={String(parsed.unmatched.length)} />
                  <Line label="Jumlah sumbangan" value={ringgitPipis(summary.total)} />
                  <Line label="Baris RM0 (tiada rekod ditulis)" value={String(summary.zeroRows)} />
                  <Line label="Capai RM5,000" value={String(summary.reachedTarget)} />
                </View>
              </Card>
            </View>

            {/*
              Padanan hampir dipapar SEBELUM butang import dan bukan selepasnya.
              Ia satu-satunya bahagian import ini yang melibatkan pertimbangan,
              jadi ia perlu dilihat ketika keputusan masih boleh diubah.
            */}
            {nearMatches.length > 0 ? (
              <View>
                <SectionTitle
                  title={'Padanan Hampir (' + nearMatches.length + ')'}
                  caption="Ejaan berbeza antara fail dan Senarai Ahli. Semak sebelum import."
                />
                <View className="gap-2">
                  {nearMatches.slice(0, ISSUE_LIMIT).map((row) => (
                    <View key={row.memberId} className="rounded-field border border-warn/30 bg-warn-soft p-3">
                      <Text className="text-xs text-ink-muted">{row.fileName}</Text>
                      <Text className="mt-0.5 text-sm font-semibold text-ink">→ {row.fullName}</Text>
                    </View>
                  ))}
                  {nearMatches.length > ISSUE_LIMIT ? (
                    <Text className="text-xs text-ink-muted">
                      {'… dan ' + (nearMatches.length - ISSUE_LIMIT) + ' lagi.'}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/*
              Nama yang tersasar TIDAK menghentikan import. Baris yang dipadankan
              tetap ditulis, dan yang tinggal disenaraikan di sini untuk
              dibetulkan — menolak keseluruhan fail kerana beberapa ejaan
              bermakna sumbangan 300 orang lain menunggu tanpa sebab.
            */}
            {parsed.unmatched.length > 0 ? (
              <View>
                <SectionTitle
                  title={'Tidak Dipadankan (' + parsed.unmatched.length + ')'}
                  caption="Baris ini TIDAK akan diimport. Betulkan ejaan dalam fail atau dalam Senarai Ahli."
                />
                <View className="gap-2">
                  {parsed.unmatched.slice(0, ISSUE_LIMIT).map((row) => (
                    <View key={row.row} className="rounded-field border border-negative/30 bg-negative-soft p-3">
                      <Text className="text-sm font-semibold text-ink">
                        {'Baris ' + row.row + ': ' + row.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-muted">{row.message}</Text>
                    </View>
                  ))}
                  {parsed.unmatched.length > ISSUE_LIMIT ? (
                    <Text className="text-xs text-ink-muted">
                      {'… dan ' + (parsed.unmatched.length - ISSUE_LIMIT) + ' lagi.'}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View>
              <SectionTitle title={'Pratonton (' + Math.min(PREVIEW_LIMIT, summary.members) + ' pertama)'} />
              <View className="gap-2">
                {parsed.matched.slice(0, PREVIEW_LIMIT).map((row) => (
                  <View
                    key={row.memberId}
                    className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-3">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                        {row.fullName}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-muted">{generationLabel(row.generasi)}</Text>
                    </View>
                    <Text className="text-sm font-bold text-ink">{ringgitPipis(row.amount)}</Text>
                    {row.nearMatch !== null ? <Badge label="Hampir" tone="warn" /> : null}
                  </View>
                ))}
              </View>
            </View>

            <View className="pb-8">
              {importing ? (
                <Text className="pb-3 text-center text-sm text-ink-muted">
                  {'Mengimport ' + progress + ' / ' + summary.members + '...'}
                </Text>
              ) : null}

              {done ? (
                <View className="pb-3">
                  <Notice
                    tone="positive"
                    message={
                      done.members + ' ahli diimport. Jumlah sumbangan ' + ringgitPipis(done.total) + '.'
                    }
                  />
                </View>
              ) : null}

              <Button
                label={'Import ' + summary.members + ' Ahli'}
                loading={importing}
                disabled={importing || summary.members === 0}
                onPress={() => void runImport()}
              />
              <Text className="pt-2 text-center text-xs text-ink-muted">
                Selamat dijalankan berulang — rekod import ahli yang sama digantikan, bukan digandakan.
                Pelarasan manual tidak disentuh.
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="flex-1 text-sm text-ink-muted">{label}</Text>
      <Text className="text-base font-semibold text-ink">{value}</Text>
    </View>
  );
}
