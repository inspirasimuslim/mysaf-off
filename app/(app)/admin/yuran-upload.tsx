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
import { ImportError } from '@/lib/ahli-import';
import { useYuranAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { fetchMembers } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import type { MemberLookupRow } from '@/lib/usrah-import';
import { importYuranOpening, ringgit } from '@/lib/yuran';
import { parseYuranWorkbook, summariseYuran, type YuranParseResult } from '@/lib/yuran-import';
import { generationLabel } from '@/types/database';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Tahun baki permulaan — TETAP, bukan medan borang.
 *
 * Skrin ini bukan muat naik tahunan yang generik. Ia satu langkah pemindahan
 * sekali: memindahkan hutang terkumpul daripada laporan bendahari ke dalam
 * sistem. Yuran tahun-tahun berikutnya dijana, bukan diimport, jadi memberi
 * admin medan tahun di sini hanya menawarkan cara untuk merosakkan data.
 */
const OPENING_YEAR = 2025;

/** Baris pratonton yang dipapar sekaligus — senarai penuh 300+ baris tidak perlu dilukis. */
const PREVIEW_LIMIT = 20;
const ISSUE_LIMIT = 25;

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

type Done = { members: number; outstanding: number; credit: number };

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

export default function YuranUploadScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = useYuranAccess();

  const [banner, setBanner] = useState<Banner>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<YuranParseResult | null>(null);
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
      setParsed(parseYuranWorkbook(base64, members));
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
        Satu panggilan seorang ahli, bukan satu tulisan pukal. RPC itu menulis
        dua table dalam satu transaksi bagi setiap ahli, jadi kegagalan di
        tengah meninggalkan ahli yang sudah selesai dalam keadaan yang sah dan
        boleh dijalankan semula — bukan separuh ledger tanpa bayarannya.
      */
      for (const [index, row] of parsed.matched.entries()) {
        await importYuranOpening(row.memberId, OPENING_YEAR, row.amountDue, row.paid);
        setProgress(index + 1);
      }

      const summary = summariseYuran(parsed.matched);
      setDone({
        members: summary.members,
        outstanding: summary.totalOutstanding,
        credit: summary.totalCredit,
      });
      setBanner({
        tone: 'positive',
        message: 'Baki permulaan ' + OPENING_YEAR + ' diimport untuk ' + summary.members + ' ahli.',
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
        <ScreenHeader title="Import Baki Permulaan" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Import baki permulaan memerlukan kebenaran menyunting pada department BENDAHARI."
          />
        </View>
      </Screen>
    );
  }

  const summary = parsed ? summariseYuran(parsed.matched) : null;
  const nearMatches = parsed?.matched.filter((row) => row.nearMatch !== null) ?? [];
  const reconciled = parsed?.matched.filter((row) => row.reconciled) ?? [];

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title={'Import Baki Permulaan ' + OPENING_YEAR}
        subtitle="Pemindahan sekali sahaja daripada laporan bendahari"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <Notice
          tone="info"
          message={
            'Skrin ini HANYA untuk baki permulaan ' +
            OPENING_YEAR +
            ' — hutang terkumpul sebelum sistem ini. Yuran ' +
            (OPENING_YEAR + 1) +
            ' dan ke atas DIJANA dari skrin Yuran, bukan diimport.'
          }
        />

        <View>
          <SectionTitle
            title="Fail Excel"
            caption="Kolum: NAMA, GENERASI, TUNGGAKAN, PEMBAYARAN_2025, BAKI_TUNGGAKAN, LEBIHAN_BAYARAN."
          />
          <Button
            label={fileName ? 'Tukar Fail' : 'Pilih Fail .xlsx'}
            variant="secondary"
            loading={picking || members === null}
            disabled={picking || members === null || importing}
            onPress={() => void pickFile()}
          />
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
                  <Line label="Jumlah tunggakan" value={ringgit(summary.totalOutstanding)} />
                  <Line label="Jumlah kredit" value={ringgit(summary.totalCredit)} />
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

            {reconciled.length > 0 ? (
              <View>
                <SectionTitle
                  title={'Baris Diselaraskan (' + reconciled.length + ')'}
                  caption="BAKI_TUNGGAKAN tidak menepati TUNGGAKAN tolak PEMBAYARAN. Import mengikut BAKI."
                />
                <View className="gap-2">
                  {reconciled.slice(0, ISSUE_LIMIT).map((row) => (
                    <View key={row.memberId} className="rounded-field border border-line bg-surface p-3">
                      <Text className="text-sm font-semibold text-ink">{row.fullName}</Text>
                      <Text className="mt-0.5 text-xs text-ink-muted">
                        {'Caj ' + ringgit(row.amountDue) + ' → baki laporan ' + ringgit(row.reportedBalance)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

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
                    <View className="items-end">
                      <Text className="text-sm font-bold text-ink">{ringgit(row.amountDue)}</Text>
                      {row.paid !== 0 ? (
                        <Text className="text-xs text-ink-muted">{'kredit ' + ringgit(row.paid)}</Text>
                      ) : null}
                    </View>
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
                      done.members +
                      ' ahli diimport. Jumlah tunggakan ' +
                      ringgit(done.outstanding) +
                      ', kredit ' +
                      ringgit(done.credit) +
                      '.'
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
                Selamat dijalankan berulang — angka ahli yang sama akan digantikan, bukan digandakan.
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
