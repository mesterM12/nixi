import Foundation
import AVFoundation
import CoreVideo

// Exercise the same native media stack used by QuickTime without opening any UI.
@main struct NativeMediaCheck {
    static func main() async {
        var report: [String: Any] = ["playable": false, "videoSamples": 0, "audioSamples": 0]
        do {
            let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
            report["playable"] = try await asset.load(.isPlayable)
            let reader = try AVAssetReader(asset: asset)
            let tracks = try await asset.load(.tracks)
            var outputs: [(String, AVAssetReaderTrackOutput)] = []
            for track in tracks {
                let settings: [String: Any]
                let key: String
                if track.mediaType == .video {
                    key = "videoSamples"
                    settings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
                } else if track.mediaType == .audio {
                    key = "audioSamples"
                    settings = [AVFormatIDKey: kAudioFormatLinearPCM]
                } else { continue }
                let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
                guard reader.canAdd(output) else { throw NSError(domain: "NixiNativeMedia", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot decode track"] ) }
                reader.add(output)
                outputs.append((key, output))
            }
            guard reader.startReading() else { throw reader.error ?? NSError(domain: "NixiNativeMedia", code: 2) }
            for (key, output) in outputs {
                var samples = 0
                while let sample = output.copyNextSampleBuffer() {
                    samples += 1
                    CMSampleBufferInvalidate(sample)
                }
                report[key] = samples
            }
            if let error = reader.error { throw error }
            report["completed"] = reader.status == .completed
            if reader.status != .completed { report["error"] = "Native decoding did not finish" }
        } catch {
            report["error"] = String(describing: error)
            report["completed"] = false
        }
        let json = try! JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
        print(String(data: json, encoding: .utf8)!)
    }
}
