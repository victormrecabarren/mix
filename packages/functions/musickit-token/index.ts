import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.1/mod.ts';

const MUSICKIT_PRIVATE_KEY = Deno.env.get('MUSICKIT_PRIVATE_KEY')!; // PEM content of .p8 file
const MUSICKIT_KEY_ID = Deno.env.get('MUSICKIT_KEY_ID')!;
const MUSICKIT_TEAM_ID = Deno.env.get('MUSICKIT_TEAM_ID')!;

async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const pemContents = pemKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

serve(async (_req) => {
  const privateKey = await importPrivateKey(MUSICKIT_PRIVATE_KEY);

  const token = await create(
    { alg: 'ES256', kid: MUSICKIT_KEY_ID },
    {
      iss: MUSICKIT_TEAM_ID,
      iat: getNumericDate(0),
      exp: getNumericDate(60 * 60 * 24 * 180), // 180 days max
    },
    privateKey
  );

  return new Response(JSON.stringify({ token }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
