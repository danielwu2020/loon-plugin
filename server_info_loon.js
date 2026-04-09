/*************************************
 * 节点详情查询 Ultimate（精修完整合并版）
 * Version: 2.02
 *
 * 数据源：
 * - ip-api
 * - cz88
 * - AbuseIPDB
 *
 * 2.02 重点修正：
 * 1. 新增通用社媒风险（socialRisk / socialAdvice）
 * 2. 增强 TM Net / Telekom Malaysia 识别，降低误伤
 * 3. 线路评级进一步收敛，减少普通企业线/商宽误判
 * 4. 统一媒体检测文案为“网页层/近似检测”
 * 5. 保持 2.01 并行 / 超时 / 缓存框架
 *************************************/

const SCRIPT_VERSION = "2.02";
const TIMEOUT = 15000;
const CHECK_GUARD_TIMEOUT = 16000;
const REQUEST_RETRY = 1;
const ABUSE_CACHE_TTL = 12 * 60 * 60 * 1000;
const RESULT_CACHE_TTL = 10 * 60 * 1000;

/*************** 参数读取 ***************/
function getArgs() {
  const raw = (typeof $argument !== "undefined" && $argument) ? $argument : "";
  const obj = {};
  raw.split("&").forEach(function (pair) {
    if (!pair) return;
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx);
    const v = pair.slice(idx + 1);
    obj[k] = decodeURIComponent(v || "");
  });
  return obj;
}

const ARGS = getArgs();

function getPersistedOrArg(storeKey, argValue) {
  try {
    if (argValue) {
      $persistentStore.write(argValue, storeKey);
      return argValue;
    }
    return $persistentStore.read(storeKey) || "";
  } catch (e) {
    return argValue || "";
  }
}

const ABUSEIPDB_KEY = getPersistedOrArg("NODE_CHECK_ABUSE_KEY", ARGS.abuse || "");

/*************** 初始化通知 ***************/
function notifyInitIfNeeded() {
  try {
    if (ARGS.init === "1" && ABUSEIPDB_KEY) {
      $notification.post(
        "节点详情查询 Ultimate",
        "AbuseIPDB Key 已写入本地存储",
        "以后可直接使用普通版插件"
      );
    }
  } catch (e) {}
}
notifyInitIfNeeded();

/*************** 节点环境 ***************/
function getNodeName() {
  try {
    if (typeof $environment !== "undefined" && $environment.params) {
      if (typeof $environment.params === "string") return $environment.params;
      if ($environment.params.node) return $environment.params.node;
      if ($environment.params.nodeInfo && $environment.params.nodeInfo.name) {
        return $environment.params.nodeInfo.name;
      }
    }
    if (typeof $loon !== "undefined" && $loon.node) return $loon.node;
  } catch (e) {}
  return "当前节点";
}

function getNodeParam() {
  try {
    if (typeof $environment !== "undefined" && $environment.params) {
      if (typeof $environment.params === "string") return $environment.params;
      if ($environment.params.node) return $environment.params.node;
      if ($environment.params.nodeInfo && $environment.params.nodeInfo.name) {
        return $environment.params.nodeInfo.name;
      }
    }
    if (typeof $loon !== "undefined" && $loon.node) return $loon.node;
  } catch (e) {}
  return null;
}

const NODE_NAME = getNodeName();
const NODE_PARAM = getNodeParam();

/*************** 工具 ***************/
function parseJSON(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lower(v) {
  return String(v || "").toLowerCase();
}

function safeText(v, fallback) {
  const s = String(v == null ? "" : v).trim();
  return s ? s : (fallback || "-");
}

function safeZip(v) {
  const s = String(v == null ? "" : v).trim();
  return s ? s : "-";
}

function escapeRegExp(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeKeywordMatch(text, keyword) {
  const t = String(text || "").toLowerCase();
  const k = String(keyword || "").toLowerCase().trim();
  if (!k) return false;

  if (k.length <= 3) {
    return new RegExp("(^|[^a-z0-9])" + escapeRegExp(k) + "([^a-z0-9]|$)", "i").test(t);
  }
  return t.indexOf(k) !== -1;
}

function hasAny(text, arr) {
  const t = lower(text);
  for (let i = 0; i < arr.length; i++) {
    if (t.indexOf(lower(arr[i])) !== -1) return true;
  }
  return false;
}

function hasAnySafe(text, arr) {
  const t = String(text || "").toLowerCase();
  for (let i = 0; i < arr.length; i++) {
    if (safeKeywordMatch(t, arr[i])) return true;
  }
  return false;
}

function uniquePush(arr, val) {
  if (arr.indexOf(val) === -1) arr.push(val);
}

function icon(level) {
  if (level === "ok") return "🟢";
  if (level === "warn") return "🟡";
  if (level === "midbad") return "🟠";
  if (level === "fail") return "🔴";
  if (level === "neutral") return "⚪️";
  return "⚪️";
}

function line(name, value, level) {
  return icon(level) + " " + name + "：" + value;
}

function boolLine(name, boolValue) {
  return (boolValue ? "🔴 " : "🟢 ") + name + "：" + (boolValue ? "是" : "否");
}

function neutralBoolLine(name, boolValue) {
  return (boolValue ? "🟡 " : "⚪️ ") + name + "：" + (boolValue ? "是" : "否");
}

function done(msg) {
  $done({
    title: "节点详情查询 Ultimate " + SCRIPT_VERSION,
    message: msg
  });
}

function simpleHash(str) {
  let hash = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function shouldRetryHttp(error, response) {
  if (error) return true;
  const code = response && (response.status || response.statusCode || 0);
  if (!code) return true;
  return code >= 500;
}

function httpGet(target, callback, retryLeft) {
  const opts = typeof target === "string" ? { url: target } : (target || {});
  if (!opts.timeout) opts.timeout = TIMEOUT;
  if (NODE_PARAM) opts.node = NODE_PARAM;

  const remain = typeof retryLeft === "number" ? retryLeft : REQUEST_RETRY;

  $httpClient.get(opts, function (error, response, data) {
    if (remain > 0 && shouldRetryHttp(error, response)) {
      return httpGet(opts, callback, remain - 1);
    }
    callback(error, response, data);
  });
}

/*************** 并行检测 ***************/
function runChecksParallel(checks, callback) {
  if (!checks || !checks.length) return callback([]);

  const results = new Array(checks.length);
  let finished = 0;
  let called = false;

  function finishOnce() {
    if (called) return;
    if (finished >= checks.length) {
      called = true;
      callback(results);
    }
  }

  checks.forEach(function (item, idx) {
    let settled = false;
    let timer = null;

    function settle(value, level) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      results[idx] = { name: item.name, value: value, level: level };
      finished++;
      finishOnce();
    }

    timer = setTimeout(function () {
      settle("检测超时", "neutral");
    }, CHECK_GUARD_TIMEOUT);

    try {
      item.run(function (value, level) {
        settle(value, level);
      });
    } catch (e) {
      settle("检测异常", "fail");
    }
  });
}

/*************** 缓存 ***************/
function readCache(key) {
  try {
    const raw = $persistentStore.read(key);
    if (!raw) return null;
    const obj = parseJSON(raw);
    if (!obj || !obj.time) return null;
    return obj;
  } catch (e) {
    return null;
  }
}

function writeCache(key, data) {
  try {
    $persistentStore.write(JSON.stringify({
      time: Date.now(),
      data: data
    }), key);
  } catch (e) {}
}

function getAbuseCacheKey(ip) {
  return "NODE_CHECK_ABUSE_CACHE_" + ip;
}

function getResultCacheKeyByMeta(ipApi, cz88Data, abuseData) {
  const ip = ipApi && ipApi.query ? ipApi.query : "unknown";
  const asn = ipApi && ipApi.as ? ipApi.as : "unknown_as";
  const cc = ipApi && ipApi.countryCode ? ipApi.countryCode : "xx";
  const proxy = ipApi && ipApi.proxy ? "1" : "0";
  const hosting = ipApi && ipApi.hosting ? "1" : "0";
  const netType = safeText(cz88Data && cz88Data.netWorkType, "-");
  const abuseScore = abuseData && abuseData.data ? String(abuseData.data.abuseConfidenceScore || 0) : "na";
  const reports = abuseData && abuseData.data ? String(abuseData.data.totalReports || 0) : "na";

  const mini = [
    NODE_NAME || "default",
    ip,
    asn,
    cc,
    proxy,
    hosting,
    netType,
    abuseScore,
    reports
  ].join("|");

  return "NODE_CHECK_RESULT_CACHE_" + SCRIPT_VERSION + "_" + simpleHash(mini);
}

/*************** 主流运营商白名单 ***************/
const MAJOR_ISP_KEYWORDS = [
  "AT&T", "Comcast", "Verizon", "T-Mobile", "Spectrum", "Charter", "Cox",
  "CenturyLink", "Lumen", "Frontier", "Windstream", "Optimum", "Altice", "Xfinity",
  "NTT", "SoftBank", "KDDI", "Rakuten", "JCOM", "IIJ",
  "Vodafone", "Orange", "Telekom", "Telefonica", "Bouygues", "Free Mobile",
  "Singtel", "StarHub", "Telstra", "Optus", "dtac",
  "China Telecom", "China Unicom", "China Mobile", "CMHK", "PCCW", "HGC",
  "SUPERLOOP", "Exetel", "Swisscom", "Virgin Media", "Claro", "Vivo",
  "True Online", "True Internet", "True Corp", "TrueMove",
  "TM Net", "Telekom Malaysia", "Unifi", "TIME dotCom", "Maxis", "Celcom"
];

function isTMNetLike(org, isp, asnOrg) {
  const str = [org, isp, asnOrg].join(" ").toLowerCase();
  return (
    safeKeywordMatch(str, "tm net") ||
    safeKeywordMatch(str, "telekom malaysia") ||
    safeKeywordMatch(str, "tm technology services") ||
    safeKeywordMatch(str, "unifi") ||
    (/\btm\b/i.test(str) && /\b(net|broadband|telekom|malaysia|unifi)\b/i.test(str))
  );
}

function isMajorISP(org, isp, asnOrg) {
  const str = [org, isp, asnOrg].join(" ").toLowerCase();

  if (isTMNetLike(org, isp, asnOrg)) return true;

  for (let i = 0; i < MAJOR_ISP_KEYWORDS.length; i++) {
    if (safeKeywordMatch(str, MAJOR_ISP_KEYWORDS[i])) return true;
  }

  if (/\batt\b/i.test(str) && /\b(telecom|communications|mobility|internet|wireless)\b/i.test(str)) return true;
  if (/\bbt\b/i.test(str) && /\b(british telecom|broadband|internet|telecom)\b/i.test(str)) return true;
  if (/\boi\b/i.test(str) && /\b(brasil|telecom|fibra|internet)\b/i.test(str)) return true;
  if (/\btim\b/i.test(str) && /\b(brasil|telecom|fibra|live)\b/i.test(str)) return true;
  if (/\bm1\b/i.test(str) && /\b(singapore|mobile|limited|ltd|telecom)\b/i.test(str)) return true;
  if (/\bo2\b/i.test(str) && /\b(telefonica|uk|mobile|broadband)\b/i.test(str)) return true;
  if (/\bais\b/i.test(str) && /\b(thailand|fibre|fiber|broadband|wireless)\b/i.test(str)) return true;
  if (/\btrue\b/i.test(str) && /\b(move|internet|online|corp|broadband)\b/i.test(str)) return true;

  return false;
}

/*************** ASN / 云数据库 ***************/
const ASN_DB = {
  premiumEnterprise: [
    "eons data",
    "leased line",
    "carrier ethernet",
    "metro ethernet",
    "mpls",
    "dedicated internet",
    "business fiber",
    "enterprise fiber",
    "dedicated internet access"
  ],
  neutralBusiness: [
    "exetel",
    "superloop business",
    "business broadband",
    "commercial internet",
    "telekom malaysia",
    "tm net",
    "unifi business"
  ],
  smallIdc: [
    "colocation",
    "hosting",
    "idc",
    "datacenter",
    "data center",
    "vps",
    "bare metal",
    "hypervisor",
    "cloud server"
  ],
  badIdc: [
    "m247",
    "ovh",
    "contabo",
    "hetzner",
    "digitalocean",
    "vultr",
    "choopa"
  ],
  bigCloud: [
    "oracle cloud",
    "aws",
    "amazon technologies",
    "amazon data services",
    "ec2",
    "google cloud",
    "gcp",
    "azure",
    "alibaba cloud",
    "aliyun",
    "tencent cloud",
    "huawei cloud"
  ]
};

const CLOUD_PROVIDER_RULES = [
  { name: "AWS", keys: ["amazon technologies", "amazon data services", "ec2", "amazon aws"] },
  { name: "Google Cloud", keys: ["google cloud", "google llc cloud", "gcp"] },
  { name: "Azure", keys: ["microsoft azure", "azure cloud"] },
  { name: "Oracle Cloud", keys: ["oracle cloud", "oracle oci"] },
  { name: "Cloudflare", keys: ["cloudflare"] },
  { name: "DigitalOcean", keys: ["digitalocean"] },
  { name: "Linode", keys: ["linode", "akamai connected cloud"] },
  { name: "Vultr", keys: ["vultr", "choopa"] },
  { name: "OVH", keys: ["ovh"] },
  { name: "Hetzner", keys: ["hetzner"] },
  { name: "Contabo", keys: ["contabo"] },
  { name: "Scaleway", keys: ["scaleway"] },
  { name: "Alibaba Cloud", keys: ["aliyun", "alibaba cloud"] },
  { name: "Tencent Cloud", keys: ["tencent cloud"] },
  { name: "Huawei Cloud", keys: ["huawei cloud"] },
  { name: "M247", keys: ["m247"] }
];

const SUSPICIOUS_TRANSIT_UPSTREAMS = [
  "cogent communications",
  "cogent",
  "hurricane electric",
  "he.net",
  "gtt communications",
  "gtt",
  "telia carrier",
  "zayo",
  "pccw global",
  "ntt america",
  "level 3",
  "lumen"
];

function matchTransitUpstream(text, majorISP) {
  const t = lower(text);
  if (!t || majorISP) return false;

  const upstreamBrandHit = hasAnySafe(t, SUSPICIOUS_TRANSIT_UPSTREAMS);
  const transitSemanticHit =
    /\b(ip transit|transit provider|upstream carrier|upstream network|global backbone|international backbone)\b/i.test(t);
  const resellerSemanticHit =
    /\b(reseller|resale|wholesale|bgp|upstream|carrier service|ip service)\b/i.test(t);

  if (upstreamBrandHit && (transitSemanticHit || resellerSemanticHit)) {
    return true;
  }

  return false;
}

function matchHostingLikeOrg(text) {
  const t = lower(text);
  if (!t) return false;

  if (isTMNetLike(t, t, t)) return false;

  const hostingCore =
    /\b(hosting|datacenter|data center|idc|colocation|vps)\b/i.test(t);

  const infraWord =
    /\b(server|rack|cabinet|hypervisor|bare metal|virtual machine|virtualization)\b/i.test(t);

  const strongBrandHit = hasAnySafe(t, [
    "digitalocean",
    "linode",
    "akamai connected cloud",
    "vultr",
    "choopa",
    "ovh",
    "hetzner",
    "contabo",
    "m247"
  ]);

  if (strongBrandHit) return true;
  if (hostingCore && infraWord) return true;

  return false;
}

function matchASNDatacenterText(text) {
  const t = lower(text);
  if (!t) return false;

  if (isTMNetLike(t, t, t)) return false;

  const strongBrandHit = hasAnySafe(t, [
    "digitalocean",
    "linode",
    "akamai connected cloud",
    "vultr",
    "choopa",
    "ovh",
    "hetzner",
    "contabo",
    "m247"
  ]);

  const hostingCore =
    /\b(hosting|datacenter|data center|idc|vps)\b/i.test(t);

  const infraWord =
    /\b(cloud server|bare metal|virtual machine|hypervisor|virtualization)\b/i.test(t);

  if (strongBrandHit) return true;
  if (hostingCore && infraWord) return true;

  return false;
}

function detectCloudProvider(ipApi, cz88) {
  const text = [
    ipApi && ipApi.as,
    ipApi && ipApi.isp,
    ipApi && ipApi.org,
    cz88 && cz88.isp,
    cz88 && cz88.netWorkType
  ].join(" ").toLowerCase();

  for (let i = 0; i < CLOUD_PROVIDER_RULES.length; i++) {
    const item = CLOUD_PROVIDER_RULES[i];
    for (let j = 0; j < item.keys.length; j++) {
      if (safeKeywordMatch(text, item.keys[j])) {
        return { hit: true, name: item.name, keyword: item.keys[j] };
      }
    }
  }

  if (/\bgoogle\b/i.test(text) && /\bcloud\b/i.test(text)) {
    return { hit: true, name: "Google Cloud", keyword: "google + cloud" };
  }
  if (/\bmicrosoft\b/i.test(text) && /\bazure\b/i.test(text)) {
    return { hit: true, name: "Azure", keyword: "microsoft + azure" };
  }
  if (/\boracle\b/i.test(text) && /\boci\b/i.test(text)) {
    return { hit: true, name: "Oracle Cloud", keyword: "oracle + oci" };
  }

  return { hit: false, name: "", keyword: "" };
}

/*************** OpenAI 支持地区 ***************/
const OPENAI_SUPPORTED_LOCS = [
  "AL","DZ","AD","AO","AG","AR","AM","AU","AT","AZ",
  "BS","BD","BB","BE","BZ","BJ","BT","BA","BW","BR","BN","BG","BF","CV","CA",
  "CL","CO","KM","CR","CI","HR","CY","DK","DJ","DM","DO",
  "EC","SV","EE","FJ","FI","FR","GA","GM","GE","DE","GH","GR","GD","GT","GN","GW","GY",
  "HT","HN","HU","IS","IN","ID","IQ","IE","IL","IT","JM","JP","JO",
  "KZ","KE","KI","KW","KG","LV","LB","LS","LR","LI","LT","LU",
  "MG","MW","MY","MV","ML","MT","MH","MR","MU","MX","FM","MD","MC","MN","ME","MA","MZ","MM",
  "NA","NR","NP","NL","NZ","NE","NG","MK","NO","OM","PK","PW","PA","PG","PY","PE","PH","PL","PT",
  "QA","RO","RW","KN","LC","VC","WS","SM","ST","SN","RS","SC","SL","SG","SK","SI","SB","ZA","KR","ES","LK","SR","SE","CH",
  "TW","TZ","TH","TL","TG","TO","TT","TN","TR","TV","UG","UA","AE","GB","US","UY","VU","ZM"
];

function parseTrace(text) {
  const obj = {};
  String(text || "").split("\n").forEach(function (line) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      obj[k] = v;
    }
  });
  return obj;
}

