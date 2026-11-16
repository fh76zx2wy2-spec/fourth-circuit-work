import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "npm:@simplewebauthn/server@13.3.0";

const origin = "https://fh76zx2wy2-spec.github.io";
const rpID = new URL(origin).hostname;
const url = Deno.env.get("SUPABASE_URL")!;
const auth = {persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth});
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = {
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
  "Cache-Control":"no-store",
  "Vary":"Origin",
};
const send = (value:unknown,status=200) => Response.json(value,{status,headers});

function fromBase64(value:string) {
  return Uint8Array.from(atob(value.replaceAll("-","+").replaceAll("_","/")),c=>c.charCodeAt(0));
}
function toBase64(value:Uint8Array) {
  return btoa(String.fromCharCode(...value)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
}
function sessionFromJWT(jwt:string) {
  return JSON.parse(new TextDecoder().decode(fromBase64(jwt.split(".")[1])));
}
async function signingKey(key:JsonWebKey) {
  if (key?.kty !== "EC" || key.crv !== "P-256" || key.d !== undefined ||
      !/^[A-Za-z0-9_-]{43}$/.test(key.x ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(key.y ?? "")) {
    throw Error("invalid_device_key");
  }
  return crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:key.x,y:key.y},
    {name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
}
async function verifyDevice(key:JsonWebKey,kind:string,challenge:string,proof:unknown) {
  if (typeof proof !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(proof)) return false;
  return crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},await signingKey(key),fromBase64(proof),
    encoder.encode(`organizer/${kind}/${challenge}`));
}

