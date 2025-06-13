# Picture-in-Picture Mode

## Overview

Picture-in-Picture (PiP) mode enhances the video conferencing experience by allowing users to multitask while keeping a small, floating video window on their screen. This guide walks you through implementing PiP mode in React-native using VideoSDK for  iOS platforms—without relying on third-party dependencies.

To enable PiP mode, native methods are used on  iOS through the native modules. the process involves capturing RTC frames natively, rendering them into a custom view with `AVPlayer`, and then utilising that view to enable PiP functionality. because iOS dont allow PiP mode other then aavplayer components .


First off all creating small project with the react native quick start 

## Local frames in iOS side 

### Installation

- To create a custom video processor, you first need to install the `react-native-webrtc` package in your React Native app using either `npm` or `yarn`.

```js
npm i "@videosdk.live/react-native-webrtc"
```

- To enable native processor development on iOS, add the following line to your `Podfile` :

  

```js title="Podfile"

pod 'react-native-webrtc', :path  =>  '../node_modules/@videosdk.live/react-native-webrtc'

```

### **Step 1: Create VideoProcessor**

- First, create a class that implements the `VideoFrameProcessorDelegate` protocol. In this class, implement the method `capturer(_:didCapture:)`, which allows you to get the video frames.

```js
@objc public class VideoProcessor: NSObject, VideoFrameProcessorDelegate {
	public func capturer(_ capturer: RTCVideoCapturer!, didCapture frame: RTCVideoFrame!) -> RTCVideoFrame! {
		// here we get the loacl frames 
		return frame
	}
	@objc public override init() {
		super.init()	
	}
}
```
### **Step 2: Register your Processor**

- Next, create a class that extends `RCTBridgeModule`. This class acts as a bridge between the native iOS code and React Native, allowing you to interact with native modules from JavaScript.

- In this class, register your video processor using the `addProcessor()` method from the `ProcessorProvider` class. Provide a `String` representing the unique processor name along with an instance of your processor to complete the registration. This processor name will be used later to apply the effects offered by your processor.

```js title="VideoEffectModule.h"
#import "VideoEffectModule.h"
#import "ProcessorProvider.h"
#import "YourApp-Bridging-Header.h"  // Replace with your project name
#import "YourApp-Swift.h" // Replace with your project name
#include <Foundation/Foundation.h>

@implementation VideoEffectModule

RCT_EXPORT_MODULE(VideoEffectModule);

RCT_EXPORT_METHOD(registerProcessor:(NSString *)name) {
  VideoProcessor *processor = [[VideoProcessor alloc] init];
  [ProcessorProvider addProcessor:processor forName:name];
}
```

- Now, in your React Native app, you can register the processor using the module.

```js
const  {VideoEffectModule}  = NativeModules;

function  register() {
	VideoEffectModule.registerProcessor('VideoProcessor');
}
```

### **Step 3: Apply the Processor**

- Once you have registered the processor, you can use it throughout the entire app lifecycle. To apply the effect, use the `applyVideoProcessor()` method from the `VideoProcessor` class. This method requires the name of the processor that was used during registration.
 
```js title="app.js"
import {VideoProcessor} from "@videosdk.live/react-native-webrtc";

function applyProcessor() {
  VideoProcessor.applyVideoProcessor("VideoProcessor");
}
```

## Remote frames in iOS side ##

for the accesing the remote stream in the ios side we need remote stream id so for that we take remote stream id in the participant hook's onstreamenabled event  and then if we want to send that to the ios side we have to create bridge beetwen the react native and ios side 

### **Step 1 : RemoteStreamBridge**

```js
#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(RemoteTrackModule, NSObject)

RCT_EXTERN_METHOD(attachRenderer:(NSString *)trackId)
@end
```

### **Step 2 : We have to now find track id for the remote participant**

we use participant hooks onstreamenable event tha

