/**
 * Demo documents. The JSON files are the source; `yarn documents` turns them into `.rc` with
 * AndroidX's parser (tools/remote-compose-json). The `.rc` files are bundled for both platforms;
 * pulse.json is bundled too, so the JSON path (Android) and the `.rc` path can be compared on the
 * same screen.
 */
import pulseJsonDocument from '../documents/json/pulse.json';

// Metro bundles a `.rc` file as an asset only through require(), which returns its asset id; the
// require() is untyped, hence the inline exceptions.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- Metro asset require
export const productCardRc: number = require('../documents/rc/product_card.rc');
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- Metro asset require
export const pulseRc: number = require('../documents/rc/pulse.rc');
export const pulseJson: object = pulseJsonDocument;

/** Real AndroidX-captured documents, pinned to the rc-players 3.12.1 tag. */
const FIXTURES =
  'https://raw.githubusercontent.com/yschimke/rc-players/3.12.1/Tests/RcNativePlayerCoreTests/Fixtures';

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