function isOpenAISupportedLoc(loc) {
  const code = String(loc || "").trim().toUpperCase();
  return OPENAI_SUPPORTED_LOCS.indexOf(code) !== -1;
}

function normalizeWarpValue(v) {
  const s = lower(v);
  if (s === "on" || s === "plus") return "on";
  if (s === "off") return "off";
  return s || "unknown";
}

/*************** 真人概率 ***************/
function getHumanScoreMeta(score, cz88) {
  const n = Number(score);
  const rawType = String((cz88 && cz88.netWorkType) || "");
  const hasUsefulType = !!rawType;

  if (isNaN(n)) return { score: null, text: "未知（数据不足）", suspicious: false, missing: true };
  if (n === 0 && !hasUsefulType) return { score: null, text: "未知（数据不足）", suspicious: false, missing: true };

  if (n >= 80) return { score: n, text: n + "（很像真人）", suspicious: false, missing: false };
  if (n >= 60) return { score: n, text: n + "（正常偏好）", suspicious: false, missing: false };
  if (n >= 40) return { score: n, text: n + "（可疑，有点像代理）", suspicious: true, missing: false };
  return { score: n, text: n + "（很像代理/机房）", suspicious: true, missing: false };
}

/*************** AbuseIPDB ***************/
function checkAbuseIPDB(ip, cb) {
  if (!ABUSEIPDB_KEY) return cb(null, false);

  const cacheKey = getAbuseCacheKey(ip);
  const cache = readCache(cacheKey);
  if (cache && cache.time && (Date.now() - cache.time < ABUSE_CACHE_TTL)) {
    return cb(cache.data, true);
  }

  const url =
    "https://api.abuseipdb.com/api/v2/check?ipAddress=" +
    encodeURIComponent(ip) +
    "&maxAgeInDays=90&verbose=true";

  httpGet(
    {
      url: url,
      headers: {
        Key: ABUSEIPDB_KEY,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0"
      }
    },
    function (err, resp, data) {
      if (err || !data) return cb(null, false);
      const parsed = parseJSON(data) || null;
      if (parsed) writeCache(cacheKey, parsed);
      cb(parsed, false);
    }
  );
}

/*************** 平台 / 流媒体检测 ***************/
function checkNetflix(cb) {
  const tests = [
    { label: "样本A", id: "70143836" },
    { label: "样本B", id: "80018499" },
    { label: "样本C", id: "81215567" },
    { label: "样本D", id: "80007226" }
  ];

  let finished = 0;
  let strongBlocked = 0;
  let uncertainBlocked = 0;
  const successLabels = [];

  function finalize() {
    if (successLabels.length) {
      return cb("样本片页面可访问（" + successLabels.join("/") + "，网页层近似检测）", "ok");
    }
    if (strongBlocked >= tests.length) {
      return cb("样本片页面均受限（网页层近似检测）", "fail");
    }
    if (strongBlocked + uncertainBlocked >= tests.length) {
      return cb("样本片均未明确通过（结果不确定）", "warn");
    }
    return cb("部分样本失败（未确认完整可用）", "warn");
  }

  tests.forEach(function (item) {
    httpGet(
      {
        url: "https://www.netflix.com/title/" + item.id,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept-Language": "en"
        }
      },
      function (err, resp) {
        finished++;

        if (err || !resp) {
          uncertainBlocked++;
          if (finished >= tests.length) finalize();
          return;
        }

        const code = resp.status || resp.statusCode || 0;
        if (code === 200) successLabels.push(item.label);
        else if (code === 403) strongBlocked++;
        else uncertainBlocked++;

        if (finished >= tests.length) finalize();
      }
    );
  });
}

function checkDisney(cb) {
  httpGet(
    {
      url: "https://www.disneyplus.com/",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en"
      }
    },
    function (err, resp, data) {
      if (err || !resp) return cb("检测失败", "fail");
      const code = resp.status || resp.statusCode || 0;
      const body = data || "";

      if (code === 200 || code === 301 || code === 302) {
        if (/not available in your region/i.test(body)) return cb("当前地区不可用（网页层）", "fail");
        return cb("网页可达（网页层，非播放验证）", "warn");
      }
      if (code === 403) return cb("被拒绝", "fail");
      return cb("未知(" + code + ")", "warn");
    }
  );
}

function checkTikTok(cb) {
  httpGet(
    {
      url: "https://www.tiktok.com/",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en"
      }
    },
    function (err, resp, data) {
      if (err || !resp) return cb("检测失败", "fail");
      const code = resp.status || resp.statusCode || 0;
      const body = data || "";
      if (code === 200 && body) return cb("首页可达（网页层，不代表推荐流/登录正常）", "warn");
      if (code === 403) return cb("被拒绝", "fail");
      return cb("未知(" + code + ")", "warn");
    }
  );
}

function checkYouTube(cb) {
  httpGet(
    {
      url: "https://www.youtube.com/premium",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en"
      }
    },
    function (err, resp, data) {
      if (err || !resp || !data) return cb("检测失败", "fail");
      const body = data || "";
      const match = body.match(/"countryCode":"(.*?)"/) || body.match(/"GL":"(.*?)"/);

      if (match && match[1]) return cb("Premium 页面地区 " + match[1] + "（网页层）", "ok");

      if (/youtube premium is not available/i.test(body) || /not available/i.test(body)) {
        return cb("当前地区不可用（网页层）", "warn");
      }

      return cb("网页可达（未识别地区）", "warn");
    }
  );
}

function checkChatGPTWithRisk(risk, cb) {
  httpGet(
    {
      url: "https://chatgpt.com/cdn-cgi/trace",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en"
      }
    },
    function (err, resp, data) {
      if (!err && resp && data) {
        const code = resp.status || resp.statusCode || 0;
        const body = String(data || "");

        if (code === 200 && body.indexOf("loc=") !== -1) {
          const trace = parseTrace(body);
          const loc = String(trace.loc || "").toUpperCase();
          const traceIp = trace.ip || "-";
          const warp = normalizeWarpValue(trace.warp || "");

          if (isOpenAISupportedLoc(loc)) {
            if (warp === "on") {
              return cb("地区支持（CF视角：" + loc + " / WARP / " + traceIp + "）", "warn");
            }

            if (
              risk &&
              (
                risk.proxyExit ||
                risk.cloudService ||
                risk.isDatacenter ||
                risk.cloudNativeDatacenter ||
                risk.suspiciousProxy
              )
            ) {
              return cb("地区支持（CF视角：" + loc + " / 代理特征 / " + traceIp + "）", "warn");
            }

            return cb("地区支持（CF视角：" + loc + " / " + traceIp + "）", "ok");
          }

          return cb("地区不在支持列表（CF视角：" + (loc || "未知") + " / " + traceIp + "）", "fail");
        }
      }

      httpGet(
        {
          url: "https://chatgpt.com/",
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "en"
          }
        },
        function (err2, resp2, data2) {
          if (err2 || !resp2) return cb("检测失败", "fail");

          const code2 = resp2.status || resp2.statusCode || 0;
          const body2 = String(data2 || "");

          if (/unsupported country/i.test(body2) || /not available in your country/i.test(body2)) {
            return cb("地区限制（网页层）", "fail");
          }

          if (code2 === 200 || code2 === 301 || code2 === 302) {
            return cb("网页可访问（未识别地区，仅网页层结论）", "warn");
          }

          if (code2 === 403) {
            return cb("被拒绝", "fail");
          }

          return cb("未知(" + code2 + ")", "warn");
        }
      );
    }
  );
}

/*************** 识别工具 ***************/
function isIspLikeText(text) {
  const t = lower(text);

  if (isTMNetLike(t, t, t)) return true;

  if (/\b(isp|telecom|telecommunications|telecomunicacoes|telecomunicações|internet service provider)\b/i.test(t)) {
    return true;
  }

  if (
    /\b(cable|dsl|residential|cable\/dsl|banda larga)\b/i.test(t) &&
    /\b(internet|telecom|provider|isp|broadband)\b/i.test(t)
  ) {
    return true;
  }

  if (
    /\b(fiber|fibra|ftth|unifi)\b/i.test(t) &&
    /\b(isp|internet service provider|telecom|telecommunications|broadband)\b/i.test(t)
  ) {
    return true;
  }

  if (
    /\b(proveedor|provedor)\b/i.test(t) &&
    /\b(internet|telecom|isp|banda larga)\b/i.test(t)
  ) {
    return true;
  }

  return false;
}

function isRealISPLineCandidate(ipApi, cz88, risk, abuseScore) {
  const mix = [
    ipApi && ipApi.isp,
    ipApi && ipApi.org,
    ipApi && ipApi.as,
    cz88 && cz88.isp,
    cz88 && cz88.netWorkType
  ].join(" ").toLowerCase();

  let hitScore = 0;

  if (!ipApi.proxy) hitScore += 20;
  if (!ipApi.hosting) hitScore += 15;
  if (!risk.cloudNativeDatacenter) hitScore += 15;
  if (!risk.isASNDatacenter) hitScore += 15;
  if (isIspLikeText(mix)) hitScore += 20;
  if (abuseScore <= 10) hitScore += 10;
  if (isTMNetLike(mix, mix, mix)) hitScore += 12;

  if (risk.transitUpstreamHit) hitScore -= 8;
  if (risk.hostingLikeOrg) hitScore -= 10;

  return hitScore >= 55;
}

function calcSharedISPScore(risk, ipApi, cz88) {
  let score = 0;
  const text = [
    ipApi && ipApi.isp,
    ipApi && ipApi.org,
    ipApi && ipApi.as,
    cz88 && cz88.netWorkType
  ].join(" ").toLowerCase();

  if (risk.sharedFeel >= 35) score += 20;
  if (risk.sharedFeel >= 50) score += 15;
  if (risk.airportSuspicion >= 35) score += 15;
  if (risk.platformRisk >= 40) score += 10;
  if (risk.nativeFeel <= 45) score += 12;
  if (risk.humanMeta && risk.humanMeta.score !== null && risk.humanMeta.score < 20) score += 18;

  if (text.indexOf("专线") !== -1) {
    if (risk.sharedFeel >= 40 || risk.nativeFeel <= 50 || risk.platformRisk >= 40) {
      score += 6;
    }
  }

  if (/\b(business|enterprise)\b/i.test(text)) {
    if (risk.sharedFeel >= 45 || risk.airportSuspicion >= 35) {
      score += 4;
    }
  }

  if (isTMNetLike(text, text, text)) score -= 12;

  if (
    risk.networkCategory === "运营商移动网络" ||
    risk.networkCategory === "移动数据"
  ) {
    score -= 10;
  }

  if (risk.majorISP) score -= 8;
  if (risk.abuseScore === 0) score -= 4;
  if (!risk.proxyExit && !risk.cloudNativeDatacenter && !risk.isASNDatacenter) score -= 6;

  return clamp(score, 0, 100);
}

