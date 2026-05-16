import ExpoModulesCore
import UIKit

// Plain ExpoView subclass. When it receives a non-empty `zoomSourceId`
// prop, it registers its own UIView in NativeZoomRegistry under that id so
// the swizzled push can later resolve the id back to this view.
class ZoomSourceView: ExpoView {
    var zoomSourceId: String = "" {
        didSet {
            if oldValue != zoomSourceId {
                if !oldValue.isEmpty {
                    NativeZoomRegistry.shared.unregister(self, forId: oldValue)
                }
                if !zoomSourceId.isEmpty {
                    NativeZoomRegistry.shared.register(self, forId: zoomSourceId)
                }
            }
        }
    }

    deinit {
        if !zoomSourceId.isEmpty {
            NativeZoomRegistry.shared.unregister(self, forId: zoomSourceId)
        }
    }
}
