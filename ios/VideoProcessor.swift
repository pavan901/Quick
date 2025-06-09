//
//  VideoProcessor.swift
//  Quick
//
//  Created by Pavan Faldu on 06/06/25.
//

import Foundation
import UIKit
import AVFoundation
import AVKit
import react_native_webrtc

class CustomVideoView: UIView {
  override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }
  var displayLayer: AVSampleBufferDisplayLayer { layer as! AVSampleBufferDisplayLayer }

  override init(frame: CGRect) {
    super.init(frame: frame)
    displayLayer.videoGravity = .resizeAspectFill
    displayLayer.flushAndRemoveImage()
  }

  required init?(coder: NSCoder) { fatalError() }
}


// MARK: - RTCFrameRenderer
class RTCFrameRenderer: NSObject, RTCVideoRenderer {
  private var videoView: CustomVideoView?
  private let processingQueue = DispatchQueue(label: "com.pip.frameProcessing")
  private var pixelBufferPool: CVPixelBufferPool?
  private var bufferWidth = 0, bufferHeight = 0
  private var frameCount = 0
  private let frameProcessingInterval = 2

  func attach(to view: CustomVideoView) {
    self.videoView = view
  }

  func renderFrame(_ frame: RTCVideoFrame?) {
    guard let frame = frame else { return }
    frameCount += 1
    if frameCount % frameProcessingInterval != 0 { return }

    processingQueue.async { [weak self] in
      guard let self = self, let sample = self.convert(frame: frame) else { return }
      DispatchQueue.main.async {
        if self.videoView?.displayLayer.status == .failed {
          self.videoView?.displayLayer.flush()
        }
        self.videoView?.displayLayer.enqueue(sample)
      }
    }
  }

  func setSize(_ size: CGSize) {
    bufferWidth = Int(size.width)
    bufferHeight = Int(size.height)
    createPixelBufferPool()
  }

  private func createPixelBufferPool() {
    let attributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
      kCVPixelBufferWidthKey as String: bufferWidth,
      kCVPixelBufferHeightKey as String: bufferHeight,
      kCVPixelBufferIOSurfacePropertiesKey as String: [:]
    ]
    CVPixelBufferPoolCreate(nil, nil, attributes as CFDictionary, &pixelBufferPool)
  }

  private func convert(frame: RTCVideoFrame) -> CMSampleBuffer? {
    let buffer: CVPixelBuffer?
    if let cv = (frame.buffer as? RTCCVPixelBuffer)?.pixelBuffer {
      buffer = cv
    } else if let i420 = frame.buffer as? RTCI420Buffer {
      buffer = convertI420ToNV12(i420)
    } else {
      buffer = nil
    }

    guard let pixelBuffer = buffer else { return nil }

    var formatDesc: CMVideoFormatDescription?
    CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault,
                                                  imageBuffer: pixelBuffer,
                                                  formatDescriptionOut: &formatDesc)

    let pts = CMTime(value: CMTimeValue(frame.timeStampNs), timescale: 1_000_000_000)
    var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: pts, decodeTimeStamp: .invalid)

    var sample: CMSampleBuffer?
    CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault,
                                             imageBuffer: pixelBuffer,
                                             formatDescription: formatDesc!,
                                             sampleTiming: &timing,
                                             sampleBufferOut: &sample)
    return sample
  }

  private func convertI420ToNV12(_ i420: RTCI420Buffer) -> CVPixelBuffer? {
    let width = Int(i420.width)
    let height = Int(i420.height)

    if pixelBufferPool == nil || bufferWidth != width || bufferHeight != height {
      bufferWidth = width
      bufferHeight = height
      createPixelBufferPool()
    }

    var buffer: CVPixelBuffer?
    if let pool = pixelBufferPool {
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
    }
    guard let pixelBuffer = buffer else { return nil }

    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

    // Copy Y
    if let yDest = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) {
      for row in 0..<height {
        memcpy(yDest.advanced(by: row * CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)),
               i420.dataY.advanced(by: row * Int(i420.strideY)),
               width)
      }
    }

    // Copy interleaved UV
    if let uvDest = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1) {
      for row in 0..<height/2 {
        for col in 0..<width/2 {
          uvDest.storeBytes(of: i420.dataU[row * Int(i420.strideU) + col], toByteOffset: (row * CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)) + col * 2, as: UInt8.self)
          uvDest.storeBytes(of: i420.dataV[row * Int(i420.strideV) + col], toByteOffset: (row * CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)) + col * 2 + 1, as: UInt8.self)
        }
      }
    }

    return pixelBuffer
  }
}

// MARK: - MultiStream Manager
class MultiStreamFrameRenderer: NSObject {
  static let shared = MultiStreamFrameRenderer()

  private let localRenderer = RTCFrameRenderer()
  private let remoteRenderer = RTCFrameRenderer()

  func attachViews(local: CustomVideoView, remote: CustomVideoView) {
    localRenderer.attach(to: local)
    remoteRenderer.attach(to: remote)
  }

