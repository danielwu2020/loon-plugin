/******** 节点详情查询 Ultimate V6-Pro Max ********/

const TIMEOUT = 15000

function getArgs(){
  let raw = typeof $argument!="undefined"?$argument:""
  let obj={}
  raw.split("&").forEach(p=>{
    let [k,v]=p.split("=")
    if(k) obj[k]=v
  })
  return obj
}

const ARGS=getArgs()

function getKey(){
  let key=$persistentStore.read("ABUSE_KEY")
  if(ARGS.abuse){
    $persistentStore.write(ARGS.abuse,"ABUSE_KEY")
    key=ARGS.abuse
  }
  return key
}

const ABUSE_KEY=getKey()

function http(url,cb){
  $httpClient.get({url:url,timeout:TIMEOUT},(e,r,d)=>{
    try{cb(JSON.parse(d))}catch{cb({})}
  })
}

// ===== IP信息 =====
http("http://ip-api.com/json", ipapi=>{

let ip=ipapi.query
let isp=ipapi.isp||""
let asn=ipapi.as||""
let country=ipapi.country||""
let city=ipapi.city||""

// ===== cz88 =====
http("https://cz88.net/api/cz88/ip/base?ip="+ip, cz=>{

let netType=cz.data?.netWorkType||"unknown"
let residential=/住宅|家宽|宽带/i.test(netType)

// ===== Abuse =====
if(!ABUSE_KEY) return main(ip,isp,asn,country,city,netType,residential,0)

$httpClient.get({
url:"https://api.abuseipdb.com/api/v2/check?ipAddress="+ip,
headers:{Key:ABUSE_KEY,Accept:"application/json"}
},(e,r,d)=>{
let abuse=0
try{abuse=JSON.parse(d).data.abuseConfidenceScore}catch{}
main(ip,isp,asn,country,city,netType,residential,abuse)
})

})
})

// ===== 主逻辑 =====
function main(ip,isp,asn,country,city,netType,residential,abuse){

let risk=0
let tags=[]
let reasons=[]

// ===== 数据库 =====
const backbone=["cogent","level3","hurricane","zayo","telia"]
const idc=["fiberstate","ovh","hetzner","digitalocean","vultr","linode","oracle","tencent","alibaba","aws","google","azure"]

// ===== 黑名单 =====
if(abuse>0){
risk+=60
tags.push("黑名单")
reasons.push("存在滥用记录")
}

// ===== IDC =====
let isIDC=false
if(idc.some(i=>asn.toLowerCase().includes(i))){
isIDC=true
risk+=30
tags.push("IDC ASN")
reasons.push("云厂商/服务器网络")
}

// ===== 骨干网 =====
let isBackbone=backbone.some(i=>isp.toLowerCase().includes(i))
if(isBackbone){
risk+=25
tags.push("骨干网")
reasons.push("骨干网线路")
}

// ===== 假家宽 =====
let fake=false
if(residential && isIDC){
fake=true
risk+=50
tags.push("假家宽")
reasons.push("住宅标记但结构异常")
}

// ===== 真人概率模拟 =====
let human=100-risk
if(human<0) human=0

// ===== 缓存 =====
let cacheKey="IP_"+ip
let history=$persistentStore.read(cacheKey)
if(history){
risk=Math.round(risk*0.7+Number(history)*0.3)
reasons.push("已结合历史行为")
}
$persistentStore.write(String(risk),cacheKey)

// ===== 行为 =====
let share="低"
if(risk>40) share="中"
if(risk>70) share="高"
if(risk>85) share="极高"

// ===== 原生感 =====
let native="强"
if(risk>40) native="一般"
if(risk>70) native="弱"
if(risk>85) native="极弱"

// ===== 多源评分 =====
let score=100-risk
if(score<0) score=0

// ===== 风控值 =====
let control=risk

// ===== 机场识别 =====
let airport=false
if((isIDC&&share==="极高")||fake||(risk>85&&!abuse)){
airport=true
tags.push("机场出口")
reasons.push("高共享+IDC特征")
}

// ===== 流媒体 =====
function media(r){
if(r>80) return "❌"
if(r>50) return "⚠️"
return "✅"
}

// ===== 平台 =====
function judge(r){
if(r>100) return "❌"
if(r>70) return "⚠️"
return "✅"
}

let apple=risk*1.3
let google=risk*1.2
let finance=risk*1.5

if(fake||share==="极高"){
apple+=25
finance+=30
}

// ===== 输出 =====
let msg=`
🌍 IP信息
IP：${ip}
国家：${country} ${city}

━━━━━━━━━━━━━━

📡 网络
ISP：${isp}
ASN：${asn}
类型：${netType}

━━━━━━━━━━━━━━

📊 核心评估
风险值：${risk}
多源评分：${score}
风控值：${control}

🏷️ 标签：${tags.join(" / ")||"无"}

━━━━━━━━━━━━━━

🧠 行为特征
真人概率：${human}
共享感：${share}
原生感：${native}

━━━━━━━━━━━━━━

🎬 流媒体
Netflix：${media(risk)}
TikTok：${media(risk)}
YouTube：${media(risk)}

━━━━━━━━━━━━━━

📱 平台建议
Apple：${judge(apple)}
Google：${judge(google)}
金融：${judge(finance)}

━━━━━━━━━━━━━━

🧾 判定原因
${reasons.join(" / ")||"无"}

━━━━━━━━━━━━━━

📌 最终结论
${airport?"🔴 机场出口 / 高风险":"🟢 正常 / 可用"}
`

$done({
title:"节点详情查询 Ultimate V6-Pro Max",
message:msg
})
}