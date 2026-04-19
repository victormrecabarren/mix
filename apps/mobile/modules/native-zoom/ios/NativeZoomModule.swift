import ExpoModulesCore

public class NativeZoomModule: Module {
    public func definition() -> ModuleDefinition {
        Name("NativeZoom")

        // Install the UINavigationController swizzle once at module init.
        OnCreate {
            _ = NativeZoomSwizzle.install
        }

        // Called from JS right before router.push(). Flags the next
        // UINavigationController push to use the zoom transition with the
        // UIView previously registered by a <ZoomSource id={...}>.
        Function("armZoomTransition") { (sourceId: String) -> Void in
            NativeZoomRegistry.shared.armedSourceId = sourceId
        }

        View(ZoomSourceView.self) {
            Prop("zoomSourceId") { (view: ZoomSourceView, id: String) in
                view.zoomSourceId = id
            }
        }
    }
}
