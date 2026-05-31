import UIKit
import ObjectiveC

// Swizzles push/present so we can set preferredTransition = .zoom on the
// incoming VC when a transition is "armed" from JS. Scoped to run at most once.
// Non-armed transitions forward straight to the original UIKit implementation.

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

        let originalPresent = class_getInstanceMethod(
            UIViewController.self,
            #selector(UIViewController.present(_:animated:completion:))
        )
        let swizzledPresent = class_getInstanceMethod(
            UIViewController.self,
            #selector(UIViewController.nativeZoom_present(_:animated:completion:))
        )
        if let originalPresent = originalPresent, let swizzledPresent = swizzledPresent {
            method_exchangeImplementations(originalPresent, swizzledPresent)
        }
    }()
}

extension UINavigationController {
    @objc func nativeZoom_pushViewController(
        _ viewController: UIViewController,
        animated: Bool
    ) {
        NativeZoomSwizzle.applyArmedZoom(to: viewController)

        // After swizzle, calling nativeZoom_pushViewController invokes the
        // original UIKit implementation.
        self.nativeZoom_pushViewController(viewController, animated: animated)
    }
}

extension UIViewController {
    @objc func nativeZoom_present(
        _ viewControllerToPresent: UIViewController,
        animated flag: Bool,
        completion: (() -> Void)? = nil
    ) {
        NativeZoomSwizzle.applyArmedZoom(to: viewControllerToPresent)

        // After swizzle, calling nativeZoom_present invokes the original UIKit implementation.
        self.nativeZoom_present(viewControllerToPresent, animated: flag, completion: completion)
    }
}

private extension NativeZoomSwizzle {
    @available(iOS 18.0, *)
    static func makeZoomTransition(sourceView: UIView, alignment: String?) -> UIViewController.Transition {
        let options = zoomOptions(for: alignment)
        return .zoom(options: options, sourceViewProvider: { _ in
            sourceView
        })
    }

    static func applyArmedZoom(to viewController: UIViewController) {
        guard let sourceId = NativeZoomRegistry.shared.armedSourceId else { return }
        NativeZoomRegistry.shared.armedSourceId = nil
        let alignment = NativeZoomRegistry.shared.armedAlignment
        NativeZoomRegistry.shared.armedAlignment = nil

        if #available(iOS 18.0, *),
           let sourceView = NativeZoomRegistry.shared.sourceView(forId: sourceId) {
            viewController.preferredTransition = makeZoomTransition(sourceView: sourceView, alignment: alignment)
        }
    }

    @available(iOS 18.0, *)
    static func zoomOptions(for alignment: String?) -> UIViewController.Transition.ZoomOptions? {
        guard alignment == "nowPlayingArt" else { return nil }

        let options = UIViewController.Transition.ZoomOptions()
        options.alignmentRectProvider = { context in
            let view = context.zoomedViewController.view
            let width = view?.bounds.width ?? UIScreen.main.bounds.width
            let topInset = view?.safeAreaInsets.top ?? 0
            let artSize = max(0, width - 40)

            // Mirrors NowPlayingContent's top bar + content/art margins so the
            // pill artwork lands on the large album-art frame during native zoom.
            return CGRect(x: 20, y: topInset + 37, width: artSize, height: artSize)
        }
        return options
    }
}