```js
const { RemoteTrackModule } =  NativeModules;

function onStreamEnabled(stream) {
  const trackId = stream.track.id;
  console.log('Stream enabled for track:', trackId);
  NativeModules.RemoteTrackModule.attachRenderer(trackId);
}

function ParticipantView({ participantId }) {
const { localParticipant } = useMeeting();
const { webcamStream, webcamOn } = useParticipant(participantId, {
    onStreamEnabled: participantId === localParticipant.id ? undefined : onStreamEnabled,
 });
```

### **Step 3 : get the remote track**

we use webrtc function remote track repository for the geting the track in the ios side 

```swift
import  react_native_webrtc
@objc  func  attachRenderer(_  trackId: String) {
	if  let track = RemoteTrackRegistry.shared().remoteTrack(forId: trackId) {
		print("Got remote track: \(trackId)")
		track.add(self)
	} else {
		print("No track for ID: \(trackId)")
	}
}
```

##  Converting RTC Frames to `CVPixelBuffer` ##

We need to take incoming WebRTC video frames, transform them into `CVPixelBuffer`s (rotating local frames and converting remote I420 frames to NV12), and wrap them in `CMSampleBuffer`s for display.

### **Step 1: Define a Custom View**

A `UIView` whose backing layer is an `AVSampleBufferDisplayLayer`, letting us enqueue and render video samples directly.

```js
import  AVFoundation
import  UIKit
import  AVKit

class  CustomVideoView: UIView {
	override  class  var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }
	var displayLayer: AVSampleBufferDisplayLayer { layer as! AVSampleBufferDisplayLayer }
	
	override  init(frame: CGRect) {
		super.init(frame: frame)
		displayLayer.videoGravity  = .resizeAspectFill
		displayLayer.flushAndRemoveImage()
	}
	required  init?(coder: NSCoder) { fatalError() }
}
```

### **Step 2: Create the Frame Renderer**

This renderer will:
1.  **Throttle** processing (every Nth frame).
2.  **Rotate** local pixel buffers 90°.
3.  **Convert** remote I420 buffers into NV12 format.
4.  **Wrap** the result in a `CMSampleBuffer` and enqueue it on the display layer.

```js
class  RTCFrameRenderer: NSObject, RTCVideoRenderer {

	private  var videoView: CustomVideoView?
	private  let processingQueue =  DispatchQueue(label: "com.pip.frameProcessing")
	private  let imageProcessingQueue =  DispatchQueue(label: "com.pip.imageProcessing", qos: .userInteractive)
	private  var pixelBufferPool: CVPixelBufferPool?
	private  var bufferWidth =  0, bufferHeight =  0
	private  var frameCount =  0
	private  let frameProcessingInterval =  2

	func  attach(to  view: CustomVideoView) {
		self.videoView  = view	
	}

	func  renderFrame(_  frame: RTCVideoFrame?) {
		guard  let frame = frame else { return }
		frameCount +=  1
		if frameCount % frameProcessingInterval !=  0 { return }
		processingQueue.async { [weak  self] in
			guard  let  self  =  self, let sample =  self.convert(frame: frame) else { return }
			DispatchQueue.main.async {
			if  self.videoView?.displayLayer.status == .failed {
				self.videoView?.displayLayer.flush()
			}
			self.videoView?.displayLayer.enqueue(sample)
		}
	}
	
	func  setSize(_  size: CGSize) {
		bufferWidth =  Int(size.width)
		bufferHeight =  Int(size.height)
		createPixelBufferPool()
	}
	
	private  func  createPixelBufferPool() {
		let attributes: [String: Any] = [
			kCVPixelBufferPixelFormatTypeKey as  String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
			kCVPixelBufferWidthKey as  String: bufferWidth,
			kCVPixelBufferHeightKey as  String: bufferHeight,
			kCVPixelBufferIOSurfacePropertiesKey as  String: [:]
		]
		CVPixelBufferPoolCreate(nil, nil, attributes as CFDictionary, &pixelBufferPool)
	}

	private  func  convert(frame: RTCVideoFrame) -> CMSampleBuffer? {
		let buffer: CVPixelBuffer?
		
		if  let cv = (frame.buffer as? RTCCVPixelBuffer)?.pixelBuffer {
			buffer =  rotatePixelBuffer(cv) 
		} else  if  let i420 = frame.buffer as? RTCI420Buffer {
			buffer =  convertI420ToNV12(i420)
		} else {
			buffer = nil
		}
		
		guard  let pixelBuffer = buffer else { return nil }
		
		var formatDesc: CMVideoFormatDescription?
		CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault,
													imageBuffer: pixelBuffer,
													formatDescriptionOut: &formatDesc)
													
		let pts =  CMTime(value: CMTimeValue(frame.timeStampNs), timescale: 1_000_000_000)
		var timing =  CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: pts, decodeTimeStamp: .invalid)
		
		var sample: CMSampleBuffer?
		CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault,
												imageBuffer: pixelBuffer,
												formatDescription: formatDesc!,
												sampleTiming: &timing,
												sampleBufferOut: &sample)
		return sample
	}
}
```

