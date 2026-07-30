#!/usr/bin/env bash

# Restore the local prerequisites for running the iOS app on a physical device.
# This deliberately does not run `expo prebuild --clean`, which can overwrite
# native-project changes. Set IOS_DEVICE_ID to target a different iPhone.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mobile_root="$repo_root/apps/mobile"
ios_root="$mobile_root/ios"
device_id="${IOS_DEVICE_ID:-00008150-001A310801F0401C}"

fail() {
  printf '\n✗ %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

echo "→ Checking local iOS tooling"
require_command node
require_command pnpm
require_command xcodebuild
require_command xcrun
require_command pod
xcodebuild -version | sed -n '1,2p'
echo "CocoaPods $(pod --version)"

echo "→ Restoring JavaScript dependencies"
pnpm --dir "$repo_root" install --frozen-lockfile

manifest_lock="$ios_root/Pods/Manifest.lock"
pod_lock="$ios_root/Podfile.lock"
workspace="$ios_root/mix.xcworkspace"

if [[ ! -d "$workspace" || ! -f "$manifest_lock" || ! -s "$pod_lock" ]] \
  || ! cmp -s "$pod_lock" "$manifest_lock"; then
  echo "→ Installing CocoaPods dependencies"
  (
    cd "$ios_root"
    pod install
  )
else
  echo "✓ CocoaPods dependencies are current"
fi

echo "→ Checking iPhone connection ($device_id)"
if ! xcrun xctrace list devices 2>&1 | grep -Fq "$device_id"; then
  fail "The configured iPhone is not connected. Plug it in, unlock it, and trust this Mac. Set IOS_DEVICE_ID to use another device."
fi

set +e
ddi_output="$(xcrun devicectl device info ddiServices --device "$device_id" --timeout 15 2>&1)"
ddi_status=$?
set -e

if [[ $ddi_status -ne 0 ]]; then
  if grep -Fq "kAMDMobileImageMounterDeviceLocked" <<<"$ddi_output"; then
    fail "Your iPhone is locked, so Xcode cannot mount its developer image. Unlock it and keep it awake, then run pnpm run doctor again."
  fi
  echo "$ddi_output" >&2
  fail "Xcode could not prepare the developer image. In Xcode, open Window > Devices and Simulators, unlock/trust the iPhone, then retry."
fi

echo "✓ iPhone developer services are ready"
printf '\nReady to run: pnpm run ios:device\n'
