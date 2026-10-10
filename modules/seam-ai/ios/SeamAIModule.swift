import ExpoModulesCore
#if canImport(FoundationModels)
import FoundationModels
#endif

#if canImport(FoundationModels)
/// The copy for one post, generated in a single structured pass.
@available(iOS 26.0, *)
@Generable
struct SeamPostCopy {
  @Guide(description: "An Instagram caption of one to three short sentences, warm and specific, written in the first person. No hashtags. At most one emoji.")
  var caption: String

  @Guide(description: "Eight to twelve relevant hashtags, lowercase, single words or joined phrases, without the # sign.")
  var hashtags: [String]

  @Guide(description: "One plain, factual alt text sentence per slide, in slide order, describing what is visible for someone who can't see it. Mention any text shown on the slide.")
  var altText: [String]
}
#endif

public class SeamAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SeamAI")

    /// 'available', or why not: 'unsupported' (OS or build), 'deviceNotEligible',
    /// 'notEnabled' (Apple Intelligence off), 'notReady' (model downloading), 'unavailable'.
    Function("availability") { () -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        switch SystemLanguageModel.default.availability {
        case .available:
          return "available"
        case .unavailable(let reason):
          switch reason {
          case .deviceNotEligible: return "deviceNotEligible"
          case .appleIntelligenceNotEnabled: return "notEnabled"
          case .modelNotReady: return "notReady"
          @unknown default: return "unavailable"
          }
        }
      }
      #endif
      return "unsupported"
    }

    /// Caption, hashtags and per-slide alt text for a post described by `context`.
    AsyncFunction("generatePostCopy") { (context: String, slideCount: Int, promise: Promise) in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        Task {
          let instructions = """
            You write social media copy for a person posting an Instagram carousel they designed. \
            Be concrete and natural; never invent facts that aren't in the description. \
            Keep the caption under 280 characters.
            """
          let prompt = "Write the caption, hashtags and alt text for this \(slideCount)-slide post.\n\n\(context)"
          var firstError = ""
          // Structured output first; some model versions reject it, so fall back to plain text.
          do {
            let session = LanguageModelSession(instructions: instructions)
            let response = try await session.respond(to: prompt, generating: SeamPostCopy.self)
            let copy = response.content
            promise.resolve(["caption": copy.caption, "hashtags": copy.hashtags, "altText": copy.altText])
            return
          } catch {
            firstError = String(describing: error)
          }
          do {
            let session = LanguageModelSession(instructions: instructions)
            let plain = try await session.respond(
              to: prompt + "\n\nReply with the caption on the first line, then a line of hashtags (each starting with #), then one alt text line per slide starting with 'Alt:'."
            )
            let lines = plain.content.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            let caption = lines.first { !$0.hasPrefix("#") && !$0.lowercased().hasPrefix("alt:") } ?? ""
            let hashtags = lines.flatMap { line in
              line.split(separator: " ").filter { $0.hasPrefix("#") }.map { String($0.dropFirst()) }
            }
            let alt = lines.filter { $0.lowercased().hasPrefix("alt:") }.map { String($0.dropFirst(4)).trimmingCharacters(in: .whitespaces) }
            promise.resolve(["caption": caption, "hashtags": hashtags, "altText": alt])
          } catch {
            promise.reject("ERR_SEAM_AI", "\(firstError) / \(String(describing: error))")
          }
        }
        return
      }
      #endif
      promise.reject("ERR_SEAM_AI", "On-device AI needs iOS 26 with Apple Intelligence")
    }
  }
}
