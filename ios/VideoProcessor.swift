//
//  VideoProcessor.swift
//  Quick
//
//  Created by Pavan Faldu on 06/06/25.
//

import Foundation
import react_native_webrtc

@objc public class VideoProcessor: NSObject, VideoFrameProcessorDelegate {
  
  public func capturer(_ capturer: RTCVideoCapturer!, didCapture frame: RTCVideoFrame!) -> RTCVideoFrame! {
    // Add your custom code here to apply the effect and return the processed VideoFrame
    print("hi \(frame.description)")
    return frame
  }

  @objc public override init() {
    //
    super.init()
  }
  
}

@objc(RemoteTrackModule)
class RemoteTrackModule: NSObject {
  
  @objc func attachRenderer(_ trackId: String) {
    if let track = RemoteTrackRegistry.shared().remoteTrack(forId: trackId) {
      print("✅ Got remote track: \(trackId)")
    } else {
      print(" No track for ID: \(trackId)")
    }
  }
}

