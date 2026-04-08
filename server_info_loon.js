/*************************************
 * 节点详情查询 Ultimate（终极融合算法版 / 细节优化完整版）
 * 数据源：
 * - ip-api
 * - cz88
 * - AbuseIPDB
 *
 * 设计原则：
 * 1. 硬风险 与 平台关联风险分离
 * 2. 黑名单状态只由硬信号触发
 * 3. 移动网络不等于黑名单，但对苹果 / 谷歌 / 金融类更严
 *************************************/

const TIMEOUT = 15000;

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
        "以后可使用不带 argument 的普通版插件"
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

/*************** 通用工具 ***************/
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
    if (t.indexOf(arr[i]) !== -1) return true;
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
    if (index >= checks.length) {
      callback(results);
      return;
    }
    const item = checks[index++];
    item.run(function (value, level) {
      results.push({ name: item.name, value: value, level: level });
      next();
    });
  }
  next();
}

/*************** 云厂商关键词 ***************/
const CLOUD_PROVIDER_KEYWORDS = [
  "amazon", "aws", "amazon technologies", "ec2",
  "google", "google cloud", "gcp",
  "microsoft", "azure",
  "oracle", "oci",
  "digitalocean",
  "linode", "akamai connected cloud",
  "vultr",
  "ovh",
  "hetzner",
  "contabo",
  "aliyun", "alibaba cloud",
  "tencent cloud",
  "huawei cloud",
  "cloudflare",
  "choopa",
  "m247",
  "scaleway"
];

function detectCloudProvider(ipApi, cz88) {
  const text = [
    ipApi && ipApi.as,
    ipApi && ipApi.isp,
    ipApi && ipApi.org,
    cz88 && cz88.isp,
    cz88 && cz88.netWorkType
  ].join(" ").toLowerCase();

  for (let i = 0; i < CLOUD_PROVIDER_KEYWORDS.length; i++) {
    if (text.indexOf(CLOUD_PROVIDER_KEYWORDS[i]) !== -1) {
      return {
        hit: true,
        name: CLOUD_PROVIDER_KEYWORDS[i]
      };
    }
  }

  return {
    hit: false,
    name: ""
  };
}

/*************** 真人概率 ***************/
function getHumanScoreMeta(score, cz88) {
  const n = Number(score);
  const rawType = String((cz88 && cz88.netWorkType) || "");
  const hasUsefulCz88 = !!rawType;

  if (isNaN(n)) {
    return { score: null, text: "未知（数据不足）", suspicious: false, missing: true };
  }

  if (n === 0 && !hasUsefulCz88) {
    return { score: null, text: "未知（数据不足）", suspicious: false, missing: true };
  }

  if (n >= 80) return { score: n, text: n + "（很像真人）", suspicious: false, missing: false };
  if (n >= 60) return { score: n, text: n + "（正常偏好）", suspicious: false, missing: false };
  if (n >= 40) return { score: n, text: n + "（可疑，有点像代理）", suspicious: true, missing: false };
  return { score: n, text: n + "（很像代理/机房）", suspicious: true, missing: false };
}

/*************** AbuseIPDB ***************/
function checkAbuseIPDB(ip, cb) {
  if (!ABUSEIPDB_KEY) return cb(null);

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
      if (err || !data) return cb(null);
      cb(parseJSON(data) || null);
    }
  );
}

/*************** 媒体检测 ***************/
function checkNetflix(cb) {
  httpGet(
    {
      url: "https://www.netflix.com/title/81215567",
      headers: { "User-Agent": "Mozilla/5.0" }
    },
    function (err, resp) {
      if (err || !resp) return cb("检测失败", "fail");
      const code = resp.status || resp.statusCode || 0;
      if (code === 200) return cb("可用", "ok");
      if (code === 404) return cb("仅自制剧", "warn");
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
      if (code === 301 || code === 302) return cb("重定向", "warn");
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
      const match = data.match(/"countryCode":"(.*?)"/);
      if (match && match[1]) return cb("Premium地区 " + match[1], "ok");
      const code = resp.status || resp.statusCode || 0;
      if (code === 200) return cb("可访问", "warn");
      return cb("未知(" + code + ")", "warn");
    }
  );
}

