Pod::Spec.new do |s|
  s.name           = 'SeamVision'
  s.version        = '1.0.0'
  s.summary        = 'Face detection and subject lifting for Seam, built on Apple Vision.'
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
  s.frameworks = 'Vision', 'CoreImage', 'CoreML', 'CoreVideo', 'ImageIO', 'UniformTypeIdentifiers'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