We spin local `CVPixelBuffer`s 90° by rendering through a `CIContext`.

```js
private  func  rotatePixelBuffer(_  pixelBuffer: CVPixelBuffer) -> CVPixelBuffer? {
	let context =  CIContext(options: [
		.useSoftwareRenderer: false,
		.workingColorSpace:  CGColorSpaceCreateDeviceRGB()
	])
	var resultBuffer: CVPixelBuffer?
	let semaphore =  DispatchSemaphore(value: 0)
	
	imageProcessingQueue.async {
		CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
		defer {
			CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
		}
		
		let ciImage =  CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
		let width =  CVPixelBufferGetHeight(pixelBuffer)  rotation
		let height =  CVPixelBufferGetWidth(pixelBuffer)
		
		var rotatedBuffer: CVPixelBuffer?
		let attributes: [String: Any] = [
			kCVPixelBufferPixelFormatTypeKey as  String:  Int(kCVPixelFormatType_420YpCbCr8BiPlanarFullRange),
			kCVPixelBufferWidthKey as  String: width,
			kCVPixelBufferHeightKey as  String: height,
			kCVPixelBufferIOSurfacePropertiesKey as  String: [:]
		]
		let result =  CVPixelBufferCreate(kCFAllocatorDefault, width, height,
										  kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
										  attributes as CFDictionary, &rotatedBuffer)
										  
		if result == kCVReturnSuccess, let rotatedBuffer = rotatedBuffer {
			// Lock the output buffer for writing
			CVPixelBufferLockBaseAddress(rotatedBuffer, [])
			defer {
				CVPixelBufferUnlockBaseAddress(rotatedBuffer, [])
			}
			// Perform the render operation
			context.render(ciImage, to: rotatedBuffer)
			resultBuffer = rotatedBuffer
		}
		semaphore.signal()
	}
	// Wait for the image processing to complete
	_ = semaphore.wait(timeout: .now() + .seconds(1))
	return resultBuffer
}
```

Copy Y-plane and interleave U/V bytes into the second plane of an NV12 buffer.

```js
private  func  convertI420ToNV12(_  i420: RTCI420Buffer) -> CVPixelBuffer? {
	let width =  Int(i420.width)
	let height =  Int(i420.height)
	if pixelBufferPool == nil || bufferWidth != width || bufferHeight != height {
		bufferWidth = width
		bufferHeight = height
		createPixelBufferPool()
	}
	var buffer: CVPixelBuffer?
	if  let pool = pixelBufferPool {
		CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
	}
	guard  let pixelBuffer = buffer else { return nil }
	CVPixelBufferLockBaseAddress(pixelBuffer, [])
	defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
	
	// Copy Y
	if  let yDest =  CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) {
		for row in  0..<height {
			memcpy(yDest.advanced(by: row * CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)),
			i420.dataY.advanced(by: row *  Int(i420.strideY)),
			width)
		}
	}
	
	// Copy interleaved UV
	if  let uvDest =  CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1) {
		for row in  0..<height/2 {
			for col in  0..<width/2 {
				uvDest.storeBytes(of: i420.dataU[row *  Int(i420.strideU) + col], toByteOffset: (row *  CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)) + col *  2, as: UInt8.self)
				uvDest.storeBytes(of: i420.dataV[row *  Int(i420.strideV) + col], toByteOffset: (row *  CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)) + col *  2  +  1, as: UInt8.self)
			}
		}
	}
	return pixelBuffer
}
```

