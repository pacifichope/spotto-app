/**
 * 本番ビルドで開発用ログを抑制する。
 * warn / error は調査用に残す。
 */
if (typeof __DEV__ !== 'undefined' && !__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}
