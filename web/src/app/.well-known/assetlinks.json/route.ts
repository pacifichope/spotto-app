import { NextResponse } from 'next/server';

/**
 * https://app.spotto.fun/.well-known/assetlinks.json
 * Android App Links（host app.spotto.fun, pathPrefix /event）と対になる。
 */
export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.taiki.spotto',
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