### **Step 3: Multistream renderer**

**MultiStreamFrameRenderer** attaches two `RTCFrameRenderer`s (local & remote).

```js
class  MultiStreamFrameRenderer: NSObject {
	static  let shared =  MultiStreamFrameRenderer()
	private  let localRenderer =  RTCFrameRenderer()
	private  let remoteRenderer =  RTCFrameRenderer()
	func  attachViews(local: CustomVideoView, remote: CustomVideoView) {
		localRenderer.attach(to: local)
		remoteRenderer.attach(to: remote)
	}
	func  renderLocalFrame(_  frame: RTCVideoFrame) {
		localRenderer.renderFrame(frame)
	}
	func  renderRemoteFrame(_  frame: RTCVideoFrame) {
		remoteRenderer.renderFrame(frame)
	}
}
```

### **Step 4: UiView for the pip mode**

**SplitVideoView** composes them side-by-side, toggling remote visibility.

```js
class  SplitVideoView: UIView {
	static  let shared =  SplitVideoView()

	let localVideoView =  CustomVideoView()
	let remoteVideoView =  CustomVideoView()

	private  var localWidthConstraint: NSLayoutConstraint?
	private  var remoteLeadingConstraint: NSLayoutConstraint?

	override  init(frame: CGRect = UIScreen.main.bounds) {
		super.init(frame: frame)
		layoutUI()
		MultiStreamFrameRenderer.shared.attachViews(local: localVideoView, remote: remoteVideoView)
	}
	
	required  init?(coder: NSCoder) {
		fatalError("init(coder:) has not been implemented")
	}
	
	private  func  layoutUI() {
		addSubview(localVideoView)
		addSubview(remoteVideoView)
		localVideoView.translatesAutoresizingMaskIntoConstraints  = false
		remoteVideoView.translatesAutoresizingMaskIntoConstraints  = false
		localVideoView.clipsToBounds  = true
		remoteVideoView.clipsToBounds  = true
		
		// Set initial constraints: local takes full width
		localWidthConstraint = localVideoView.widthAnchor.constraint(equalTo: widthAnchor)
		remoteLeadingConstraint = remoteVideoView.leadingAnchor.constraint(equalTo: localVideoView.trailingAnchor)
		
		NSLayoutConstraint.activate([
			localVideoView.leadingAnchor.constraint(equalTo: leadingAnchor),
			localVideoView.topAnchor.constraint(equalTo: topAnchor),
			localVideoView.bottomAnchor.constraint(equalTo: bottomAnchor),
			localWidthConstraint!,
			
			remoteLeadingConstraint!,
			remoteVideoView.topAnchor.constraint(equalTo: topAnchor),
			remoteVideoView.bottomAnchor.constraint(equalTo: bottomAnchor),
			remoteVideoView.trailingAnchor.constraint(equalTo: trailingAnchor),
		])
		remoteVideoView.isHidden  = true
	}
	
	func  updateRemoteVisibility(showRemote: Bool) {
		DispatchQueue.main.async {
		self.remoteVideoView.isHidden  =  !showRemote
		
		// Update width constraint for local view
		self.localWidthConstraint?.isActive  = false
		if showRemote {
			self.localWidthConstraint  =  self.localVideoView.widthAnchor.constraint(equalTo: self.widthAnchor, multiplier: 0.5)
		} else {
			self.localWidthConstraint  =  self.localVideoView.widthAnchor.constraint(equalTo: self.widthAnchor)
		}
		self.localWidthConstraint?.isActive  = true
		self.layoutIfNeeded()
		}
	}
}
```
how to wire your two renderers into the shared `MultiStreamFrameRenderer`.

