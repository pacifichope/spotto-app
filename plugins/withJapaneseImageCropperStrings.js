/**
 * Android の画像クロップ画面（android-image-cropper）の「Crop」等を日本語化する。
 * 端末ロケールが英語でも、アプリ既定として日本語ラベルを使う。
 */
const {
  AndroidConfig,
  withStringsXml,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const CROP_STRINGS = [
  { name: 'crop_image_menu_crop', value: '切り抜き' },
  { name: 'ic_flip_24', value: '反転' },
  { name: 'ic_flip_24_horizontally', value: '左右反転' },
  { name: 'ic_flip_24_vertically', value: '上下反転' },
  { name: 'ic_rotate_left_24', value: '左に回転' },
  { name: 'ic_rotate_right_24', value: '右に回転' },
  { name: 'pick_image_camera', value: 'カメラ' },
  { name: 'pick_image_chooser_title', value: '画像を選択' },
  { name: 'pick_image_gallery', value: 'アルバム' },
];

function withJapaneseImageCropperStrings(config) {
  return withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      CROP_STRINGS.map(({ name, value }) => ({
        $: { name },
        _: value,
      })),
      cfg.modResults,
    );
    return cfg;
  });
}

module.exports = createRunOncePlugin(
  withJapaneseImageCropperStrings,
  'with-japanese-image-cropper-strings',
  '1.0.0',
);
