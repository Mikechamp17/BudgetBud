// Resolves who an Edge Function call is for: a signed-in user, or the server's secret key plus a user ID.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function secretKey() {
  return Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

/** Lets the web app call functions from the browser. */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Answers the browser's CORS preflight request. */
export function withCors(handler: (req: Request) => Promise<Response>) {
  return (req: Request) => (req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : handler(req));
}

/** Returns the user ID the call acts for, or an error Response. */
export async function resolveUserId(
  req: Request,
  admin: SupabaseClient,
  body: { user_id?: unknown },
): Promise<string | Response> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) {
    return json({ error: 'Missing authorization' }, 401);
  }
  const key = secretKey();
  if (key && token === key) {
    return typeof body.user_id === 'string' ? body.user_id : json({ error: 'user_id is required' }, 400);
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return json({ error: 'Invalid session' }, 401);
  }
  return data.user.id;
}