/*************** ASN画像 ***************/
function getASNMeta(ipApi, risk) {
  const text = lower([ipApi && ipApi.as, ipApi && ipApi.isp, ipApi && ipApi.org].join(" "));
  let abuseHistory = 0;
  const reasons = [];

  if (hasAnySafe(text, ASN_DB.badIdc)) {
    abuseHistory += 62;
    uniquePush(reasons, "常见高共享机房/云ASN");
  }

  if (hasAnySafe(text, ASN_DB.bigCloud)) {
    abuseHistory += 48;
    uniquePush(reasons, "大云厂商ASN");
  }

  if (hasAnySafe(text, ASN_DB.smallIdc)) {
    abuseHistory += 30;
    uniquePush(reasons, "小型IDC/Hosting特征");
  }

  if (hasAnySafe(text, ASN_DB.neutralBusiness)) {
    abuseHistory -= 12;
    uniquePush(reasons, "带ISP/商宽底子");
  }

  if (hasAnySafe(text, ASN_DB.premiumEnterprise)) {
    abuseHistory -= 16;
    uniquePush(reasons, "企业专线/商业线路特征");
  }

  if (risk.majorISP) {
    abuseHistory -= 12;
    uniquePush(reasons, "主流运营商");
  }

  if (isTMNetLike(text, text, text)) {
    abuseHistory -= 10;
    uniquePush(reasons, "TM Net / Telekom Malaysia 运营商特征");
  }

  if (risk.cloudHitOnly) {
    abuseHistory += 10;
    uniquePush(reasons, "云厂商品牌命中");
  }

  if (risk.cloudNativeDatacenter) {
    abuseHistory += 10;
    uniquePush(reasons, "云厂商机房化倾向");
  }

  if (risk.isASNDatacenter) {
    abuseHistory += 16;
    uniquePush(reasons, "ASN机房特征");
  }

  if (risk.sharedFeel >= 55) {
    abuseHistory += 10;
    uniquePush(reasons, "共享感偏高");
  } else if (risk.sharedFeel >= 35) {
    abuseHistory += 5;
    uniquePush(reasons, "共享感中等");
  }

  if (risk.nativeFeel <= 40) {
    abuseHistory += 8;
    uniquePush(reasons, "原生感偏低");
  }

  if (risk.abuseScore >= 50) {
    abuseHistory += 12;
    uniquePush(reasons, "当前IP滥用高");
  } else if (risk.abuseScore >= 20) {
    abuseHistory += 6;
    uniquePush(reasons, "当前IP滥用中");
  }

  abuseHistory = clamp(abuseHistory, 0, 100);

  let level = "clean";
  let tier = "优质专线/干净企业线";

  if (abuseHistory > 70) {
    level = "bad";
    tier = "高风险IDC/垃圾机房";
  } else if (abuseHistory > 50) {
    level = "bad";
    tier = "共享IDC/高风险云";
  } else if (abuseHistory > 30) {
    level = "neutral";
    tier = "普通商宽/中性企业线";
  } else if (abuseHistory > 15) {
    level = "neutral";
    tier = "较干净商宽/企业线";
  }

  return {
    abuseHistory: abuseHistory,
    level: level,
    tier: tier,
    reason: reasons.length ? reasons.join(" / ") : "无明显异常"
  };
}

function getASNDensity(risk) {
  let density = 0;

  density += risk.sharedFeel * 0.58;
  density += risk.airportSuspicion * 0.35;
  density += risk.platformRisk * 0.18;
  density += risk.vpnProbability * 0.12;

  if (risk.networkCategory === "数据中心/服务器") density += 28;
  if (risk.networkCategory === "机房宽带嫌疑") density += 18;
  if (risk.networkCategory === "ISP底子 / 共享嫌疑") density += 10;
  if (risk.networkCategory === "商宽/企业宽带") density += 6;

  if (risk.majorISP) density -= 10;
  if (isTMNetLike(risk.orgText || "", risk.ispText || "", risk.asText || "")) density -= 8;
  if (risk.nativeFeel >= 70) density -= 8;
  if (risk.abuseScore === 0) density -= 4;
  if (!risk.proxyExit && !risk.cloudNativeDatacenter && !risk.isASNDatacenter) density -= 4;

  density = clamp(Math.round(density), 0, 100);

  let label = "低密度";
  if (density > 65) label = "高密度";
  else if (density > 35) label = "中密度";

  return {
    density: density,
    label: label
  };
}

function getSegmentPollution(risk, ipApi) {
  let score = 0;
  const text = lower([ipApi && ipApi.as, ipApi && ipApi.org, ipApi && ipApi.isp].join(" "));

  if (risk.abuseScore >= 50) score += 25;
  else if (risk.abuseScore >= 20) score += 12;
  else if (risk.abuseScore > 0) score += 4;

  if (risk.totalReports >= 10) score += 12;
  else if (risk.totalReports >= 5) score += 6;

  if (risk.cloudNativeDatacenter) score += 18;
  if (risk.isASNDatacenter) score += 16;
  if (risk.hostingLikeOrg) score += 10;
  if (risk.networkCategory === "数据中心/服务器") score += 18;
  if (risk.networkCategory === "机房宽带嫌疑") score += 12;
  if (risk.networkCategory === "ISP底子 / 共享嫌疑") score += 6;

  if (isIspLikeText(text)) score -= 10;
  if (risk.majorISP) score -= 10;
  if (isTMNetLike(text, text, text)) score -= 8;
  if (!risk.proxyExit && !risk.cloudNativeDatacenter && !risk.isASNDatacenter) score -= 6;

  score = clamp(score, 0, 100);
  return {
    score: score,
    level: score <= 20 ? "低" : score <= 50 ? "中" : "高"
  };
}

function classifyLineQuality(risk, asnMeta, asnDensity, ipApi) {
  const all = lower([ipApi && ipApi.as, ipApi && ipApi.isp, ipApi && ipApi.org].join(" "));
  const tmNet = isTMNetLike(ipApi && ipApi.org, ipApi && ipApi.isp, ipApi && ipApi.as);

  const strongEnterprise =
    all.indexOf("eons data") !== -1 ||
    all.indexOf("leased line") !== -1 ||
    all.indexOf("carrier ethernet") !== -1 ||
    all.indexOf("metro ethernet") !== -1 ||
    all.indexOf("dedicated internet") !== -1 ||
    all.indexOf("dedicated internet access") !== -1 ||
    all.indexOf("mpls") !== -1;

  const weakEnterprise =
    /\benterprise\b/i.test(all) ||
    /\bbusiness\b/i.test(all);

  if (
    !risk.blacklisted &&
    !risk.attackInvolved &&
    !risk.cloudNativeDatacenter &&
    !risk.isASNDatacenter &&
    !risk.proxyExit &&
    risk.abuseScore < 10 &&
    asnDensity.density <= 28 &&
    (
      risk.networkCategory === "商宽/企业宽带" ||
      strongEnterprise ||
      tmNet ||
      (weakEnterprise && risk.nativeFeel >= 68 && risk.sharedFeel <= 25)
    ) &&
    risk.nativeFeel >= 58 &&
    risk.sharedFeel <= 32 &&
    (asnMeta.level === "clean" || asnMeta.abuseHistory <= 25)
  ) {
    return {
      label: "🟢 优质专线 / 干净企业线",
      level: "good",
      desc: "更像独立企业出口、专线或较干净商业线路，不像机场池或高共享IDC"
    };
  }

  if (
    !risk.blacklisted &&
    !risk.attackInvolved &&
    !risk.proxyExit &&
    !risk.cloudNativeDatacenter &&
    risk.networkCategory === "商宽/企业宽带" &&
    asnDensity.density <= 52 &&
    risk.sharedFeel <= 48
  ) {
    return {
      label: "🟡 普通商宽 / 中性企业线",
      level: "mid",
      desc: "偏商宽或普通企业用途，整体中性，可用但不建议按优质家宽/独享专线看待"
    };
  }

  if (
    !risk.blacklisted &&
    !risk.attackInvolved &&
    (
      risk.networkCategory === "ISP底子 / 共享嫌疑" ||
      risk.networkCategory === "机房宽带嫌疑"
    ) &&
    asnDensity.density <= 68 &&
    risk.sharedFeel <= 70
  ) {
    return {
      label: "🟠 小型IDC / 共享专线嫌疑",
      level: "midbad",
      desc: "底子不一定很脏，但共享、池化、机场化或轻机房痕迹明显，敏感用途不建议"
    };
  }

  return {
    label: "🔴 垃圾机房 / 高风险 IDC",
    level: "bad",
    desc: "共享密度高、机房/云特征明显，更像机场池、批量代理池或高风险IDC"
  };
}

/*************** 展示格式 ***************/
function formatAbuseScore(abuse, fromCache) {
  if (!ABUSEIPDB_KEY) return { text: "未启用", level: "warn" };
  if (!abuse || !abuse.data) return { text: "请求失败", level: "fail" };
  const s = Number(abuse.data.abuseConfidenceScore || 0);
  const suffix = fromCache ? "（缓存）" : "";
  if (s === 0) return { text: "低风险（" + s + "）" + suffix, level: "ok" };
  if (s < 25) return { text: "轻微风险（" + s + "）" + suffix, level: "warn" };
  if (s < 50) return { text: "一般风险（" + s + "）" + suffix, level: "warn" };
  return { text: "高风险（" + s + "）" + suffix, level: "fail" };
}

function formatIpApiRisk(ipApi) {
  if (!ipApi) return { text: "未知", level: "warn" };
  if (ipApi.hosting) return { text: "机房/托管网络", level: "fail" };
  if (ipApi.proxy) return { text: "代理出口", level: "warn" };
  return { text: "普通网络", level: "ok" };
}

function formatCz88Risk(cz88) {
  const t = String((cz88 && cz88.netWorkType) || "");
  if (!t) return { text: "未返回", level: "warn" };
  if (t.indexOf("机房") !== -1 || t.indexOf("数据中心") !== -1) return { text: t, level: "fail" };
  if (t.indexOf("专线") !== -1 || t.indexOf("企业") !== -1 || t.indexOf("商务") !== -1) return { text: t, level: "warn" };
  return { text: t, level: "ok" };
}

function formatRiskPercent(value) {
  const n = clamp(Math.round(Number(value) || 0), 0, 100);
  if (n <= 10) return { text: n + "%（极低）", level: "ok" };
  if (n <= 25) return { text: n + "%（低）", level: "ok" };
  if (n <= 45) return { text: n + "%（偏低）", level: "warn" };
  if (n <= 65) return { text: n + "%（中等）", level: "warn" };
  if (n <= 85) return { text: n + "%（偏高）", level: "fail" };
  return { text: n + "%（高）", level: "fail" };
}

function formatNativeFeel(score) {
  const n = Number(score);
  if (isNaN(n)) return { text: "-", level: "warn" };
  if (n >= 85) return { text: n + "（高原生）", level: "ok" };
  if (n >= 60) return { text: n + "（一般原生）", level: "warn" };
  return { text: n + "（低原生）", level: "fail" };
}

function formatSharedFeel(score) {
  const n = Number(score);
  if (isNaN(n)) return { text: "-", level: "warn" };
  if (n <= 20) return { text: n + "（低共享）", level: "ok" };
  if (n <= 50) return { text: n + "（中共享）", level: "warn" };
  return { text: n + "（高共享）", level: "fail" };
}

function formatHistoryBehavior(score) {
  const n = Number(score);
  if (isNaN(n)) return { text: "-", level: "warn" };
  if (n >= 85) return { text: n + "（稳定）", level: "ok" };
  if (n >= 60) return { text: n + "（一般）", level: "warn" };
  return { text: n + "（较杂）", level: "fail" };
}

function formatProxyTier(risk) {
  if (risk.highRiskProxy) return { text: "高风险", level: "fail" };
  if (risk.suspiciousProxy) return { text: "可疑", level: "warn" };
  return { text: "正常", level: "ok" };
}

function formatShareCount(score) {
  const n = clamp(Math.round(Number(score) || 0), 0, 100);
  if (n <= 10) return { text: "1–10（低）", level: "ok" };
  if (n <= 30) return { text: "10–30（较低）", level: "ok" };
  if (n <= 60) return { text: "30–80（一般）", level: "warn" };
  return { text: "80+（偏高）", level: "fail" };
}

function formatRiskBand(n) {
  const v = clamp(Math.round(Number(n) || 0), 0, 100);
  if (v <= 20) return { text: v + "（低）", level: "ok" };
  if (v <= 50) return { text: v + "（中）", level: "warn" };
  return { text: v + "（高）", level: "fail" };
}

function formatAirportSuspicion(v) {
  const n = clamp(Math.round(Number(v) || 0), 0, 100);
  if (n <= 25) return { text: "低", level: "ok" };
  if (n <= 55) return { text: "有一定概率", level: "warn" };
  return { text: "偏高", level: "fail" };
}

function adviceByRisk(score, goodText, midText, badText) {
  const s = clamp(Math.round(Number(score) || 0), 0, 100);
  if (s <= 30) return goodText;
  if (s <= 60) return midText;
  return badText;
}

