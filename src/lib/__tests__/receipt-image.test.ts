import { ImageManipulator } from 'expo-image-manipulator';

import { prepareReceiptImage, resizeFor } from '../receipt-image';

jest.mock('expo-image-manipulator', () => {
  const context = {
    resize: jest.fn(),
    renderAsync: jest.fn(),
  };
  return {
    SaveFormat: { JPEG: 'jpeg' },
    ImageManipulator: { manipulate: jest.fn(() => context) },
    __context: context,
  };
});

it('keeps the long edge at most 1568 px', () => {
  expect(resizeFor(4000, 3000)).toEqual({ width: 1568 });
  expect(resizeFor(3000, 4000)).toEqual({ height: 1568 });
  expect(resizeFor(1200, 900)).toBeNull();
});

it('uploads a 4000 px HEIC library photo as a 1568 px JPEG', async () => {
  const context = jest.requireMock('expo-image-manipulator').__context;
  const saveAsync = jest.fn().mockResolvedValue({ uri: 'file:///out.jpg', width: 1568, height: 1176 });
  context.renderAsync.mockResolvedValue({ saveAsync });

  const result = await prepareReceiptImage('file:///IMG_0001.HEIC', 4000, 3000);

  expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///IMG_0001.HEIC');
  expect(context.resize).toHaveBeenCalledWith({ width: 1568 });
  expect(saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 });
  expect(result.uri).toBe('file:///out.jpg');
});
