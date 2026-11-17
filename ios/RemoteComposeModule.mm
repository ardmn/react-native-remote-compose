#import "RemoteComposeModule.h"

/// iOS has no on-device converter for AndroidX authoring JSON (the only implementation is
/// AndroidX's Java `RemoteComposeJsonParser`). Convert on a server or at build time instead.
@implementation RemoteComposeModule

RCT_EXPORT_MODULE(RemoteComposeModule)

- (NSNumber *)isJsonConversionSupported {
  return @NO;
}

- (void)convertJsonToRc:(NSString *)json
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject {
  reject(@"E_UNSUPPORTED",
         @"JSON to .rc conversion is available on Android only. Convert on the server or at build time "
          "(tools/remote-compose-json) and pass the .rc as uri or base64.",
         nil);
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeRemoteComposeModuleSpecJSI>(params);
}

@end