  func renderLocalFrame(_ frame: RTCVideoFrame) {
    localRenderer.renderFrame(frame)
  }

  func renderRemoteFrame(_ frame: RTCVideoFrame) {
    remoteRenderer.renderFrame(frame)
  }
}

// MARK: - Split Video View
class SplitVideoView: UIView {
  static let shared = SplitVideoView()

  let localVideoView = CustomVideoView()
  let remoteVideoView = CustomVideoView()

  override init(frame: CGRect = UIScreen.main.bounds) {
    super.init(frame: frame)
    layoutUI()
    MultiStreamFrameRenderer.shared.attachViews(local: localVideoView, remote: remoteVideoView)
  }

  required init?(coder: NSCoder) { fatalError() }

  private func layoutUI() {
    addSubview(localVideoView)
    addSubview(remoteVideoView)

    localVideoView.translatesAutoresizingMaskIntoConstraints = false
    remoteVideoView.translatesAutoresizingMaskIntoConstraints = false

    
    localVideoView.transform = CGAffineTransform(rotationAngle: .pi / 2)
    localVideoView.clipsToBounds = true
    localVideoView.contentMode = .scaleToFill
    
    NSLayoutConstraint.activate([
      localVideoView.leadingAnchor.constraint(equalTo: leadingAnchor),
      localVideoView.topAnchor.constraint(equalTo: topAnchor),
      localVideoView.bottomAnchor.constraint(equalTo: bottomAnchor),
      localVideoView.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.5),

      remoteVideoView.leadingAnchor.constraint(equalTo: localVideoView.trailingAnchor),
      remoteVideoView.topAnchor.constraint(equalTo: topAnchor),
      remoteVideoView.trailingAnchor.constraint(equalTo: trailingAnchor),
      remoteVideoView.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])
  }
}

@objc public class VideoProcessor: NSObject, VideoFrameProcessorDelegate {
  public func capturer(_ capturer: RTCVideoCapturer!, didCapture frame: RTCVideoFrame!) -> RTCVideoFrame! {
    MultiStreamFrameRenderer.shared.renderLocalFrame(frame)
    return frame
  }

  @objc public override init() {
    super.init()
  }
}

@objc(RemoteTrackModule)
class RemoteTrackModule: NSObject, RTCVideoRenderer {

  @objc func attachRenderer(_ trackId: String) {
    if let track = RemoteTrackRegistry.shared().remoteTrack(forId: trackId) {
      print("✅ Got remote track: \(trackId)")
      track.add(self)
    } else {
      print("❌ No track for ID: \(trackId)")
    }
  }

  func setSize(_ size: CGSize) {}

  func renderFrame(_ frame: RTCVideoFrame?) {
    guard let frame = frame else { return }
    MultiStreamFrameRenderer.shared.renderRemoteFrame(frame)
  }
}


@objc(PiPManager)
class PiPManager: NSObject , AVPictureInPictureControllerDelegate {

  private var pipController: AVPictureInPictureController?
  private var pipViewController: AVPictureInPictureVideoCallViewController?
  private var splitVideoView: SplitVideoView?

  @objc public override init() {
    super.init()
  }
  
  @objc func setupPiP() {
    DispatchQueue.main.async {
      guard AVPictureInPictureController.isPictureInPictureSupported(),
            let rootView = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { $0.isKeyWindow })?.rootViewController?.view else {
        print("❌ PiP not supported or root view not found")
        return
      }

      if self.splitVideoView == nil {
        self.splitVideoView = SplitVideoView(frame: CGRect(x: 0, y: 0, width: 120, height: 90))
      }

      let pipVC = AVPictureInPictureVideoCallViewController()
      pipVC.preferredContentSize = CGSize(width: 120, height: 90)

      if let splitView = self.splitVideoView {
        pipVC.view.addSubview(splitView)
        splitView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
          splitView.topAnchor.constraint(equalTo: pipVC.view.topAnchor),
          splitView.bottomAnchor.constraint(equalTo: pipVC.view.bottomAnchor),
          splitView.leadingAnchor.constraint(equalTo: pipVC.view.leadingAnchor),
          splitView.trailingAnchor.constraint(equalTo: pipVC.view.trailingAnchor)
        ])
      }

      let contentSource = AVPictureInPictureController.ContentSource(
        activeVideoCallSourceView: rootView,
        contentViewController: pipVC
      )

      self.pipController = AVPictureInPictureController(contentSource: contentSource)
      self.pipController?.canStartPictureInPictureAutomaticallyFromInline = true
      self.pipViewController = pipVC

      print("✅ PiP setup complete")
    }
  }


  @objc func startPiP() {
    DispatchQueue.main.async {
      if self.pipController?.isPictureInPictureActive == false {
        self.pipController?.startPictureInPicture()
        print("▶️ PiP started")
      }
    }
  }

  @objc func stopPiP() {
    DispatchQueue.main.async {
      if self.pipController?.isPictureInPictureActive == true {
        self.pipController?.stopPictureInPicture()
        print("⏹️ PiP stopped")
      }
    }
  }

}