- local frames 
```js
@objc  public  class  VideoProcessor: NSObject, VideoFrameProcessorDelegate {
	public  func  capturer(_  capturer: RTCVideoCapturer!, didCapture  frame: RTCVideoFrame!) -> RTCVideoFrame! {
		MultiStreamFrameRenderer.shared.renderLocalFrame(frame)
		return frame
	}
	
	@objc  public  override  init() {
		super.init()
	}
}
```
- remote track

```js
@objc(RemoteTrackModule)
class  RemoteTrackModule: NSObject, RTCVideoRenderer {

	@objc  func  attachRenderer(_  trackId: String) {
		if  let track = RemoteTrackRegistry.shared().remoteTrack(forId: trackId) {
			print("Got remote track: \(trackId)")
			track.add(self)
		} else {
			print("No track for ID: \(trackId)")
		}
	}
	
	func  setSize(_  size: CGSize) {}

	func  renderFrame(_  frame: RTCVideoFrame?) {
		guard  let frame = frame else { return }
		MultiStreamFrameRenderer.shared.renderRemoteFrame(frame)
	}
}
```


## PiP Implementation ##

### **Step 1 : Enable Xcode Capabilities**

Enable the necessary capabilities in Xcode:

1. Open your project in Xcode.

2. Navigate to your target settings.

3. Select the "Signing & Capabilities" tab.

4. Click the "+" button to add capabilities.

5. Add **Background Modes**.

Under **Background Modes**, enable the following options:
- Audio, AirPlay, and Picture in Picture
- Voice over IP

<center>

<img  src='https://cdn.videosdk.live/website-resources/docs-resources/pip_flutter_ios_modes.png'/>

</center>

### **Step 2: PiPManager (Swift)**

This singleton sets up, starts/stops PiP, and toggles whether to show the remote stream.

```js
@objc(PiPManager)
class  PiPManager: NSObject, AVPictureInPictureControllerDelegate {

	// Flag to determine whether to show remote or local video in PiP
	private  var _showRemote: Bool  = false {
		didSet {
			DispatchQueue.main.async { [weak  self] in
			guard  let  self  =  self  else { return }
			SplitVideoView.shared.updateRemoteVisibility(showRemote: self._showRemote)
			}
		}
	}
	
	private  var pipController: AVPictureInPictureController?
	private  var pipViewController: AVPictureInPictureVideoCallViewController?
	private  var splitVideoView: SplitVideoView?
	
	@objc  public  override  init() {
		super.init()
	}
	
	// Called from React Native to toggle the flag
	@objc  func  setShowRemote(_  value: Bool) {
		_showRemote = value
	}
	
	@objc  func  setupPiP() {
		DispatchQueue.main.async { [weak  self] in
		guard  let  self  =  self,
		AVPictureInPictureController.isPictureInPictureSupported(),
		
		let rootView = UIApplication.shared.connectedScenes
		.compactMap({ $0  as? UIWindowScene })
		.flatMap({ $0.windows })
		.first(where: { $0.isKeyWindow })?.rootViewController?.view else {
			print("PiP not supported or root view not found")
		return
		}
		
		self.splitVideoView  = SplitVideoView.shared
		
		let pipVC =  AVPictureInPictureVideoCallViewController()
		pipVC.preferredContentSize  =  CGSize(width: 120, height: 90)
		if  let splitView =  self.splitVideoView {
			pipVC.view.addSubview(splitView)
			splitView.translatesAutoresizingMaskIntoConstraints  = false
			
			NSLayoutConstraint.activate([
				splitView.topAnchor.constraint(equalTo: pipVC.view.topAnchor),
				splitView.bottomAnchor.constraint(equalTo: pipVC.view.bottomAnchor),
				splitView.leadingAnchor.constraint(equalTo: pipVC.view.leadingAnchor),
				splitView.trailingAnchor.constraint(equalTo: pipVC.view.trailingAnchor)
			])
			
			splitView.updateRemoteVisibility(showRemote: self._showRemote)
		}
		
		let contentSource = AVPictureInPictureController.ContentSource(
			activeVideoCallSourceView: rootView,
			contentViewController: pipVC
		)	
		
		self.pipController  =  AVPictureInPictureController(contentSource: contentSource)
		self.pipController?.delegate  =  self
		self.pipController?.canStartPictureInPictureAutomaticallyFromInline  = true
		self.pipViewController  = pipVC
		
		print("PiP setup complete")
		}
	}
	
	@objc  func  startPiP() {
		DispatchQueue.main.async {
			if  self.pipController?.isPictureInPictureActive == false {
				self.pipController?.startPictureInPicture()
				print("PiP started")
			}
		}
	}
	
	@objc  func  stopPiP() {
		DispatchQueue.main.async {
			if  self.pipController?.isPictureInPictureActive == true {
				self.pipController?.stopPictureInPicture()
				print("PiP stopped")
			}
		}
	}
	
	func  pictureInPictureControllerDidStopPictureInPicture(_  controller: AVPictureInPictureController) {
		if  let view =  self.splitVideoView {
			view.removeFromSuperview()
		}
		pipViewController = nil
		pipController = nil
		print("PiP cleanup done")
	}
}
```

