/**
 * Expo config plugin: keep native (CMake) object file paths short on Windows.
 *
 * React Native's Android CMake setup passes `-DCMAKE_OBJECT_PATH_MAX=1024`,
 * which lets CMake emit object paths that mirror the absolute source path.
 * On Windows the filesystem still stops at 260 characters, so codegen targets
 * such as react-native-gesture-handler fail with:
 *
 *   ninja: error: mkdir(.../C_/Users/.../rngesturehandler_codegen): No such file or directory
 *
 * Lowering the limit to 250 makes CMake fall back to its hashed short names,
 * which stay well below MAX_PATH. Applied after `expo prebuild`.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const SNIPPET = `        // Keep native codegen object paths below Windows' 260-char MAX_PATH limit.
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_OBJECT_PATH_MAX=250"
            }
        }`;

module.exports = function withAndroidObjectPathMax(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withAndroidObjectPathMax expects a Groovy build.gradle');
    }
    const contents = cfg.modResults.contents;
    if (contents.includes('CMAKE_OBJECT_PATH_MAX')) {
      return cfg;
    }
    const marker = /^(\s*)defaultConfig\s*\{/m;
    if (!marker.test(contents)) {
      throw new Error('withAndroidObjectPathMax: defaultConfig block not found');
    }
    cfg.modResults.contents = contents.replace(
      marker,
      (match) => `${match}\n${SNIPPET}`
    );
    return cfg;
  });
};
