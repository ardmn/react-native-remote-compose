#import "RemoteComposeView.h"

#import <react/renderer/components/RemoteComposeViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RemoteComposeViewSpec/RCTComponentViewHelpers.h>

#import "Contract/RemoteComposeContractCpp.h"

using namespace facebook::react;
using namespace remotecompose::contract;

/// Thin Fabric glue: Codegen's C++ props become Swift types for `RemoteComposeHostView`, and its
/// Swift events become Codegen's C++ event structs. Conversions are generated from the spec.
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
  const auto &newProps = *std::static_pointer_cast<RemoteComposeViewProps const>(props);

  [_host setDocumentBase64:newProps.documentBase64.empty() ? nil : toNSString(newProps.documentBase64)];
  [_host setDocumentUri:newProps.documentUri.empty() ? nil : toNSString(newProps.documentUri)];
  [_host setDocumentJson:newProps.documentJson.empty() ? nil : toNSString(newProps.documentJson)];

  NSMutableArray<NSString *> *headers = [NSMutableArray arrayWithCapacity:newProps.documentHeaders.size()];
  for (const auto &header : newProps.documentHeaders) {
    [headers addObject:toNSString(header)];
  }
  [_host setDocumentHeaders:headers];
  [_host setNamedValues:toObjC(newProps.namedValues)];
  [_host setTheme:toObjC(newProps.theme)];
  [_host setLenient:newProps.lenient];

  [super updateProps:props oldProps:oldProps];
  [_host commit];
}

- (void)prepareForRecycle {
  [super prepareForRecycle];
  [_host prepareForRecycle];
}

@end
