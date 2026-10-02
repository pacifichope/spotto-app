/**
 * Android ビルドの Gradle / JDK を安定させる。
 *
 * - Gradle: React Native 0.86 公式の 9.3.1 に揃える
 *   （8.14.x + Android Studio JBR 25 だと
 *    `Error resolving plugin [id: 'com.facebook.react.settings'] > 25.0.3` になる）
 * - JDK: 検出できた JDK 17 を org.gradle.java.home に書き、
 *   Studio / bare gradle でも CMake の restricted-method 失敗を避ける
 */
const { withDangerousMod, createRunOncePlugin } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DEFAULT_GRADLE_VERSION = '9.3.1';
const JDK_HOME_BEGIN = '# BEGIN spotto-jdk17';
const JDK_HOME_END = '# END spotto-jdk17';

/** @returns {string | null} */
function resolveJdk17Home() {
  const candidates = [
    process.env.SPOTTO_JAVA_HOME,
    process.env.ORG_GRADLE_JAVA_HOME,
    '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/opt/homebrew/opt/openjdk@17',
    '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@17',
  ].filter(Boolean);

  for (const home of candidates) {
    if (fs.existsSync(path.join(home, 'bin', 'java'))) {
      return home;
    }
  }
  return null;
}

/**
 * @param {string} contents
 * @param {string | null} jdkHome
 */
function upsertJdkHomeBlock(contents, jdkHome) {
  const blockRe = new RegExp(
    `${JDK_HOME_BEGIN}[\\s\\S]*?${JDK_HOME_END}\\n?`,
    'm',
  );
  const without = contents.replace(blockRe, '').replace(/\s+$/, '');
  if (!jdkHome) {
    return `${without}\n`;
  }
  const block = [
    JDK_HOME_BEGIN,
    `# Auto-managed by withAndroidGradlePin / scripts/android-jdk.sh`,
    `org.gradle.java.home=${jdkHome}`,
    JDK_HOME_END,
    '',
  ].join('\n');
  return `${without}\n\n${block}`;
}

/**
 * @param {import('expo/config-plugins').ExportedConfig} config
 * @param {{ version?: string }} [props]
 */
function withAndroidGradlePin(config, props = {}) {
  const version = String(props.version || DEFAULT_GRADLE_VERSION).trim();
  if (!/^\d+\.\d+(\.\d+)?$/.test(version)) {
    throw new Error(
      `[withAndroidGradlePin] invalid Gradle version: ${JSON.stringify(version)}`,
    );
  }

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const wrapperProps = path.join(
        root,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      );
      const gradleProps = path.join(root, 'gradle.properties');

      if (fs.existsSync(wrapperProps)) {
        const distributionUrl = `https\\://services.gradle.org/distributions/gradle-${version}-bin.zip`;
        let contents = await fs.promises.readFile(wrapperProps, 'utf8');
        if (/^distributionUrl=/m.test(contents)) {
          contents = contents.replace(
            /^distributionUrl=.*$/m,
            `distributionUrl=${distributionUrl}`,
          );
        } else {
          contents = `${contents.trimEnd()}\ndistributionUrl=${distributionUrl}\n`;
        }
        await fs.promises.writeFile(wrapperProps, contents);
        console.log(`[withAndroidGradlePin] Gradle ${version}`);
      } else {
        console.warn(
          `[withAndroidGradlePin] missing ${wrapperProps}; skip Gradle pin`,
        );
      }

      const jdkHome = resolveJdk17Home();
      if (fs.existsSync(gradleProps)) {
        const before = await fs.promises.readFile(gradleProps, 'utf8');
        const after = upsertJdkHomeBlock(before, jdkHome);
        if (after !== before) {
          await fs.promises.writeFile(gradleProps, after);
        }
        if (jdkHome) {
          console.log(`[withAndroidGradlePin] org.gradle.java.home=${jdkHome}`);
        } else {
          console.warn(
            '[withAndroidGradlePin] JDK 17 未検出。EAS など CI では JAVA_HOME を使います。ローカルは brew install openjdk@17',
          );
        }
      }

      return cfg;
    },
  ]);
}

module.exports = createRunOncePlugin(
  withAndroidGradlePin,
  'with-android-gradle-pin',
  '1.1.0',
);
