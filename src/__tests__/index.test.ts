/**
 * The module functions: every failure reaches the app as a rejected promise with a clear message,
 * never as a synchronous throw from a function that returns a promise.
 */
import { convertJsonToRc } from '../index';

type FakeModule = {
  isJsonConversionSupported(): boolean;
  convertJsonToRc(json: string): Promise<string>;
};
const mockNative: { current: FakeModule | null } = { current: null };
jest.mock('../NativeRemoteComposeModule', () => ({
  __esModule: true,
  get default() {
    return mockNative.current;
  },
}));

afterEach(() => {
  mockNative.current = null;
});

it('rejects with how to link the module when it is not linked', async () => {
  const result = convertJsonToRc('{}');
  await expect(result).rejects.toThrow(/not linked[\s\S]*development build/);
});

it('sends an object as its JSON text and resolves with the native result', async () => {
  const convert = jest.fn(async (json: string) => `rc:${json}`);
  mockNative.current = {
    isJsonConversionSupported: () => true,
    convertJsonToRc: convert,
  };
  await expect(convertJsonToRc({ root: {} })).resolves.toBe('rc:{"root":{}}');
});

it('rejects JSON that cannot be serialised instead of throwing', async () => {
  mockNative.current = {
    isJsonConversionSupported: () => true,
    convertJsonToRc: jest.fn(),
  };
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await expect(convertJsonToRc(circular)).rejects.toThrow(
    /json could not be serialised/
  );
});
