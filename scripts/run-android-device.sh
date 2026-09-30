#!/usr/bin/env bash
# spotto: Android 実機での開発ビルド＆起動
#
# 事前準備:
#   1) 端末で「開発者向けオプション」→「USB デバッグ」を ON
#   2) USB で Mac に接続し、端末側で「このコンピュータを常に許可」
#   3) 同じ Wi‑Fi（LAN API / Metro を使う場合）または USB のみで adb reverse
#
# 使い方:
#   npm run android:device
#   SKIP_METRO=1 npm run android:device   # ビルドだけ
#   ANDROID_SERIAL=<deviceId> npm run android:device
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=android-jdk.sh
source "${ROOT}/scripts/android-jdk.sh"

export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Library/Android/sdk}"
export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"

if ! command -v adb >/dev/null 2>&1; then
  echo "error: adb が見つかりません。" >&2
  echo "  Android Studio を入れ、SDK platform-tools を入れてください。" >&2
  echo "  想定パス: ${ANDROID_HOME}/platform-tools" >&2
  exit 1
fi

echo "› adb devices"
adb start-server >/dev/null
adb devices -l

# 実機を優先して serial を返す
pick_serial() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    echo "${ANDROID_SERIAL}"
    return
  fi
  local line id
  while IFS= read -r line; do
    id="$(echo "${line}" | awk '{print $1}')"
    [[ -z "${id}" || "${id}" == "List" ]] && continue
    echo "${line}" | grep -qE '[[:space:]]device([[:space:]]|$)' || continue
    if echo "${line}" | grep -qi 'emulator'; then
      continue
    fi
    echo "${id}"
    return
  done < <(adb devices -l | tail -n +2)

  while IFS= read -r line; do
    id="$(echo "${line}" | awk '{print $1}')"
    [[ -z "${id}" || "${id}" == "List" ]] && continue
    echo "${line}" | grep -qE '[[:space:]]device([[:space:]]|$)' || continue
    echo "${id}"
    return
  done < <(adb devices -l | tail -n +2)
}

# Expo CLI は adb serial ではなく model 名（model:XXX）を使う
expo_device_name() {
  local serial="$1"
  local line model
  line="$(adb devices -l | awk -v s="${serial}" '$1 == s { print; exit }')"
  model="$(echo "${line}" | grep -oE 'model:[^[:space:]]+' | head -1 | cut -d: -f2-)"
  if [[ -n "${model}" ]]; then
    echo "${model}"
    return
  fi
  # fallback: Expo と同じ解決を node で実行
  node -e '
    const { createRequire } = require("module");
    const requireFromExpo = createRequire(require.resolve("expo/package.json"));
    const adb = requireFromExpo("./node_modules/@expo/cli/build/src/start/platforms/android/adb.js");
    adb.getAttachedDevicesAsync().then((devices) => {
      const hit = devices.find((d) => d.pid === process.argv[1]) || devices[0];
      if (!hit) process.exit(2);
      process.stdout.write(hit.name);
    }).catch(() => process.exit(2));
  ' "${serial}" 2>/dev/null || echo "${serial}"
}

DEVICE_SERIAL="$(pick_serial || true)"
if [[ -z "${DEVICE_SERIAL}" ]]; then
  echo "" >&2
  echo "error: 接続中の Android 端末がありません。" >&2
  echo "" >&2
  echo "チェックリスト:" >&2
  echo "  • USB ケーブルで接続しているか" >&2
  echo "  • 端末の「USB デバッグ」が ON か" >&2
  echo "  • 端末に「USB デバッグを許可しますか？」が出ていたら許可" >&2
  echo "  • 別ターミナルで: adb devices" >&2
  echo "" >&2
  echo "無線デバッグの場合は先にペアリング:" >&2
  echo "  adb pair <IP>:<pairing-port>" >&2
  echo "  adb connect <IP>:<port>" >&2
  exit 1
fi

EXPO_DEVICE_NAME="$(expo_device_name "${DEVICE_SERIAL}")"
export ANDROID_SERIAL="${DEVICE_SERIAL}"
echo "› Using device serial=${DEVICE_SERIAL} expoName=${EXPO_DEVICE_NAME}"

# USB 経由で Metro / ローカル API に届くようにポート転送
echo "› adb reverse (Metro 8081 / API 8787)"
adb -s "${DEVICE_SERIAL}" reverse tcp:8081 tcp:8081 || true
adb -s "${DEVICE_SERIAL}" reverse tcp:8787 tcp:8787 || true

echo "› Building & installing Dev Client on device…"
npx expo run:android --device "${EXPO_DEVICE_NAME}" --no-bundler

if [[ "${SKIP_METRO:-0}" == "1" ]]; then
  echo "› SKIP_METRO=1 — Metro は起動しません。別ターミナルで npm start してください。"
  exit 0
fi

echo "› Starting Metro (dev-client)。端末と PC は同じ Wi‑Fi、または上記 reverse を利用。"
exec npx expo start --dev-client --clear
