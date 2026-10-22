import Foundation
import Vision
import AppKit
// usage: psa-ocr <outdir> <image>...  -> writes <outdir>/<basename>.ocr.json: [{"t":text,"x":minX,"y":top,"w":w,"h":h}], coords 0..1, y from top.
let args = CommandLine.arguments
let out = args[1]
for path in args.dropFirst(2) {
  let base = ((path as NSString).lastPathComponent as NSString).deletingPathExtension
  let dest = "\(out)/\(base).ocr.json"
  if FileManager.default.fileExists(atPath: dest) { continue }
  guard let img = NSImage(contentsOfFile: path), let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let cg = rep.cgImage else { continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  do { try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req]) } catch { continue }
  let rows: [[String: Any]] = (req.results ?? []).compactMap { r in
    guard let c = r.topCandidates(1).first else { return nil }
    let b = r.boundingBox
    return ["t": c.string, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height, "c": c.confidence]
  }
  let data = try! JSONSerialization.data(withJSONObject: rows)
  try! data.write(to: URL(fileURLWithPath: dest))
}
