//
//  RemoteStreamBridge.m
//  Quick
//
//  Created by Pavan Faldu on 06/06/25.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RemoteTrackModule, NSObject)
RCT_EXTERN_METHOD(attachRenderer:(NSString *)trackId)
@end
