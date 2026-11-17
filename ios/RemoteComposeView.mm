#import "RemoteComposeView.h"

#import <react/renderer/components/RemoteComposeViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RemoteComposeViewSpec/EventEmitters.h>
#import <react/renderer/components/RemoteComposeViewSpec/Props.h>
#import <react/renderer/components/RemoteComposeViewSpec/RCTComponentViewHelpers.h>

#if __has_include(<RemoteCompose/RemoteCompose-Swift.h>)
#import <RemoteCompose/RemoteCompose-Swift.h>
#else
#import "RemoteCompose-Swift.h"
#endif

using namespace facebook::react;

static NSString *RCNSString(const std::string &value) {
  return [NSString stringWithUTF8String:value.c_str()] ?: @"";
}

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

- (void)createHost {
  _host = [[RemoteComposeHostView alloc] initWithFrame:self.bounds];
  __weak RemoteComposeView *weakSelf = self;

  _host.onAction = ^(NSDictionary<NSString *, id> *payload) {
    RemoteComposeView *strongSelf = weakSelf;
    if (!strongSelf || !strongSelf->_eventEmitter) {
      return;
    }
    std::vector<double> numbers;
    for (NSNumber *number in (NSArray *)payload[@"numbers"]) {
      numbers.push_back(number.doubleValue);
    }
    std::static_pointer_cast<const RemoteComposeViewEventEmitter>(strongSelf->_eventEmitter)
        ->onRemoteAction(RemoteComposeViewEventEmitter::OnRemoteAction{
            .kind = std::string([payload[@"kind"] UTF8String]),
            .actionId = [payload[@"actionId"] intValue],
            .name = std::string([payload[@"name"] UTF8String]),
            .metadata = std::string([payload[@"metadata"] UTF8String]),
            .valueType = std::string([payload[@"valueType"] UTF8String]),
            .text = std::string([payload[@"text"] UTF8String]),
            .number = [payload[@"number"] doubleValue],
            .numbers = numbers,
        });
  };

  _host.onError = ^(NSDictionary<NSString *, id> *payload) {
    RemoteComposeView *strongSelf = weakSelf;
    if (!strongSelf || !strongSelf->_eventEmitter) {
      return;
    }
    std::static_pointer_cast<const RemoteComposeViewEventEmitter>(strongSelf->_eventEmitter)
        ->onRemoteError(RemoteComposeViewEventEmitter::OnRemoteError{
            .code = std::string([payload[@"code"] UTF8String]),
            .message = std::string([payload[@"message"] UTF8String]),
        });
  };

  _host.onLoad = ^(NSDictionary<NSString *, id> *payload) {
    RemoteComposeView *strongSelf = weakSelf;
    if (!strongSelf || !strongSelf->_eventEmitter) {
      return;
    }
    std::vector<std::string> names;
    for (NSString *name in (NSArray *)payload[@"namedValues"]) {
      names.push_back(std::string([name UTF8String]));
    }
    std::static_pointer_cast<const RemoteComposeViewEventEmitter>(strongSelf->_eventEmitter)
        ->onRemoteLoad(RemoteComposeViewEventEmitter::OnRemoteLoad{
            .byteLength = [payload[@"byteLength"] intValue],
            .loadMs = [payload[@"loadMs"] doubleValue],
            .decodeMs = [payload[@"decodeMs"] doubleValue],
            .namedValues = names,
        });
  };

  self.contentView = _host;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &newProps = *std::static_pointer_cast<RemoteComposeViewProps const>(props);

  [_host setDocumentBase64:newProps.documentBase64.empty() ? nil : RCNSString(newProps.documentBase64)];
  [_host setDocumentUri:newProps.documentUri.empty() ? nil : RCNSString(newProps.documentUri)];
  [_host setDocumentJson:newProps.documentJson.empty() ? nil : RCNSString(newProps.documentJson)];

  NSMutableArray<NSString *> *headers = [NSMutableArray arrayWithCapacity:newProps.documentHeaders.size()];
  for (const auto &header : newProps.documentHeaders) {
    [headers addObject:RCNSString(header)];
  }
  [_host setDocumentHeaders:headers];

  NSMutableArray<NSDictionary *> *values = [NSMutableArray arrayWithCapacity:newProps.namedValues.size()];
  for (const auto &value : newProps.namedValues) {
    [values addObject:@{
      @"name" : RCNSString(value.name),
      @"type" : RCNSString(value.type),
      @"text" : RCNSString(value.text),
      @"number" : @(value.number),
    }];
  }
  [_host setNamedValues:values];

  [_host setTheme:RCNSString(toString(newProps.theme))];
  [_host setLenient:newProps.lenient];

  [super updateProps:props oldProps:oldProps];
  [_host commit];
}

- (void)prepareForRecycle {
  [super prepareForRecycle];
  [_host prepareForRecycle];
}

@end
