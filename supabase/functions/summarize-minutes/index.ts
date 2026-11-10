// Optional: deploy as a Supabase Edge Function, with OPENAI_API_KEY as secret.
// Never expose the API key in the GitHub Pages code or repository.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
const encoder = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
 status, headers: { 'content-type':'application/json; charset=utf-8', 'access-control-allow-origin':'*', 'access-control-allow-headers':'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods':'POST, OPTIONS' }
});
Deno.serve(async (req: Request) => {
 if (req.method === 'OPTIONS') return encoder({ ok:true });
 if (req.method !== 'POST') return encoder({error:'Method not allowed'},405);
 try {
  const bearer = req.headers.get('Authorization') || '';
  const jwt = bearer.replace(/^Bearer\s+/i,'');
  if (!jwt) return encoder({error:'يجب تسجيل الدخول.'},401);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
  const db = createClient(url,key,{global:{headers:{Authorization:bearer}}});
  const {data:{user},error:authError} = await db.auth.getUser(jwt);
  if(authError || !user) return encoder({error:'جلسة الدخول غير صالحة'},401);
  const {data:profile,error:profileError} = await db.from('profiles').select('is_active').eq('id',user.id).maybeSingle();
  if(profileError || !profile?.is_active) return encoder({error:'الحساب غير معتمد'},403);
  const {text} = await req.json();
  if(typeof text!=='string'||text.trim().length<30||text.length>60000) return encoder({error:'نص الضبط غير صالح أو طويل جدًا'},400);
  const aiKey = Deno.env.get('OPENAI_API_KEY');
  if(!aiKey) return encoder({error:'لم يتم إعداد مفتاح خدمة التلخيص في الخادم'},503);
  const schema = {type:'object',additionalProperties:false,properties:{
   last_session_summary:{type:'string'},adjournment_reason:{type:'string'},reason_evidence_quote:{type:'string'},next_action:{type:'string'},summary_warning:{type:'string'}
  },required:['last_session_summary','adjournment_reason','reason_evidence_quote','next_action','summary_warning']};
  const prompt = `أنت مساعد تحضير قضائي سعودي. لخص فقط ما ورد في نص ضبط الجلسة المرسل، دون افتراضات أو رأي قضائي.
- last_session_summary: موجز دقيق لما جرى، ومواقف الأطراف والإجراءات المثبتة.
- adjournment_reason: سبب رفع الجلسة الصريح فقط؛ إذا لم يُذكر صراحةً فاكتب: "لم يرد في الضبط سبب صريح لرفع الجلسة".
- reason_evidence_quote: اقتباس حرفي متصل من النص نفسه يدعم سبب الرفع؛ إن لم تجد دليلًا صريحًا فاكتب سلسلة فارغة.
- next_action: الإجراء المثبت صراحة لما بعد الجلسة؛ إن لم يُذكر فاكتب: "لم يحدد الضبط إجراءً صريحًا للجلسة القادمة".
- summary_warning: بيان مواضع الغموض أو قصر الدليل؛ لا تقل "مؤكد".
انتبه إلى أن "رفعت الجلسة" قد لا يبيّن سببها. لا تعتبر آخر طلب سببًا إذا لم تقرر الدائرة ذلك بوضوح.
لا تضف أحكامًا أو أنظمة أو وقائع ليست في النص. أعد JSON فقط وفق المخطط.`;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${aiKey}`,'content-type':'application/json'},body:JSON.stringify({model:Deno.env.get('OPENAI_MODEL')||'gpt-4.1-mini',input:[{role:'system',content:prompt},{role:'user',content:text}],text:{format:{type:'json_schema',name:'minutes_summary',strict:true,schema}}})});
  if(!response.ok)return encoder({error:'خدمة التلخيص غير متاحة حاليًا ('+response.status+')'},502);
  const result=await response.json();
  const output=result.output_text || result.output?.flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('') || '';
  let data;
  try{data=JSON.parse(output);}catch{return encoder({error:'تعذر قراءة نتيجة خدمة التلخيص'},502);}
  const verifiedQuote=String(data.reason_evidence_quote||'').trim();
  if(verifiedQuote && !text.includes(verifiedQuote)){
    data.reason_evidence_quote='';
    data.adjournment_reason='لم يتأكد سبب رفع الجلسة من اقتباس حرفي مطابق للضبط';
    data.summary_warning='اقتراح الذكاء الاصطناعي تضمّن اقتباسًا لا يطابق النص؛ تحقق يدويًا. '+String(data.summary_warning||'');
  }
  return encoder({last_session_summary:String(data.last_session_summary||''),adjournment_reason:String(data.adjournment_reason||''),reason_evidence_quote:String(data.reason_evidence_quote||''),next_action:String(data.next_action||''),summary_warning:String(data.summary_warning||'')});
 } catch { return encoder({error:'حدث خطأ في تلخيص الضبط؛ تحقق من إعداد الخدمة.'},500); }
});
