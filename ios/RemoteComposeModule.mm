#import "RemoteComposeModule.h"

#if __has_include(<RemoteCompose/RemoteCompose-Swift.h>)
#import <RemoteCompose/RemoteCompose-Swift.h>
#else
#import "RemoteCompose-Swift.h"
#endif

/// Thin TurboModule glue; the behaviour lives in Swift (`RemoteComposeJson`).
@implementation RemoteComposeModule

RCT_EXPORT_MODULE(RemoteComposeModule)

- (NSNumber *)isJsonConversionSupported {
  return @(RemoteComposeJson.isConversionSupported);
}

- (void)convertJsonToRc:(NSString *)json
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject {
  reject(@"E_UNSUPPORTED", RemoteComposeJson.unsupportedMessage, nil);
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeRemoteComposeModuleSpecJSI>(params);
}

@end
