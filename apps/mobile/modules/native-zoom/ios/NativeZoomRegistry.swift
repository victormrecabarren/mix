import UIKit

// Shared state between the ZoomSourceView component and the swizzled
// UINavigationController.pushViewController. React tags source views by id;
// JS arms a transition by id just before pushing a new route.

final class NativeZoomRegistry {
    static let shared = NativeZoomRegistry()

    // Weak-refs to registered source UIViews, keyed by the id prop.
    private var sources: [String: WeakView] = [:]

    // The id to apply to the *next* pushed UIViewController. Cleared after use.
    var armedSourceId: String?

    func register(_ view: UIView, forId id: String) {
        sources[id] = WeakView(view: view)
    }

    func unregister(_ view: UIView, forId id: String) {
        if let entry = sources[id], entry.view === view {
            sources.removeValue(forKey: id)
        }
    }

    func sourceView(forId id: String) -> UIView? {
        return sources[id]?.view
    }

    private struct WeakView {
        weak var view: UIView?
    }
}
