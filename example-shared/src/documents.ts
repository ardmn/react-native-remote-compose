/**
 * Demo documents. The JSON files are the source; `yarn documents` turns them into `.rc` with
 * AndroidX's parser (tools/remote-compose-json), and both are bundled so the JSON path (Android)
 * and the `.rc` path (both platforms) can be compared on the same screen.
 */
export const productCardRc: number = require('../documents/rc/product_card.rc');
export const pulseRc: number = require('../documents/rc/pulse.rc');
export const productCardJson: object = require('../documents/json/product_card.json');
export const pulseJson: object = require('../documents/json/pulse.json');

/** Real AndroidX-captured documents, pinned to the rc-players 3.8.0 tag. */
const FIXTURES =
  'https://raw.githubusercontent.com/yschimke/rc-players/3.8.0/Tests/RcNativePlayerCoreTests/Fixtures';

export const networkDocuments = [
  {
    label: 'Circular progress',
    uri: `${FIXTURES}/CircularProgressRemote-384x384.rc`,
  },
  { label: 'Arc progress', uri: `${FIXTURES}/ArcProgressRemote-454x400.rc` },
  {
    label: 'Indeterminate',
    uri: `${FIXTURES}/IndeterminateCircularProgress-400x400.rc`,
  },
  { label: 'Title card', uri: `${FIXTURES}/TitleCardRemote-640x480.rc` },
  { label: 'Demo tile', uri: `${FIXTURES}/demo-tile.rc` },
  {
    label: 'Error demo: 404',
    uri: `${FIXTURES}/does-not-exist.rc`,
    note: 'Intentional: shows how a load failure is reported (console + onError), not a crash.',
  },
] as const;
