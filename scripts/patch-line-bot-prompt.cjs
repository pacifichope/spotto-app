/**
 * @xmartlabs/react-native-line Android が botPrompt 未指定時に "normal" を強制し、
 * 公式アカウント連携チャネルで毎回許可／友だち追加 UI が出る問題を修正する。
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
  'android',
  'src',
  'main',
  'java',
  'com',
  'xmartlabs',
  'line',
  'LineLoginModule.kt',
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const original = fs.readFileSync(target, 'utf8');
if (original.includes('botPrompt は明示指定時のみ付与する')) {
  process.exit(0);
}

const needle = `        val onlyWebLogin = args.hasKey(ONLY_WEB_LOGIN) && args.getBoolean(ONLY_WEB_LOGIN)

        val botPromptRaw = args.getString(BOT_PROMPT) ?: "normal"
        val botPrompt = LineAuthenticationParams.BotPrompt.entries
            .find { it.name.equals(botPromptRaw, ignoreCase = true) }
            ?: return promise.reject(
                "INVALID_ARGUMENT",
                "Invalid botPrompt '$botPromptRaw'. Expected: \${
                    LineAuthenticationParams.BotPrompt.entries.joinToString { it.name.lowercase() }
                }",
                null,
            )

        val activity = currentActivity
            ?: return promise.reject("NO_ACTIVITY", "Activity is not available", null)

        if (!pendingLogin.compareAndSet(null, promise)) {
            return promise.reject("LOGIN_IN_PROGRESS", "A login is already in progress", null)
        }

        val authParams = LineAuthenticationParams.Builder()
            .scopes(Scope.convertToScopeList(scopes))
            .botPrompt(botPrompt)
            .build()`;

const replacement = `        val onlyWebLogin = args.hasKey(ONLY_WEB_LOGIN) && args.getBoolean(ONLY_WEB_LOGIN)

        // botPrompt は明示指定時のみ付与する。
        // 旧実装は未指定時 "normal" 固定で、OA 連携チャネルだと毎回友だち追加／許可 UI が出ていた。
        var botPrompt: LineAuthenticationParams.BotPrompt? = null
        if (args.hasKey(BOT_PROMPT) && !args.isNull(BOT_PROMPT)) {
            val botPromptRaw = args.getString(BOT_PROMPT)
            botPrompt = LineAuthenticationParams.BotPrompt.entries
                .find { it.name.equals(botPromptRaw, ignoreCase = true) }
                ?: return promise.reject(
                    "INVALID_ARGUMENT",
                    "Invalid botPrompt '$botPromptRaw'. Expected: \${
                        LineAuthenticationParams.BotPrompt.entries.joinToString { it.name.lowercase() }
                    }",
                    null,
                )
        }

        val activity = currentActivity
            ?: return promise.reject("NO_ACTIVITY", "Activity is not available", null)

        if (!pendingLogin.compareAndSet(null, promise)) {
            return promise.reject("LOGIN_IN_PROGRESS", "A login is already in progress", null)
        }

        val authParamsBuilder = LineAuthenticationParams.Builder()
            .scopes(Scope.convertToScopeList(scopes))
        if (botPrompt != null) {
            authParamsBuilder.botPrompt(botPrompt)
        }
        val authParams = authParamsBuilder.build()`;

if (!original.includes(needle)) {
  console.warn(
    '[patch-line-bot-prompt] LineLoginModule.kt の想定箇所が見つかりません（SDK 更新の可能性）。スキップします。',
  );
  process.exit(0);
}

fs.writeFileSync(target, original.replace(needle, replacement));
console.log('[patch-line-bot-prompt] Applied Android botPrompt fix');
