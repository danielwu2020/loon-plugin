/*************************************
 * 节点详情查询 Ultimate（完整细节优化版 - GPT/Netflix增强完整版）-1.86
 * 数据源：
 * - ip-api
 * - cz88
 * - AbuseIPDB
 *
 * 优化重点：
 * 1. 主流运营商白名单，避免家宽/移动误杀
 * 2. 专线 / 商宽 / 家宽 / 机房宽带嫌疑拆分更细
 * 3. 多源评分明确区分“真实结果”和“本地模拟”
 * 4. 小型IDC / Hosting / Transit / Reseller 特征增强
 * 5. 平台风控、行为模型、综合结论更贴近实际
 * 6. AbuseIPDB 增加本地缓存，避免频繁请求
 * 7. 流媒体 / 平台检测增强：Netflix / Disney+ / TikTok / YouTube / ChatGPT
 *************************************/

const TIMEOUT = 15000;
const ABUSE_CACHE_TTL = 12 * 60 * 60 * 1000; // 12小时
const RESULT_CACHE_TTL = 10 * 60 * 1000;     // 10分钟整体验证缓存

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
function httpGet(target, callback) {
  const opts = typeof target === "string" ? { url: target } : target;
  if (!opts.timeout) opts.timeout = TIMEOUT;
  if (NODE_PARAM) opts.node = NODE_PARAM;
  $httpClient.get(opts, function (error, response, data) {
    callback(error, response, data);
  });
}

function parseJSON(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lower(v) {
  return String(v || "").toLowerCase();
}

function hasAny(text, arr) {
  const t = lower(text);
  for (let i = 0; i < arr.length; i++) {
    if (t.indexOf(lower(arr[i])) !== -1) return true;
  }
  return false;
}

function uniquePush(arr, val) {
  if (arr.indexOf(val) === -1) arr.push(val);
}

function icon(level) {
  if (level === "ok") return "🟢";
  if (level === "warn") return "🟡";
  return "🔴";
}

function line(name, value, level) {
  return icon(level) + " " + name + "：" + value;
}

function boolLine(name, boolValue) {
  return (boolValue ? "🔴 " : "🟢 ") + name + "：" + (boolValue ? "是" : "否");
}

function done(msg) {
  $done({
    title: "节点详情查询 Ultimate",
    message: msg
  });
}

function runChecks(checks, callback) {
  const results = [];
  let index = 0;
  function next() {
    if (index >= checks.length) return callback(results);
    const item = checks[index++];
    item.run(function (value, level) {
      results.push({ name: item.name, value: value, level: level });
      next();
    });
  }
  next();
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

function getResultCacheKey(ip) {
  return "NODE_CHECK_RESULT_CACHE_" + ip;
}

/*************** 主流运营商白名单 ***************/
const MAJOR_ISP_KEYWORDS = [
  "AT&T", "ATT", "AT&T Corp", "AT&T Enterprises", "Comcast", "Verizon", "T-Mobile",
  "Spectrum", "Charter", "Cox", "CenturyLink", "Lumen", "Frontier", "Windstream",
  "Optimum", "Altice", "Xfinity",
  "NTT", "SoftBank", "KDDI", "Rakuten", "JCOM", "IIJ",
  "Vodafone", "Orange", "Telekom", "Telefonica", "O2", "Bouygues", "Free Mobile",
  "Singtel", "StarHub", "M1", "Telstra", "Optus", "AIS", "True", "dtac",
  "China Telecom", "China Unicom", "China Mobile", "CMHK", "PCCW", "HGC"
];

function isMajorISP(org, isp, asnOrg) {
  const str = [org, isp, asnOrg].join(" ").toLowerCase();
  return MAJOR_ISP_KEYWORDS.some(function (name) {
    return str.indexOf(name.toLowerCase()) !== -1;
  });
}

/*************** 云厂商 / Hosting 数据库 ***************/
const CLOUD_PROVIDER_RULES = [
  { name: "AWS", keys: ["amazon technologies", "amazon data services", "aws", "ec2"] },
  { name: "Google Cloud", keys: ["google cloud", "gcp"] },
  { name: "Azure", keys: ["azure"] },
  { name: "Oracle Cloud", keys: ["oracle cloud", "oracle", "oci"] },
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
  "cogent", "cogent communications",
  "he.net", "hurricane electric",
  "gtt", "gtt communications",
  "telia", "telia carrier",
  "zayo", "pccw global",
  "ntt america", "level 3", "lumen",
  "colo", "transit", "backbone"
];

const HOSTING_RESELLER_KEYWORDS = [
  "hosting", "host", "server", "datacenter", "data center", "idc", "vps", "colo",
  "colocation", "dedicated", "bare metal", "cloud", "llc", "solutions", "technology",
  "tech", "group", "networks", "communications", "fiberstate", "reseller"
];

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
      if (text.indexOf(item.keys[j].toLowerCase()) !== -1) {
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

  return { hit: false, name: "", keyword: "" };
}

/*************** OpenAI 支持地区（用于 GPT 检测） ***************/
const OPENAI_SUPPORTED_LOCS = [
  "AL","DZ","AD","AO","AG","AR","AM","AU","AT","AZ",
  "BS","BD","BB","BE","BZ","BJ","BT","BA","BW","BR","BN","BG","BF","CV","CA",
  "CL","CO","KM","CR","CI","HR","CY","DK","DJ","DM","DO",
  "EC","SV","EE","FJ","FI","FR","GA","GM","GE","DE","GH","GR","GD","GT","GN","GW","GY",
  "HT","HN","HU",
  "IS","IN","ID","IQ","IE","IL","IT",
  "JM","JP","JO",
  "KZ","KE","KI","KW","KG",
  "LV","LB","LS","LR","LI","LT","LU",
  "MG","MW","MY","MV","ML","MT","MH","MR","MU","MX","FM","MD","MC","MN","ME","MA","MZ","MM",
  "NA","NR","NP","NL","NZ","NE","NG","MK","NO",
  "OM",
  "PK","PW","PA","PG","PY","PE","PH","PL","PT",
  "QA",
  "RO","RW",
  "KN","LC","VC","WS","SM","ST","SN","RS","SC","SL","SG","SK","SI","SB","ZA","KR","ES","LK","SR","SE","CH",
  "TW","TZ","TH","TL","TG","TO","TT","TN","TR","TV",
  "UG","UA","AE","GB","US","UY","VU",
  "ZM"
];

/*************** trace / GPT 工具 ***************/
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

/*************** 流媒体 / 平台检测 ***************/
function checkNetflix(cb) {
  const tests = [
    { region: "US", id: "70143836" },
    { region: "JP", id: "80018499" },
    { region: "SG", id: "81215567" },
    { region: "GB", id: "80007226" }
  ];

  let idx = 0;
  let onlyOriginal = false;

  function next() {
    if (idx >= tests.length) {
      if (onlyOriginal) return cb("仅自制剧", "warn");
      return cb("不可用", "fail");
    }

    const item = tests[idx++];
    httpGet(
      {
        url: "https://www.netflix.com/title/" + item.id,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept-Language": "en"
        }
      },
      function (err, resp) {
        if (err || !resp) {
          if (idx >= tests.length) return cb("检测失败", "fail");
          return next();
        }
        const code = resp.status || resp.statusCode || 0;

        if (code === 200) return cb("完整解锁（" + item.region + "）", "ok");
        if (code === 404) {
          onlyOriginal = true;
          return next();
        }
        if (code === 403) return cb("被拒绝", "fail");
        return next();
      }
    );
  }

  next();
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
        if (/not available in your region/i.test(body)) return cb("当前地区不可用", "fail");
        return cb("可访问", "ok");
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
      if (code === 200 && body) return cb("可访问", "ok");
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
      const code = resp.status || resp.statusCode || 0;

      const match = body.match(/"countryCode":"(.*?)"/) || body.match(/"GL":"(.*?)"/);
      if (match && match[1]) return cb("Premium地区 " + match[1], "ok");

      if (/youtube premium is not available/i.test(body)) {
        return cb("当前地区不可用", "warn");
      }

      if (code === 200) return cb("可访问", "warn");
      return cb("未知(" + code + ")", "warn");
    }
  );
}

