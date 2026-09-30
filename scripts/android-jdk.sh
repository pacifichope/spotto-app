#!/usr/bin/env bash
# React Native / Expo Android ビルド用に JDK 17 を強制する。
# Android Studio 同梱 JBR（JDK 25+）だと:
#   - Gradle 8.x: settings.gradle で com.facebook.react.settings 解決失敗（> 25.0.3）
#   - Gradle 9.x: CMake が「restricted method in java.lang.System」で失敗
#
# 使い方: source scripts/android-jdk.sh

resolve_jdk17() {
  local candidates=(
    "${SPOTTO_JAVA_HOME:-}"
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
    "/opt/homebrew/opt/openjdk@17"
    "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
    "/usr/local/opt/openjdk@17"
  )
  local c
  for c in "${candidates[@]}"; do
    [[ -z "${c}" ]] && continue
    if [[ -x "${c}/bin/java" ]]; then
      echo "${c}"
      return 0
    fi
  done
  return 1
}

sync_gradle_java_home() {
  local jdk_home="$1"
  local props="${_SCRIPT_DIR}/../android/gradle.properties"
  [[ -f "${props}" ]] || return 0

  local begin='# BEGIN spotto-jdk17'
  local end='# END spotto-jdk17'
  local tmp
  tmp="$(mktemp)"
  # 既存ブロックを除去
  awk -v b="${begin}" -v e="${end}" '
    $0 == b {skip=1; next}
    $0 == e {skip=0; next}
    !skip {print}
  ' "${props}" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' >"${tmp}"

  {
    cat "${tmp}"
    echo ""
    echo "${begin}"
    echo "# Auto-managed by scripts/android-jdk.sh"
    echo "org.gradle.java.home=${jdk_home}"
    echo "${end}"
  } >"${props}"
  rm -f "${tmp}"
}

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

JDK17_HOME="$(resolve_jdk17 || true)"
if [[ -z "${JDK17_HOME}" ]]; then
  echo "error: JDK 17 が見つかりません。" >&2
  echo "  brew install openjdk@17" >&2
  echo "  または SPOTTO_JAVA_HOME=/path/to/jdk-17 を設定してください。" >&2
  return 1 2>/dev/null || exit 1
fi

export JAVA_HOME="${JDK17_HOME}"
export PATH="${JAVA_HOME}/bin:${PATH}"
export ORG_GRADLE_JAVA_HOME="${JAVA_HOME}"

echo "› JAVA_HOME=${JAVA_HOME}"
"${JAVA_HOME}/bin/java" -version 2>&1 | head -1

sync_gradle_java_home "${JAVA_HOME}"
echo "› synced org.gradle.java.home in android/gradle.properties"

# 別 JDK で起動済みの daemon を落とす
_GRADLEW="${_SCRIPT_DIR}/../android/gradlew"
if [[ -x "${_GRADLEW}" ]]; then
  (cd "$(dirname "${_GRADLEW}")" && ./gradlew --stop >/dev/null 2>&1) || true
fi