/*************** 行为模型 ***************/
function calcBehaviorModel(risk) {
  let registerRisk = 0;
  let loginRisk = 0;
  let browseRisk = 0;

  registerRisk += Math.round(risk.riskValue * 0.35);
  registerRisk += Math.round((100 - risk.nativeFeel) * 0.25);
  registerRisk += Math.round(risk.sharedFeel * 0.2);
  registerRisk += Math.round(risk.associationRisk * 0.2);
  if (risk.suspiciousProxy) registerRisk += 18;
  if (risk.highRiskProxy) registerRisk += 25;
  if (risk.blacklisted) registerRisk += 30;
  if (risk.networkCategory === "运营商移动网络" || risk.networkCategory === "移动数据") registerRisk += 8;
  if (risk.networkCategory === "机房宽带嫌疑") registerRisk += 10;
  if (risk.networkCategory === "ISP底子 / 共享嫌疑") registerRisk += 6;
  if (risk.networkCategory === "数据中心/服务器") registerRisk += 16;

  loginRisk += Math.round(risk.riskValue * 0.3);
  loginRisk += Math.round((100 - risk.nativeFeel) * 0.2);
  loginRisk += Math.round(risk.sharedFeel * 0.2);
  loginRisk += Math.round(risk.platformRisk * 0.2);
  if (risk.suspiciousProxy) loginRisk += 15;
  if (risk.blacklisted) loginRisk += 25;
  if (risk.airportSuspicion >= 60) loginRisk += 10;
  if (risk.networkCategory === "机房宽带嫌疑") loginRisk += 8;
  if (risk.networkCategory === "ISP底子 / 共享嫌疑") loginRisk += 5;
  if (risk.networkCategory === "数据中心/服务器") loginRisk += 12;

  browseRisk += Math.round(risk.riskValue * 0.18);
  browseRisk += Math.round((100 - risk.nativeFeel) * 0.12);
  browseRisk += Math.round(risk.sharedFeel * 0.12);
  if (risk.suspiciousProxy) browseRisk += 8;
  if (risk.blacklisted) browseRisk += 15;
  if (risk.networkCategory === "数据中心/服务器") browseRisk += 8;

  if (risk.majorISP && !risk.blacklisted && !risk.cloudNativeDatacenter && !risk.proxyExit) {
    registerRisk -= 6;
    loginRisk -= 5;
    browseRisk -= 4;
  }

  registerRisk = clamp(registerRisk, 0, 100);
  loginRisk = clamp(loginRisk, 0, 100);
  browseRisk = clamp(browseRisk, 0, 100);

  return {
    registerRisk: registerRisk,
    loginRisk: loginRisk,
    browseRisk: browseRisk,
    registerAdvice: adviceByRisk(registerRisk, "推荐", "谨慎", "不建议"),
    loginAdvice: adviceByRisk(loginRisk, "推荐", "可用", "谨慎"),
    browseAdvice: adviceByRisk(browseRisk, "推荐", "可用", "问题不大")
  };
}

/*************** 本地拟合（非真实 API） ***************/
function simulateMultiSourceScores(risk, ipApi) {
  const riskValue = Math.round(risk.riskValue || 0);
  const shared = Math.round(risk.sharedFeel || 0);

  let ippure = { text: "低风险（1）", level: "ok" };
  if (risk.platformAssociationLevel === "高" || risk.mobileBehaviorRisk >= 60) {
    ippure = { text: "行为风险偏高（" + Math.max(risk.mobileBehaviorRisk, 60) + "）", level: "fail" };
  } else if (risk.mobileBehaviorRisk >= 35 || riskValue > 35) {
    ippure = { text: "中风险（" + Math.max(2, Math.round((risk.mobileBehaviorRisk + riskValue) / 30)) + "）", level: "warn" };
  }

  let scamalytics = { text: "低风险（0）", level: "ok" };
  const scamScore = Math.min(100, Math.round(risk.abuseScore * 0.6 + riskValue * 0.25 + shared * 0.1));
  if (scamScore > 15) scamalytics = { text: "中风险（" + scamScore + "）", level: "warn" };
  if (scamScore > 40) scamalytics = { text: "高风险（" + scamScore + "）", level: "fail" };

  let ip2location = { text: "低风险（3）", level: "ok" };
  if (risk.networkCategory === "数据中心/服务器") {
    ip2location = { text: "数据中心（DCH）", level: "fail" };
  } else if (risk.networkCategory === "机房宽带嫌疑") {
    ip2location = { text: "宽带嫌疑（可疑）", level: "warn" };
  } else if (risk.networkCategory === "ISP底子 / 共享嫌疑") {
    ip2location = { text: "ISP底子（共享嫌疑）", level: "warn" };
  } else if (risk.networkCategory === "商宽/企业宽带") {
    ip2location = { text: "商业宽带（中性）", level: "warn" };
  } else if (risk.networkCategory === "移动数据" || risk.networkCategory === "运营商移动网络") {
    ip2location = { text: "移动网络（MOB）", level: "ok" };
  } else if (risk.networkCategory === "运营商ISP网络" || risk.networkCategory === "住宅宽带") {
    ip2location = { text: "家庭宽带 / ISP", level: "ok" };
  }

  let ipregistry = { text: "干净（Clean）", level: "ok" };
  if (ipApi.proxy) ipregistry = { text: "有标记（Proxy）", level: "fail" };
  else if (risk.networkCategory === "数据中心/服务器") {
    ipregistry = { text: "有标记（Hosting）", level: "fail" };
  } else if (risk.networkCategory === "机房宽带嫌疑") {
    ipregistry = { text: "有标记（Hosting/Suspicious）", level: "fail" };
  } else if (risk.networkCategory === "ISP底子 / 共享嫌疑") {
    ipregistry = { text: "有标记（Shared ISP）", level: "warn" };
  } else if (risk.networkCategory === "商宽/企业宽带") {
    ipregistry = { text: "有标记（Suspicious）", level: "warn" };
  }

  return { ippure, scamalytics, ip2location, ipregistry };
}

function inferAsnType(ipApi, risk) {
  const asText = lower(ipApi && ipApi.as);
  const ispText = lower(ipApi && ipApi.isp);
  const orgText = lower(ipApi && ipApi.org);
  const all = asText + " " + ispText + " " + orgText;

  if (isTMNetLike(orgText, ispText, asText)) return "主流运营商ASN";

  if (risk.isASNDatacenter || risk.cloudNativeDatacenter || matchASNDatacenterText(all)) {
    return "云/机房ASN";
  }

  if (
    (risk.networkCategory === "移动数据" || risk.networkCategory === "运营商移动网络") &&
    hasAnySafe(all, [
      "mobile", "wireless", "移动", "cellular", "rakuten mobile", "rakuten",
      "telecom mobile", "t-mobile", "verizon", "at&t", "att"
    ])
  ) {
    return "移动网络ASN";
  }

  if (isMajorISP(ipApi && ipApi.org, ipApi && ipApi.isp, ipApi && ipApi.as)) {
    return "主流运营商ASN";
  }

  if (risk.networkCategory === "ISP底子 / 共享嫌疑") return "共享ISP/池化ASN";
  if (risk.networkCategory === "商宽/企业宽带") return "商宽/企业ASN";
  if (risk.networkCategory === "机房宽带嫌疑") return "轻机房/托管嫌疑ASN";
  if (risk.networkCategory === "住宅宽带" || risk.networkCategory === "运营商ISP网络") return "住宅/运营商ASN";

  return "普通ASN";
}

