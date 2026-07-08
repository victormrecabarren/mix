Pod::Spec.new do |s|
  s.name           = 'AppleMusic'
  s.version        = '0.0.1'
  s.summary        = 'Native iOS MusicKit playback for Expo.'
  s.description    = 'Wraps MusicKit ApplicationMusicPlayer (authorization + catalog playback) for React Native.'
  s.author         = ''
  s.homepage       = 'https://example.com/apple-music'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'MusicKit', 'MediaPlayer'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
