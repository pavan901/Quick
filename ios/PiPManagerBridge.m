//
//  PiPManagerBridge.m
//  Quick
//
//  Created by Pavan Faldu on 09/06/25.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PiPManager, NSObject)
RCT_EXTERN_METHOD(setupPiP)
RCT_EXTERN_METHOD(startPiP)
RCT_EXTERN_METHOD(stopPiP)
@end
