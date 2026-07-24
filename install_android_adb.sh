#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
DEVICE_SERIAL="${1:-${ANDROID_SERIAL:-}}"
APK_UNSIGNED="$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
APK_ALIGNED="${APK_UNSIGNED%-unsigned.apk}-aligned.apk"
APK="${APK_UNSIGNED%-unsigned.apk}-debug-signed.apk"

fail() {
  echo "error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

select_device() {
  if [[ -n "$DEVICE_SERIAL" ]]; then
    adb -s "$DEVICE_SERIAL" get-state >/dev/null
    return
  fi

  mapfile -t devices < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
  case "${#devices[@]}" in
    0) fail "no ADB device connected" ;;
    1) DEVICE_SERIAL="${devices[0]}" ;;
    *) fail "multiple ADB devices connected; pass a serial: ./install_android_adb.sh <serial>" ;;
  esac
}

detect_build_tools() {
  local build_tools_dir

  [[ -d "$ANDROID_HOME/build-tools" ]] || fail "Android build-tools not found under $ANDROID_HOME/build-tools"
  build_tools_dir="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
  [[ -n "$build_tools_dir" ]] || fail "Android build-tools not found under $ANDROID_HOME/build-tools"

  ZIPALIGN="$build_tools_dir/zipalign"
  APKSIGNER="$build_tools_dir/apksigner"
  [[ -x "$ZIPALIGN" ]] || fail "zipalign not found: $ZIPALIGN"
  [[ -x "$APKSIGNER" ]] || fail "apksigner not found: $APKSIGNER"
}

ensure_debug_keystore() {
  DEBUG_KEYSTORE="${DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"

  if [[ -f "$DEBUG_KEYSTORE" ]]; then
    return
  fi

  mkdir -p "$(dirname "$DEBUG_KEYSTORE")"
  keytool -genkeypair \
    -keystore "$DEBUG_KEYSTORE" \
    -storepass android \
    -keypass android \
    -alias androiddebugkey \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null
}

assert_supported_device() {
  ABI="$(adb -s "$DEVICE_SERIAL" shell getprop ro.product.cpu.abi | tr -d '\r')"

  case "$ABI" in
    arm64-v8a)
      ;;
    *)
      fail "unsupported device ABI '$ABI'; this installer currently builds arm64-v8a APKs"
      ;;
  esac
}

build_apk() {
  echo "building production APK..."
  rm -f "$APK_UNSIGNED" "$APK_ALIGNED" "$APK"
  pnpm tauri android build --apk --target aarch64
  [[ -f "$APK_UNSIGNED" ]] || fail "APK was not produced: $APK_UNSIGNED"
}

sign_apk() {
  echo "signing APK..."
  "$ZIPALIGN" -p -f 4 "$APK_UNSIGNED" "$APK_ALIGNED"
  "$APKSIGNER" sign \
    --ks "$DEBUG_KEYSTORE" \
    --ks-key-alias androiddebugkey \
    --ks-pass pass:android \
    --key-pass pass:android \
    --out "$APK" \
    "$APK_ALIGNED"
  "$APKSIGNER" verify "$APK"
}

install_apk() {
  echo "installing APK..."
  adb -s "$DEVICE_SERIAL" install -r -d "$APK"

  APK_SIZE="$(du -h "$APK" | awk '{ print $1 }')"
  echo "installed com.grengin.community from $APK ($APK_SIZE)"
}

main() {
  require_cmd adb
  require_cmd keytool
  require_cmd pnpm

  [[ -d "$ANDROID_HOME" ]] || fail "ANDROID_HOME does not exist: $ANDROID_HOME"
  select_device
  assert_supported_device
  detect_build_tools
  ensure_debug_keystore

  export ANDROID_HOME
  export ANDROID_SDK_ROOT

  echo "device: $DEVICE_SERIAL ($ABI)"
  echo "android sdk: $ANDROID_HOME"
  echo "build tools: $(dirname "$APKSIGNER")"

  build_apk
  sign_apk
  install_apk
}

main "$@"
