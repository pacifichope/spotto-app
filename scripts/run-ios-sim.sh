#!/usr/bin/env bash
# Apple Sign In 等の entitlement があるため Expo CLI は署名証明書を要求する。
# 開発証明書が無い場合でも、シミュレーターは CODE_SIGNING_ALLOWED=NO でビルド可能。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEME="${IOS_SCHEME:-spotto}"
BUNDLE_ID="${IOS_BUNDLE_ID:-com.taiki.spotto}"
SIM_NAME="${IOS_SIMULATOR:-iPhone 17}"
DERIVED="$ROOT/ios/build/DerivedData"
APP="$DERIVED/Build/Products/Debug-iphonesimulator/${SCHEME}.app"

boot_simulator() {
  local udid
  udid="$(xcrun simctl list devices booted 2>/dev/null | grep -oE '[A-F0-9-]{36}' | head -1 || true)"
  if [[ -n "${udid}" ]]; then
    echo "${udid}"
    return
  fi
  echo "› Booting simulator: ${SIM_NAME}" >&2
  xcrun simctl boot "${SIM_NAME}" 2>/dev/null || true
  open -a Simulator 2>/dev/null || true
  sleep 2
  xcrun simctl list devices booted 2>/dev/null | grep -oE '[A-F0-9-]{36}' | head -1
}

UDID="$(boot_simulator)"
if [[ -z "${UDID}" ]]; then
  echo "Could not boot simulator ${SIM_NAME}" >&2
  exit 1
fi
echo "› Using simulator ${UDID}"

echo "› Building (simulator, unsigned)…"
cd "$ROOT/ios"
xcodebuild \
  -workspace "${SCHEME}.xcworkspace" \
  -scheme "${SCHEME}" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=${UDID}" \
  -derivedDataPath "${DERIVED}" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

if [[ ! -d "${APP}" ]]; then
  echo "Build succeeded but app not found at ${APP}" >&2
  exit 1
fi

echo "› Installing ${APP}"
xcrun simctl install "${UDID}" "${APP}"
echo "› Launching ${BUNDLE_ID}"
xcrun simctl launch "${UDID}" "${BUNDLE_ID}" || true

cd "$ROOT"
if [[ "${SKIP_METRO:-0}" != "1" ]]; then
  echo "› Starting Metro…"
  exec npx expo start --localhost
fi
