/**
 * iOS LineSDK は LoginManager.setup 前に AccessTokenStore を触ると fatalError する。
 * logout / トークン取得を未初期化のまま呼べないようにし、
 * Info.plist の LineChannelID があれば先に setup する。
 * npm install 後に自動実行（package.json postinstall）。
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@xmartlabs',
  'react-native-line',
  'ios',
  'LineLoginModule.swift',
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const original = fs.readFileSync(target, 'utf8');
if (original.includes('spotto: line sdk setup guard')) {
  process.exit(0);
}

const helperNeedle = `  private let loginLock = NSLock()
  private var isLoginInProgress = false`;

const helper = `  private let loginLock = NSLock()
  private var isLoginInProgress = false

  /// spotto: line sdk setup guard
  /// AccessTokenStore は setup 前に触ると fatalError になる。
  /// Info.plist の LineChannelID があれば、他の API より先に初期化する。
  @objc public static func setupIfNeeded() {
    guard !LoginManager.shared.isSetupFinished else { return }
    let channelID = (Bundle.main.object(forInfoDictionaryKey: "LineChannelID") as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !channelID.isEmpty else { return }
    LoginManager.shared.setup(channelID: channelID, universalLinkURL: nil)
  }

  /// setup 済み、または今セットアップできたときだけ true。
  private func ensureReady() -> Bool {
    Self.setupIfNeeded()
    return LoginManager.shared.isSetupFinished
  }`;

const openUrlNeedle = `    return LoginManager.shared.application(application, open: url, options: options)`;
const openUrlReplacement = `    Self.setupIfNeeded()
    return LoginManager.shared.application(application, open: url, options: options)`;

const universalNeedle = `    return LoginManager.shared.application(application, open: userActivity.webpageURL)`;
const universalReplacement = `    Self.setupIfNeeded()
    return LoginManager.shared.application(application, open: userActivity.webpageURL)`;

const loginNeedle = `    loginLock.lock()
    guard !isLoginInProgress else {`;
const loginReplacement = `    guard ensureReady() else {
      reject("NOT_SETUP", "Call setup() before using the LINE SDK", nil)
      return
    }

    loginLock.lock()
    guard !isLoginInProgress else {`;

const logoutNeedle = `  @objc func logout(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    LoginManager.shared.logout { result in`;
const logoutReplacement = `  @objc func logout(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    // 未初期化の logout は AccessTokenStore を触って落ちる。セッションが無いので成功扱いにする。
    guard ensureReady() else {
      resolve(nil)
      return
    }
    LoginManager.shared.logout { result in`;

const tokenNeedle = `  @objc func getCurrentAccessToken(_ resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let token = AccessTokenStore.shared.current else {`;
const tokenReplacement = `  @objc func getCurrentAccessToken(_ resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard ensureReady() else {
      reject("NOT_SETUP", "Call setup() before using the LINE SDK", nil)
      return
    }
    guard let token = AccessTokenStore.shared.current else {`;

const friendshipNeedle = `  @objc func getFriendshipStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    API.getBotFriendshipStatus { result in`;
const friendshipReplacement = `  @objc func getFriendshipStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard ensureReady() else {
      reject("NOT_SETUP", "Call setup() before using the LINE SDK", nil)
      return
    }
    API.getBotFriendshipStatus { result in`;

const profileNeedle = `  @objc func getProfile(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    API.getProfile { result in`;
const profileReplacement = `  @objc func getProfile(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard ensureReady() else {
      reject("NOT_SETUP", "Call setup() before using the LINE SDK", nil)
      return
    }
    API.getProfile { result in`;

const refreshNeedle = `  @objc func refreshAccessToken(_ resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
    API.Auth.refreshAccessToken { result in`;
const refreshReplacement = `  @objc func refreshAccessToken(_ resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard ensureReady() else {
      reject("NOT_SETUP", "Call setup() before using the LINE SDK", nil)
      return
    }
    API.Auth.refreshAccessToken { result in`;

const verifyNeedle = `  @objc func verifyAccessToken(_ resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
    API.Auth.verifyAccessToken { result in`;
const verifyReplacement = `  @objc func verifyAccessToken(_ resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard ensureReady() else {
      reject("NOT_SETUP", "Call setup() before using the LINE SDK", nil)
      return
    }
    API.Auth.verifyAccessToken { result in`;

const replacements = [
  [helperNeedle, helper],
  [openUrlNeedle, openUrlReplacement],
  [universalNeedle, universalReplacement],
  [loginNeedle, loginReplacement],
  [logoutNeedle, logoutReplacement],
  [tokenNeedle, tokenReplacement],
  [friendshipNeedle, friendshipReplacement],
  [profileNeedle, profileReplacement],
  [refreshNeedle, refreshReplacement],
  [verifyNeedle, verifyReplacement],
];

let next = original;
for (const [needle, replacement] of replacements) {
  if (!next.includes(needle)) {
    console.warn(
      '[patch-line-sdk-setup] LineLoginModule.swift の想定箇所が見つかりません（SDK 更新の可能性）。スキップします。',
    );
    process.exit(0);
  }
  next = next.replace(needle, replacement);
}

fs.writeFileSync(target, next);
console.log('[patch-line-sdk-setup] Applied iOS setup guard');
