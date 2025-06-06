//
//  VideoEffectModule.m
//  Quick
//
//  Created by Pavan Faldu on 06/06/25.
//

#import "VideoEffectModule.h"
#import "ProcessorProvider.h"
#import "Quick-Bridging-Header.h"
#import "Quick-Swift.h"
#include <Foundation/Foundation.h>

@implementation VideoEffectModule

RCT_EXPORT_MODULE(VideoEffectModule);

RCT_EXPORT_METHOD(registerProcessor:(NSString *)name) {
  VideoProcessor *processor = [[VideoProcessor alloc] init];
  [ProcessorProvider addProcessor:processor forName:name];
}

@end