function inferIpTypeLabel(risk, ipApi, cz88) {
  if (risk.networkCategory === "数据中心/服务器") return "数据中心 / 服务器";
  if (risk.networkCategory === "机房宽带嫌疑") return "机房宽带嫌疑";
  if (risk.networkCategory === "ISP底子 / 共享嫌疑") return "ISP底子 / 共享嫌疑";
  if (risk.networkCategory === "商宽 / 企业用途" || risk.networkCategory === "商宽/企业宽带") return "商宽 / 企业用途";
  if (risk.networkCategory === "住宅宽带") return "住宅宽带";
  if (risk.networkCategory === "运营商ISP网络") return "运营商 ISP 网络";
  if (risk.networkCategory === "运营商移动网络") return "运营商移动网络";
  if (risk.networkCategory === "移动数据") return "移动数据";
  if (ipApi.proxy) return "代理出口";
  const raw = String((cz88 && cz88.netWorkType) || "");
  return raw || "普通网络";
}
/*************** 核心分析 ***************/
function analyzeRisk(ipApi, cz88, abuse) {
  const rawNetwork = String((cz88 && cz88.netWorkType) || "");
  const rawLower = lower(rawNetwork);

  const asText = lower(ipApi && ipApi.as);
  const ispText = lower(ipApi && ipApi.isp);
  const orgText = lower(ipApi && ipApi.org);

  const majorISP = isMajorISP(ipApi && ipApi.org, ipApi && ipApi.isp, ipApi && ipApi.as);
  const tmNetLike = isTMNetLike(ipApi && ipApi.org, ipApi && ipApi.isp, ipApi && ipApi.as);
  const cloudProvider = detectCloudProvider(ipApi, cz88);

  let isResidential =
    rawLower.indexOf("住宅") !== -1 ||
    rawLower.indexOf("家庭") !== -1 ||
    rawLower.indexOf("家宽") !== -1 ||
    rawLower.indexOf("residential") !== -1 ||
    rawLower.indexOf("cable") !== -1 ||
    rawLower.indexOf("dsl") !== -1 ||
    rawLower.indexOf("unifi") !== -1;

  let isBusinessLine =
    rawLower.indexOf("商宽") !== -1 ||
    rawLower.indexOf("企业") !== -1 ||
    rawLower.indexOf("商务") !== -1 ||
    rawLower.indexOf("专线") !== -1 ||
    rawLower.indexOf("business") !== -1 ||
    rawLower.indexOf("leased line") !== -1;

  let isDatacenter =
    rawLower.indexOf("机房") !== -1 ||
    rawLower.indexOf("数据中心") !== -1 ||
    rawLower.indexOf("hosting") !== -1 ||
    rawLower.indexOf("dch") !== -1 ||
    ipApi.hosting === true;

  let isMobile =
    rawLower.indexOf("移动") !== -1 ||
    rawLower.indexOf("蜂窝") !== -1 ||
    rawLower.indexOf("mobile") !== -1 ||
    rawLower.indexOf("cellular") !== -1;

  const allAsnText = asText + " " + ispText + " " + orgText;

  const cloudHitOnly = cloudProvider.hit;

  const cloudInfraSignal =
    cloudProvider.hit &&
    (
      ipApi.hosting === true ||
      rawLower.indexOf("机房") !== -1 ||
      rawLower.indexOf("数据中心") !== -1 ||
      matchASNDatacenterText(allAsnText)
    );

  const isASNResidential =
    (
      hasAnySafe(allAsnText, ["broadband", "residential", "cable", "fiber", "ftth", "家庭", "住宅", "家宽", "dsl", "unifi"]) ||
      tmNetLike
    ) &&
    !isMobile &&
    !isBusinessLine;

  const isASNDatacenter =
    cloudInfraSignal ||
    (
      matchASNDatacenterText(allAsnText) &&
      !majorISP &&
      !isASNResidential &&
      !tmNetLike
    );

  const cloudNativeDatacenter = cloudInfraSignal;

  const transitUpstreamHit = matchTransitUpstream(allAsnText, majorISP);
  const hostingLikeOrg = matchHostingLikeOrg(orgText + " " + ispText);

  let humanMeta = getHumanScoreMeta(cz88 && cz88.score, cz88);
  let humanScore = humanMeta.score;

  if (
    majorISP &&
    humanScore !== null &&
    humanScore < 15 &&
    !ipApi.proxy &&
    !ipApi.hosting &&
    !cloudNativeDatacenter
  ) {
    humanScore = Math.min(60, humanScore + 24);
    humanMeta = {
      score: humanScore,
      text: humanScore + "（运营商修正后）",
      suspicious: humanScore < 40,
      missing: false
    };
  }

  const orgBusinessStrong =
    !majorISP &&
    /\b(enterprise|aviation)\b/i.test(orgText) &&
    /\b(network|telecom|communications?)\b/i.test(orgText + " " + ispText);

  const orgBusinessWeak =
    !majorISP &&
    /\bbusiness\b/i.test(orgText) &&
    /\b(network|telecom|communications?)\b/i.test(orgText + " " + ispText);

  let abuseScore = 0;
  let totalReports = 0;
  if (abuse && abuse.data) {
    abuseScore = Number(abuse.data.abuseConfidenceScore || 0);
    totalReports = Number(abuse.data.totalReports || 0);
  }

  const enterpriseCleanShield =
    !ipApi.proxy &&
    !ipApi.hosting &&
    abuseScore < 10 &&
    humanScore !== null &&
    humanScore >= 60 &&
    !cloudNativeDatacenter &&
    !isASNDatacenter;

  if (isASNDatacenter || (cloudNativeDatacenter && (ipApi.hosting || rawLower.indexOf("机房") !== -1 || rawLower.indexOf("数据中心") !== -1))) {
    isDatacenter = true;
    isResidential = false;
    isBusinessLine = false;
    isMobile = false;
  } else if (isMobile) {
    isResidential = false;
  } else if (isASNResidential && !isDatacenter && !isBusinessLine) {
    isResidential = true;
  }

  let dedicatedSuspiciousCount = 0;
  if (orgBusinessStrong) dedicatedSuspiciousCount += 1;
  if (orgBusinessWeak) dedicatedSuspiciousCount += 0.5;
  if (transitUpstreamHit && !majorISP && !enterpriseCleanShield) dedicatedSuspiciousCount += 1;
  if (hostingLikeOrg && !enterpriseCleanShield) dedicatedSuspiciousCount += 1;
  if (humanScore !== null && humanScore < 35 && !enterpriseCleanShield) dedicatedSuspiciousCount += 1;

  const dedicatedLineSuspicious =
    rawLower.indexOf("专线") !== -1 &&
    !majorISP &&
    dedicatedSuspiciousCount >= 2 &&
    !tmNetLike;

  const ispLikeCandidate = isRealISPLineCandidate(ipApi, cz88, {
    cloudNativeDatacenter: cloudNativeDatacenter,
    isASNDatacenter: isASNDatacenter,
    transitUpstreamHit: transitUpstreamHit,
    hostingLikeOrg: hostingLikeOrg
  }, abuseScore);

  let networkCategory = "普通网络";

  if (isDatacenter) {
    networkCategory = "数据中心/服务器";
  } else if (isMobile) {
    networkCategory = majorISP ? "运营商移动网络" : "移动数据";
  } else if (majorISP) {
    networkCategory = "运营商ISP网络";
  } else if (dedicatedLineSuspicious) {
    networkCategory = ispLikeCandidate ? "ISP底子 / 共享嫌疑" : "机房宽带嫌疑";
  } else if (isBusinessLine) {
    if (enterpriseCleanShield || tmNetLike) {
      networkCategory = "商宽/企业宽带";
    } else if (ispLikeCandidate) {
      networkCategory = "商宽/企业宽带";
    } else if (hostingLikeOrg || transitUpstreamHit) {
      networkCategory = "ISP底子 / 共享嫌疑";
    } else {
      networkCategory = "商宽/企业宽带";
    }
  } else if (isResidential || isASNResidential) {
    networkCategory = "住宅宽带";
  } else if (rawLower.indexOf("宽带") !== -1) {
    networkCategory = orgBusinessStrong ? "商宽/企业宽带" : "住宅宽带";
  } else if (ispLikeCandidate) {
    networkCategory = "ISP底子 / 共享嫌疑";
  }

  if (tmNetLike && !isDatacenter && !ipApi.proxy && !cloudNativeDatacenter) {
    if (networkCategory === "ISP底子 / 共享嫌疑") networkCategory = "运营商ISP网络";
    if (networkCategory === "机房宽带嫌疑") networkCategory = "商宽/企业宽带";
  }

  let score = 88;
  const tags = [];

  let proxyExit = false;
  let suspiciousProxy = false;
  let highRiskProxy = false;
  let cloudService = false;

  let blacklisted = false;
  let blacklistSuspicious = false;
  let abuseNode = false;
  let attackInvolved = false;
  let anonymousVpnStyle = false;
  let publicProxyStyle = false;
  let torStyle = false;

  if (ipApi.proxy === true) {
    proxyExit = true;
    suspiciousProxy = true;
    anonymousVpnStyle = true;
    publicProxyStyle = true;
    uniquePush(tags, "代理出口");
  }

  if (ipApi.hosting === true) {
    cloudService = true;
    suspiciousProxy = true;
    uniquePush(tags, "机房托管");
  }

  if (isASNDatacenter || cloudNativeDatacenter) {
    cloudService = true;
    suspiciousProxy = true;
    uniquePush(tags, "云/机房特征");
  } else if (cloudHitOnly) {
    uniquePush(tags, "云厂商品牌命中");
  }

  if (transitUpstreamHit && !majorISP && !enterpriseCleanShield) uniquePush(tags, "Transit上游");
  if (hostingLikeOrg && !majorISP && !enterpriseCleanShield) uniquePush(tags, "组织疑似Hosting");
  if (tmNetLike) uniquePush(tags, "TMNet/TelekomMalaysia");

  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") {
    score += 6;
    uniquePush(tags, "ISP网络");
  } else if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") {
    score += 2;
    uniquePush(tags, "移动网络");
  } else if (networkCategory === "ISP底子 / 共享嫌疑") {
    score -= 4;
    suspiciousProxy = true;
    uniquePush(tags, "ISP底子");
    uniquePush(tags, "共享嫌疑");
  } else if (networkCategory === "商宽/企业宽带") {
    score -= 6;
    uniquePush(tags, "企业用途");
  } else if (networkCategory === "机房宽带嫌疑") {
    score -= 12;
    suspiciousProxy = true;
    uniquePush(tags, "机房宽带嫌疑");
  } else if (networkCategory === "数据中心/服务器") {
    score -= 24;
    suspiciousProxy = true;
    uniquePush(tags, "机房网络");
  }

  if (dedicatedLineSuspicious && networkCategory !== "ISP底子 / 共享嫌疑") {
    score -= 4;
    suspiciousProxy = true;
    uniquePush(tags, "专线可疑");
  }

  if (humanScore !== null) {
    if (humanScore >= 80) score += 6;
    else if (humanScore >= 60) score += 2;
    else if (humanScore >= 40) {
      score -= 5;
      uniquePush(tags, "原生一般");
    } else if (humanScore >= 20) {
      score -= 10;
      uniquePush(tags, "真人概率偏低");
    } else {
      score -= majorISP ? 6 : 14;
      uniquePush(tags, majorISP ? "真人分偏低（已降权）" : "高度可疑");
    }
  } else if (!(networkCategory === "运营商移动网络" || networkCategory === "移动数据")) {
    score -= 6;
    uniquePush(tags, "数据缺失");
  }

  if (abuseScore >= 10 || totalReports >= 3) {
    abuseNode = true;
    uniquePush(tags, "滥用记录");
  }

  if (abuseScore >= 25 || totalReports >= 5) {
    blacklisted = true;
    uniquePush(tags, "黑名单嫌疑");
  }

  if (abuseScore >= 50 || totalReports >= 10) {
    attackInvolved = true;
    uniquePush(tags, "攻击风险");
  }

  if (abuseScore >= 80) score -= 22;
  else if (abuseScore >= 50) score -= 16;
  else if (abuseScore >= 25) score -= 9;
  else if (abuseScore >= 10) score -= 4;
  else if (abuseScore > 0) score -= 1;

  if (tmNetLike && abuseScore < 10 && !proxyExit && !cloudNativeDatacenter) score += 4;

  let riskValue = 8;
  let nativeFeel = 55;
  let sharedFeel = 20;

  if (ipApi.proxy === true) riskValue += 28;
  if (ipApi.hosting === true) riskValue += 20;
  if (networkCategory === "数据中心/服务器") riskValue += 24;
  if (networkCategory === "机房宽带嫌疑") riskValue += 18;
  if (networkCategory === "ISP底子 / 共享嫌疑") riskValue += 10;
  if (networkCategory === "商宽/企业宽带") riskValue += 10;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") riskValue += 4;
  if (cloudNativeDatacenter) riskValue += 22;
  else if (cloudHitOnly) riskValue += 8;
  if (dedicatedLineSuspicious && networkCategory !== "ISP底子 / 共享嫌疑") riskValue += 8;
  if (transitUpstreamHit && !majorISP && !enterpriseCleanShield) riskValue += 6;

  if (humanScore !== null) {
    if (humanScore >= 80) riskValue -= 8;
    else if (humanScore >= 60) riskValue -= 2;
    else if (humanScore >= 40) riskValue += 4;
    else if (humanScore >= 20) riskValue += 8;
    else riskValue += majorISP ? 4 : 14;
  } else if (!(networkCategory === "运营商移动网络" || networkCategory === "移动数据")) {
    riskValue += 8;
  }

  riskValue += Math.min(28, Math.round(abuseScore * 0.25));
  if (totalReports >= 10) riskValue += 10;
  else if (totalReports >= 5) riskValue += 5;
  else if (totalReports > 0) riskValue += 2;
  if (tmNetLike && !proxyExit && !cloudNativeDatacenter && abuseScore < 10) riskValue -= 6;
  riskValue = clamp(riskValue, 0, 100);

  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") nativeFeel += 18;
  if (networkCategory === "ISP底子 / 共享嫌疑") nativeFeel += 2;
  if (networkCategory === "商宽/企业宽带") nativeFeel += 3;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") nativeFeel += 8;
  if (networkCategory === "数据中心/服务器") nativeFeel -= 30;
  if (networkCategory === "机房宽带嫌疑") nativeFeel -= 18;
  if (ipApi.hosting === true) nativeFeel -= 16;
  if (ipApi.proxy === true) nativeFeel -= 18;
  if (cloudNativeDatacenter) nativeFeel -= 20;
  else if (cloudHitOnly) nativeFeel -= 6;
  if (dedicatedLineSuspicious && networkCategory !== "ISP底子 / 共享嫌疑") nativeFeel -= 6;
  if (transitUpstreamHit && !majorISP && !enterpriseCleanShield) nativeFeel -= 4;

  if (humanScore !== null) {
    if (humanScore >= 80) nativeFeel += 14;
    else if (humanScore >= 60) nativeFeel += 6;
    else if (humanScore >= 40) nativeFeel -= 4;
    else if (humanScore >= 20) nativeFeel -= 8;
    else nativeFeel -= majorISP ? 8 : 16;
  }

  nativeFeel -= Math.min(12, Math.round(abuseScore * 0.12));
  if (tmNetLike && !proxyExit && !cloudNativeDatacenter) nativeFeel += 8;
  nativeFeel = clamp(nativeFeel, 0, 100);

  if (ipApi.hosting === true) sharedFeel += 20;
  if (ipApi.proxy === true) sharedFeel += 20;
  if (networkCategory === "数据中心/服务器") sharedFeel += 24;
  if (networkCategory === "机房宽带嫌疑") sharedFeel += 16;
  if (networkCategory === "ISP底子 / 共享嫌疑") sharedFeel += 12;
  if (networkCategory === "商宽/企业宽带") sharedFeel += 8;
  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") sharedFeel -= 6;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") sharedFeel += 6;
  if (cloudNativeDatacenter) sharedFeel += 18;
  else if (cloudHitOnly) sharedFeel += 6;
  if (dedicatedLineSuspicious && networkCategory !== "ISP底子 / 共享嫌疑") sharedFeel += 8;

  if (humanScore !== null) {
    if (humanScore >= 80) sharedFeel -= 6;
    else if (humanScore >= 60) sharedFeel -= 2;
    else if (humanScore >= 40) sharedFeel += 4;
    else if (humanScore >= 20) sharedFeel += 8;
    else sharedFeel += majorISP ? 6 : 12;
  }

  sharedFeel += Math.min(18, Math.round(abuseScore * 0.18));
  if (totalReports >= 10) sharedFeel += 10;
  if (tmNetLike && !proxyExit && !cloudNativeDatacenter) sharedFeel -= 8;
  sharedFeel = clamp(sharedFeel, 0, 100);

  let historyBehavior = 82;
  historyBehavior -= Math.min(50, Math.round(abuseScore * 0.5));
  historyBehavior -= Math.min(20, totalReports);
  if (ipApi.proxy === true) historyBehavior -= 10;
  if (ipApi.hosting === true) historyBehavior -= 6;
  if (humanScore !== null && humanScore < 20 && !majorISP) historyBehavior -= 8;
  if (networkCategory === "机房宽带嫌疑") historyBehavior -= 6;
  if (networkCategory === "数据中心/服务器") historyBehavior -= 10;
  if (tmNetLike && abuseScore < 10) historyBehavior += 4;
  historyBehavior = clamp(historyBehavior, 0, 100);

  let shareCountScore = sharedFeel;
  if ((networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") && historyBehavior >= 80) {
    shareCountScore -= 4;
  }
  if (networkCategory === "数据中心/服务器") shareCountScore += 8;
  if (networkCategory === "机房宽带嫌疑") shareCountScore += 6;
  if (networkCategory === "ISP底子 / 共享嫌疑") shareCountScore += 4;
  shareCountScore = clamp(shareCountScore, 0, 100);

  let dataCompletenessScore = 100;
  if (!rawNetwork) dataCompletenessScore -= 35;
  if (humanMeta.missing) dataCompletenessScore -= 35;
  if (ABUSEIPDB_KEY && !abuse) dataCompletenessScore -= 30;
  dataCompletenessScore = clamp(dataCompletenessScore, 0, 100);

  let dataCompleteness = "高";
  if (dataCompletenessScore >= 80) dataCompleteness = "高";
  else if (dataCompletenessScore >= 50) dataCompleteness = "中";
  else dataCompleteness = "低";

  let residentialScore = 40;
  let businessScore = 26;
  let datacenterScore = 22;

  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") residentialScore += 18;
  if (networkCategory === "ISP底子 / 共享嫌疑") {
    residentialScore += 8;
    businessScore += 10;
  }
  if (networkCategory === "商宽/企业宽带") businessScore += 24;
  if (networkCategory === "机房宽带嫌疑") datacenterScore += 20;
  if (networkCategory === "数据中心/服务器") datacenterScore += 34;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") residentialScore += 6;

  if (majorISP) residentialScore += 6;
  if (orgBusinessStrong) businessScore += 12;
  else if (orgBusinessWeak) businessScore += 6;
  if (tmNetLike) residentialScore += 8;

  if (dedicatedLineSuspicious && networkCategory !== "ISP底子 / 共享嫌疑") datacenterScore += 10;

  if (transitUpstreamHit && !majorISP && !enterpriseCleanShield) {
    businessScore += 4;
    datacenterScore += 8;
  }

  if (humanScore !== null) {
    if (humanScore >= 80) residentialScore += 8;
    else if (humanScore >= 60) residentialScore += 4;
    else if (humanScore < 20 && !majorISP) {
      residentialScore -= 10;
      datacenterScore += 10;
      businessScore += 6;
    }
  }

  if (ipApi.hosting === true) {
    residentialScore -= 18;
    datacenterScore += 20;
  } else if (cloudNativeDatacenter) {
    residentialScore -= 12;
    datacenterScore += 14;
  } else if (cloudHitOnly) {
    residentialScore -= 4;
    datacenterScore += 4;
  }

  if (ipApi.proxy === true) {
    residentialScore -= 12;
    datacenterScore += 12;
  }

  residentialScore -= Math.min(18, Math.round(abuseScore * 0.18));
  datacenterScore += Math.min(16, Math.round(abuseScore * 0.16));

  residentialScore = clamp(residentialScore, 0, 100);
  businessScore = clamp(businessScore, 0, 100);
  datacenterScore = clamp(datacenterScore, 0, 100);

  const totalFeatureScore = residentialScore + businessScore + datacenterScore;

  let residentialProbability = 0;
  let businessProbability = 0;
  let datacenterProbability = 0;

  if (totalFeatureScore > 0) {
    residentialProbability = Math.round(residentialScore / totalFeatureScore * 100);
    businessProbability = Math.round(businessScore / totalFeatureScore * 100);
    datacenterProbability = Math.round(datacenterScore / totalFeatureScore * 100);
  }

  const probFix = 100 - (residentialProbability + businessProbability + datacenterProbability);
  if (probFix !== 0) {
    if (residentialProbability >= businessProbability && residentialProbability >= datacenterProbability) {
      residentialProbability += probFix;
    } else if (businessProbability >= residentialProbability && businessProbability >= datacenterProbability) {
      businessProbability += probFix;
    } else {
      datacenterProbability += probFix;
    }
  }

  const residentialLikeSurface =
    isResidential ||
    isASNResidential ||
    rawLower.indexOf("住宅") !== -1 ||
    rawLower.indexOf("家宽") !== -1 ||
    rawLower.indexOf("家庭") !== -1 ||
    rawLower.indexOf("broadband") !== -1 ||
    rawLower.indexOf("cable") !== -1 ||
    rawLower.indexOf("dsl") !== -1 ||
    rawLower.indexOf("unifi") !== -1 ||
    tmNetLike;

  let fakeResidentialRisk = residentialLikeSurface ? 18 : 0;

  if (orgBusinessStrong) fakeResidentialRisk += residentialLikeSurface ? 22 : 8;
  else if (orgBusinessWeak) fakeResidentialRisk += residentialLikeSurface ? 10 : 4;

  if (humanMeta.suspicious && !majorISP) fakeResidentialRisk += residentialLikeSurface ? 12 : 6;
  if (sharedFeel >= 35) fakeResidentialRisk += residentialLikeSurface ? 12 : 6;
  if (nativeFeel <= 50) fakeResidentialRisk += residentialLikeSurface ? 12 : 6;
  if (cloudHitOnly) fakeResidentialRisk += residentialLikeSurface ? 20 : 8;
  if (networkCategory === "商宽/企业宽带") fakeResidentialRisk += residentialLikeSurface ? 18 : 6;
  if (networkCategory === "机房宽带嫌疑") fakeResidentialRisk += residentialLikeSurface ? 28 : 10;
  if (networkCategory === "数据中心/服务器") fakeResidentialRisk += residentialLikeSurface ? 32 : 12;
  if (transitUpstreamHit && !majorISP && !enterpriseCleanShield) fakeResidentialRisk += residentialLikeSurface ? 10 : 4;
  if (majorISP) fakeResidentialRisk -= residentialLikeSurface ? 18 : 6;
  if (tmNetLike) fakeResidentialRisk -= residentialLikeSurface ? 14 : 6;

  fakeResidentialRisk = clamp(fakeResidentialRisk, 0, residentialLikeSurface ? 100 : 40);

  let llmSummary = "三类倾向接近，需结合主分类综合判断";
  if (residentialProbability >= businessProbability && residentialProbability >= datacenterProbability) {
    llmSummary = residentialProbability >= 70 ? "家庭宽带倾向明显" : "偏家庭宽带";
  } else if (businessProbability >= residentialProbability && businessProbability >= datacenterProbability) {
    llmSummary = businessProbability >= 70 ? "商宽/企业用途倾向明显" : "偏商业宽带或企业用途";
  } else {
    llmSummary = datacenterProbability >= 70 ? "机房/数据中心倾向明显" : "偏机房宽带或共享出口";
  }

  let associationRisk = 0;
  let airportSuspicion = 0;
  let mobileBehaviorRisk = 0;
  let platformRisk = 0;
  let vpnProbability = 0;
  let strictLibraryFlag = false;

  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") {
    associationRisk = 24 + Math.round(sharedFeel * 0.35);
    airportSuspicion = 18 + Math.round(sharedFeel * 0.4);
    mobileBehaviorRisk = 20 + Math.round(sharedFeel * 0.45) + Math.round((100 - nativeFeel) * 0.15);

    if (abuseScore >= 10) {
      associationRisk += 10;
      airportSuspicion += 10;
      mobileBehaviorRisk += 12;
    }

    platformRisk += 18;
    vpnProbability += 22;
  } else {
    associationRisk = Math.round(sharedFeel * 0.35);
    airportSuspicion = Math.round(sharedFeel * 0.25);
    mobileBehaviorRisk = Math.round(sharedFeel * 0.3 + (100 - nativeFeel) * 0.15);
  }

  if (networkCategory === "ISP底子 / 共享嫌疑") {
    associationRisk += 8;
    airportSuspicion += 12;
    platformRisk += 8;
    vpnProbability += 6;
  }

  if (networkCategory === "机房宽带嫌疑") {
    airportSuspicion += 8;
    platformRisk += 10;
    vpnProbability += 12;
  }

  if (networkCategory === "数据中心/服务器") {
    platformRisk += 20;
    vpnProbability += 20;
  }

  if (nativeFeel < 50) {
    platformRisk += 18;
    vpnProbability += 18;
  }
  if (sharedFeel > 30) {
    platformRisk += 18;
    vpnProbability += 22;
  }
  if (mobileBehaviorRisk > 50) platformRisk += 12;
  if (ipApi.proxy) {
    platformRisk += 30;
    vpnProbability += 30;
  }
  if (cloudNativeDatacenter || isASNDatacenter) {
    platformRisk += 20;
    vpnProbability += 25;
  } else if (cloudHitOnly) {
    platformRisk += 6;
    vpnProbability += 8;
  }

  if (majorISP && !ipApi.proxy && !ipApi.hosting && !cloudNativeDatacenter && abuseScore === 0) {
    platformRisk -= 8;
    vpnProbability -= 8;
    airportSuspicion -= 8;
    associationRisk -= 6;
  }

  if (tmNetLike && !proxyExit && !cloudNativeDatacenter && abuseScore < 10) {
    platformRisk -= 6;
    vpnProbability -= 6;
    airportSuspicion -= 5;
    associationRisk -= 4;
  }

  associationRisk = clamp(associationRisk, 0, 100);
  airportSuspicion = clamp(airportSuspicion, 0, 100);
  mobileBehaviorRisk = clamp(mobileBehaviorRisk, 0, 100);
  platformRisk = clamp(platformRisk, 0, 100);
  vpnProbability = clamp(vpnProbability, 0, 100);

  let platformControlPressure = 0;
  platformControlPressure += Math.round(riskValue * 0.35);
  platformControlPressure += Math.round((100 - nativeFeel) * 0.25);
  platformControlPressure += Math.round(sharedFeel * 0.2);
  platformControlPressure += Math.round(associationRisk * 0.2);
  if (airportSuspicion >= 60) platformControlPressure += 12;
  if (cloudNativeDatacenter) platformControlPressure += 15;
  else if (cloudHitOnly) platformControlPressure += 5;
  if (ipApi.proxy) platformControlPressure += 20;
  if (networkCategory === "机房宽带嫌疑") platformControlPressure += 10;
  if (networkCategory === "ISP底子 / 共享嫌疑") platformControlPressure += 5;
  if (majorISP && abuseScore === 0 && !cloudNativeDatacenter) platformControlPressure -= 8;
  if (tmNetLike && abuseScore < 10 && !proxyExit) platformControlPressure -= 6;
  platformControlPressure = clamp(platformControlPressure, 0, 100);

  let platformAssociationLevel = "低";
  if (
    (networkCategory === "运营商移动网络" || networkCategory === "移动数据" || networkCategory === "机房宽带嫌疑" || networkCategory === "ISP底子 / 共享嫌疑") &&
    (associationRisk >= 35 || airportSuspicion >= 35 || platformRisk >= 40)
  ) {
    platformAssociationLevel = "中";
  }
  if (
    (networkCategory === "运营商移动网络" || networkCategory === "移动数据" || networkCategory === "机房宽带嫌疑" || networkCategory === "ISP底子 / 共享嫌疑") &&
    (associationRisk >= 55 || airportSuspicion >= 60 || platformRisk >= 60)
  ) {
    platformAssociationLevel = "高";
  }

  if (abuseScore >= 10 || blacklisted || abuseNode || attackInvolved || ipApi.proxy === true) {
    blacklistSuspicious = true;
  }

  if (ipApi.proxy === true || blacklisted || attackInvolved || abuseScore >= 50) {
    highRiskProxy = true;
  } else if (
    ipApi.hosting === true ||
    cloudNativeDatacenter ||
    isASNDatacenter ||
    networkCategory === "机房宽带嫌疑" ||
    networkCategory === "数据中心/服务器" ||
    networkCategory === "ISP底子 / 共享嫌疑"
  ) {
    suspiciousProxy = true;
  }

  const strictLibraryExempt =
    !ipApi.proxy &&
    !blacklisted &&
    !attackInvolved &&
    riskValue < 55 &&
    sharedFeel <= 35 &&
    (
      (
        !cloudNativeDatacenter &&
        !isASNDatacenter &&
        (networkCategory === "商宽/企业宽带" || networkCategory === "运营商ISP网络" || networkCategory === "住宅宽带")
      ) ||
      (
        networkCategory === "ISP底子 / 共享嫌疑" &&
        sharedFeel <= 28 &&
        nativeFeel >= 60 &&
        abuseScore < 10
      )
    );

  if (
    !strictLibraryExempt &&
    (
      ipApi.proxy === true ||
      blacklisted ||
      attackInvolved ||
      (
        cloudHitOnly &&
        (
          ipApi.hosting === true ||
          networkCategory === "数据中心/服务器" ||
          networkCategory === "机房宽带嫌疑"
        ) &&
        riskValue >= 55 &&
        sharedFeel >= 35
      ) ||
      (isASNDatacenter && platformRisk >= 60 && nativeFeel <= 55)
    )
  ) {
    strictLibraryFlag = true;
  }

  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") {
    if (sharedFeel > 35) score = Math.min(score, 82);
  }
  if (networkCategory === "ISP底子 / 共享嫌疑") score = Math.min(score, 80);
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") {
    if (platformAssociationLevel === "高") score = Math.min(score, 84);
    if (associationRisk >= 35) score = Math.min(score, 86);
    if (airportSuspicion >= 35) score = Math.min(score, 84);
  }
  if (networkCategory === "机房宽带嫌疑") score = Math.min(score, 74);
  if (networkCategory === "数据中心/服务器") score = Math.min(score, 62);
  if (tmNetLike && !proxyExit && !cloudNativeDatacenter && abuseScore < 10) score = Math.max(score, 82);

  score = clamp(score, 0, 100);

  let level = "优秀";
  if (score >= 85) level = "优秀";
  else if (score >= 70) level = "良好";
  else if (score >= 50) level = "一般";
  else level = "较差";

  let appleRisk = 0;
  let googleRisk = 0;
  let tiktokRisk = 0;
  let telegramRisk = 0;
  let instagramRisk = 0;
  let financeRisk = 0;

  appleRisk += Math.round((100 - nativeFeel) * 0.35);
  appleRisk += Math.round(sharedFeel * 0.25);
  appleRisk += Math.round(riskValue * 0.2);
  if (suspiciousProxy) appleRisk += 20;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") appleRisk += 10;
  if (networkCategory === "ISP底子 / 共享嫌疑") appleRisk += 8;
  if (airportSuspicion >= 60) appleRisk += 15;
  if (networkCategory === "机房宽带嫌疑") appleRisk += 12;
  if (networkCategory === "数据中心/服务器") appleRisk += 20;

  googleRisk += Math.round(riskValue * 0.35);
  googleRisk += Math.round(sharedFeel * 0.25);
  googleRisk += Math.round(mobileBehaviorRisk * 0.2);
  if (suspiciousProxy) googleRisk += 20;
  if (networkCategory === "ISP底子 / 共享嫌疑") googleRisk += 6;
  if (platformRisk >= 50) googleRisk += 10;
  if (networkCategory === "机房宽带嫌疑") googleRisk += 10;
  if (networkCategory === "数据中心/服务器") googleRisk += 18;

  tiktokRisk += Math.round((100 - nativeFeel) * 0.2);
  tiktokRisk += Math.round(sharedFeel * 0.15);
  tiktokRisk += Math.round(airportSuspicion * 0.2);
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") tiktokRisk -= 6;
  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") tiktokRisk -= 5;
  if (suspiciousProxy) tiktokRisk += 15;
  if (networkCategory === "ISP底子 / 共享嫌疑") tiktokRisk += 4;
  if (networkCategory === "机房宽带嫌疑") tiktokRisk += 8;
  if (networkCategory === "数据中心/服务器") tiktokRisk += 12;

  telegramRisk += Math.round(riskValue * 0.2);
  telegramRisk += Math.round(sharedFeel * 0.2);
  telegramRisk += Math.round(mobileBehaviorRisk * 0.15);
  if (suspiciousProxy) telegramRisk += 10;
  if (blacklisted) telegramRisk += 20;
  if (networkCategory === "ISP底子 / 共享嫌疑") telegramRisk += 4;
  if (networkCategory === "机房宽带嫌疑") telegramRisk += 8;
  if (networkCategory === "数据中心/服务器") telegramRisk += 12;

  instagramRisk += Math.round((100 - nativeFeel) * 0.28);
  instagramRisk += Math.round(sharedFeel * 0.22);
  instagramRisk += Math.round(platformRisk * 0.18);
  if (suspiciousProxy) instagramRisk += 16;
  if (networkCategory === "机房宽带嫌疑") instagramRisk += 12;
  if (networkCategory === "数据中心/服务器") instagramRisk += 18;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") instagramRisk -= 4;
  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") instagramRisk -= 4;

  financeRisk += Math.round(riskValue * 0.4);
  financeRisk += Math.round((100 - nativeFeel) * 0.3);
  financeRisk += Math.round(sharedFeel * 0.25);
  financeRisk += Math.round(associationRisk * 0.25);
  financeRisk += Math.round(airportSuspicion * 0.25);
  if (suspiciousProxy) financeRisk += 25;
  if (blacklisted) financeRisk += 40;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") financeRisk += 12;
  if (networkCategory === "ISP底子 / 共享嫌疑") financeRisk += 10;
  if (networkCategory === "机房宽带嫌疑") financeRisk += 18;
  if (networkCategory === "数据中心/服务器") financeRisk += 28;

  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") {
    appleRisk = Math.max(appleRisk, 35);
    googleRisk = Math.max(googleRisk, 30);
    financeRisk = Math.max(financeRisk, 45);
  }
  if (networkCategory === "ISP底子 / 共享嫌疑") {
    appleRisk = Math.max(appleRisk, 38);
    googleRisk = Math.max(googleRisk, 32);
    instagramRisk = Math.max(instagramRisk, 34);
    financeRisk = Math.max(financeRisk, 48);
  }
  if ((networkCategory === "运营商移动网络" || networkCategory === "移动数据") &&
      (associationRisk >= 35 || airportSuspicion >= 35)) {
    appleRisk = Math.max(appleRisk, 40);
    googleRisk = Math.max(googleRisk, 35);
    instagramRisk = Math.max(instagramRisk, 36);
    financeRisk = Math.max(financeRisk, 55);
  }
  if (networkCategory === "机房宽带嫌疑") {
    appleRisk = Math.max(appleRisk, 45);
    googleRisk = Math.max(googleRisk, 40);
    instagramRisk = Math.max(instagramRisk, 42);
    financeRisk = Math.max(financeRisk, 60);
  }
  if (networkCategory === "数据中心/服务器") {
    appleRisk = Math.max(appleRisk, 60);
    googleRisk = Math.max(googleRisk, 55);
    instagramRisk = Math.max(instagramRisk, 52);
    financeRisk = Math.max(financeRisk, 75);
  }

  if (majorISP && abuseScore === 0 && !cloudNativeDatacenter && !ipApi.proxy && !ipApi.hosting) {
    appleRisk -= 5;
    googleRisk -= 4;
    tiktokRisk -= 4;
    telegramRisk -= 4;
    instagramRisk -= 4;
  }

  if (tmNetLike && abuseScore === 0 && !cloudNativeDatacenter && !ipApi.proxy && !ipApi.hosting) {
    appleRisk -= 4;
    googleRisk -= 3;
    tiktokRisk -= 3;
    telegramRisk -= 3;
    instagramRisk -= 3;
  }

  appleRisk = clamp(appleRisk, 0, 100);
  googleRisk = clamp(googleRisk, 0, 100);
  tiktokRisk = clamp(tiktokRisk, 0, 100);
  telegramRisk = clamp(telegramRisk, 0, 100);
  instagramRisk = clamp(instagramRisk, 0, 100);
  financeRisk = clamp(financeRisk, 0, 100);

  /*************** 通用社媒风险（聚合） ***************/
  let socialRisk = 0;
  socialRisk += Math.round((100 - nativeFeel) * 0.25);
  socialRisk += Math.round(sharedFeel * 0.25);
  socialRisk += Math.round(platformRisk * 0.2);
  socialRisk += Math.round(associationRisk * 0.15);
  socialRisk += Math.round(platformControlPressure * 0.15);

  if (suspiciousProxy) socialRisk += 12;
  if (highRiskProxy) socialRisk += 20;
  if (blacklisted) socialRisk += 15;
  if (attackInvolved) socialRisk += 18;

  if (networkCategory === "ISP底子 / 共享嫌疑") socialRisk += 6;
  if (networkCategory === "机房宽带嫌疑") socialRisk += 12;
  if (networkCategory === "数据中心/服务器") socialRisk += 20;

  if (airportSuspicion >= 60) socialRisk += 10;
  else if (airportSuspicion >= 35) socialRisk += 5;

  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") socialRisk -= 6;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") socialRisk -= 3;
  if (majorISP && !proxyExit && !cloudNativeDatacenter && abuseScore === 0) socialRisk -= 4;
  if (tmNetLike && !proxyExit && !cloudNativeDatacenter && abuseScore === 0) socialRisk -= 3;

  const avgPlatform = (tiktokRisk + telegramRisk + instagramRisk) / 3;
  socialRisk += Math.round(avgPlatform * 0.3);
  socialRisk = clamp(socialRisk, 0, 100);

  let appleAdvice = adviceByRisk(appleRisk, "推荐", "谨慎", "不建议");
  let googleAdvice = adviceByRisk(googleRisk, "推荐", "可用", "谨慎");
  let tiktokAdvice = adviceByRisk(tiktokRisk, "推荐", "可用", "谨慎");
  let telegramAdvice = adviceByRisk(telegramRisk, "推荐", "可用", "谨慎");
  let instagramAdvice = adviceByRisk(instagramRisk, "推荐", "可用", "谨慎");
  let financeAdvice = adviceByRisk(financeRisk, "可用", "谨慎", "不建议");
  let socialAdvice = adviceByRisk(socialRisk, "推荐", "可用", "谨慎");

  if (
    networkCategory === "数据中心/服务器" ||
    proxyExit ||
    highRiskProxy ||
    sharedFeel >= 55
  ) {
    appleAdvice = "不建议";
  } else if (
    networkCategory === "机房宽带嫌疑" ||
    networkCategory === "ISP底子 / 共享嫌疑" ||
    nativeFeel < 55
  ) {
    appleAdvice = "谨慎";
  }

  if (
    highRiskProxy ||
    blacklisted ||
    attackInvolved ||
    networkCategory === "数据中心/服务器"
  ) {
    googleAdvice = "谨慎";
  } else if (
    networkCategory === "运营商ISP网络" ||
    networkCategory === "住宅宽带" ||
    (networkCategory === "商宽/企业宽带" && sharedFeel <= 35 && nativeFeel >= 58)
  ) {
    googleAdvice = "推荐";
  }

  if (
    networkCategory === "运营商移动网络" ||
    networkCategory === "移动数据" ||
    networkCategory === "住宅宽带" ||
    networkCategory === "运营商ISP网络"
  ) {
    if (!proxyExit && sharedFeel <= 45) tiktokAdvice = "推荐";
  } else if (
    networkCategory === "数据中心/服务器" ||
    sharedFeel >= 60
  ) {
    tiktokAdvice = "谨慎";
  }

  if (blacklisted || attackInvolved) {
    telegramAdvice = "谨慎";
  } else if (
    !proxyExit &&
    networkCategory !== "数据中心/服务器" &&
    sharedFeel <= 50
  ) {
    telegramAdvice = "推荐";
  }

  if (
    networkCategory === "数据中心/服务器" ||
    highRiskProxy ||
    blacklisted ||
    attackInvolved
  ) {
    instagramAdvice = "谨慎";
  } else if (
    (networkCategory === "运营商移动网络" || networkCategory === "移动数据" || networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") &&
    !proxyExit &&
    sharedFeel <= 45 &&
    nativeFeel >= 52
  ) {
    instagramAdvice = "推荐";
  } else if (
    networkCategory === "ISP底子 / 共享嫌疑" ||
    networkCategory === "机房宽带嫌疑" ||
    sharedFeel >= 50 ||
    nativeFeel < 50
  ) {
    instagramAdvice = "谨慎";
  }

  if (
    proxyExit ||
    highRiskProxy ||
    blacklisted ||
    attackInvolved ||
    networkCategory === "数据中心/服务器" ||
    networkCategory === "机房宽带嫌疑"
  ) {
    financeAdvice = "不建议";
  } else if (
    networkCategory === "ISP底子 / 共享嫌疑" ||
    networkCategory === "移动数据" ||
    networkCategory === "运营商移动网络" ||
    sharedFeel >= 40 ||
    nativeFeel < 58
  ) {
    financeAdvice = "谨慎";
  } else {
    financeAdvice = "可用";
  }

  if (
    networkCategory === "数据中心/服务器" ||
    highRiskProxy ||
    (blacklisted && abuseScore >= 25) ||
    attackInvolved
  ) {
    socialAdvice = "不建议";
  } else if (
    networkCategory === "机房宽带嫌疑" ||
    networkCategory === "ISP底子 / 共享嫌疑" ||
    sharedFeel >= 50 ||
    nativeFeel < 50 ||
    platformAssociationLevel === "高"
  ) {
    socialAdvice = "谨慎";
  }

  const platformAdvice = {
    apple: appleAdvice,
    google: googleAdvice,
    tiktok: tiktokAdvice,
    telegram: telegramAdvice,
    instagram: instagramAdvice,
    finance: financeAdvice,
    social: socialAdvice
  };

  const asnMeta = getASNMeta(ipApi, {
    majorISP: majorISP,
    cloudHitOnly: cloudHitOnly,
    cloudNativeDatacenter: cloudNativeDatacenter,
    isASNDatacenter: isASNDatacenter,
    abuseScore: abuseScore,
    sharedFeel: sharedFeel,
    nativeFeel: nativeFeel
  });

  const sharedISPScore = calcSharedISPScore({
    sharedFeel: sharedFeel,
    airportSuspicion: airportSuspicion,
    platformRisk: platformRisk,
    nativeFeel: nativeFeel,
    humanMeta: humanMeta,
    abuseScore: abuseScore,
    proxyExit: proxyExit,
    cloudNativeDatacenter: cloudNativeDatacenter,
    isASNDatacenter: isASNDatacenter,
    majorISP: majorISP,
    networkCategory: networkCategory
  }, ipApi, cz88);

  const asnDensity = getASNDensity({
    sharedFeel: sharedFeel,
    airportSuspicion: airportSuspicion,
    platformRisk: platformRisk,
    vpnProbability: vpnProbability,
    networkCategory: networkCategory,
    majorISP: majorISP,
    abuseScore: abuseScore,
    nativeFeel: nativeFeel,
    proxyExit: proxyExit,
    cloudNativeDatacenter: cloudNativeDatacenter,
    isASNDatacenter: isASNDatacenter,
    orgText: orgText,
    ispText: ispText,
    asText: asText
  });

  const segmentPollution = getSegmentPollution({
    abuseScore: abuseScore,
    totalReports: totalReports,
    cloudNativeDatacenter: cloudNativeDatacenter,
    isASNDatacenter: isASNDatacenter,
    hostingLikeOrg: hostingLikeOrg,
    networkCategory: networkCategory,
    proxyExit: proxyExit,
    majorISP: majorISP
  }, ipApi);

  const lineQuality = classifyLineQuality({
    blacklisted: blacklisted,
    attackInvolved: attackInvolved,
    cloudNativeDatacenter: cloudNativeDatacenter,
    isASNDatacenter: isASNDatacenter,
    proxyExit: proxyExit,
    abuseScore: abuseScore,
    nativeFeel: nativeFeel,
    sharedFeel: sharedFeel,
    networkCategory: networkCategory
  }, asnMeta, asnDensity, ipApi);

  let hardRiskConclusion = "无明确黑名单/滥用风险";
  if (attackInvolved || (blacklisted && abuseScore >= 50)) {
    hardRiskConclusion = "存在明确滥用或黑名单风险";
  } else if (ipApi.proxy === true) {
    hardRiskConclusion = "存在明确代理风险";
  } else if (ipApi.hosting === true) {
    hardRiskConclusion = "存在托管/机房特征";
  }

  let platformRiskConclusion = "平台关联压力低";
  if (platformAssociationLevel === "中") platformRiskConclusion = "平台关联压力中";
  if (platformAssociationLevel === "高") platformRiskConclusion = "平台关联压力高";

  let finalConclusion = "整体可正常使用";

  if (attackInvolved || (blacklisted && abuseScore >= 50)) {
    finalConclusion = "存在明确硬风险，不建议用于敏感场景";
  } else if (ipApi.proxy === true || networkCategory === "数据中心/服务器") {
    finalConclusion = "偏机房/代理/托管出口，不建议用于注册、主号、金融等敏感用途";
  } else if (networkCategory === "机房宽带嫌疑") {
    finalConclusion = "存在轻机房或共享专线嫌疑，普通浏览可用，但注册、主号、金融场景不建议";
  } else if (networkCategory === "ISP底子 / 共享嫌疑") {
    finalConclusion = "底层更像ISP/家宽/Cable-DSL，但共享、池化或机场化嫌疑存在；日常和流媒体可用，敏感场景谨慎";
  } else if (networkCategory === "商宽/企业宽带") {
    if (lineQuality.level === "good") {
      finalConclusion = "更像干净企业线/优质专线，普通与中敏感场景表现通常不错，但仍不建议等同纯净独享家宽";
    } else if (
      majorISP &&
      sharedFeel <= 35 &&
      abuseScore < 10 &&
      nativeFeel >= 58
    ) {
      finalConclusion = "偏干净企业宽带，整体中性偏稳，敏感场景仍建议谨慎，但不必直接视作池化共享线";
    } else {
      finalConclusion = "偏普通商宽/企业用途，中性可用，不建议按纯净家宽理解";
    }
  } else if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") {
    if (platformAssociationLevel === "高") {
      finalConclusion = "移动网络本身不一定脏，但平台关联压力偏高，敏感场景谨慎";
    } else {
      finalConclusion = "偏干净移动网络，日常使用通常没大问题";
    }
  } else if (networkCategory === "运营商ISP网络") {
    finalConclusion = "整体较稳，接近正常运营商家宽/ISP出口，可正常使用";
  } else if (score >= 85 && networkCategory === "住宅宽带") {
    finalConclusion = "偏优质住宅，日常、平台、流媒体场景通常都比较稳";
  }

  return {
    score,
    level,
    networkCategory,
    isResidential: networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络",
    isResidentialBase: networkCategory === "住宅宽带",
    isIspBase: networkCategory === "运营商ISP网络" || networkCategory === "ISP底子 / 共享嫌疑",
    isSharedIspLike: networkCategory === "ISP底子 / 共享嫌疑",
    isBusinessLine: networkCategory === "商宽/企业宽带",
    isBusinessLike: networkCategory === "商宽/企业宽带" || networkCategory === "机房宽带嫌疑",
    isSharedBusinessLike:
      networkCategory === "ISP底子 / 共享嫌疑" ||
      (
        networkCategory === "商宽/企业宽带" &&
        (sharedFeel >= 45 || airportSuspicion >= 35 || platformRisk >= 40)
      ) ||
      networkCategory === "机房宽带嫌疑",
    isDatacenter,
    isMobile,
    proxyExit,
    suspiciousProxy,
    highRiskProxy,
    cloudService,
    blacklisted,
    blacklistSuspicious,
    abuseNode,
    attackInvolved,
    anonymousVpnStyle,
    publicProxyStyle,
    torStyle,
    hardRiskConclusion,
    platformRiskConclusion,
    finalConclusion,
    riskValue,
    nativeFeel,
    sharedFeel,
    historyBehavior,
    isASNDatacenter,
    humanMeta,
    shareCountScore,
    residentialProbability,
    businessProbability,
    datacenterProbability,
    llmSummary,
    abuseScore,
    totalReports,
    associationRisk,
    airportSuspicion,
    mobileBehaviorRisk,
    platformRisk,
    vpnProbability,
    strictLibraryFlag,
    appleRisk,
    googleRisk,
    tiktokRisk,
    telegramRisk,
    instagramRisk,
    financeRisk,
    socialRisk,
    socialAdvice,
    platformAdvice,
    cloudProvider,
    cloudHitOnly,
    cloudNativeDatacenter,
    fakeResidentialRisk,
    platformControlPressure,
    dataCompleteness,
    dataCompletenessScore,
    platformAssociationLevel,
    majorISP,
    dedicatedLineSuspicious,
    transitUpstreamHit,
    hostingLikeOrg,
    ispLikeCandidate,
    sharedISPScore,
    asnMeta,
    asnDensity,
    segmentPollution,
    lineQuality,
    featureExplainType: "relative-index",
    tags: tags.length ? Array.from(new Set(tags)).join(" / ") : "无明显异常",
    orgText,
    ispText,
    asText
  };
}

