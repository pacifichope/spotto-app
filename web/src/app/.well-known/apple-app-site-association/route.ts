import { NextResponse } from 'next/server';

/**
 * https://spotto.fun/.well-known/apple-app-site-association
 * アプリ側の associatedDomains（applinks:spotto.fun）と対になる。
 * インストール済みの iOS は /event/* をアプリで開く。
 */
export function GET() {
  const teamId = (process.env.APPLE_TEAM_ID || '').trim();
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${teamId}.com.taiki.spotto`],
          components: [{ '/': '/event/*' }],
        },
      ],
    },
  };
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
