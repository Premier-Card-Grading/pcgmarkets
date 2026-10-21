import Foundation
import Vision
import AppKit
// usage: slab-ocr <image>  -> prints the image's text lines, top to bottom, as a JSON array (macOS Vision).
guard CommandLine.arguments.count == 2, let img = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let cg = rep.cgImage else {
  FileHandle.standardError.write("cannot read image\n".data(using: .utf8)!); exit(1)
}
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
let lines = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
let json = try JSONSerialization.data(withJSONObject: lines)
print(String(data: json, encoding: .utf8)!)
