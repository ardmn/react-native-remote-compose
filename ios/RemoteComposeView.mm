#import "RemoteComposeView.h"

#import <react/renderer/components/RemoteComposeViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RemoteComposeViewSpec/RCTComponentViewHelpers.h>

#import "Contract/RemoteComposeContractCpp.h"

using namespace facebook::react;
using namespace remotecompose::contract;

/// Fabric glue only. React Native's component view API is C++ (`Props::Shared`, the component
/// descriptor, the event emitter), so this class must be Objective-C++; everything it does is
/// hand Codegen's C++ props to `RemoteComposeHostView` (Swift) and Swift events back to Codegen's
/// C++ emitter, through conversions generated from the spec (Contract/RemoteComposeContractCpp.h).
@interface RemoteComposeView () <RCTRemoteComposeViewViewProtocol>
@end

@implementation RemoteComposeView {
  RemoteComposeHostView *_host;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<RemoteComposeViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const RemoteComposeViewProps>();
    _props = defaultProps;
    [self createHost];
  }
  return self;
}

- (std::shared_ptr<const RemoteComposeViewEventEmitter>)emitter {
  return std::static_pointer_cast<const RemoteComposeViewEventEmitter>(_eventEmitter);
}

- (void)createHost {
  _host = [[RemoteComposeHostView alloc] initWithFrame:self.bounds];
  __weak RemoteComposeView *weakSelf = self;
  _host.onAction = ^(RemoteComposeActionEvent *event) {
    if (auto emitter = [weakSelf emitter]) {
      emitter->onRemoteAction(toCpp(event));
    }
  };
  _host.onError = ^(RemoteComposeErrorEvent *event) {
    if (auto emitter = [weakSelf emitter]) {
      emitter->onRemoteError(toCpp(event));
    }
  };
  _host.onLoad = ^(RemoteComposeLoadEvent *event) {
    if (auto emitter = [weakSelf emitter]) {
      emitter->onRemoteLoad(toCpp(event));
    }
  };
  self.contentView = _host;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  [super updateProps:props oldProps:oldProps];
  [_host update:toObjC(*std::static_pointer_cast<RemoteComposeViewProps const>(props))];
}

- (void)prepareForRecycle {
  [super prepareForRecycle];
  [_host prepareForRecycle];
}

@end
