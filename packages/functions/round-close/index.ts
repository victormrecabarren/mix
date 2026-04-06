import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { roundId } = await req.json();

  // 1. Fetch all submissions for this round
  const { data: submissions, error } = await supabase
    .from('submissions')
    .select('id')
    .eq('round_id', roundId);

  if (error || !submissions) {
    return new Response(JSON.stringify({ error: 'Failed to fetch submissions' }), { status: 500 });
  }

  // 2. Assign randomized anonymous_position values
  const shuffled = submissions
    .map((s, i) => ({ id: s.id, position: i }))
    .sort(() => Math.random() - 0.5);

  for (const item of shuffled) {
    await supabase
      .from('submissions')
      .update({ anonymous_position: item.position })
      .eq('id', item.id);
  }

  // 3. Transition round to voting
  await supabase
    .from('rounds')
    .update({ status: 'voting' })
    .eq('id', roundId);

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