### **Step 3: Expose to React Native (Obj-C Bridge)**

```c
#import  <React/RCTBridgeModule.h>

@interface  RCT_EXTERN_MODULE(PiPManager,  NSObject)

RCT_EXTERN_METHOD(setupPiP)
RCT_EXTERN_METHOD(startPiP)
RCT_EXTERN_METHOD(stopPiP)
RCT_EXTERN_METHOD(setShowRemote:(BOOL)value)
@end
```

### **Step 4: Invoke from JavaScript**

Register your buttons and remote-stream logic:

```js
const { VideoEffectModule, PiPManager, RemoteTrackModule } =  NativeModules;

<Button
	onPress={() => {
		register();
		applyProcessor();
		PiPManager.setupPiP();
	}}
	buttonText={'Apply Processor'}
	backgroundColor={'#1178F8'}
/>

<Button
	onPress={() => {
		PiPManager.startPiP();
	}}
	buttonText={'PiP'}
	backgroundColor={'#1178F8'}
/>
```

### **Step 5: Auto-Toggle Remote in PiP**

Inside your `useParticipant` hook, attach remote tracks and flip the PiP flag:
```js
const {webcamStream, webcamOn} =  useParticipant(participantId, {
	onStreamEnabled:  stream  => {
		setWebcamStatusMap(prev  => ({...prev, [participantId]: true}));
		const  trackId  =  stream.track.id;
		
		// Automatically assign to PiP if no one is set
		if (
			!pipedParticipantRef.current  &&
			participantId  !==  localParticipant.id
		) {
			pipedParticipantRef.current  =  participantId;
			RemoteTrackModule.attachRenderer(trackId);
			PiPManager.setShowRemote(true);
		} else  if (participantId  ===  pipedParticipantRef.current) {
			RemoteTrackModule.attachRenderer(trackId);
			PiPManager.setShowRemote(true);
		}
	},
	
	onStreamDisabled: () => {
	setWebcamStatusMap(prev  => {
		const  updated  = {...prev, [participantId]: false};
		if (participantId  ===  pipedParticipantRef.current) {
			const  nextPiped  =  Object.entries(updated).find(
			    ([id, isOn]) =>
				id  !==  localParticipant.id  &&  id  !==  participantId  &&  isOn,
			);
			
			if (nextPiped) {
				pipedParticipantRef.current  =  nextPiped[0];
				PiPManager.setShowRemote(true);
			} else {
				pipedParticipantRef.current  = null;
				PiPManager.setShowRemote(false);
			}
		}
		return  updated;
	});
	},
});
```
that's it. 