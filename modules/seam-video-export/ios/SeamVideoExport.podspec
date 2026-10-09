Pod::Spec.new do |s|
  s.name           = 'SeamVideoExport'
  s.version        = '1.0.0'
  s.summary        = 'Renders a Seam carousel slide containing video layers into an H.264 MP4.'
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
  s.frameworks = 'AVFoundation', 'CoreImage', 'CoreMedia', 'CoreVideo', 'ImageIO'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
