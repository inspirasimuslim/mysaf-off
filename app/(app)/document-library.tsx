import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CellText, DataTable, RowIconAction } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import {
  MAX_DOCUMENT_BYTES,
  deleteDocument,
  documentKind,
  fetchDocuments,
  formatFileSize,
  formatUploadDate,
  openDocument,
  uploadDocument,
  type DocumentKind,
  type DocumentRow,
  type PickedDocument,
  type UploadProgress,
} from '@/lib/documents';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { useIsDesktop } from '@/lib/use-desktop';
import { usePermissions } from '@/lib/permissions';
import { useColors } from '@/lib/theme';

/**
 * Library Dokumen ("Arkib") — terbuka kepada semua ahli (lihat, muat naik).
 * Padam: pemilik sendiri atau Super Admin sahaja. Fail sebenar di Google Drive;
 * lihat `lib/documents.ts`.
 */

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

const KIND_ICON: Record<DocumentKind, keyof typeof Ionicons.glyphMap> = {
  pdf: 'document-text-outline',
  word: 'document-outline',
  excel: 'grid-outline',
  slide: 'easel-outline',
  image: 'image-outline',
  other: 'attach-outline',
};

function progressLabel(progress: UploadProgress | null): string {
  if (!progress || progress.stage === 'membaca') return 'Membaca fail...';
  if (progress.stage === 'menghantar') return 'Memuat naik... ' + Math.round(progress.fraction * 100) + '%';
  return 'Menyimpan ke Google Drive...';
}

