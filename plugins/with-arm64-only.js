// Config plugin: semua build Android hanya untuk arm64-v8a.
//
// `expo prebuild` menjana semula android/gradle.properties dan menetapkan
// reactNativeArchitectures kepada empat senibina CPU, menjadikan APK ~134 MB
// berbanding ~51 MB (pustaka natif disalin empat kali). Plugin ini menetapkannya
// semula setiap kali prebuild dijalankan.
const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withArm64Only(config) {
  return withGradleProperties(config, (cfg) => {
    const key = 'reactNativeArchitectures';
    const items = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === key));
    items.push({ type: 'property', key, value: 'arm64-v8a' });
    cfg.modResults = items;
    return cfg;
  });
};
