// Minimal stand-ins for ExpoModulesCore's Record/@Field so the renderer can be compiled
// and exercised as a plain macOS command-line tool (see run-macos-test.sh).
protocol Record { init() }

@propertyWrapper
struct Field<T> {
  var wrappedValue: T
  init(wrappedValue: T) { self.wrappedValue = wrappedValue }
}