export default function DocumentLibraryScreen() {
  const colors = useColors();
  const goBack = useGoBack();
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      setDocuments(await fetchDocuments());
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan senarai dokumen.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // --- Cari / tapis --------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(documents.map((doc) => doc.category).filter((c): c is string => !!c))).sort(),
    [documents],
  );

  // Kategori terakhir dipadam sementara ia masih dipilih → jangan tersekat pada tapisan kosong.
  useEffect(() => {
    if (categoryFilter && !categories.includes(categoryFilter)) setCategoryFilter(null);
  }, [categories, categoryFilter]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return documents.filter((doc) => {
      if (categoryFilter && doc.category !== categoryFilter) return false;
      if (!needle) return true;
      return (
        doc.file_name.toLowerCase().includes(needle) ||
        (doc.category ?? '').toLowerCase().includes(needle) ||
        (doc.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [documents, search, categoryFilter]);

  // --- Muat naik -------------------------------------------------------------------
  const [picked, setPicked] = useState<PickedDocument | null>(null);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pickDocument = useCallback(async () => {
    setBanner(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets.length) return;

      const asset = result.assets[0]!;
      if (typeof asset.size === 'number' && asset.size > MAX_DOCUMENT_BYTES) {
        setBanner({
          tone: 'negative',
          message: 'Fail "' + asset.name + '" (' + formatFileSize(asset.size) + ') melebihi had 20 MB.',
        });
        return;
      }

      setPicked({
        uri: asset.uri,
        name: asset.name,
        size: asset.size ?? null,
        mimeType: asset.mimeType ?? null,
        webFile: asset.file,
      });
      setCategory('');
      setDescription('');
      setUploadError(null);
      setProgress(null);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memilih fail.') });
    }
  }, []);

  const submitUpload = useCallback(async () => {
    if (!picked || uploading) return;

    setUploading(true);
    setUploadError(null);
    try {
      await uploadDocument(picked, category, description, setProgress);
      setPicked(null);
      setBanner({ tone: 'positive', message: 'Dokumen berjaya dimuat naik.' });
      await load();
    } catch (caught) {
      setUploadError(caught instanceof Error && caught.message ? caught.message : 'Gagal memuat naik dokumen.');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }, [category, description, load, picked, uploading]);

  // --- Buka / muat turun ---------------------------------------------------------------
  const [openingId, setOpeningId] = useState<string | null>(null);

  const open = useCallback(
    async (doc: DocumentRow) => {
      if (openingId) return;
      setOpeningId(doc.id);
      setBanner(null);
      try {
        await openDocument(doc);
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal membuka dokumen.') });
      } finally {
        setOpeningId(null);
      }
    },
    [openingId],
  );

  // --- Padam ---------------------------------------------------------------------
  const [pendingDelete, setPendingDelete] = useState<DocumentRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deleteDocument(pendingDelete.id);
      setBanner({ tone: 'positive', message: 'Dokumen berjaya dipadam.' });
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memadam dokumen.') });
    } finally {
      setPendingDelete(null);
      setDeleteBusy(false);
    }
  }, [deleteBusy, load, pendingDelete]);

  if (loading) return <LoadingScreen />;

  return (
    <View className="flex-1 bg-background">
      <Screen padTop={false} wide>
        <ScreenHeader eyebrow="Tetapan" title="Arkib" subtitle="Perpustakaan dokumen untuk semua ahli" onBackPress={goBack} />

        <View className="gap-4 px-gutter pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <Button
            label="+ Muat Naik Dokumen"
            onPress={() => void pickDocument()}
            disabled={uploading}
          />

          {documents.length > 0 ? (
            <View className="gap-3">
              <TextField
                label="Cari"
                placeholder="Nama fail, kategori atau penerangan"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                returnKeyType="search"
                topAnchored
              />
              {categories.length > 0 ? (
                <PickerField
                  label="Kategori"
                  value={categoryFilter}
                  options={categories.map((name) => ({ value: name, label: name }))}
                  onChange={setCategoryFilter}
                  placeholder="Semua"
                  clearable
                />
              ) : null}
            </View>
          ) : null}

          {documents.length === 0 ? (
            <EmptyState
              icon="folder-open-outline"
              title="Belum ada dokumen"
              description="Muat naik dokumen pertama untuk dikongsi dengan semua ahli."
            />
          ) : visible.length === 0 ? (
            <EmptyState icon="search-outline" title="Tiada padanan" description="Cuba kata carian atau kategori lain." />
          ) : desktop ? (
            <DataTable
              rows={visible}
              keyOf={(d) => d.id}
              onRowPress={(d) => void open(d)}
              actionsWidth={56}
              columns={[
                {
                  key: 'ikon',
                  header: '',
                  width: 44,
                  render: (d) => (
                    <Ionicons
                      name={openingId === d.id ? 'sync-outline' : KIND_ICON[documentKind(d.file_name)]}
                      size={20}
                      color={colors.primary}
                    />
                  ),
                },
                { key: 'nama', header: 'Nama Fail', flex: 3, render: (d) => <CellText strong>{d.file_name}</CellText> },
                { key: 'kategori', header: 'Kategori', width: 160, render: (d) => (d.category ? <Badge label={d.category} tone="neutral" /> : null) },
                { key: 'desc', header: 'Penerangan', flex: 2, render: (d) => <CellText muted>{d.description ?? '—'}</CellText> },
                { key: 'saiz', header: 'Saiz', width: 90, align: 'right', render: (d) => <CellText muted>{formatFileSize(d.file_size_bytes)}</CellText> },
                { key: 'tarikh', header: 'Dimuat Naik', width: 130, render: (d) => <CellText muted>{formatUploadDate(d.created_at)}</CellText> },
              ]}
              actions={(d) =>
                isSuperAdmin() || d.uploaded_by === user?.id ? (
                  <RowIconAction
                    icon="trash-outline"
                    destructive
                    label={'Padam ' + d.file_name}
                    onPress={() => setPendingDelete(d)}
                  />
                ) : null
              }
            />
          ) : (
            <View className="gap-3">
              {visible.map((doc) => {
                const canDelete = isSuperAdmin() || doc.uploaded_by === user?.id;
                const meta = [formatFileSize(doc.file_size_bytes), formatUploadDate(doc.created_at)]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <Card key={doc.id}>
                    <View className="flex-row items-center gap-3">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={'Buka ' + doc.file_name}
                        onPress={() => void open(doc)}
                        className="flex-1 flex-row items-center gap-3 active:opacity-70">
                        <View className="h-11 w-11 items-center justify-center rounded-field bg-primary-soft">
                          <Ionicons
                            name={openingId === doc.id ? 'sync-outline' : KIND_ICON[documentKind(doc.file_name)]}
                            size={22}
                            color={colors.primary}
                          />
                        </View>

                        <View className="flex-1 gap-1">
                          <Text className="text-base font-semibold text-ink" numberOfLines={2}>
                            {doc.file_name}
                          </Text>
                          {doc.description ? (
                            <Text className="text-sm text-ink-muted" numberOfLines={2}>
                              {doc.description}
                            </Text>
                          ) : null}
                          <View className="flex-row flex-wrap items-center gap-2">
                            {doc.category ? <Badge label={doc.category} tone="neutral" /> : null}
                            <Text className="text-xs text-ink-muted">{meta}</Text>
                          </View>
                        </View>
                      </Pressable>

                      {canDelete ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={'Padam ' + doc.file_name}
                          hitSlop={8}
                          onPress={() => setPendingDelete(doc)}
                          className="h-9 w-9 items-center justify-center rounded-pill active:opacity-70">
                          <Ionicons name="trash-outline" size={18} color={colors.negative} />
                        </Pressable>
                      ) : null}
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </View>
      </Screen>

      <FormModal
        visible={picked !== null}
        title="Muat Naik Dokumen"
        description="Kategori dan penerangan adalah pilihan."
        dismissable={!uploading}
        onClose={() => setPicked(null)}
        footer={
          <Button
            label={uploading ? progressLabel(progress) : 'Muat Naik'}
            loading={uploading}
            onPress={() => void submitUpload()}
          />
        }>
        {picked ? (
          <View className="gap-4">
            <View className="flex-row items-center gap-3 rounded-field border border-line bg-background p-3">
              <Ionicons name={KIND_ICON[documentKind(picked.name)]} size={22} color={colors.primary} />
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink" numberOfLines={2}>
                  {picked.name}
                </Text>
                {picked.size !== null ? (
                  <Text className="text-xs text-ink-muted">{formatFileSize(picked.size)}</Text>
                ) : null}
              </View>
            </View>

            <TextField
              label="Kategori (pilihan)"
              placeholder="Contoh: Borang, Minit Mesyuarat"
              value={category}
              onChangeText={setCategory}
              maxLength={60}
              editable={!uploading}
            />

            {categories.length > 0 ? (
              <View className="-mt-2 flex-row flex-wrap gap-2">
                {categories.map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={'Guna kategori ' + name}
                    disabled={uploading}
                    onPress={() => setCategory(name)}
                    className="rounded-full border border-line bg-background px-3 py-1.5 active:opacity-70">
                    <Text className="text-sm text-ink">{name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <TextField
              label="Penerangan (pilihan)"
              placeholder="Ringkasan dokumen ini"
              value={description}
              onChangeText={setDescription}
              maxLength={500}
              multiline
              editable={!uploading}
            />

            {uploading && progress?.stage === 'menghantar' ? (
              <View className="h-2 overflow-hidden rounded-pill bg-primary-soft">
                <View className="h-2 bg-primary" style={{ width: `${Math.max(2, progress.fraction * 100)}%` as `${number}%` }} />
              </View>
            ) : null}

            {uploadError ? <Notice tone="negative" message={uploadError} /> : null}
          </View>
        ) : null}
      </FormModal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam dokumen ini?"
        message={
          pendingDelete
            ? '"' + pendingDelete.file_name + '" akan dipadam dari Arkib dan dari Google Drive. Tindakan ini tidak boleh dibatalkan.'
            : ''
        }
        confirmLabel="Padam"
        destructive
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  );
}
