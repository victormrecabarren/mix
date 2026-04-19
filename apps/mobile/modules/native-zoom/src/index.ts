import { requireNativeModule, requireNativeView } from "expo";
import type { ViewProps } from "react-native";

// Native module singleton. iOS-only; on Android these are no-ops
// (the module isn't built for Android and any call becomes a missing-module
// error, so swap to an if-ios wrapper if you start supporting Android).
const NativeZoom: {
  armZoomTransition: (sourceId: string) => void;
} = requireNativeModule("NativeZoom");

// Arm the NEXT UINavigationController.pushViewController call to use iOS 18's
// .zoom transition, sourced from the <ZoomSource> whose id matches. Call this
// right before router.push() / navigation.navigate(). iOS < 18 silently falls
// back to the standard push animation.
export function armZoomTransition(sourceId: string): void {
  NativeZoom.armZoomTransition(sourceId);
}

export type ZoomSourceProps = ViewProps & {
  // Must match the string passed to armZoomTransition().
  zoomSourceId: string;
};

// Native view that registers its UIView in the module's source registry.
// Use as the visual "origin" of a zoom transition — e.g. a card's artwork.
export const ZoomSource =
  requireNativeView<ZoomSourceProps>("NativeZoom");
