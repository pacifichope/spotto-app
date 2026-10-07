/**
 * アプリ起動時に LineSDK を初期化する。
 *
 * Expo の mod は plugins 配列の後ろから実行される。
 * このプラグインは @xmartlabs/react-native-line より先に動くため、
 * `LineLogin.application(...)` はまだ AppDelegate に無い。
 * 挿入位置はプレビルド直後のテンプレートに必ずある行にする。
 */
const {
  withAppDelegate,
  withInfoPlist,
  createRunOncePlugin,
} = require('expo/config-plugins');
const generateCode = require('@expo/config-plugins/build/utils/generateCode');

const SETUP_CALL = '    LineLogin.setupIfNeeded()';

function alreadyGenerated(src, tag) {
  return src.includes(`@generated begin ${tag}`);
}

/**
 * 最初に一致した anchor の直前（offset 0）または指定 offset に1回だけ挿入する。
 * 一致しなければ次の anchor を試す。どれも無ければビルドを止めず警告だけ出す。
 */
function insertSetupCall(src, { tag, anchors }) {
  if (alreadyGenerated(src, tag)) return src;

  for (const { anchor, offset } of anchors) {
    const pattern = anchor.global ? new RegExp(anchor.source, anchor.flags) : anchor;
    if (![...src.split('\n')].some((line) => pattern.test(line))) continue;
    const merged = generateCode.mergeContents({
      tag,
      src,
      newSrc: SETUP_CALL,
      anchor: pattern,
      offset,
      comment: '//',
    });
    return merged.contents;
  }

  console.warn(
    `[withLineSdkSetup] ${tag} の挿入位置が AppDelegate に見つかりませんでした。スキップします。`,
  );
  return src;
}

function withLineSdkSetup(config, props = {}) {
  const channelId = String(props.channelId || '').trim();

  config = withInfoPlist(config, (cfg) => {
    if (channelId) {
      cfg.modResults.LineChannelID = channelId;
    }
    return cfg;
  });

  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') return cfg;

    let contents = cfg.modResults.contents;

    // didFinishLaunching の先頭（テンプレートの最初の文の直前）
    contents = insertSetupCall(contents, {
      tag: 'spotto-line-setup-launch',
      anchors: [
        { anchor: /let delegate = ReactNativeDelegate\(\)/, offset: 0 },
        { anchor: /didFinishLaunchingWithOptions/, offset: 2 },
      ],
    });

    // openURL の本体先頭。LineLogin.application より前に置く。
    // `open url: URL` の3行後が `{` の次の行。
    contents = insertSetupCall(contents, {
      tag: 'spotto-line-setup-openurl',
      anchors: [
        { anchor: /open url: URL/, offset: 3 },
        {
          anchor:
            /return\s+super\.application\(\s*app,\s*open:\s*url,\s*options:\s*options\s*\)/,
          offset: 0,
        },
      ],
    });

    return {
      ...cfg,
      modResults: {
        ...cfg.modResults,
        contents,
      },
    };
  });

  return config;
}

module.exports = createRunOncePlugin(
  withLineSdkSetup,
  'with-line-sdk-setup',
  '1.1.0',
);
