const {readFileSync} = require("node:fs");
const {sign} = require("node:crypto");
const {connect} = require("node:http2");
const {setTimeout: pause} = require("node:timers/promises");
const env = process.env;

function assertion(ok, message) { if (!ok) throw new Error(message); }

async function rows(table, filters) {
  const url = new URL("/rest/v1/" + table, env.NEXT_PUBLIC_SUPABASE_URL);
  url.search = new URLSearchParams(filters);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, {headers: {apikey:key, Authorization:"Bearer " + key}, redirect:"error", signal:AbortSignal.timeout(10000)});
  assertion(response.ok, "Recipient lookup failed: " + response.status);
  return response.json();
}

async function main() {
  const admin = env.ADMIN_TELEGRAM_IDS?.trim();
  assertion(/^[1-9]\d*$/.test(admin) && admin === process.argv[2], "Private admin mismatch");
  assertion(env.APNS_KEY_ID === "8XG5C5XVXD" && env.APPLE_TEAM_ID === "T9N7783SRR", "Provider ID mismatch");
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const prefix = encode({alg:"ES256",kid:env.APNS_KEY_ID}) + "." + encode({iss:env.APPLE_TEAM_ID,iat:Math.floor(Date.now()/1000)});
  const signature = sign("sha256", Buffer.from(prefix), {
    key:readFileSync(env.APNS_KEY_FILE), dsaEncoding:"ieee-p1363"
  }).toString("base64url");
  console.log("PROVIDER_READY");
  const users = await rows("users", {select:"id",telegram_id:"eq."+admin,limit:"2"});
  assertion(users.length===1, "A unique private account is required");
  for(let i=0; i<48; i++) {
    const tokens=await rows("push_tokens", {select:"token",user_id:"eq."+users[0].id,platform:"eq.apns",limit:"2"});
    assertion(tokens.length<=1, "MULTIPLE_IPHONES");
    if(tokens.length===0) {
      if(i===47) {console.log("NO_REGISTERED_IPHONE"); return;}
      await pause(10000);continue;
    }
    const token=tokens[0].token;
    assertion(/^(?:[0-9a-fA-F]{2}){16,128}$/.test(token),"Invalid device address");
    // Give the recipient time to lock their iPhone after opening the app.
    await pause(12000);
    const current=await rows("push_tokens",{select:"token",user_id:"eq."+users[0].id,platform:"eq.apns",limit:"2"});
    assertion(current.length===1 && current[0].token===token,"Recipient registration changed");
    const session=connect("https://api.push.apple.com");
    try {
      const result=await new Promise((resolve,reject)=>{
        const stop=setTimeout(()=>session.destroy(new Error("Apple connection timeout")),15000);
        session.on("error",reject);
        const req=session.request({":method":"POST",":path":"/3/device/"+token,authorization:"bearer "+prefix+"."+signature,
          "apns-topic":"ru.mesto.app","apns-push-type":"alert","apns-priority":"10","apns-expiration":"0"});
        let status,body="";
        req.on("response",h=>status=h[":status"]);req.setEncoding("utf8");
        req.on("data",part=>body+=part);req.on("error",reject);
        req.on("close",()=>clearTimeout(stop));
        req.on("end",()=>resolve({status,body}));
        req.end(JSON.stringify({aps:{alert:{title:"МЕСТО",body:"Андрей, это тестовое уведомление на твой iPhone."},sound:"default"},body:{url:"/notifications"}}));
      });
      if(result.status===200) console.log("APPLE_ACCEPTED_ONE_PRIVATE_PUSH");
      else {
        const reason=JSON.parse(result.body||"{}").reason;
        throw new Error("Apple status "+result.status+" "+(/^[a-z]+$/i.test(reason??"")?reason:"unknown"));
      }
    } finally {session.destroy();}
    return;
  }
}
main().catch(err=>{console.error(String(err.message).replace(/https?:\/\/\S+/g,"[url]"));process.exitCode=1;});