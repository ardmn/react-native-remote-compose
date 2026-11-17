#import "RemoteComposeView.h"

#import <React/RCTConversions.h>

#import <react/renderer/components/RemoteComposeViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RemoteComposeViewSpec/Props.h>
#import <react/renderer/components/RemoteComposeViewSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@implementation RemoteComposeView {
  UIView * _view;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<RemoteComposeViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const RemoteComposeViewProps>();
    _props = defaultProps;

    _view = [[UIView alloc] init];

    self.contentView = _view;
  }

  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &oldViewProps = *std::static_pointer_cast<RemoteComposeViewProps const>(_props);
  const auto &newViewProps = *std::static_pointer_cast<RemoteComposeViewProps const>(props);

  if (oldViewProps.color != newViewProps.color) {
    [_view setBackgroundColor: RCTUIColorFromSharedColor(newViewProps.color)];
  }

  [super updateProps:props oldProps:oldProps];
}

@end
