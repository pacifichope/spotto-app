function read(name: string) {
  return (process.env[name] || '').trim();
}

export function supabaseUrl() {
  return read('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
}

export function supabaseAnonKey() {
  return read('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function apiBaseUrl() {
  return read('NEXT_PUBLIC_API_BASE_URL').replace(/\/+$/, '');
}

export function siteUrl() {
  return (read('NEXT_PUBLIC_SITE_URL') || 'https://spotto.fun').replace(
    /\/+$/,
    '',
  );
}
