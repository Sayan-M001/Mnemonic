import AppKit
import Foundation
import Vision

struct OCRTextBlock: Codable {
    let text: String
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let confidence: Double
}

struct OCRResult: Codable {
    let fullText: String
    let blocks: [OCRTextBlock]
    let averageConfidence: Double
    let imageSize: OCRImageSize
    let processedAt: String
}

struct OCRImageSize: Codable {
    let width: Int
    let height: Int
}

enum OCRScriptError: Error {
    case missingPath
    case imageLoadFailed
}

func roundTo3(_ value: Double) -> Double {
    (value * 1000).rounded() / 1000
}

func extractText(from imagePath: String) throws -> OCRResult {
    let imageUrl = URL(fileURLWithPath: imagePath)
    guard let nsImage = NSImage(contentsOf: imageUrl) else {
        throw OCRScriptError.imageLoadFailed
    }

    guard let cgImage = prepareImageForOCR(nsImage) else {
        throw OCRScriptError.imageLoadFailed
    }

    var capturedError: Error?
    var capturedResult = OCRResult(
        fullText: "",
        blocks: [],
        averageConfidence: 0,
        imageSize: OCRImageSize(width: cgImage.width, height: cgImage.height),
        processedAt: ISO8601DateFormatter().string(from: Date())
    )

    let semaphore = DispatchSemaphore(value: 0)

    let request = VNRecognizeTextRequest { request, error in
        defer { semaphore.signal() }

        if let error {
            capturedError = error
            return
        }

        guard let observations = request.results as? [VNRecognizedTextObservation] else {
            return
        }

        let safeObservations = Array(observations)
        var blocks: [OCRTextBlock] = []
        var lines: [String] = []
        var confidenceSum: Double = 0

        for observation in safeObservations {
            guard let candidate = observation.topCandidates(1).first else {
                continue
            }

            let boundingBox = observation.boundingBox
            guard boundingBox.origin.x.isFinite,
                  boundingBox.origin.y.isFinite,
                  boundingBox.width.isFinite,
                  boundingBox.height.isFinite else {
                continue
            }

            blocks.append(
                OCRTextBlock(
                    text: candidate.string,
                    x: roundTo3(boundingBox.origin.x),
                    y: roundTo3(boundingBox.origin.y),
                    width: roundTo3(boundingBox.width),
                    height: roundTo3(boundingBox.height),
                    confidence: roundTo3(Double(candidate.confidence))
                )
            )
            lines.append(candidate.string)
            confidenceSum += Double(candidate.confidence)
        }

        let averageConfidence = blocks.isEmpty ? 0 : roundTo3(confidenceSum / Double(blocks.count))

        capturedResult = OCRResult(
            fullText: lines.joined(separator: "\n"),
            blocks: blocks,
            averageConfidence: averageConfidence,
            imageSize: OCRImageSize(width: cgImage.width, height: cgImage.height),
            processedAt: ISO8601DateFormatter().string(from: Date())
        )
    }

    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])
    semaphore.wait()

    if let capturedError {
        throw capturedError
    }

    return capturedResult
}

func prepareImageForOCR(_ image: NSImage) -> CGImage? {
    var sourceRect = NSRect(origin: .zero, size: image.size)
    guard let sourceCGImage = image.cgImage(forProposedRect: &sourceRect, context: nil, hints: nil) else {
        return nil
    }

    let width = sourceCGImage.width
    let height = sourceCGImage.height
    let longestSide = max(width, height)

    let scale: CGFloat
    if longestSide < 1400 {
        scale = 2.0
    } else if longestSide < 2200 {
        scale = 1.35
    } else {
        scale = 1.0
    }

    if scale == 1.0 {
        return sourceCGImage
    }

    let targetSize = NSSize(width: CGFloat(width) * scale, height: CGFloat(height) * scale)
    let resizedImage = NSImage(size: targetSize)

    resizedImage.lockFocus()
    NSGraphicsContext.current?.imageInterpolation = .high
    image.draw(in: NSRect(origin: .zero, size: targetSize), from: NSRect(origin: .zero, size: image.size), operation: .copy, fraction: 1.0)
    resizedImage.unlockFocus()

    var targetRect = NSRect(origin: .zero, size: targetSize)
    return resizedImage.cgImage(forProposedRect: &targetRect, context: nil, hints: nil)
}

do {
    guard CommandLine.arguments.count > 1 else {
        throw OCRScriptError.missingPath
    }

    let result = try extractText(from: CommandLine.arguments[1])
    let json = try JSONEncoder().encode(result)
    FileHandle.standardOutput.write(json)
} catch {
    let payload = ["error": String(describing: error)]
    if let json = try? JSONSerialization.data(withJSONObject: payload, options: []) {
        FileHandle.standardError.write(json)
    }
    exit(1)
}
