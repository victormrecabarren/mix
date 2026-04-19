Pod::Spec.new do |s|
  s.name           = 'NativeZoom'
  s.version        = '0.0.1'
  s.summary        = 'Native iOS 18 zoom transitions for Expo Router.'
  s.description    = 'Exposes UIViewController.preferredTransition = .zoom to React Native via a tagged source view.'
  s.author         = ''
  s.homepage       = 'https://example.com/native-zoom'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