Deno.serve(async request => {
  if (request.headers.get("origin") !== origin) return send({error:"origin_not_allowed"},403);
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
  if (request.method !== "POST") return send({error:"method_not_allowed"},405);

  try {
    const raw=await request.text();
    if (raw.length>32000) return send({error:"invalid_request"},400);
    const input=JSON.parse(raw);
    const action=input?.action;
    let actor:null|string=null, sid:null|string=null;
    if (["register-options","register-verify","list","revoke"].includes(action)) {
      const token=request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token || token.split(".").length!==3) return send({error:"unauthenticated"},401);
      const client=createClient(url,publicKey,{auth});
      const {data:{user},error}=await client.auth.getUser(token);
      if (error || !user || user.is_anonymous) return send({error:"unauthenticated"},401);
      const claims=sessionFromJWT(token);
      if (claims.sub!==user.id || typeof claims.session_id!=="string" || !uuid.test(claims.session_id)) {
        return send({error:"unauthenticated"},401);
      }
      actor=user.id;
      sid=claims.session_id;
    }
    async function database(action:string,payload:Record<string,unknown>={}) {
      const {data,error} = await admin.rpc("organizer_passkey_server",{
        action,actor,sid,payload
      });
      if (error) throw Error("diwan_database_error");
      return data;
    }
    if (actor && !(await database("identify"))) return send({error:"forbidden"},403);
    if (action === "list") {
      const devices=await database("list");
      return devices ? send({devices}) : send({error:"locked"},403);
    }
    if (action === "revoke") {
      if (typeof input.deviceId !== "string" || !uuid.test(input.deviceId)) return send({error:"invalid_request"},400);
      return await database("revoke",{deviceId:input.deviceId}) ? send({ok:true}) : send({error:"forbidden"},403);
    }
    const kind = action === "register-options" || action === "register-verify" ? "register" : "authenticate";
    if (action === "register-options" || action === "authenticate-options") {
      const {deviceId} = input;
      if (typeof deviceId !== "string" || !uuid.test(deviceId)) return send({error:"invalid_request"},400);
      let options, data:Record<string,unknown> = {};
      let password:string|undefined;
      if (kind === "register") {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (!name || name.length>80 || typeof input.code !== "string" || !input.code.length || input.code.length>128) {
          return send({error:"invalid_request"},400);
        }
        await signingKey(input.publicKey);
        password=input.code.replace(/[٠-٩۰-۹]/g,(digit:string)=>String(digit.charCodeAt(0)-(digit<="٩"?0x660:0x6f0)));
        options = await generateRegistrationOptions({
          rpName:"منظّم أعمال الدائرة الرابعة",rpID,userID:encoder.encode(deviceId),
          userName:`ziyad-${deviceId.slice(0,8)}`,userDisplayName:`زياد البابطين · ${name}`,
          timeout:90000,attestationType:"none",supportedAlgorithmIDs:[-7],
          authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"required",userVerification:"required"},
        });
        const {x,y}=input.publicKey;
        data = {name,publicKey:{kty:"EC",crv:"P-256",x,y}};
      } else {
        const device=await database("device",{deviceId});
        if (!device) return send({error:"unknown_device"},404);
        options=await generateAuthenticationOptions({
          rpID,timeout:90000,userVerification:"required",
          allowCredentials:[{id:device.credential_id,transports:["internal"]}],
        });
      }
      const ceremony=await database("begin",{deviceId,kind,challenge:options.challenge,data,password});
      if (ceremony?.limited) return send({error:"rate_limited"},429);
      if (!ceremony) return send({error:"cannot_start"},403);
      return send({options,challengeId:ceremony.id});
    }

    if (action !== "register-verify" && action !== "authenticate-verify") return send({error:"invalid_request"},400);
    const {challengeId,credential,proof} = input;
    if (typeof challengeId !== "string" || !uuid.test(challengeId) || !credential || credential.authenticatorAttachment === "cross-platform") {
      return send({error:"invalid_request"},400);
    }
    const ceremony=await database("claim",{challengeId,kind});
    if (!ceremony) return send({error:"expired_challenge"},403);
    let finish:Record<string,unknown>;
    if (kind === "register") {
      if (!await verifyDevice(ceremony.data.publicKey,kind,ceremony.challenge,proof)) {
        return send({error:"unapproved_device"},403);
      }
      const verification=await verifyRegistrationResponse({
        response:credential as RegistrationResponseJSON,expectedOrigin:origin,
        expectedRPID:rpID,expectedChallenge:ceremony.challenge,requireUserVerification:true,
      });
      if (!verification.verified || !verification.registrationInfo) return send({error:"verification_failed"},403);
      const registered=verification.registrationInfo.credential;
      finish={credentialId:registered.id,publicKey:toBase64(registered.publicKey),counter:registered.counter};
    } else {
      const device=await database("device",{deviceId:ceremony.device_id});
      const handle=credential.response?.userHandle;
      if (!device || credential.id !== device.credential_id ||
          (handle && handle!==toBase64(encoder.encode(ceremony.device_id))) ||
          !await verifyDevice(device.device_public_key,kind,ceremony.challenge,proof)) {
        return send({error:"unapproved_device"},403);
      }
      const verification=await verifyAuthenticationResponse({
        response:credential as AuthenticationResponseJSON,expectedOrigin:origin,expectedRPID:rpID,
        expectedChallenge:ceremony.challenge,requireUserVerification:true,
        credential:{id:device.credential_id,publicKey:fromBase64(device.credential_public_key),counter:device.signature_counter},
      });
      if (!verification.verified) return send({error:"verification_failed"},403);
      finish={credentialId:device.credential_id,previousCounter:device.signature_counter,counter:verification.authenticationInfo.newCounter};
    }
    const account=await database("finish",{kind,challengeId,...finish});
    if (!account) return send({error:"expired_challenge"},403);
    if (kind==="register") return send({ok:true});

    // Exchange a one-use token on the server. Do not send email or expose the token hash.
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email:account.email});
    if (linkError || link.user?.id!==account.id || !link.properties?.hashed_token) {
      return send({error:"session_unavailable"},503);
    }
    const {data:result,error:sessionError}=await createClient(url,publicKey,{auth}).auth.verifyOtp({
      token_hash:link.properties.hashed_token,type:"email",
    });
    if (sessionError || !result.session || result.user?.id!==account.id) return send({error:"session_unavailable"},503);
    return send({access_token:result.session.access_token,refresh_token:result.session.refresh_token});
  } catch {
    return send({error:"passkey_request_failed"},400);
  }
});
