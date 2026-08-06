#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
NDK_HOME="${NDK_HOME:-}"
ANDROID_API_LEVEL="${ANDROID_API_LEVEL:-24}"
DEVICE_SERIAL="${1:-${ANDROID_SERIAL:-}}"
RUST_TARGET="aarch64-linux-android"
RUST_BUILD_JOBS="${RUST_BUILD_JOBS:-4}"
GRADLE_VARIANT="Arm64Release"
JNI_ABI="arm64-v8a"
APK_UNSIGNED="$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release-unsigned.apk"
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

detect_ndk() {
  if [[ -n "$NDK_HOME" ]]; then
    [[ -d "$NDK_HOME" ]] || fail "NDK_HOME does not exist: $NDK_HOME"
    return
  fi

  [[ -d "$ANDROID_HOME/ndk" ]] || fail "Android NDK not found under $ANDROID_HOME/ndk"
  NDK_HOME="$(find "$ANDROID_HOME/ndk" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
  [[ -n "$NDK_HOME" ]] || fail "Android NDK not found under $ANDROID_HOME/ndk"
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
  local linker
  local lib_dst
  local lib_src
  local toolchain

  echo "building production APK..."

  toolchain="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
  linker="$toolchain/aarch64-linux-android${ANDROID_API_LEVEL}-clang"
  [[ -x "$linker" ]] || fail "Android linker not found: $linker"

  export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$linker"
  export CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-Clink-arg=-landroid -Clink-arg=-llog -Clink-arg=-lOpenSLES"
  export CC_aarch64_linux_android="$linker"
  export CXX_aarch64_linux_android="$toolchain/aarch64-linux-android${ANDROID_API_LEVEL}-clang++"
  export AR_aarch64_linux_android="$toolchain/llvm-ar"
  export TAURI_ANDROID_PROJECT_PATH="$ROOT_DIR/src-tauri/gen/android"
  export WRY_ANDROID_LIBRARY="grengin_lib"
  export WRY_ANDROID_PACKAGE="com.grengin.community"
  export TAURI_ANDROID_PACKAGE_UNESCAPED="com.grengin.community"
  export WRY_ANDROID_KOTLIN_FILES_OUT_DIR="$ROOT_DIR/src-tauri/gen/android/app/src/main/java/com/grengin/community/generated"
  export CARGO_BUILD_JOBS="$RUST_BUILD_JOBS"
  export PATH="$toolchain:$PATH"

  pnpm build
  cargo build \
    --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml" \
    --target "$RUST_TARGET" \
    --features "tauri/custom-protocol" \
    --lib \
    --release \
    -j "$RUST_BUILD_JOBS"

  lib_src="$ROOT_DIR/src-tauri/target/$RUST_TARGET/release/libgrengin_lib.so"
  lib_dst="$ROOT_DIR/src-tauri/gen/android/app/src/main/jniLibs/$JNI_ABI/libgrengin_lib.so"
  [[ -f "$lib_src" ]] || fail "Rust library was not produced: $lib_src"
  mkdir -p "$(dirname "$lib_dst")"
  ln -sfn "$lib_src" "$lib_dst"

  "$ROOT_DIR/src-tauri/gen/android/gradlew" \
    --project-dir "$ROOT_DIR/src-tauri/gen/android" \
    ":app:assemble$GRADLE_VARIANT" \
    -x ":app:rustBuild$GRADLE_VARIANT"

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
  require_cmd cargo
  require_cmd keytool
  require_cmd pnpm

  [[ -d "$ANDROID_HOME" ]] || fail "ANDROID_HOME does not exist: $ANDROID_HOME"
  select_device
  assert_supported_device
  detect_build_tools
  detect_ndk
  ensure_debug_keystore

  export ANDROID_HOME
  export ANDROID_SDK_ROOT

  echo "device: $DEVICE_SERIAL ($ABI)"
  echo "android sdk: $ANDROID_HOME"
  echo "android ndk: $NDK_HOME"
  echo "build tools: $(dirname "$APKSIGNER")"
  echo "rust jobs: $RUST_BUILD_JOBS"

  build_apk
  sign_apk
  install_apk
}

main "$@"
