/**
 * React Native / Expo 向け WebCrypto ポリフィル。
 *
 * Supabase Auth の PKCE（SHA-256 code_challenge）は globalThis.crypto.subtle.digest を使う。
 * Hermes には無いため、未設定だと
 * 「WebCrypto API is not supported. Code challenge method will default to use plain」
 * となり、exchangeCodeForSession が失敗・ハングしやすい。
 *
 * expo-crypto は既に依存関係にあるので、追加パッケージなしで subtle / getRandomValues を供給する。
 * このファイルは createClient / Auth より先に import すること。
 */
import * as ExpoCrypto from 'expo-crypto';
import { Platform } from 'react-native';

type GlobalWithCrypto = typeof globalThis & {
  crypto?: {
    getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
    randomUUID?: () => string;
    subtle?: {
      digest?: (
        algorithm: AlgorithmIdentifier,
        data: BufferSource,
      ) => Promise<ArrayBuffer>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  btoa?: (data: string) => string;
  atob?: (data: string) => string;
};

function resolveDigestAlgorithm(algorithm: AlgorithmIdentifier) {
  const name =
    typeof algorithm === 'string'
      ? algorithm
      : String((algorithm as Algorithm).name || '');

  switch (name.toUpperCase().replace('_', '-')) {
    case 'SHA-256':
    case 'SHA256':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA256;
    case 'SHA-384':
    case 'SHA384':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA384;
    case 'SHA-512':
    case 'SHA512':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA512;
    default:
      throw new Error(`Unsupported digest algorithm: ${name}`);
  }
}

async function subtleDigest(
  algorithm: AlgorithmIdentifier,
  data: BufferSource,
): Promise<ArrayBuffer> {
  return ExpoCrypto.digest(resolveDigestAlgorithm(algorithm), data);
}

function installBase64IfNeeded(g: GlobalWithCrypto) {
  if (typeof g.btoa !== 'function') {
    // PKCE challenge の base64url 化で supabase-js が btoa を使う
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Buffer } = require('buffer') as typeof import('buffer');
    g.btoa = (input: string) =>
      Buffer.from(input, 'binary').toString('base64');
  }
  if (typeof g.atob !== 'function') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Buffer } = require('buffer') as typeof import('buffer');
    g.atob = (input: string) =>
      Buffer.from(input, 'base64').toString('binary');
  }
}

export function installWebCryptoPolyfill() {
  // Web はブラウザ実装を優先（上書きしない）
  if (Platform.OS === 'web') {
    const g = globalThis as GlobalWithCrypto;
    installBase64IfNeeded(g);
    return;
  }

  const g = globalThis as GlobalWithCrypto;

  if (!g.crypto) {
    g.crypto = {};
  }

  if (typeof g.crypto.getRandomValues !== 'function') {
    g.crypto.getRandomValues = ExpoCrypto.getRandomValues as NonNullable<
      GlobalWithCrypto['crypto']
    >['getRandomValues'];
  }

  if (typeof g.crypto.randomUUID !== 'function') {
    g.crypto.randomUUID = ExpoCrypto.randomUUID;
  }

  if (!g.crypto.subtle) {
    g.crypto.subtle = { digest: subtleDigest };
  } else if (typeof g.crypto.subtle.digest !== 'function') {
    g.crypto.subtle.digest = subtleDigest;
  }

  installBase64IfNeeded(g);
}

installWebCryptoPolyfill();