/*************** 主流程 ***************/
function fetchAll() {
  httpGet(
    "http://ip-api.com/json?lang=zh-CN&fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query,proxy,hosting",
    function (err1, res1, data1) {
      if (err1 || !data1) return done("IP查询失败\n" + String(err1 || ""));

      const ipApi = parseJSON(data1);
      if (!ipApi || !ipApi.query) return done("IP数据解析失败");

      const cz88Url = "https://www.cz88.net/api/cz88/ip/base?ip=" + ipApi.query;
      httpGet(cz88Url, function (err2, res2, data2) {
        let cz88Data = null;
        if (!err2 && data2) {
          const cz88Json = parseJSON(data2);
          if (cz88Json && cz88Json.data) cz88Data = cz88Json.data;
        }

        checkAbuseIPDB(ipApi.query, function (abuseData, abuseFromCache) {
          const resultCacheKey = getResultCacheKeyByMeta(ipApi, cz88Data, abuseData);
          const resultCache = readCache(resultCacheKey);
          if (resultCache && resultCache.time && (Date.now() - resultCache.time < RESULT_CACHE_TTL)) {
            return done(resultCache.data);
          }

          const risk = analyzeRisk(ipApi, cz88Data || {}, abuseData);
          const behavior = calcBehaviorModel(risk);

          const abuseScoreText = formatAbuseScore(abuseData, abuseFromCache);
          const ipapiScore = formatIpApiRisk(ipApi);
          const cz88Score = formatCz88Risk(cz88Data);
          const riskValueText = formatRiskPercent(risk.riskValue);
          const nativeFeelText = formatNativeFeel(risk.nativeFeel);
          const sharedFeelText = formatSharedFeel(risk.sharedFeel);
          const proxyTierText = formatProxyTier(risk);
          const historyBehaviorText = formatHistoryBehavior(risk.historyBehavior);
          const shareCountText = formatShareCount(risk.shareCountScore);
          const asnType = inferAsnType(ipApi, risk);
          const ipTypeLabel = inferIpTypeLabel(risk, ipApi, cz88Data);
          const simulated = simulateMultiSourceScores(risk, ipApi);
          const associationRiskText = formatRiskBand(risk.associationRisk);
          const airportSuspicionText = formatAirportSuspicion(risk.airportSuspicion);
          const behaviorRiskText = formatRiskBand(risk.mobileBehaviorRisk);
          const platformRiskText = formatRiskBand(risk.platformRisk);
          const vpnProbabilityText = formatRiskBand(risk.vpnProbability);
          const fakeResidentialText = formatRiskBand(risk.fakeResidentialRisk);
          const platformPressureText = formatRiskBand(risk.platformControlPressure);
          const sharedISPText = formatRiskBand(risk.sharedISPScore);
          const segmentPollutionText = formatRiskBand(risk.segmentPollution.score);

          const registerRiskText = formatRiskPercent(behavior.registerRisk);
          const loginRiskText = formatRiskPercent(behavior.loginRisk);
          const browseRiskText = formatRiskPercent(behavior.browseRisk);
          const socialRiskText = formatRiskPercent(risk.socialRisk);

          const checks = [
            { name: "Netflix", run: checkNetflix },
            { name: "Disney+", run: checkDisney },
            { name: "TikTok", run: checkTikTok },
            { name: "YouTube", run: checkYouTube },
            {
              name: "ChatGPT",
              run: function (cb) {
                checkChatGPTWithRisk(risk, cb);
              }
            }
          ];

          runChecksParallel(checks, function (results) {
            const lines = [];

            lines.push("【节点信息】");
            lines.push("节点：" + safeText(NODE_NAME, "当前节点"));
            lines.push("版本：" + SCRIPT_VERSION);
            lines.push("");

            lines.push("【IP详细】");
            lines.push("IP：" + safeText(ipApi.query, "-"));
            lines.push("ASN：" + safeText(ipApi.as, "-"));
            lines.push("ASN类型：" + safeText(asnType, "-"));
            lines.push("IP类型：" + safeText(ipTypeLabel, "-"));
            lines.push("位置：" + safeText(ipApi.country, "-") + " " + safeText(ipApi.regionName, "-") + " " + safeText(ipApi.city, "-"));
            lines.push("");

            lines.push("【基础信息】");
            lines.push("国家/地区：" + safeText(ipApi.country, "-"));
            lines.push("地区：" + safeText(ipApi.regionName, "-"));
            lines.push("城市：" + safeText(ipApi.city, "-"));
            lines.push("ZIP：" + safeZip(ipApi.zip));
            lines.push("ISP：" + safeText((cz88Data && cz88Data.isp) || ipApi.isp, "-"));
            lines.push("组织：" + safeText(ipApi.org, "-"));
            lines.push("时区：" + safeText(ipApi.timezone, "-"));
            lines.push("经纬度：" + safeText(ipApi.lat, "-") + " / " + safeText(ipApi.lon, "-"));
            lines.push("主流运营商：" + (risk.majorISP ? "是" : "否"));
            lines.push("TM Net / Telekom Malaysia：" + (isTMNetLike(ipApi.org, ipApi.isp, ipApi.as) ? "是" : "否"));
            lines.push("");

            lines.push("【网络检测】");
            lines.push("主类型：" + safeText(risk.networkCategory, "-"));
            lines.push("住宅/主流ISP：" + (risk.isResidential ? "是" : "否"));
            lines.push("住宅底子：" + (risk.isResidentialBase ? "是" : "否"));
            lines.push("ISP底子：" + (risk.isIspBase ? "是" : "否"));
            lines.push("共享ISP嫌疑：" + (risk.isSharedIspLike ? "是" : "否"));
            lines.push("商宽/企业线：" + (risk.isBusinessLine ? "是" : "否"));
            lines.push("企业用途倾向：" + (risk.isBusinessLike ? "是" : "否"));
            lines.push("共享商宽/ISP嫌疑：" + (risk.isSharedBusinessLike ? "是" : "否"));
            lines.push("数据中心：" + (risk.isDatacenter ? "是" : "否"));
            lines.push("移动网络：" + (risk.isMobile ? "是" : "否"));
            lines.push("ASN机房特征：" + (risk.isASNDatacenter ? "是" : "否"));
            lines.push("云厂商命中：" + (risk.cloudHitOnly ? "是" : "否"));
            lines.push("云厂商机房化倾向：" + (risk.cloudNativeDatacenter ? "是" : "否"));
            lines.push("专线可疑增强：" + (risk.dedicatedLineSuspicious ? "是" : "否"));
            lines.push("ISP底子候选：" + (risk.ispLikeCandidate ? "是" : "否"));
            lines.push("Transit上游命中：" + (risk.transitUpstreamHit ? "是" : "否"));
            lines.push("Hosting组织特征：" + (risk.hostingLikeOrg ? "是" : "否"));
            lines.push("原始网络标记：" + safeText(cz88Data && cz88Data.netWorkType, "未返回"));
            lines.push("真人概率：" + (risk.humanMeta ? risk.humanMeta.text : "未知（数据不足）"));
            lines.push("代理标记：" + (ipApi.proxy ? "是" : "否"));
            lines.push("托管标记：" + (ipApi.hosting ? "是" : "否"));
            lines.push("");

            lines.push("【综合质量】");
            lines.push("综合质量分：" + risk.score + " / 100");
            lines.push("质量判断：" + risk.level);
            lines.push("数据完整度：" + risk.dataCompleteness + "（" + risk.dataCompletenessScore + "）");
            lines.push("特征：" + safeText(risk.tags, "无明显异常"));
            lines.push("");

            lines.push("【特征推断（相对倾向指数，非真实概率）】");
            lines.push("家庭宽带倾向指数：" + risk.residentialProbability);
            lines.push("商业宽带倾向指数：" + risk.businessProbability);
            lines.push("机房宽带倾向指数：" + risk.datacenterProbability);
            lines.push("综合判断：" + risk.llmSummary);
            lines.push("");

            lines.push("【风控画像】");
            lines.push(line("风控值", riskValueText.text, riskValueText.level));
            lines.push(line("原生感", nativeFeelText.text, nativeFeelText.level));
            lines.push(line("共享感", sharedFeelText.text, sharedFeelText.level));
            lines.push(line("共享人数", shareCountText.text, shareCountText.level));
            lines.push(line("历史行为评分", historyBehaviorText.text, historyBehaviorText.level));
            lines.push("");

            lines.push("【行为 / 关联画像】");
            lines.push(line("关联风险", associationRiskText.text, associationRiskText.level));
            lines.push(line("机场嫌疑", airportSuspicionText.text, airportSuspicionText.level));
            lines.push(line("行为风险", behaviorRiskText.text, behaviorRiskText.level));
            lines.push("");

            lines.push("【增强识别】");
            lines.push("云厂商识别：" + (risk.cloudProvider.hit ? (risk.cloudProvider.name + " / " + risk.cloudProvider.keyword) : "否"));
            lines.push(line("伪住宅风险", fakeResidentialText.text, fakeResidentialText.level));
            lines.push(line("平台风控压力", platformPressureText.text, platformPressureText.level));
            lines.push("");

            lines.push("【ASN画像】");
            lines.push("ASN历史风险：" + risk.asnMeta.abuseHistory + "（" + risk.asnMeta.level + "）");
            lines.push("ASN分层：" + safeText(risk.asnMeta.tier, "-"));
            lines.push("ASN画像说明：" + safeText(risk.asnMeta.reason, "无明显异常"));
            lines.push("ASN共享密度：" + risk.asnDensity.density + "（" + safeText(risk.asnDensity.label, "-") + "）");
            lines.push(line("IP段污染率", segmentPollutionText.text, segmentPollutionText.level));
            lines.push("IP段污染等级：" + risk.segmentPollution.level);
            lines.push("");

            lines.push("【共享型 ISP 识别】");
            lines.push(line("共享型ISP评分", sharedISPText.text, sharedISPText.level));
            lines.push("共享型ISP判断：" + (risk.sharedISPScore <= 30 ? "低" : risk.sharedISPScore <= 60 ? "中" : "高"));
            lines.push("说明：该项用于识别是否存在池化/机场化/共享出口倾向，不代表真实运营商属性");
            lines.push("");

            lines.push("【线路评级 / 实战归类】");
            lines.push(risk.lineQuality.label);
            lines.push("说明：" + risk.lineQuality.desc);
            lines.push("");

            lines.push("【平台风控视角】");
            lines.push("平台关联等级：" + risk.platformAssociationLevel);
            lines.push(line("平台识别风险", platformRiskText.text, platformRiskText.level));
            lines.push(line("VPN判定概率", vpnProbabilityText.text, vpnProbabilityText.level));
            lines.push(boolLine("严格风控库标记", risk.strictLibraryFlag));
            lines.push("");

            lines.push("【行为模型】");
            lines.push("注册：" + behavior.registerAdvice + "（风险 " + behavior.registerRisk + "）");
            lines.push("登录：" + behavior.loginAdvice + "（风险 " + behavior.loginRisk + "）");
            lines.push("浏览：" + behavior.browseAdvice + "（风险 " + behavior.browseRisk + "）");
            lines.push(line("注册风险", registerRiskText.text, registerRiskText.level));
            lines.push(line("登录风险", loginRiskText.text, loginRiskText.level));
            lines.push(line("浏览风险", browseRiskText.text, browseRiskText.level));
            lines.push("");

            lines.push("【真实来源结果】");
            lines.push(line("AbuseIPDB", abuseScoreText.text, abuseScoreText.level));
            lines.push(line("ip-api", ipapiScore.text, ipapiScore.level));
            lines.push(line("cz88", cz88Score.text, cz88Score.level));
            lines.push("");

            lines.push("【本地规则映射（非真实官方接口，仅供风格参考）】");
            lines.push(line("IPPure风格映射", simulated.ippure.text, simulated.ippure.level));
            lines.push(line("Scamalytics风格映射", simulated.scamalytics.text, simulated.scamalytics.level));
            lines.push(line("IP2Location风格映射", simulated.ip2location.text, simulated.ip2location.level));
            lines.push(line("ipregistry风格映射", simulated.ipregistry.text, simulated.ipregistry.level));
            lines.push("");

            lines.push("【硬风险判定】");
            lines.push(boolLine("匿名VPN风格", risk.anonymousVpnStyle));
            lines.push(boolLine("机房代理风格", risk.cloudService || risk.isDatacenter || risk.isASNDatacenter));
            lines.push(boolLine("公共代理风格", risk.publicProxyStyle));
            lines.push(boolLine("黑名单", risk.blacklisted));
            lines.push(boolLine("滥用节点", risk.abuseNode));
            lines.push(boolLine("参与攻击", risk.attackInvolved));
            lines.push(boolLine("云服务", risk.cloudService));
            if (!ABUSEIPDB_KEY) {
              lines.push("Abuse置信分：未启用");
              lines.push("滥用报告数：未启用");
              lines.push("信誉缓存：未启用");
            } else if (abuseData && abuseData.data) {
              lines.push("Abuse置信分：" + (abuseData.data.abuseConfidenceScore || 0));
              lines.push("滥用报告数：" + (abuseData.data.totalReports || 0));
              lines.push("信誉缓存：" + (abuseFromCache ? "命中" : "实时"));
            } else {
              lines.push("Abuse置信分：请求失败");
              lines.push("滥用报告数：请求失败");
              lines.push("信誉缓存：无");
            }
            lines.push("");

            lines.push("【隐私检测】");
            lines.push(boolLine("代理出口", risk.proxyExit));
            lines.push(line("代理等级", proxyTierText.text, proxyTierText.level));
            lines.push(boolLine("可疑代理", risk.suspiciousProxy));
            lines.push(boolLine("高风险代理", risk.highRiskProxy));
            lines.push("");

            lines.push("【中性网络标记】");
            lines.push(neutralBoolLine("主流运营商", risk.majorISP));
            lines.push(neutralBoolLine("移动网络", risk.isMobile));
            lines.push(neutralBoolLine("数据中心属性", risk.isDatacenter));
            lines.push(neutralBoolLine("云厂商命中", risk.cloudHitOnly));
            lines.push(neutralBoolLine("云厂商机房化倾向", risk.cloudNativeDatacenter));
            lines.push(neutralBoolLine("ISP底子候选", risk.ispLikeCandidate));
            lines.push("");

            lines.push("【分平台建议】");
            lines.push("社媒通用：" + risk.platformAdvice.social + "（风险 " + risk.socialRisk + "）");
            lines.push(line("社媒通用风险", socialRiskText.text, socialRiskText.level));
            lines.push("苹果：" + risk.platformAdvice.apple + "（风险 " + risk.appleRisk + "）");
            lines.push("谷歌：" + risk.platformAdvice.google + "（风险 " + risk.googleRisk + "）");
            lines.push("TikTok：" + risk.platformAdvice.tiktok + "（风险 " + risk.tiktokRisk + "）");
            lines.push("Telegram：" + risk.platformAdvice.telegram + "（风险 " + risk.telegramRisk + "）");
            lines.push("Instagram：" + risk.platformAdvice.instagram + "（风险 " + risk.instagramRisk + "）");
            lines.push("金融类：" + risk.platformAdvice.finance + "（风险 " + risk.financeRisk + "）");
            lines.push("");

            lines.push("【媒体检测 / 平台解锁】");
            for (let i = 0; i < results.length; i++) {
              lines.push(line(results[i].name, results[i].value, results[i].level));
            }
            lines.push("");

            lines.push("【最终结论】");
            lines.push("硬风险结论：" + risk.hardRiskConclusion);
            lines.push("平台结论：" + risk.platformRiskConclusion);
            lines.push("综合建议：" + risk.finalConclusion);

            const finalMsg = lines.join("\n");
            writeCache(resultCacheKey, finalMsg);
            done(finalMsg);
          });
        });
      });
    }
  );
}

fetchAll();