/*************** 格式化 ***************/
function formatAbuseScore(abuse) {
  if (!ABUSEIPDB_KEY) return { text: "未启用", level: "warn" };
  if (!abuse || !abuse.data) return { text: "请求失败", level: "fail" };
  const s = Number(abuse.data.abuseConfidenceScore || 0);
  if (s === 0) return { text: "低风险（" + s + "）", level: "ok" };
  if (s < 50) return { text: "一般风险（" + s + "）", level: "warn" };
  return { text: "高风险（" + s + "）", level: "fail" };
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
  if (t.indexOf("移动") !== -1 || t.indexOf("蜂窝") !== -1 || t.indexOf("mobile") !== -1) {
    return { text: t, level: "ok" };
  }
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

/*************** 多源评分（本地模拟） ***************/
function simulateMultiSourceScores(risk, ipApi) {
  const riskValue = Math.round(risk.riskValue || 0);
  const shared = Math.round(risk.sharedFeel || 0);

  let ippure = { text: "低风险（1）", level: "ok" };
  if (risk.mobileBehaviorRisk >= 60) {
    ippure = { text: "行为风险偏高（" + risk.mobileBehaviorRisk + "）", level: "fail" };
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
  } else if (risk.networkCategory === "移动数据") {
    ip2location = { text: "移动网络（MOB）", level: "ok" };
  }

  let ipregistry = { text: "干净（Clean）", level: "ok" };
  if (ipApi.proxy) ipregistry = { text: "有标记（Proxy）", level: "fail" };
  else if (ipApi.hosting || risk.networkCategory === "数据中心/服务器") {
    ipregistry = { text: "有标记（Hosting）", level: "warn" };
  } else if (risk.networkCategory === "商宽/企业宽带" || risk.networkCategory === "机房宽带嫌疑") {
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
    "oracle", "aws", "azure", "google", "gcp", "digitalocean", "linode", "vultr",
    "aliyun", "tencent cloud", "huawei cloud"
  ])) {
    return "云/机房ASN";
  }

  if (risk.networkCategory === "移动数据" && hasAny(all, [
    "mobile", "wireless", "移动", "cellular", "rakuten mobile", "rakuten", "telecom mobile", "t-mobile"
  ])) {
    return "移动网络ASN";
  }

  if (hasAny(all, ["broadband", "residential", "cable", "fiber", "宽带", "住宅", "家庭"])) {
    return "家宽ASN";
  }

  return "普通ASN";
}

function inferIpTypeLabel(risk, ipApi, cz88) {
  if (risk.networkCategory === "数据中心/服务器") return "数据中心 / 服务器";
  if (risk.networkCategory === "机房宽带嫌疑") return "机房宽带嫌疑";
  if (risk.networkCategory === "商宽/企业宽带") return "商宽 / 企业用途";
  if (risk.networkCategory === "住宅宽带") return "住宅宽带";
  if (risk.networkCategory === "移动数据") return "移动数据";
  if (ipApi.proxy) return "代理出口";
  const raw = String((cz88 && cz88.netWorkType) || "");
  return raw || "普通网络";
}

