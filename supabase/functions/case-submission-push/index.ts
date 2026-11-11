import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import webpush from 'npm:web-push@3.6.7';

const site = 'https://fh76zx2wy2-spec.github.io/fourth-circuit-work/';
const cors = {
  'Access-Control-Allow-Origin': new URL(site).origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function pushOptions(vapid, eventId: string, ttl = 3600) {
  return {
    TTL: ttl,
    timeout: 10000,
    urgency: 'high' as const,
    topic: eventId.replaceAll('-', ''),
    vapidDetails: { subject: site, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
  };
}

async function sendTest(request: Request, client: ReturnType<typeof createClient>) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors });

  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors });

  const { data, error } = await client.rpc('prepare_judge_push_test', { requester: user.id });
  if (error) {
    const status = error.code === '42501' ? 403 : error.message === 'push_test_rate_limit' ? 429 : 500;
    return Response.json({ error: status === 429 ? 'rate_limit' : 'test_failed' }, { status, headers: cors });
  }

  const { workerOnly } = await request.json().catch(() => ({}));
  const testId = crypto.randomUUID();
  const testPayload = workerOnly === true ? { testId } : {
    testId,
    web_push: 8030,
    notification: {
      title: 'منظم أعمال الدائرة الرابعة',
      body: 'إشعار تجريبي — إشعارات الدائرة الرابعة تعمل بنجاح',
      lang: 'ar',
      dir: 'rtl',
      tag: 'push-test-' + testId,
      navigate: site,
    },
  };
  const results = await Promise.all(data.jobs.map(async ({ device, subscription }, index) => {
    const row = { device, number: index + 1 };
    if (!data.vapid) return { ...row, ok: false, reason: 'إعداد Web Push غير متاح.' };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(testPayload), pushOptions(data.vapid, testId, 300));
      return { ...row, ok: true };
    } catch (failure) {
      const status = failure?.statusCode;
      const reason = status === 404 || status === 410
        ? 'انتهى الاشتراك. فعّل الإشعارات مجددًا من هذا الجهاز.'
        : Number.isInteger(status) ? `رفضت خدمة الإشعارات الطلب (HTTP ${status}).` : 'تعذّر الاتصال بخدمة الإشعارات.';
      return { ...row, ok: false, reason };
    }
  }));
  return Response.json({ results, testId }, { headers: cors });
}

Deno.serve(async (request) => {
  const token = request.headers.get('x-dispatch-token');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: cors });

  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!token) return sendTest(request, client);
  const { data, error } = await client.rpc('claim_case_push', { dispatch_token: token });
  if (error) return new Response(null, { status: error.code === '42501' ? 403 : 500 });
  if (!data.jobs.length) return new Response(null, { status: 204 });
  if (!data.vapid) return new Response(null, { status: 503 });

  await Promise.all(data.jobs.map(async ({ deliveryId, id, taskId, sender, attempt, subscription }) => {
    let result = 'sent';
    try {
      const payload = taskId ? { taskId, sender } : { id };
      const eventId = taskId || id;
      await webpush.sendNotification(subscription, JSON.stringify(payload), pushOptions(data.vapid, eventId));
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
