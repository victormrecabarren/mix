import UIKit
import ObjectiveC

// Swizzles UINavigationController.pushViewController(_:animated:) so we can
// set preferredTransition = .zoom on the incoming VC when a transition is
// "armed" from JS. Scoped to run at most once. Non-armed pushes are
// unaffected — the swizzle forwards straight to the original implementation.

enum NativeZoomSwizzle {
    // static let with a side-effecting initializer is Swift's idiom for
    // dispatch_once. The closure runs exactly once, the first time this
    // property is accessed.
    static let install: Void = {
        let original = class_getInstanceMethod(
            UINavigationController.self,
            #selector(UINavigationController.pushViewController(_:animated:))
        )
        let swizzled = class_getInstanceMethod(
            UINavigationController.self,
            #selector(UINavigationController.nativeZoom_pushViewController(_:animated:))
        )
        if let original = original, let swizzled = swizzled {
            method_exchangeImplementations(original, swizzled)
        }
    }()
}

extension UINavigationController {
    @objc func nativeZoom_pushViewController(
        _ viewController: UIViewController,
        animated: Bool
    ) {
        if let sourceId = NativeZoomRegistry.shared.armedSourceId {
            NativeZoomRegistry.shared.armedSourceId = nil

            if #available(iOS 18.0, *),
               let sourceView = NativeZoomRegistry.shared.sourceView(forId: sourceId) {
                viewController.preferredTransition = .zoom(sourceViewProvider: { _ in
                    sourceView
                })
            }
        }

        // After swizzle, calling nativeZoom_pushViewController invokes the
        // original UIKit implementation.
        self.nativeZoom_pushViewController(viewController, animated: animated)
    }
}
