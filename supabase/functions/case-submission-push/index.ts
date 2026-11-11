import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async (request) => {
  const token = request.headers.get('x-dispatch-token');
  if (request.method !== 'POST' || !token) return new Response(null, { status: 403 });

  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc('claim_case_push', { dispatch_token: token });
  if (error) return new Response(null, { status: error.code === '42501' ? 403 : 500 });
  if (!data.jobs.length) return new Response(null, { status: 204 });
  if (!data.vapid) return new Response(null, { status: 503 });

  await Promise.all(data.jobs.map(async ({ deliveryId, id, taskId, sender, attempt, subscription }) => {
    let result = 'sent';
    try {
      const payload = taskId ? { taskId, sender } : { id };
      const eventId = taskId || id;
      await webpush.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 3600,
        timeout: 10000,
        urgency: 'high',
        topic: eventId.replaceAll('-', ''),
        vapidDetails: {
          subject: 'https://fh76zx2wy2-spec.github.io/fourth-circuit-work/',
          publicKey: data.vapid.publicKey,
          privateKey: data.vapid.privateKey,
        },
      });
    } catch (error) {
      if (error.statusCode !== 404 && error.statusCode !== 410) return;
      result = 'expired';
    }
    await client.rpc('finish_case_push', {
      batch: deliveryId || id, destination: subscription.endpoint, attempt, result,
    });
  }));
  return new Response(null, { status: 204 });
});
