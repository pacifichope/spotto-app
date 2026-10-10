import { NextResponse } from 'next/server';

/**
 * https://app.spotto.fun/.well-known/apple-app-site-association
 * アプリ側の associatedDomains（applinks:app.spotto.fun）と対になる。
 * インストール済みの iOS は /event/*・/clubs/* をアプリで開く。
 */
export function GET() {
  const teamId = (process.env.APPLE_TEAM_ID || '').trim();
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${teamId}.com.taiki.spotto`],
          components: [
            { '/': '/event/*' },
            { '/': '/clubs/*' },
            { '/': '/club/*' },
          ],
        },
      ],
    },
  };
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
