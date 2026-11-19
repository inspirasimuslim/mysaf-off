// Config plugin: tandatangan release guna kunci muat naik, bukan kunci debug.
//
// `expo prebuild` menjana semula android/app/build.gradle dengan release
// ditandatangani `signingConfigs.debug`, lalu AAB/APK ditolak Play Console.
// Plugin ini menyuntik `signingConfigs.release` yang membaca sifat Gradle
// MYSAFF_UPLOAD_* daripada ~/.gradle/gradle.properties (di luar git), dan
// menukar buildTypes.release supaya menggunakannya. Hanya NAMA sifat dirujuk —
// tiada laluan keystore atau kata laluan ditulis dalam fail ini.
//
// Jika MYSAFF_UPLOAD_STORE_FILE tiada, release jatuh balik ke kunci debug
// (supaya binaan tempatan tanpa keystore tidak pecah).
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = 'MYSAFF_UPLOAD_STORE_FILE';

const RELEASE_SIGNING_BLOCK = `        release {
            if (findProperty('MYSAFF_UPLOAD_STORE_FILE')) {
                storeFile file(findProperty('MYSAFF_UPLOAD_STORE_FILE'))
                storePassword findProperty('MYSAFF_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('MYSAFF_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('MYSAFF_UPLOAD_KEY_PASSWORD')
            }
        }
`;

function applyReleaseSigning(contents) {
  // Idempotent: sudah disuntik.
  if (contents.includes(MARKER)) return contents;

  // 1. Tambah signingConfigs.release selepas blok `debug { ... }` dalam signingConfigs.
  const signingRe = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\}\s*\n)/;
  if (!signingRe.test(contents)) {
    throw new Error('with-release-signing: blok signingConfigs.debug tidak ditemui dalam build.gradle');
  }
  let out = contents.replace(signingRe, `$1${RELEASE_SIGNING_BLOCK}`);

  // 2. Dalam buildTypes.release, tukar signingConfig kepada release (kekal debug jika keystore tiada).
  const buildTypeRe = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!buildTypeRe.test(out)) {
    throw new Error('with-release-signing: signingConfig dalam buildTypes.release tidak ditemui');
  }
  out = out.replace(
    buildTypeRe,
    "$1signingConfig findProperty('MYSAFF_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"
  );
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applyReleaseSigning = applyReleaseSigning;
