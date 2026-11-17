#import "RemoteComposeModule.h"

#import "Contract/RemoteComposeContractCpp.h"

using namespace facebook::react;
using namespace remotecompose::contract;

/// Thin TurboModule glue; the behaviour lives in Swift (`RemoteComposeJson`).
@implementation RemoteComposeModule

RCT_EXPORT_MODULE(RemoteComposeModule)

- (NSNumber *)isJsonConversionSupported {
  return @(RemoteComposeJson.isConversionSupported);
}

- (void)convertJsonToRc:(NSString *)json
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject {
  // Rejected with the error code the view reports for a `{ json }` source on iOS.
  NSString *code = @(RemoteComposeViewEventEmitter::toString(toCpp(RemoteComposeErrorCodeUnsupported)));
  reject(code, RemoteComposeJson.unsupportedMessage, nil);
}

- (std::shared_ptr<TurboModule>)getTurboModule:(const ObjCTurboModule::InitParams &)params {
  return std::make_shared<NativeRemoteComposeModuleSpecJSI>(params);
}

@end
