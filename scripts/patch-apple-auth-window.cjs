/**
 * expo-apple-authentication は認可シートの親に UIApplication.shared.keyWindow を使う。
 * iPadOS / UIScene では keyWindow が nil になり、Sign in with Apple が fatalError で落ちる。
 * npm install 後に自動実行（package.json postinstall）。
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-apple-authentication',
  'ios',
  'AppleAuthenticationRequest.swift',
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const original = fs.readFileSync(target, 'utf8');
if (original.includes('spotto: scene key window')) {
  process.exit(0);
}

const needle = `  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    guard let window = UIApplication.shared.keyWindow else {
      fatalError("Unable to present authentication modal because UIApplication.shared.keyWindow is not available")
    }
    return window
  }`;

const replacement = `  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    // spotto: scene key window
    // iPadOS では UIApplication.shared.keyWindow が nil になり fatalError する。
    // 接続中の UIWindowScene から表示中の key window を選ぶ。
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap { $0.windows }
    if let key = windows.first(where: { $0.isKeyWindow }) {
      return key
    }
    if let visible = windows.first(where: { !$0.isHidden }) {
      return visible
    }
    if let legacy = UIApplication.shared.delegate?.window ?? nil {
      return legacy
    }
    if let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first {
      return UIWindow(windowScene: scene)
    }
    fatalError("Unable to present authentication modal because no UIWindow is available")
  }`;

if (!original.includes(needle)) {
  console.warn(
    '[patch-apple-auth-window] presentationAnchor の対象が見つかりません。SDK 更新を確認してください。',
  );
  process.exit(0);
}

fs.writeFileSync(target, original.replace(needle, replacement));
console.log('[patch-apple-auth-window] Apple Sign-In の presentationAnchor を更新しました');
