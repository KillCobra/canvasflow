Pod::Spec.new do |s|
  s.name           = 'SeamAI'
  s.version        = '1.0.0'
  s.summary        = 'On-device captions, hashtags and alt text for Seam, built on Apple Foundation Models.'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Seam'
  s.homepage       = 'https://github.com/expo/expo'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Foundation Models ships with iOS 26; older systems run without it.
  s.weak_frameworks = 'FoundationModels'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