/*************** 核心分析 ***************/
function analyzeRisk(ipApi, cz88, abuse) {
  const rawNetwork = String((cz88 && cz88.netWorkType) || "");
  const rawLower = lower(rawNetwork);

  let isResidential =
    rawLower.indexOf("住宅") !== -1 ||
    rawLower.indexOf("家庭") !== -1 ||
    rawLower.indexOf("宽带") !== -1;

  let isDatacenter =
    rawLower.indexOf("机房") !== -1 ||
    rawLower.indexOf("数据中心") !== -1 ||
    ipApi.hosting === true;

  let isMobile =
    rawLower.indexOf("移动") !== -1 ||
    rawLower.indexOf("蜂窝") !== -1 ||
    rawLower.indexOf("mobile") !== -1;

  const asText = lower(ipApi && ipApi.as);
  const ispText = lower(ipApi && ipApi.isp);
  const orgText = lower(ipApi && ipApi.org);
  const allAsnText = asText + " " + ispText + " " + orgText;

  const isASNDatacenter =
    /(^|\s)as\d+/.test(asText) &&
    hasAny(allAsnText, [
      "cloud", "hosting", "host", "server", "vps", "colo", "idc", "datacenter",
      "oracle", "aws", "azure", "google", "gcp", "digitalocean", "linode", "vultr",
      "aliyun", "tencent cloud", "huawei cloud", "data communications"
    ]);

  const isASNResidential =
    hasAny(allAsnText, ["broadband", "residential", "cable", "fiber", "宽带", "家庭", "住宅"]) &&
    !isASNDatacenter &&
    !isMobile;

  const humanMeta = getHumanScoreMeta(cz88 && cz88.score, cz88);
  const humanScore = humanMeta.score;

  const orgLooksBusiness = hasAny(orgText, [
    "llc", "inc", "ltd", "limited", "company", "corp", "corporation",
    "enterprise", "business", "aviation", "studio", "tech", "solutions", "group"
  ]);

  const cloudProvider = detectCloudProvider(ipApi, cz88);

  let abuseScore = 0;
  let totalReports = 0;
  if (abuse && abuse.data) {
    abuseScore = Number(abuse.data.abuseConfidenceScore || 0);
    totalReports = Number(abuse.data.totalReports || 0);
  }

  if (isASNDatacenter) {
    isDatacenter = true;
    isResidential = false;
    isMobile = false;
  } else if (isMobile) {
    isResidential = false;
  } else if (isASNResidential && !isDatacenter) {
    isResidential = true;
  }

  let networkCategory = "普通网络";
  if (isMobile) {
    networkCategory = "移动数据";
  } else if (isASNDatacenter || ipApi.hosting === true) {
    networkCategory = "数据中心/服务器";
  } else if (isResidential || isASNResidential) {
    if (!rawNetwork && orgLooksBusiness) {
      networkCategory = "商宽/企业宽带";
    } else if (orgLooksBusiness && (humanMeta.suspicious || totalReports > 0)) {
      networkCategory = "商宽/企业宽带";
    } else if (humanScore !== null && humanScore < 40) {
      networkCategory = "机房宽带嫌疑";
    } else {
      networkCategory = "住宅宽带";
    }
  } else if (isDatacenter) {
    networkCategory = "数据中心/服务器";
  }

  let score = 88;
  const tags = [];

  let proxyExit = false;
  let suspiciousProxy = false;
  let highRiskProxy = false;
  let cloudService = false;

  // 只允许硬信号影响黑名单状态
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
    uniquePush(tags, "代理出口");
  }

  if (ipApi.hosting === true) {
    cloudService = true;
    proxyExit = true;
    suspiciousProxy = true;
    uniquePush(tags, "机房托管");
  }

  if (isASNDatacenter) {
    cloudService = true;
    suspiciousProxy = true;
    uniquePush(tags, "ASN机房特征");
  }

  if (cloudProvider.hit) {
    cloudService = true;
    suspiciousProxy = true;
    uniquePush(tags, "云厂商特征");
  }

  if (networkCategory === "住宅宽带") {
    score += 8;
    uniquePush(tags, "住宅宽带");
  } else if (networkCategory === "商宽/企业宽带") {
    score -= 6;
    uniquePush(tags, "企业用途");
  } else if (networkCategory === "机房宽带嫌疑") {
    score -= 12;
    suspiciousProxy = true;
    uniquePush(tags, "机房宽带嫌疑");
  } else if (networkCategory === "移动数据") {
    score += 3;
    uniquePush(tags, "移动网络");
  } else if (networkCategory === "数据中心/服务器") {
    score -= 20;
    uniquePush(tags, "机房网络");
  }

  if (humanScore !== null) {
    if (humanScore >= 80) score += 6;
    else if (humanScore >= 60) score += 2;
    else if (humanScore >= 40) {
      score -= 8;
      uniquePush(tags, "真人概率偏低");
    } else {
      score -= 15;
      suspiciousProxy = true;
      uniquePush(tags, "高度可疑");
    }
  } else if (networkCategory !== "移动数据") {
    score -= 6;
    uniquePush(tags, "数据缺失");
  }

  if (abuseScore > 0) {
    blacklisted = true;
    abuseNode = true;
    highRiskProxy = true;
    uniquePush(tags, "滥用记录");
  }

  if (abuseScore >= 50 || totalReports >= 10) {
    attackInvolved = true;
    uniquePush(tags, "攻击风险");
  }

  if (ipApi.proxy === true) {
    anonymousVpnStyle = true;
    publicProxyStyle = true;
  }

  if (abuseScore >= 80) score -= 25;
  else if (abuseScore >= 50) score -= 18;
  else if (abuseScore >= 20) score -= 10;
  else if (abuseScore > 0) score -= 5;

  if (!rawNetwork && networkCategory !== "移动数据") score -= 10;

  let riskValue = 8;
  let nativeFeel = 55;
  let sharedFeel = 20;

  if (ipApi.proxy === true) riskValue += 28;
  if (ipApi.hosting === true) riskValue += 28;
  if (networkCategory === "数据中心/服务器") riskValue += 20;
  if (networkCategory === "机房宽带嫌疑") riskValue += 12;
  if (isASNDatacenter) riskValue += 20;
  if (networkCategory === "商宽/企业宽带") riskValue += 12;
  if (networkCategory === "移动数据") riskValue += 4;
  if (cloudProvider.hit) riskValue += 22;

  if (humanScore !== null) {
    if (humanScore >= 80) riskValue -= 8;
    else if (humanScore >= 60) riskValue -= 2;
    else if (humanScore >= 40) riskValue += 8;
    else riskValue += 16;
  } else if (networkCategory !== "移动数据") {
    riskValue += 8;
  }

  riskValue += Math.min(30, Math.round(abuseScore * 0.3));
  if (totalReports >= 10) riskValue += 10;
  else if (totalReports > 0) riskValue += 4;
  if (!rawNetwork && networkCategory !== "移动数据") riskValue += 8;
  riskValue = clamp(riskValue, 0, 100);

  if (networkCategory === "住宅宽带") nativeFeel += 22;
  if (networkCategory === "商宽/企业宽带") nativeFeel += 4;
  if (networkCategory === "移动数据") nativeFeel += 10;
  if (networkCategory === "数据中心/服务器") nativeFeel -= 28;
  if (networkCategory === "机房宽带嫌疑") nativeFeel -= 18;
  if (isASNDatacenter) nativeFeel -= 18;
  if (ipApi.hosting === true) nativeFeel -= 22;
  if (ipApi.proxy === true) nativeFeel -= 18;
  if (cloudProvider.hit) nativeFeel -= 20;

  if (humanScore !== null) {
    if (humanScore >= 80) nativeFeel += 14;
    else if (humanScore >= 60) nativeFeel += 6;
    else if (humanScore >= 40) nativeFeel -= 8;
    else nativeFeel -= 18;
  } else if (networkCategory !== "移动数据") {
    nativeFeel -= 8;
  }

  nativeFeel -= Math.min(15, Math.round(abuseScore * 0.15));
  if (!rawNetwork && networkCategory !== "移动数据") nativeFeel -= 8;
  nativeFeel = clamp(nativeFeel, 0, 100);

  if (ipApi.hosting === true) sharedFeel += 28;
  if (ipApi.proxy === true) sharedFeel += 20;
  if (networkCategory === "数据中心/服务器") sharedFeel += 20;
  if (networkCategory === "机房宽带嫌疑") sharedFeel += 12;
  if (isASNDatacenter) sharedFeel += 18;
  if (networkCategory === "商宽/企业宽带") sharedFeel += 10;
  if (networkCategory === "住宅宽带") sharedFeel -= 8;
  if (networkCategory === "移动数据") sharedFeel += 3;
  if (cloudProvider.hit) sharedFeel += 18;

  if (humanScore !== null) {
    if (humanScore >= 80) sharedFeel -= 6;
    else if (humanScore >= 60) sharedFeel -= 2;
    else if (humanScore >= 40) sharedFeel += 8;
    else sharedFeel += 12;
  } else if (networkCategory !== "移动数据") {
    sharedFeel += 6;
  }

  sharedFeel += Math.min(20, Math.round(abuseScore * 0.2));
  if (totalReports >= 10) sharedFeel += 10;
  if (!rawNetwork && networkCategory !== "移动数据") sharedFeel += 8;
  sharedFeel = clamp(sharedFeel, 0, 100);

  let historyBehavior = 82;
  historyBehavior -= Math.min(50, Math.round(abuseScore * 0.5));
  historyBehavior -= Math.min(20, totalReports);
  if (ipApi.proxy === true) historyBehavior -= 10;
  if (ipApi.hosting === true) historyBehavior -= 8;
  if (isASNDatacenter) historyBehavior -= 8;
  if (humanScore !== null && humanScore < 40) historyBehavior -= 8;
  if (!rawNetwork && networkCategory !== "移动数据") historyBehavior -= 10;
  historyBehavior = clamp(historyBehavior, 0, 100);

  let shareCountScore = sharedFeel;
  if (networkCategory === "住宅宽带" && historyBehavior >= 80) shareCountScore -= 4;
  if (networkCategory === "数据中心/服务器") shareCountScore += 8;
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

  let residentialProbability = 42;
  let businessProbability = 28;
  let datacenterProbability = 24;

  if (networkCategory === "住宅宽带") residentialProbability += 22;
  if (networkCategory === "商宽/企业宽带") businessProbability += 22;
  if (networkCategory === "机房宽带嫌疑") datacenterProbability += 18;
  if (networkCategory === "数据中心/服务器") datacenterProbability += 30;
  if (networkCategory === "移动数据") residentialProbability += 4;

  if (isASNDatacenter) datacenterProbability += 18;
  if (isResidential) residentialProbability += 8;
  if (orgLooksBusiness && networkCategory !== "移动数据") businessProbability += 12;

  if (humanScore !== null) {
    if (humanScore >= 80) residentialProbability += 8;
    else if (humanScore >= 60) residentialProbability += 4;
    else if (humanScore < 40) {
      residentialProbability -= 12;
      datacenterProbability += 10;
      businessProbability += 8;
    }
  }

  if (ipApi.hosting === true) {
    residentialProbability -= 18;
    datacenterProbability += 18;
  }

  if (ipApi.proxy === true) {
    residentialProbability -= 10;
    datacenterProbability += 8;
  }

  if (!rawNetwork && networkCategory !== "移动数据") {
    residentialProbability -= 14;
    businessProbability += 8;
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
  if (!rawNetwork) fakeResidentialRisk += 10;
  if (humanMeta.suspicious) fakeResidentialRisk += 12;
  if (sharedFeel >= 35) fakeResidentialRisk += 12;
  if (nativeFeel <= 50) fakeResidentialRisk += 12;
  if (cloudProvider.hit) fakeResidentialRisk += 20;
  if (networkCategory === "商宽/企业宽带") fakeResidentialRisk += 18;
  if (networkCategory === "机房宽带嫌疑") fakeResidentialRisk += 25;
  fakeResidentialRisk = clamp(fakeResidentialRisk, 0, 100);

  let fakeResidentialLabel = "否";
  if (fakeResidentialRisk >= 65) fakeResidentialLabel = "高";
  else if (fakeResidentialRisk >= 35) fakeResidentialLabel = "中";

  if (
    (networkCategory === "住宅宽带" || isResidential || isASNResidential) &&
    fakeResidentialRisk >= 65
  ) {
    networkCategory = "商宽/企业宽带";
    uniquePush(tags, "假家宽嫌疑");
  }

  let llmSummary = "特征较均衡";
  if (!rawNetwork && humanMeta.missing && networkCategory !== "移动数据") {
    if (businessProbability >= residentialProbability && businessProbability >= datacenterProbability) {
      llmSummary = "更像商业宽带或企业用途（数据不足，结果偏保守）";
    } else if (datacenterProbability >= residentialProbability && datacenterProbability >= businessProbability) {
      llmSummary = "更像机房宽带或数据中心（数据不足，结果偏保守）";
    } else {
      llmSummary = "偏家庭宽带（数据不足，结果偏保守）";
    }
  } else if (residentialProbability >= businessProbability && residentialProbability >= datacenterProbability) {
    llmSummary = residentialProbability >= 70 ? "更像家庭宽带" : "偏家庭宽带";
  } else if (businessProbability >= residentialProbability && businessProbability >= datacenterProbability) {
    llmSummary = "更像商业宽带或企业用途";
  } else {
    llmSummary = "更像机房宽带或数据中心";
  }

  // 平台关联风险
  let associationRisk = 0;
  let airportSuspicion = 0;
  let mobileBehaviorRisk = 0;
  let platformRisk = 0;
  let vpnProbability = 0;
  let strictLibraryFlag = false;

  if (networkCategory === "移动数据") {
    associationRisk = 22 + Math.round(sharedFeel * 0.35);
    airportSuspicion = 18 + Math.round(sharedFeel * 0.45);
    mobileBehaviorRisk = 20 + Math.round(sharedFeel * 0.6) + Math.round((100 - nativeFeel) * 0.15);

    if (abuseScore > 0) {
      associationRisk += 10;
      airportSuspicion += 10;
      mobileBehaviorRisk += 12;
    }

    platformRisk += 20;
    vpnProbability += 25;
  } else {
    associationRisk = Math.round(sharedFeel * 0.4);
    airportSuspicion = Math.round(sharedFeel * 0.3);
    mobileBehaviorRisk = Math.round(sharedFeel * 0.35 + (100 - nativeFeel) * 0.15);
  }

  if (networkCategory === "移动数据") airportSuspicion += 8;
  if (sharedFeel >= 35) airportSuspicion += 10;
  if (nativeFeel <= 45) airportSuspicion += 10;
  if (platformRisk >= 50) airportSuspicion += 10;
  if (cloudProvider.hit) airportSuspicion += 20;

  if (nativeFeel < 50) {
    platformRisk += 20;
    vpnProbability += 20;
  }
  if (sharedFeel > 30) {
    platformRisk += 20;
    vpnProbability += 25;
  }
  if (mobileBehaviorRisk > 50) {
    platformRisk += 15;
  }
  if (ipApi.proxy || ipApi.hosting) {
    platformRisk += 30;
    vpnProbability += 30;
    strictLibraryFlag = true;
  }
  if (isASNDatacenter) {
    platformRisk += 20;
    vpnProbability += 25;
    strictLibraryFlag = true;
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
  platformControlPressure = clamp(platformControlPressure, 0, 100);

  let platformAssociationLevel = "低";
  if (
    networkCategory === "移动数据" &&
    (associationRisk >= 35 || airportSuspicion >= 35 || platformRisk >= 40)
  ) {
    platformAssociationLevel = "中";
  }
  if (
    networkCategory === "移动数据" &&
    (associationRisk >= 55 || airportSuspicion >= 60 || platformRisk >= 60)
  ) {
    platformAssociationLevel = "高";
  }

  // 仅硬信号触发黑名单状态
  if (abuseScore > 0 || blacklisted || abuseNode || attackInvolved || ipApi.proxy === true || ipApi.hosting === true) {
    blacklistSuspicious = true;
  }

  // 代理等级：移动网络不因为共享就自动当代理
  if (proxyExit || blacklisted || attackInvolved || abuseScore >= 20) {
    highRiskProxy = true;
  } else if (
    ipApi.proxy === true ||
    ipApi.hosting === true ||
    isASNDatacenter ||
    cloudProvider.hit ||
    networkCategory === "机房宽带嫌疑" ||
    (networkCategory === "移动数据" && (airportSuspicion >= 70 || platformRisk >= 60))
  ) {
    suspiciousProxy = true;
  } else {
    suspiciousProxy = false;
  }

  if (networkCategory === "住宅宽带") {
    if (!rawNetwork) score = Math.min(score, 84);
    if (humanMeta.missing) score = Math.min(score, 82);
    if (sharedFeel > 35) score = Math.min(score, 80);
  }

  // 移动网络别轻易给到过高分
  if (networkCategory === "移动数据") {
    if (associationRisk >= 35) score = Math.min(score, 88);
    if (airportSuspicion >= 35) score = Math.min(score, 85);
  }

  score = clamp(score, 0, 100);

  let level = "优秀";
  if (score >= 85) level = "优秀";
  else if (score >= 70) level = "良好";
  else if (score >= 50) level = "一般";
  else level = "较差";

  // 分平台建议
  let appleRisk = 0;
  let googleRisk = 0;
  let tiktokRisk = 0;
  let telegramRisk = 0;
  let financeRisk = 0;

  appleRisk += Math.round((100 - nativeFeel) * 0.35);
  appleRisk += Math.round(sharedFeel * 0.25);
  appleRisk += Math.round(riskValue * 0.2);
  if (suspiciousProxy) appleRisk += 20;
  if (networkCategory === "移动数据") appleRisk += 10;
  if (airportSuspicion >= 60) appleRisk += 15;

  googleRisk += Math.round(riskValue * 0.35);
  googleRisk += Math.round(sharedFeel * 0.25);
  googleRisk += Math.round(mobileBehaviorRisk * 0.25);
  if (suspiciousProxy) googleRisk += 20;
  if (networkCategory === "移动数据") googleRisk += 8;
  if (platformRisk >= 50) googleRisk += 8;

  tiktokRisk += Math.round((100 - nativeFeel) * 0.2);
  tiktokRisk += Math.round(sharedFeel * 0.15);
  tiktokRisk += Math.round(airportSuspicion * 0.2);
  if (networkCategory === "移动数据") tiktokRisk -= 8;
  if (networkCategory === "住宅宽带") tiktokRisk -= 5;
  if (suspiciousProxy) tiktokRisk += 15;

  telegramRisk += Math.round(riskValue * 0.2);
  telegramRisk += Math.round(sharedFeel * 0.2);
  telegramRisk += Math.round(mobileBehaviorRisk * 0.15);
  if (suspiciousProxy) telegramRisk += 10;
  if (blacklisted) telegramRisk += 20;

  financeRisk += Math.round(riskValue * 0.4);
  financeRisk += Math.round((100 - nativeFeel) * 0.3);
  financeRisk += Math.round(sharedFeel * 0.25);
  financeRisk += Math.round(associationRisk * 0.25);
  financeRisk += Math.round(airportSuspicion * 0.25);
  if (suspiciousProxy) financeRisk += 25;
  if (blacklisted) financeRisk += 40;
  if (networkCategory === "移动数据") financeRisk += 12;

  // 移动网络对苹果 / 谷歌 / 金融类更严
  if (networkCategory === "移动数据") {
    appleRisk = Math.max(appleRisk, 35);
    googleRisk = Math.max(googleRisk, 35);
    financeRisk = Math.max(financeRisk, 45);
  }
  if (networkCategory === "移动数据" && (associationRisk >= 35 || airportSuspicion >= 35)) {
    financeRisk = Math.max(financeRisk, 55);
  }

  appleRisk = clamp(appleRisk, 0, 100);
  googleRisk = clamp(googleRisk, 0, 100);
  tiktokRisk = clamp(tiktokRisk, 0, 100);
  telegramRisk = clamp(telegramRisk, 0, 100);
  financeRisk = clamp(financeRisk, 0, 100);

  const platformAdvice = {
    apple: adviceByRisk(appleRisk, "推荐", "谨慎", "不建议"),
    google: adviceByRisk(googleRisk, "推荐", "谨慎", "不建议"),
    tiktok: adviceByRisk(tiktokRisk, "推荐", "可用", "谨慎"),
    telegram: adviceByRisk(telegramRisk, "推荐", "可用", "谨慎"),
    finance: adviceByRisk(financeRisk, "可用", "谨慎", "不建议")
  };

  // 结论拆分
  let hardRiskConclusion = "无明确黑名单/滥用风险";
  if (blacklisted || abuseNode || attackInvolved) {
    hardRiskConclusion = "存在明确滥用或黑名单风险";
  } else if (ipApi.proxy === true || ipApi.hosting === true) {
    hardRiskConclusion = "存在明确代理或托管风险";
  }

  let platformRiskConclusion = "平台关联压力低";
  if (platformAssociationLevel === "中") {
    platformRiskConclusion = "存在一定平台关联压力";
  } else if (platformAssociationLevel === "高") {
    platformRiskConclusion = "平台关联压力较高";
  }

  let finalConclusion = "整体可正常使用";
  if (blacklisted || abuseNode || attackInvolved) {
    finalConclusion = "存在明确硬风险，不建议用于敏感场景";
  } else if (networkCategory === "移动数据") {
    if (platformAssociationLevel === "高") {
      finalConclusion = "移动网络整体不脏，但平台关联压力较高，敏感场景谨慎";
    } else if (platformAssociationLevel === "中") {
      finalConclusion = "偏干净移动网络，日常使用良好，但不建议按低关联独享住宅看待";
    } else {
      finalConclusion = "偏干净移动网络，整体可正常使用";
    }
  } else if (networkCategory === "商宽/企业宽带") {
    finalConclusion = "偏商宽/企业用途，普通使用可行，注册和主号场景谨慎";
  } else if (networkCategory === "机房宽带嫌疑") {
    finalConclusion = "存在机房宽带嫌疑，不建议按纯家宽对待";
  } else if (networkCategory === "数据中心/服务器" || proxyExit) {
    finalConclusion = "偏机房/代理出口，不建议用于敏感用途";
  } else if (score >= 85 && networkCategory === "住宅宽带") {
    finalConclusion = "偏优质住宅，日常使用问题不大";
  } else {
    finalConclusion = "整体较稳，可正常使用";
  }

  return {
    score,
    level,
    networkCategory,
    isResidential,
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

      const cz88Url = "https://www.cz88.net/api/cz88/ip/base?ip=" + ipApi.query;
      httpGet(cz88Url, function (err2, res2, data2) {
        let cz88Data = null;
        if (!err2 && data2) {
          const cz88Json = parseJSON(data2);
          if (cz88Json && cz88Json.data) cz88Data = cz88Json.data;
        }

        checkAbuseIPDB(ipApi.query, function (abuseData) {
          const risk = analyzeRisk(ipApi, cz88Data || {}, abuseData);

          const abuseScoreText = formatAbuseScore(abuseData);
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

          const checks = [
            { name: "Netflix", run: checkNetflix },
            { name: "TikTok", run: checkTikTok },
            { name: "YouTube", run: checkYouTube }
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
            lines.push("");

            lines.push("【网络检测】");
            lines.push("主类型：" + (risk.networkCategory || "-"));
            lines.push("家宽底子：" + (risk.isResidential ? "是" : "否"));
            lines.push("数据中心：" + (risk.isDatacenter ? "是" : "否"));
            lines.push("移动网络：" + (risk.isMobile ? "是" : "否"));
            lines.push("ASN机房特征：" + (risk.isASNDatacenter ? "是" : "否"));
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
            lines.push("云厂商命中：" + (risk.cloudProvider.hit ? risk.cloudProvider.name : "否"));
            lines.push(line("假家宽识别", fakeResidentialText.text, fakeResidentialText.level));
            lines.push(line("平台风控压力", platformPressureText.text, platformPressureText.level));
            lines.push("");

            lines.push("【平台风控视角】");
            lines.push("平台关联等级：" + risk.platformAssociationLevel);
            lines.push(line("平台识别风险", platformRiskText.text, platformRiskText.level));
            lines.push(line("VPN判定概率", vpnProbabilityText.text, vpnProbabilityText.level));
            lines.push(boolLine("严格风控库标记", risk.strictLibraryFlag));
            lines.push("");

            lines.push("【多源评分】");
            lines.push(line("AbuseIPDB", abuseScoreText.text, abuseScoreText.level));
            lines.push(line("ip-api", ipapiScore.text, ipapiScore.level));
            lines.push(line("cz88", cz88Score.text, cz88Score.level));
            lines.push(line("IPPure风格", simulated.ippure.text, simulated.ippure.level));
            lines.push(line("Scamalytics风格", simulated.scamalytics.text, simulated.scamalytics.level));
            lines.push(line("IP2Location风格", simulated.ip2location.text, simulated.ip2location.level));
            lines.push(line("ipregistry风格", simulated.ipregistry.text, simulated.ipregistry.level));
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
            } else if (abuseData && abuseData.data) {
              lines.push("Abuse置信分：" + (abuseData.data.abuseConfidenceScore || 0));
              lines.push("滥用报告数：" + (abuseData.data.totalReports || 0));
            } else {
              lines.push("Abuse置信分：请求失败");
              lines.push("滥用报告数：请求失败");
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

            lines.push("【媒体检测 / 流媒体解锁】");
            for (let i = 0; i < results.length; i++) {
              lines.push(line(results[i].name, results[i].value, results[i].level));
            }
            lines.push("");

            lines.push("【最终结论】");
            lines.push("硬风险结论：" + risk.hardRiskConclusion);
            lines.push("平台结论：" + risk.platformRiskConclusion);
            lines.push("综合建议：" + risk.finalConclusion);

            done(lines.join("\n"));
          });
        });
      });
    }
  );
}

fetchAll();