function checkChatGPTWithRisk(risk, cb) {
  httpGet(
    {
      url: "https://chat.openai.com/cdn-cgi/trace",
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
              return cb("WARP解锁（" + loc + " / " + traceIp + "）", "warn");
            }

            if (
              risk &&
              (
                risk.proxyExit ||
                risk.cloudService ||
                risk.isDatacenter ||
                risk.cloudProvider.hit ||
                risk.suspiciousProxy
              )
            ) {
              return cb("代理解锁（" + loc + " / " + traceIp + "）", "warn");
            }

            return cb("原生解锁（" + loc + " / " + traceIp + "）", "ok");
          }

          return cb("未解锁（" + (loc || "未知地区") + " / " + traceIp + "）", "fail");
        }
      }

      httpGet(
        {
          url: "https://chat.openai.com/",
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
            return cb("地区限制", "fail");
          }

          if (code2 === 200 || code2 === 301 || code2 === 302) {
            return cb("网页可访问（未识别地区）", "warn");
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

/*************** 展示格式 ***************/
function formatAbuseScore(abuse, fromCache) {
  if (!ABUSEIPDB_KEY) return { text: "未启用", level: "warn" };
  if (!abuse || !abuse.data) return { text: "请求失败", level: "fail" };
  const s = Number(abuse.data.abuseConfidenceScore || 0);
  const suffix = fromCache ? "（缓存）" : "";
  if (s === 0) return { text: "低风险（" + s + "）" + suffix, level: "ok" };
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
  if (v <= 20) return { text: "低", level: "ok" };
  if (v <= 50) return { text: "中", level: "warn" };
  return { text: "高", level: "fail" };
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
  if (risk.networkCategory === "数据中心/服务器") registerRisk += 16;

  loginRisk += Math.round(risk.riskValue * 0.3);
  loginRisk += Math.round((100 - risk.nativeFeel) * 0.2);
  loginRisk += Math.round(risk.sharedFeel * 0.2);
  loginRisk += Math.round(risk.platformRisk * 0.2);
  if (risk.suspiciousProxy) loginRisk += 15;
  if (risk.blacklisted) loginRisk += 25;
  if (risk.airportSuspicion >= 60) loginRisk += 10;
  if (risk.networkCategory === "机房宽带嫌疑") loginRisk += 8;
  if (risk.networkCategory === "数据中心/服务器") loginRisk += 12;

  browseRisk += Math.round(risk.riskValue * 0.18);
  browseRisk += Math.round((100 - risk.nativeFeel) * 0.12);
  browseRisk += Math.round(risk.sharedFeel * 0.12);
  if (risk.suspiciousProxy) browseRisk += 8;
  if (risk.blacklisted) browseRisk += 15;
  if (risk.networkCategory === "数据中心/服务器") browseRisk += 8;

  if (risk.majorISP && !risk.blacklisted && !risk.cloudProvider.hit && !risk.proxyExit) {
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

/*************** 多源模拟（不是实际 API） ***************/
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
  } else if (risk.networkCategory === "商宽/企业宽带") {
    ip2location = { text: "商业宽带（中性）", level: "warn" };
  } else if (risk.networkCategory === "移动数据" || risk.networkCategory === "运营商移动网络") {
    ip2location = { text: "移动网络（MOB）", level: "ok" };
  } else if (risk.networkCategory === "运营商ISP网络" || risk.networkCategory === "住宅宽带") {
    ip2location = { text: "家庭宽带 / ISP", level: "ok" };
  }

  let ipregistry = { text: "干净（Clean）", level: "ok" };
  if (ipApi.proxy) ipregistry = { text: "有标记（Proxy）", level: "fail" };
  else if (ipApi.hosting || risk.networkCategory === "数据中心/服务器") {
    ipregistry = { text: "有标记（Hosting）", level: "fail" };
  } else if (risk.networkCategory === "机房宽带嫌疑") {
    ipregistry = { text: "有标记（Hosting/Suspicious）", level: "fail" };
  } else if (risk.networkCategory === "商宽/企业宽带") {
    ipregistry = { text: "有标记（Suspicious）", level: "warn" };
  }

  return { ippure, scamalytics, ip2location, ipregistry };
}

/*************** ASN / 类型 ***************/
function inferAsnType(ipApi, risk) {
  const asText = lower(ipApi && ipApi.as);
  const ispText = lower(ipApi && ipApi.isp);
  const orgText = lower(ipApi && ipApi.org);
  const all = asText + " " + ispText + " " + orgText;

  if (risk.isASNDatacenter || hasAny(all, [
    "cloud", "hosting", "host", "server", "vps", "colo", "idc", "datacenter",
    "oracle", "aws", "azure", "google cloud", "gcp", "digitalocean", "linode", "vultr",
    "aliyun", "tencent cloud", "huawei cloud"
  ])) {
    return "云/机房ASN";
  }

  if ((risk.networkCategory === "移动数据" || risk.networkCategory === "运营商移动网络") && hasAny(all, [
    "mobile", "wireless", "移动", "cellular", "rakuten mobile", "rakuten",
    "telecom mobile", "t-mobile", "verizon", "at&t", "att"
  ])) {
    return "移动网络ASN";
  }

  if (isMajorISP(ipApi && ipApi.org, ipApi && ipApi.isp, ipApi && ipApi.as)) {
    return "主流运营商ASN";
  }

  if (risk.networkCategory === "商宽/企业宽带") return "商宽/企业ASN";
  if (risk.networkCategory === "住宅宽带" || risk.networkCategory === "运营商ISP网络") return "家宽ASN";

  return "普通ASN";
}

function inferIpTypeLabel(risk, ipApi, cz88) {
  if (risk.networkCategory === "数据中心/服务器") return "数据中心 / 服务器";
  if (risk.networkCategory === "机房宽带嫌疑") return "机房宽带嫌疑";
  if (risk.networkCategory === "商宽 / 企业宽带") return "商宽 / 企业用途";
  if (risk.networkCategory === "商宽/企业宽带") return "商宽 / 企业用途";
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

  const majorISP = isMajorISP(ipApi && ipApi.org, ipApi && ipApi.isp, ipApi && ipApi.as);
  const cloudProvider = detectCloudProvider(ipApi, cz88);

  let isResidential =
    rawLower.indexOf("住宅") !== -1 ||
    rawLower.indexOf("家庭") !== -1 ||
    rawLower.indexOf("家宽") !== -1 ||
    rawLower.indexOf("residential") !== -1;

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
    ipApi.hosting === true ||
    cloudProvider.hit;

  let isMobile =
    rawLower.indexOf("移动") !== -1 ||
    rawLower.indexOf("蜂窝") !== -1 ||
    rawLower.indexOf("mobile") !== -1 ||
    rawLower.indexOf("cellular") !== -1;

  const asText = lower(ipApi && ipApi.as);
  const ispText = lower(ipApi && ipApi.isp);
  const orgText = lower(ipApi && ipApi.org);
  const allAsnText = asText + " " + ispText + " " + orgText;

  const isASNDatacenter =
    /(^|\s)as\d+/.test(asText) &&
    hasAny(allAsnText, [
      "cloud", "hosting", "host", "server", "vps", "colo", "idc", "datacenter",
      "oracle", "aws", "azure", "google cloud", "gcp", "digitalocean", "linode", "vultr",
      "aliyun", "tencent cloud", "huawei cloud"
    ]);

  const isASNResidential =
    hasAny(allAsnText, ["broadband", "residential", "cable", "fiber", "ftth", "家庭", "住宅", "家宽"]) &&
    !isASNDatacenter &&
    !isMobile &&
    !isBusinessLine;

  const transitUpstreamHit = hasAny(allAsnText, SUSPICIOUS_TRANSIT_UPSTREAMS);
  const hostingLikeOrg = hasAny(orgText + " " + ispText, HOSTING_RESELLER_KEYWORDS);

  let humanMeta = getHumanScoreMeta(cz88 && cz88.score, cz88);
  let humanScore = humanMeta.score;

  if (
    majorISP &&
    humanScore !== null &&
    humanScore < 15 &&
    !(ipApi.proxy === true) &&
    !(ipApi.hosting === true) &&
    !cloudProvider.hit
  ) {
    humanScore = Math.min(60, humanScore + 24);
    humanMeta = {
      score: humanScore,
      text: humanScore + "（运营商修正后）",
      suspicious: humanScore < 40,
      missing: false
    };
  }

  const orgLooksBusiness =
    !majorISP &&
    hasAny(orgText, [
      "llc", "inc", "ltd", "limited", "company", "corp", "corporation",
      "enterprise", "business", "aviation", "studio", "tech", "solutions", "group",
      "communications", "network", "fiber", "state"
    ]);

  let abuseScore = 0;
  let totalReports = 0;
  if (abuse && abuse.data) {
    abuseScore = Number(abuse.data.abuseConfidenceScore || 0);
    totalReports = Number(abuse.data.totalReports || 0);
  }

  if (isASNDatacenter || cloudProvider.hit) {
    isDatacenter = true;
    isResidential = false;
    isBusinessLine = false;
    isMobile = false;
  } else if (isMobile) {
    isResidential = false;
  } else if (isASNResidential && !isDatacenter && !isBusinessLine) {
    isResidential = true;
  }

  const dedicatedLineSuspicious =
    rawLower.indexOf("专线") !== -1 &&
    !majorISP &&
    (
      orgLooksBusiness ||
      transitUpstreamHit ||
      hostingLikeOrg ||
      (humanScore !== null && humanScore < 50)
    );

  let networkCategory = "普通网络";

  if (isDatacenter) {
    networkCategory = "数据中心/服务器";
  } else if (dedicatedLineSuspicious) {
    networkCategory = "机房宽带嫌疑";
  } else if (isMobile) {
    networkCategory = majorISP ? "运营商移动网络" : "移动数据";
  } else if (majorISP) {
    networkCategory = "运营商ISP网络";
  } else if (isBusinessLine) {
    networkCategory = "商宽/企业宽带";
  } else if (isResidential || isASNResidential) {
    networkCategory = "住宅宽带";
  } else if (rawLower.indexOf("宽带") !== -1) {
    networkCategory = orgLooksBusiness ? "商宽/企业宽带" : "住宅宽带";
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
    proxyExit = true;
    suspiciousProxy = true;
    uniquePush(tags, "机房托管");
  }

  if (isASNDatacenter || cloudProvider.hit) {
    cloudService = true;
    suspiciousProxy = true;
    uniquePush(tags, "云/机房特征");
  }

  if (transitUpstreamHit && !majorISP) {
    uniquePush(tags, "Transit上游");
  }

  if (hostingLikeOrg && !majorISP) {
    uniquePush(tags, "组织疑似Hosting");
  }

  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") {
    score += 6;
    uniquePush(tags, "ISP网络");
  } else if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") {
    score += 2;
    uniquePush(tags, "移动网络");
  } else if (networkCategory === "商宽/企业宽带") {
    score -= 8;
    uniquePush(tags, "企业用途");
  } else if (networkCategory === "机房宽带嫌疑") {
    score -= 14;
    suspiciousProxy = true;
    uniquePush(tags, "机房宽带嫌疑");
  } else if (networkCategory === "数据中心/服务器") {
    score -= 24;
    suspiciousProxy = true;
    uniquePush(tags, "机房网络");
  }

  if (dedicatedLineSuspicious) {
    score -= 6;
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
      score -= majorISP ? 6 : 16;
      uniquePush(tags, majorISP ? "真人分偏低（已降权）" : "高度可疑");
    }
  } else if (!(networkCategory === "运营商移动网络" || networkCategory === "移动数据")) {
    score -= 6;
    uniquePush(tags, "数据缺失");
  }

  if (abuseScore > 0) {
    blacklisted = true;
    abuseNode = true;
    uniquePush(tags, "滥用记录");
  }

  if (abuseScore >= 50 || totalReports >= 10) {
    attackInvolved = true;
    uniquePush(tags, "攻击风险");
  }

  if (abuseScore >= 80) score -= 25;
  else if (abuseScore >= 50) score -= 18;
  else if (abuseScore >= 20) score -= 10;
  else if (abuseScore > 0) score -= 5;

  let riskValue = 8;
  let nativeFeel = 55;
  let sharedFeel = 20;

  if (ipApi.proxy === true) riskValue += 28;
  if (ipApi.hosting === true) riskValue += 28;
  if (networkCategory === "数据中心/服务器") riskValue += 24;
  if (networkCategory === "机房宽带嫌疑") riskValue += 18;
  if (networkCategory === "商宽/企业宽带") riskValue += 12;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") riskValue += 4;
  if (cloudProvider.hit) riskValue += 22;
  if (dedicatedLineSuspicious) riskValue += 10;
  if (transitUpstreamHit && !majorISP) riskValue += 6;

  if (humanScore !== null) {
    if (humanScore >= 80) riskValue -= 8;
    else if (humanScore >= 60) riskValue -= 2;
    else if (humanScore >= 40) riskValue += 4;
    else if (humanScore >= 20) riskValue += 8;
    else riskValue += majorISP ? 4 : 16;
  } else if (!(networkCategory === "运营商移动网络" || networkCategory === "移动数据")) {
    riskValue += 8;
  }

  riskValue += Math.min(30, Math.round(abuseScore * 0.3));
  if (totalReports >= 10) riskValue += 10;
  else if (totalReports > 0) riskValue += 4;
  riskValue = clamp(riskValue, 0, 100);

  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") nativeFeel += 18;
  if (networkCategory === "商宽/企业宽带") nativeFeel += 1;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") nativeFeel += 8;
  if (networkCategory === "数据中心/服务器") nativeFeel -= 30;
  if (networkCategory === "机房宽带嫌疑") nativeFeel -= 18;
  if (ipApi.hosting === true) nativeFeel -= 22;
  if (ipApi.proxy === true) nativeFeel -= 18;
  if (cloudProvider.hit) nativeFeel -= 20;
  if (dedicatedLineSuspicious) nativeFeel -= 8;
  if (transitUpstreamHit && !majorISP) nativeFeel -= 4;

  if (humanScore !== null) {
    if (humanScore >= 80) nativeFeel += 14;
    else if (humanScore >= 60) nativeFeel += 6;
    else if (humanScore >= 40) nativeFeel -= 4;
    else if (humanScore >= 20) nativeFeel -= 8;
    else nativeFeel -= majorISP ? 8 : 18;
  }

  nativeFeel -= Math.min(15, Math.round(abuseScore * 0.15));
  nativeFeel = clamp(nativeFeel, 0, 100);

  if (ipApi.hosting === true) sharedFeel += 28;
  if (ipApi.proxy === true) sharedFeel += 20;
  if (networkCategory === "数据中心/服务器") sharedFeel += 24;
  if (networkCategory === "机房宽带嫌疑") sharedFeel += 16;
  if (networkCategory === "商宽/企业宽带") sharedFeel += 10;
  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") sharedFeel -= 6;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") sharedFeel += 6;
  if (cloudProvider.hit) sharedFeel += 18;
  if (dedicatedLineSuspicious) sharedFeel += 8;

  if (humanScore !== null) {
    if (humanScore >= 80) sharedFeel -= 6;
    else if (humanScore >= 60) sharedFeel -= 2;
    else if (humanScore >= 40) sharedFeel += 4;
    else if (humanScore >= 20) sharedFeel += 8;
    else sharedFeel += majorISP ? 6 : 12;
  }

  sharedFeel += Math.min(20, Math.round(abuseScore * 0.2));
  if (totalReports >= 10) sharedFeel += 10;
  sharedFeel = clamp(sharedFeel, 0, 100);

  let historyBehavior = 82;
  historyBehavior -= Math.min(50, Math.round(abuseScore * 0.5));
  historyBehavior -= Math.min(20, totalReports);
  if (ipApi.proxy === true) historyBehavior -= 10;
  if (ipApi.hosting === true) historyBehavior -= 8;
  if (humanScore !== null && humanScore < 20 && !majorISP) historyBehavior -= 8;
  if (networkCategory === "机房宽带嫌疑") historyBehavior -= 6;
  if (networkCategory === "数据中心/服务器") historyBehavior -= 10;
  historyBehavior = clamp(historyBehavior, 0, 100);

  let shareCountScore = sharedFeel;
  if ((networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") && historyBehavior >= 80) {
    shareCountScore -= 4;
  }
  if (networkCategory === "数据中心/服务器") shareCountScore += 8;
  if (networkCategory === "机房宽带嫌疑") shareCountScore += 6;
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

  let residentialProbability = 40;
  let businessProbability = 26;
  let datacenterProbability = 22;

  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") residentialProbability += 18;
  if (networkCategory === "商宽/企业宽带") businessProbability += 24;
  if (networkCategory === "机房宽带嫌疑") datacenterProbability += 20;
  if (networkCategory === "数据中心/服务器") datacenterProbability += 34;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") residentialProbability += 6;

  if (majorISP) residentialProbability += 10;
  if (orgLooksBusiness) businessProbability += 10;
  if (dedicatedLineSuspicious) datacenterProbability += 10;
  if (transitUpstreamHit && !majorISP) {
    businessProbability += 6;
    datacenterProbability += 6;
  }

  if (humanScore !== null) {
    if (humanScore >= 80) residentialProbability += 8;
    else if (humanScore >= 60) residentialProbability += 4;
    else if (humanScore < 20 && !majorISP) {
      residentialProbability -= 10;
      datacenterProbability += 8;
      businessProbability += 8;
    }
  }

  if (ipApi.hosting === true || cloudProvider.hit) {
    residentialProbability -= 18;
    datacenterProbability += 18;
  }

  if (ipApi.proxy === true) {
    residentialProbability -= 10;
    datacenterProbability += 8;
  }

  residentialProbability -= Math.min(15, Math.round(abuseScore * 0.15));
  datacenterProbability += Math.min(10, Math.round(abuseScore * 0.1));

  residentialProbability = clamp(residentialProbability, 0, 100);
  businessProbability = clamp(businessProbability, 0, 100);
  datacenterProbability = clamp(datacenterProbability, 0, 100);

  let fakeResidentialRisk = 0;
  if (isResidential || isASNResidential) fakeResidentialRisk += 20;
  if (orgLooksBusiness) fakeResidentialRisk += 20;
  if (humanMeta.suspicious && !majorISP) fakeResidentialRisk += 12;
  if (sharedFeel >= 35) fakeResidentialRisk += 12;
  if (nativeFeel <= 50) fakeResidentialRisk += 12;
  if (cloudProvider.hit) fakeResidentialRisk += 20;
  if (networkCategory === "商宽/企业宽带") fakeResidentialRisk += 20;
  if (networkCategory === "机房宽带嫌疑") fakeResidentialRisk += 28;
  if (transitUpstreamHit && !majorISP) fakeResidentialRisk += 10;
  if (majorISP) fakeResidentialRisk -= 18;
  fakeResidentialRisk = clamp(fakeResidentialRisk, 0, 100);

  let fakeResidentialLabel = "否";
  if (fakeResidentialRisk >= 65) fakeResidentialLabel = "高";
  else if (fakeResidentialRisk >= 35) fakeResidentialLabel = "中";

  let llmSummary = "特征较均衡";
  if (residentialProbability >= businessProbability && residentialProbability >= datacenterProbability) {
    llmSummary = residentialProbability >= 70 ? "更像家庭宽带" : "偏家庭宽带";
  } else if (businessProbability >= residentialProbability && businessProbability >= datacenterProbability) {
    llmSummary = "更像商业宽带或企业用途";
  } else {
    llmSummary = "更像机房宽带或数据中心";
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

    if (abuseScore > 0) {
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

  if ((networkCategory === "运营商移动网络" || networkCategory === "移动数据")) airportSuspicion += 6;
  if (sharedFeel >= 35) airportSuspicion += 10;
  if (nativeFeel <= 45) airportSuspicion += 10;
  if (cloudProvider.hit) airportSuspicion += 20;
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
  if (mobileBehaviorRisk > 50) {
    platformRisk += 12;
  }
  if (ipApi.proxy || ipApi.hosting) {
    platformRisk += 30;
    vpnProbability += 30;
    strictLibraryFlag = true;
  }
  if (cloudProvider.hit || isASNDatacenter) {
    platformRisk += 20;
    vpnProbability += 25;
    strictLibraryFlag = true;
  }
  if (networkCategory === "机房宽带嫌疑") {
    strictLibraryFlag = strictLibraryFlag || vpnProbability >= 55;
  }

  if (majorISP && !ipApi.proxy && !ipApi.hosting && !cloudProvider.hit && abuseScore === 0) {
    platformRisk -= 8;
    vpnProbability -= 8;
    airportSuspicion -= 8;
    associationRisk -= 6;
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
  if (cloudProvider.hit) platformControlPressure += 15;
  if (ipApi.proxy || ipApi.hosting) platformControlPressure += 20;
  if (networkCategory === "机房宽带嫌疑") platformControlPressure += 10;
  if (majorISP && abuseScore === 0 && !cloudProvider.hit) platformControlPressure -= 8;
  platformControlPressure = clamp(platformControlPressure, 0, 100);

  let platformAssociationLevel = "低";
  if (
    (networkCategory === "运营商移动网络" || networkCategory === "移动数据" || networkCategory === "机房宽带嫌疑") &&
    (associationRisk >= 35 || airportSuspicion >= 35 || platformRisk >= 40)
  ) {
    platformAssociationLevel = "中";
  }
  if (
    (networkCategory === "运营商移动网络" || networkCategory === "移动数据" || networkCategory === "机房宽带嫌疑") &&
    (associationRisk >= 55 || airportSuspicion >= 60 || platformRisk >= 60)
  ) {
    platformAssociationLevel = "高";
  }

  if (abuseScore > 0 || blacklisted || abuseNode || attackInvolved || ipApi.proxy === true || ipApi.hosting === true) {
    blacklistSuspicious = true;
  }

  if (proxyExit || blacklisted || attackInvolved || abuseScore >= 20) {
    highRiskProxy = true;
  } else if (
    ipApi.proxy === true ||
    ipApi.hosting === true ||
    cloudProvider.hit ||
    isASNDatacenter ||
    networkCategory === "机房宽带嫌疑" ||
    networkCategory === "数据中心/服务器" ||
    ((networkCategory === "运营商移动网络" || networkCategory === "移动数据") && (airportSuspicion >= 70 || platformRisk >= 60))
  ) {
    suspiciousProxy = true;
  } else {
    suspiciousProxy = false;
  }

  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") {
    if (sharedFeel > 35) score = Math.min(score, 82);
  }
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") {
    if (platformAssociationLevel === "高") score = Math.min(score, 84);
    if (associationRisk >= 35) score = Math.min(score, 86);
    if (airportSuspicion >= 35) score = Math.min(score, 84);
  }
  if (networkCategory === "机房宽带嫌疑") {
    score = Math.min(score, 72);
  }
  if (networkCategory === "数据中心/服务器") {
    score = Math.min(score, 62);
  }

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
  let financeRisk = 0;

  appleRisk += Math.round((100 - nativeFeel) * 0.35);
  appleRisk += Math.round(sharedFeel * 0.25);
  appleRisk += Math.round(riskValue * 0.2);
  if (suspiciousProxy) appleRisk += 20;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") appleRisk += 10;
  if (airportSuspicion >= 60) appleRisk += 15;
  if (networkCategory === "机房宽带嫌疑") appleRisk += 12;
  if (networkCategory === "数据中心/服务器") appleRisk += 20;

  googleRisk += Math.round(riskValue * 0.35);
  googleRisk += Math.round(sharedFeel * 0.25);
  googleRisk += Math.round(mobileBehaviorRisk * 0.2);
  if (suspiciousProxy) googleRisk += 20;
  if (platformRisk >= 50) googleRisk += 10;
  if (networkCategory === "机房宽带嫌疑") googleRisk += 10;
  if (networkCategory === "数据中心/服务器") googleRisk += 18;

  tiktokRisk += Math.round((100 - nativeFeel) * 0.2);
  tiktokRisk += Math.round(sharedFeel * 0.15);
  tiktokRisk += Math.round(airportSuspicion * 0.2);
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") tiktokRisk -= 6;
  if (networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络") tiktokRisk -= 5;
  if (suspiciousProxy) tiktokRisk += 15;
  if (networkCategory === "机房宽带嫌疑") tiktokRisk += 8;
  if (networkCategory === "数据中心/服务器") tiktokRisk += 12;

  telegramRisk += Math.round(riskValue * 0.2);
  telegramRisk += Math.round(sharedFeel * 0.2);
  telegramRisk += Math.round(mobileBehaviorRisk * 0.15);
  if (suspiciousProxy) telegramRisk += 10;
  if (blacklisted) telegramRisk += 20;
  if (networkCategory === "机房宽带嫌疑") telegramRisk += 8;
  if (networkCategory === "数据中心/服务器") telegramRisk += 12;

  financeRisk += Math.round(riskValue * 0.4);
  financeRisk += Math.round((100 - nativeFeel) * 0.3);
  financeRisk += Math.round(sharedFeel * 0.25);
  financeRisk += Math.round(associationRisk * 0.25);
  financeRisk += Math.round(airportSuspicion * 0.25);
  if (suspiciousProxy) financeRisk += 25;
  if (blacklisted) financeRisk += 40;
  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") financeRisk += 12;
  if (networkCategory === "机房宽带嫌疑") financeRisk += 18;
  if (networkCategory === "数据中心/服务器") financeRisk += 28;

  if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") {
    appleRisk = Math.max(appleRisk, 35);
    googleRisk = Math.max(googleRisk, 30);
    financeRisk = Math.max(financeRisk, 45);
  }
  if ((networkCategory === "运营商移动网络" || networkCategory === "移动数据") &&
      (associationRisk >= 35 || airportSuspicion >= 35)) {
    appleRisk = Math.max(appleRisk, 40);
    googleRisk = Math.max(googleRisk, 35);
    financeRisk = Math.max(financeRisk, 55);
  }

  if (networkCategory === "机房宽带嫌疑") {
    appleRisk = Math.max(appleRisk, 45);
    googleRisk = Math.max(googleRisk, 40);
    financeRisk = Math.max(financeRisk, 60);
  }

  if (networkCategory === "数据中心/服务器") {
    appleRisk = Math.max(appleRisk, 60);
    googleRisk = Math.max(googleRisk, 55);
    financeRisk = Math.max(financeRisk, 75);
  }

  if (majorISP && abuseScore === 0 && !cloudProvider.hit && !ipApi.proxy && !ipApi.hosting) {
    appleRisk -= 5;
    googleRisk -= 4;
    tiktokRisk -= 4;
    telegramRisk -= 4;
  }

  appleRisk = clamp(appleRisk, 0, 100);
  googleRisk = clamp(googleRisk, 0, 100);
  tiktokRisk = clamp(tiktokRisk, 0, 100);
  telegramRisk = clamp(telegramRisk, 0, 100);
  financeRisk = clamp(financeRisk, 0, 100);

  const platformAdvice = {
    apple: adviceByRisk(appleRisk, "推荐", "谨慎", "不建议"),
    google: adviceByRisk(googleRisk, "推荐", "可用", "谨慎"),
    tiktok: adviceByRisk(tiktokRisk, "推荐", "可用", "谨慎"),
    telegram: adviceByRisk(telegramRisk, "推荐", "可用", "谨慎"),
    finance: adviceByRisk(financeRisk, "可用", "谨慎", "不建议")
  };

  let hardRiskConclusion = "无明确黑名单/滥用风险";
  if (blacklisted || abuseNode || attackInvolved) {
    hardRiskConclusion = "存在明确滥用或黑名单风险";
  } else if (ipApi.proxy === true || ipApi.hosting === true) {
    hardRiskConclusion = "存在明确代理或托管风险";
  }

  let platformRiskConclusion = "平台关联压力低";
  if (platformAssociationLevel === "中") platformRiskConclusion = "平台关联压力中";
  if (platformAssociationLevel === "高") platformRiskConclusion = "平台关联压力高";

  let finalConclusion = "整体可正常使用";
  if (blacklisted || abuseNode || attackInvolved) {
    finalConclusion = "存在明确硬风险，不建议用于敏感场景";
  } else if (networkCategory === "数据中心/服务器" || proxyExit) {
    finalConclusion = "偏机房/代理/托管出口，不建议用于注册、主号、金融等敏感用途";
  } else if (networkCategory === "机房宽带嫌疑") {
    finalConclusion = "存在明显机房宽带/托管嫌疑，不建议按纯净家宽看待；普通浏览可用，注册和主号场景谨慎";
  } else if (networkCategory === "运营商移动网络" || networkCategory === "移动数据") {
    if (platformAssociationLevel === "高") {
      finalConclusion = "移动网络整体不脏，但平台关联压力较高，敏感场景谨慎";
    } else if (platformAssociationLevel === "中") {
      finalConclusion = "偏干净移动网络，日常使用良好，但不建议按低关联独享住宅看待";
    } else {
      finalConclusion = "偏干净移动网络，整体可正常使用";
    }
  } else if (networkCategory === "运营商ISP网络") {
    finalConclusion = "整体较稳，接近正常运营商家宽/ISP出口，可正常使用";
  } else if (networkCategory === "商宽/企业宽带") {
    finalConclusion = "偏商宽/专线或企业用途，不建议按纯净家宽看待；普通浏览可行，注册、主号、金融场景谨慎";
  } else if (score >= 85 && networkCategory === "住宅宽带") {
    finalConclusion = "偏优质住宅，日常使用问题不大";
  } else {
    finalConclusion = "整体较稳，可正常使用";
  }

  return {
    score,
    level,
    networkCategory,
    isResidential: networkCategory === "住宅宽带" || networkCategory === "运营商ISP网络",
    isBusinessLine: networkCategory === "商宽/企业宽带" || networkCategory === "机房宽带嫌疑",
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
    financeRisk,
    platformAdvice,
    cloudProvider,
    fakeResidentialRisk,
    fakeResidentialLabel,
    platformControlPressure,
    dataCompleteness,
    dataCompletenessScore,
    platformAssociationLevel,
    majorISP,
    dedicatedLineSuspicious,
    transitUpstreamHit,
    hostingLikeOrg,
    tags: tags.length ? Array.from(new Set(tags)).join(" / ") : "无明显异常"
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

      const resultCacheKey = getResultCacheKey(ipApi.query);
      const resultCache = readCache(resultCacheKey);
      if (resultCache && resultCache.time && (Date.now() - resultCache.time < RESULT_CACHE_TTL)) {
        return done(resultCache.data);
      }

      const cz88Url = "https://www.cz88.net/api/cz88/ip/base?ip=" + ipApi.query;
      httpGet(cz88Url, function (err2, res2, data2) {
        let cz88Data = null;
        if (!err2 && data2) {
          const cz88Json = parseJSON(data2);
          if (cz88Json && cz88Json.data) cz88Data = cz88Json.data;
        }

        checkAbuseIPDB(ipApi.query, function (abuseData, abuseFromCache) {
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

          const registerRiskText = formatRiskPercent(behavior.registerRisk);
          const loginRiskText = formatRiskPercent(behavior.loginRisk);
          const browseRiskText = formatRiskPercent(behavior.browseRisk);

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

          runChecks(checks, function (results) {
            const lines = [];

            lines.push("【节点信息】");
            lines.push("节点：" + NODE_NAME);
            lines.push("");

            lines.push("【IP详细】");
            lines.push("IP：" + (ipApi.query || "-"));
            lines.push("ASN：" + (ipApi.as || "-"));
            lines.push("ASN类型：" + asnType);
            lines.push("IP类型：" + ipTypeLabel);
            lines.push("位置：" + (ipApi.country || "-") + " " + (ipApi.regionName || "-") + " " + (ipApi.city || "-"));
            lines.push("");

            lines.push("【基础信息】");
            lines.push("国家/地区：" + (ipApi.country || "-"));
            lines.push("地区：" + (ipApi.regionName || "-"));
            lines.push("城市：" + (ipApi.city || "-"));
            lines.push("ZIP：" + (ipApi.zip || "-"));
            lines.push("ISP：" + ((cz88Data && cz88Data.isp) || ipApi.isp || "-"));
            lines.push("组织：" + (ipApi.org || "-"));
            lines.push("时区：" + (ipApi.timezone || "-"));
            lines.push("经纬度：" + (ipApi.lat || "-") + " / " + (ipApi.lon || "-"));
            lines.push("主流运营商：" + (risk.majorISP ? "是" : "否"));
            lines.push("");

            lines.push("【网络检测】");
            lines.push("主类型：" + (risk.networkCategory || "-"));
            lines.push("住宅/ISP底子：" + (risk.isResidential ? "是" : "否"));
            lines.push("商宽/专线底子：" + (risk.isBusinessLine ? "是" : "否"));
            lines.push("数据中心：" + (risk.isDatacenter ? "是" : "否"));
            lines.push("移动网络：" + (risk.isMobile ? "是" : "否"));
            lines.push("ASN机房特征：" + (risk.isASNDatacenter ? "是" : "否"));
            lines.push("专线可疑增强：" + (risk.dedicatedLineSuspicious ? "是" : "否"));
            lines.push("Transit上游命中：" + (risk.transitUpstreamHit ? "是" : "否"));
            lines.push("Hosting组织特征：" + (risk.hostingLikeOrg ? "是" : "否"));
            lines.push("原始网络标记：" + ((cz88Data && cz88Data.netWorkType) || "未返回"));
            lines.push("真人概率：" + (risk.humanMeta ? risk.humanMeta.text : "未知（数据不足）"));
            lines.push("代理标记：" + (ipApi.proxy ? "是" : "否"));
            lines.push("托管标记：" + (ipApi.hosting ? "是" : "否"));
            lines.push("");

            lines.push("【综合质量】");
            lines.push("综合质量分：" + risk.score + " / 100");
            lines.push("质量判断：" + risk.level);
            lines.push("数据完整度：" + risk.dataCompleteness + "（" + risk.dataCompletenessScore + "）");
            lines.push("特征：" + risk.tags);
            lines.push("");

            lines.push("【大模型检测】");
            lines.push("家庭宽带概率：" + risk.residentialProbability + "%");
            lines.push("商业宽带概率：" + risk.businessProbability + "%");
            lines.push("机房宽带概率：" + risk.datacenterProbability + "%");
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
            lines.push("云厂商命中：" + (risk.cloudProvider.hit ? (risk.cloudProvider.name + " / " + risk.cloudProvider.keyword) : "否"));
            lines.push(line("假家宽识别", fakeResidentialText.text, fakeResidentialText.level));
            lines.push(line("平台风控压力", platformPressureText.text, platformPressureText.level));
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

            lines.push("【本地模拟结果（非真实API）】");
            lines.push(line("IPPure模拟", simulated.ippure.text, simulated.ippure.level));
            lines.push(line("Scamalytics模拟", simulated.scamalytics.text, simulated.scamalytics.level));
            lines.push(line("IP2Location模拟", simulated.ip2location.text, simulated.ip2location.level));
            lines.push(line("ipregistry模拟", simulated.ipregistry.text, simulated.ipregistry.level));
            lines.push("");

            lines.push("【硬风险判定】");
            lines.push(boolLine("匿名VPN风格", risk.anonymousVpnStyle));
            lines.push(boolLine("机房代理风格", risk.cloudService || risk.isDatacenter || risk.isASNDatacenter));
            lines.push(boolLine("公共代理风格", risk.publicProxyStyle));
            lines.push(boolLine("黑名单", risk.blacklisted));
            lines.push(boolLine("滥用节点", risk.abuseNode));
            lines.push(boolLine("TOR节点风格", risk.torStyle));
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

            lines.push("【分平台建议】");
            lines.push("苹果：" + risk.platformAdvice.apple + "（风险 " + risk.appleRisk + "）");
            lines.push("谷歌：" + risk.platformAdvice.google + "（风险 " + risk.googleRisk + "）");
            lines.push("TikTok：" + risk.platformAdvice.tiktok + "（风险 " + risk.tiktokRisk + "）");
            lines.push("Telegram：" + risk.platformAdvice.telegram + "（风险 " + risk.telegramRisk + "）");
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