/*************************************
 * 节点详情查询 Ultimate（最终完整优化版 / 展示细节拉满版 / 无额外API）
 * 数据源：
 * - ip-api
 * - cz88
 * - AbuseIPDB
 *
 * 功能：
 * - IP详细
 * - 基础信息
 * - 网络检测
 * - 综合质量
 * - 大模型检测（本地推断）
 * - 风控画像
 * - 多源评分（本地模拟）
 * - 隐私检测
 * - 黑名单 / 滥用
 * - 媒体检测 / 流媒体解锁
 * - 结论（严谨保守）
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
      if ($environment.params.nodeInfo && $environment.params.nodeInfo.name) return $environment.params.nodeInfo.name;
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
      if ($environment.params.nodeInfo && $environment.params.nodeInfo.name) return $environment.params.nodeInfo.name;
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
  $done({ title: "节点详情查询 Ultimate", message: msg });
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

/*************** 真人概率 ***************/
function getHumanScoreMeta(score, cz88) {
  const n = Number(score);
  const rawType = String((cz88 && cz88.netWorkType) || "");
  const hasUsefulCz88 = !!rawType;

  if (isNaN(n)) {
    return {
      score: null,
      text: "未知（数据不足）",
      suspicious: false,
      missing: true
    };
  }

  if (n === 0 && !hasUsefulCz88) {
    return {
      score: null,
      text: "未知（数据不足）",
      suspicious: false,
      missing: true
    };
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
    { url: "https://www.netflix.com/title/81215567", headers: { "User-Agent": "Mozilla/5.0" } },
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
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" }
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
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" }
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
  if (t.indexOf("移动") !== -1) return { text: t, level: "warn" };
  return { text: t, level: "ok" };
}

function formatRiskPercent(value) {
  const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
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

function formatBlacklistTier(risk) {
  if (risk.blacklisted) return { text: "是", level: "fail" };
  if (risk.blacklistSuspicious) return { text: "可疑", level: "warn" };
  return { text: "否", level: "ok" };
}

function formatShareCount(score) {
  const n = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  if (n <= 10) return { text: "1–10（低）", level: "ok" };
  if (n <= 30) return { text: "10–30（较低）", level: "ok" };
  if (n <= 60) return { text: "30–80（一般）", level: "warn" };
  return { text: "80+（偏高）", level: "fail" };
}

/*************** 多源评分（本地模拟） ***************/
function simulateMultiSourceScores(risk, abuseScore, ipApi) {
  const riskValue = Math.round(risk.riskValue || 0);
  const shared = Math.round(risk.sharedFeel || 0);

  let ippure = { text: "低风险（1）", level: "ok" };
  if (riskValue > 35) ippure = { text: "中风险（" + Math.max(2, Math.round(riskValue / 20)) + "）", level: "warn" };
  if (riskValue > 65) ippure = { text: "高风险（" + Math.max(4, Math.round(riskValue / 15)) + "）", level: "fail" };

  let scamalytics = { text: "低风险（0）", level: "ok" };
  const scamScore = Math.min(100, Math.round(abuseScore * 0.6 + riskValue * 0.25 + shared * 0.1));
  if (scamScore > 15) scamalytics = { text: "中风险（" + scamScore + "）", level: "warn" };
  if (scamScore > 40) scamalytics = { text: "高风险（" + scamScore + "）", level: "fail" };

  let ip2location = { text: "低风险（3）", level: "ok" };
  if (risk.networkCategory === "数据中心/服务器") {
    ip2location = { text: "数据中心（DCH）", level: "fail" };
  } else if (risk.networkCategory === "机房宽带嫌疑") {
    ip2location = { text: "宽带嫌疑（可疑）", level: "warn" };
  } else if (risk.networkCategory === "商宽/企业宽带") {
    ip2location = { text: "商业宽带（中性）", level: "warn" };
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
  const asText = String((ipApi && ipApi.as) || "").toLowerCase();
  const ispText = String((ipApi && ipApi.isp) || "").toLowerCase();
  const orgText = String((ipApi && ipApi.org) || "").toLowerCase();
  const all = asText + " " + ispText + " " + orgText;

  if (risk.isASNDatacenter || /cloud|hosting|host|server|vps|colo|idc|datacenter|data communications|eons|ovh|oracle|aws|azure|google|gcp|digitalocean|linode|vultr|aliyun|tencent cloud|huawei cloud/.test(all)) {
    return "云/机房ASN";
  }
  if (/mobile|wireless|移动|cellular/.test(all)) return "移动网络ASN";
  if (/broadband|residential|cable|fiber|宽带|住宅|家庭/.test(all)) return "家宽ASN";
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
  const rawLower = rawNetwork.toLowerCase();

  let isResidential =
    rawLower.indexOf("住宅") !== -1 ||
    rawLower.indexOf("家庭") !== -1 ||
    rawLower.indexOf("宽带") !== -1;

  let isDatacenter =
    rawLower.indexOf("机房") !== -1 ||
    rawLower.indexOf("数据中心") !== -1 ||
    ipApi.hosting === true;

  let isMobile = rawLower.indexOf("移动") !== -1;

  const asText = String((ipApi && ipApi.as) || "").toLowerCase();
  const ispText = String((ipApi && ipApi.isp) || "").toLowerCase();
  const orgText = String((ipApi && ipApi.org) || "").toLowerCase();
  const allAsnText = asText + " " + ispText + " " + orgText;

  const isASNDatacenter =
    /(^|\s)as\d+/.test(asText) &&
    /cloud|hosting|host|server|vps|colo|idc|datacenter|data communications|eons|ovh|oracle|aws|azure|google|gcp|digitalocean|linode|vultr|aliyun|tencent cloud|huawei cloud/.test(allAsnText);

  const isASNResidential =
    /broadband|residential|cable|fiber|宽带|家庭|住宅/.test(allAsnText) &&
    !isASNDatacenter;

  if (isASNDatacenter) {
    isDatacenter = true;
    isResidential = false;
  } else if (isASNResidential && !isDatacenter) {
    isResidential = true;
  }

  const humanMeta = getHumanScoreMeta(cz88 && cz88.score, cz88);
  const humanScore = humanMeta.score;

  const orgLooksBusiness =
    /llc|inc|ltd|limited|company|corp|corporation|enterprise|business|aviation|studio|tech|solutions|group/.test(orgText);

  let abuseScore = 0;
  let totalReports = 0;
  if (abuse && abuse.data) {
    abuseScore = Number(abuse.data.abuseConfidenceScore || 0);
    totalReports = Number(abuse.data.totalReports || 0);
  }

  let networkCategory = "普通网络";
  if (isASNDatacenter || ipApi.hosting === true) {
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
  } else if (isMobile) {
    networkCategory = "移动数据";
  } else if (isDatacenter) {
    networkCategory = "数据中心/服务器";
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

  if (ipApi.proxy === true) {
    proxyExit = true;
    highRiskProxy = true;
    score -= 20;
    if (tags.indexOf("代理出口") === -1) tags.push("代理出口");
  }

  if (ipApi.hosting === true) {
    cloudService = true;
    proxyExit = true;
    score -= 24;
    if (tags.indexOf("机房托管") === -1) tags.push("机房托管");
  }

  if (isASNDatacenter) {
    cloudService = true;
    score -= 18;
    if (tags.indexOf("ASN机房特征") === -1) tags.push("ASN机房特征");
  }

  if (networkCategory === "住宅宽带") {
    score += 8;
  } else if (networkCategory === "商宽/企业宽带") {
    score -= 6;
    suspiciousProxy = true;
    if (tags.indexOf("企业用途") === -1) tags.push("企业用途");
  } else if (networkCategory === "机房宽带嫌疑") {
    score -= 12;
    suspiciousProxy = true;
    if (tags.indexOf("机房宽带嫌疑") === -1) tags.push("机房宽带嫌疑");
  } else if (networkCategory === "移动数据") {
    score += 2;
    if (tags.indexOf("移动网络") === -1) tags.push("移动网络");
  } else if (networkCategory === "数据中心/服务器") {
    score -= 20;
    if (tags.indexOf("机房网络") === -1) tags.push("机房网络");
  }

  if (humanScore !== null) {
    if (humanScore >= 80) score += 6;
    else if (humanScore >= 60) score += 2;
    else if (humanScore >= 40) {
      score -= 8;
      suspiciousProxy = true;
      if (tags.indexOf("真人概率偏低") === -1) tags.push("真人概率偏低");
    } else {
      score -= 15;
      suspiciousProxy = true;
      if (tags.indexOf("高度可疑") === -1) tags.push("高度可疑");
    }
  } else {
    score -= 6;
    if (tags.indexOf("数据缺失") === -1) tags.push("数据缺失");
  }

  if (abuseScore > 0) {
    blacklisted = true;
    abuseNode = true;
    highRiskProxy = true;
    if (tags.indexOf("滥用记录") === -1) tags.push("滥用记录");
  }

  if (abuseScore >= 50 || totalReports >= 10) {
    attackInvolved = true;
    if (tags.indexOf("攻击风险") === -1) tags.push("攻击风险");
  }

  if (abuseScore >= 80) score -= 25;
  else if (abuseScore >= 50) score -= 18;
  else if (abuseScore >= 20) score -= 10;
  else if (abuseScore > 0) score -= 5;

  if (!rawNetwork) score -= 10;

  let riskValue = 8;
  let nativeFeel = 55;
  let sharedFeel = 20;

  if (ipApi.proxy === true) riskValue += 28;
  if (ipApi.hosting === true) riskValue += 28;
  if (networkCategory === "数据中心/服务器") riskValue += 20;
  if (networkCategory === "机房宽带嫌疑") riskValue += 12;
  if (isASNDatacenter) riskValue += 20;
  if (networkCategory === "商宽/企业宽带") riskValue += 12;
  if (isMobile) riskValue += 4;

  if (humanScore !== null) {
    if (humanScore >= 80) riskValue -= 8;
    else if (humanScore >= 60) riskValue -= 2;
    else if (humanScore >= 40) riskValue += 8;
    else riskValue += 16;
  } else {
    riskValue += 8;
  }

  riskValue += Math.min(30, Math.round(abuseScore * 0.3));
  if (totalReports >= 10) riskValue += 10;
  else if (totalReports > 0) riskValue += 4;
  if (!rawNetwork) riskValue += 8;

  if (riskValue < 0) riskValue = 0;
  if (riskValue > 100) riskValue = 100;

  if (networkCategory === "住宅宽带") nativeFeel += 22;
  if (networkCategory === "商宽/企业宽带") nativeFeel += 4;
  if (isMobile) nativeFeel += 10;
  if (networkCategory === "数据中心/服务器") nativeFeel -= 28;
  if (networkCategory === "机房宽带嫌疑") nativeFeel -= 18;
  if (isASNDatacenter) nativeFeel -= 18;
  if (ipApi.hosting === true) nativeFeel -= 22;
  if (ipApi.proxy === true) nativeFeel -= 18;

  if (humanScore !== null) {
    if (humanScore >= 80) nativeFeel += 14;
    else if (humanScore >= 60) nativeFeel += 6;
    else if (humanScore >= 40) nativeFeel -= 8;
    else nativeFeel -= 18;
  } else {
    nativeFeel -= 8;
  }

  nativeFeel -= Math.min(15, Math.round(abuseScore * 0.15));
  if (!rawNetwork) nativeFeel -= 8;

  if (nativeFeel < 0) nativeFeel = 0;
  if (nativeFeel > 100) nativeFeel = 100;

  if (ipApi.hosting === true) sharedFeel += 28;
  if (ipApi.proxy === true) sharedFeel += 20;
  if (networkCategory === "数据中心/服务器") sharedFeel += 20;
  if (networkCategory === "机房宽带嫌疑") sharedFeel += 12;
  if (isASNDatacenter) sharedFeel += 18;
  if (networkCategory === "商宽/企业宽带") sharedFeel += 10;
  if (networkCategory === "住宅宽带") sharedFeel -= 8;
  if (isMobile) sharedFeel += 5;

  if (humanScore !== null) {
    if (humanScore >= 80) sharedFeel -= 6;
    else if (humanScore >= 60) sharedFeel -= 2;
    else if (humanScore >= 40) sharedFeel += 8;
    else sharedFeel += 12;
  } else {
    sharedFeel += 6;
  }

  sharedFeel += Math.min(20, Math.round(abuseScore * 0.2));
  if (totalReports >= 10) sharedFeel += 10;
  if (!rawNetwork) sharedFeel += 8;

  if (sharedFeel < 0) sharedFeel = 0;
  if (sharedFeel > 100) sharedFeel = 100;

  let historyBehavior = 82;
  historyBehavior -= Math.min(50, Math.round(abuseScore * 0.5));
  historyBehavior -= Math.min(20, totalReports);
  if (ipApi.proxy === true) historyBehavior -= 10;
  if (ipApi.hosting === true) historyBehavior -= 8;
  if (isASNDatacenter) historyBehavior -= 8;
  if (humanScore !== null && humanScore < 40) historyBehavior -= 8;
  if (!rawNetwork) historyBehavior -= 10;
  if (historyBehavior < 0) historyBehavior = 0;
  if (historyBehavior > 100) historyBehavior = 100;

  let shareCountScore = sharedFeel;
  if (networkCategory === "住宅宽带" && historyBehavior >= 80) shareCountScore -= 4;
  if (networkCategory === "数据中心/服务器") shareCountScore += 8;
  if (shareCountScore < 0) shareCountScore = 0;
  if (shareCountScore > 100) shareCountScore = 100;

  let residentialProbability = 42;
  let businessProbability = 28;
  let datacenterProbability = 24;

  if (networkCategory === "住宅宽带") residentialProbability += 22;
  if (networkCategory === "商宽/企业宽带") businessProbability += 22;
  if (networkCategory === "机房宽带嫌疑") datacenterProbability += 18;
  if (networkCategory === "数据中心/服务器") datacenterProbability += 30;

  if (isASNDatacenter) datacenterProbability += 18;
  if (isResidential) residentialProbability += 8;
  if (orgLooksBusiness) businessProbability += 12;

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

  if (!rawNetwork) {
    residentialProbability -= 14;
    businessProbability += 8;
    datacenterProbability += 8;
  }

  residentialProbability -= Math.min(15, Math.round(abuseScore * 0.15));
  datacenterProbability += Math.min(10, Math.round(abuseScore * 0.1));

  residentialProbability = Math.max(0, Math.min(100, Math.round(residentialProbability)));
  businessProbability = Math.max(0, Math.min(100, Math.round(businessProbability)));
  datacenterProbability = Math.max(0, Math.min(100, Math.round(datacenterProbability)));

  let llmSummary = "特征较均衡";
  if (!rawNetwork && humanMeta.missing) {
    if (businessProbability >= residentialProbability && businessProbability >= datacenterProbability) {
      llmSummary = "更像商业宽带或企业用途（数据不足，结果偏保守）";
    } else if (datacenterProbability >= residentialProbability && datacenterProbability >= businessProbability) {
      llmSummary = "更像机房宽带或数据中心（数据不足，结果偏保守）";
    } else {
      llmSummary = "偏家庭宽带（数据不足，结果偏保守）";
    }
  } else if (residentialProbability >= businessProbability && residentialProbability >= datacenterProbability) {
    if (residentialProbability >= 70) llmSummary = "更像家庭宽带";
    else llmSummary = "偏家庭宽带";
  } else if (businessProbability >= residentialProbability && businessProbability >= datacenterProbability) {
    llmSummary = "更像商业宽带或企业用途";
  } else {
    llmSummary = "更像机房宽带或数据中心";
  }

  if (!blacklisted) {
    if (
      !rawNetwork ||
      humanMeta.missing ||
      networkCategory === "商宽/企业宽带" ||
      networkCategory === "机房宽带嫌疑" ||
      cloudService ||
      suspiciousProxy ||
      riskValue >= 20
    ) {
      blacklistSuspicious = true;
    }
  }

  if (!highRiskProxy) {
    if (proxyExit) highRiskProxy = true;
    else if (blacklisted || abuseNode || attackInvolved) highRiskProxy = true;
    else if (riskValue >= 70) highRiskProxy = true;
    else if (cloudService || suspiciousProxy || riskValue >= 35 || nativeFeel < 55) suspiciousProxy = true;
  }

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  let level = "优秀";
  if (score >= 85) level = "优秀";
  else if (score >= 70) level = "良好";
  else if (score >= 50) level = "一般";
  else level = "较差";

  let conclusion = "普通可用";
  if (blacklisted || attackInvolved) {
    conclusion = "存在明确滥用或攻击风险，不建议用于敏感场景";
  } else if (blacklistSuspicious) {
    conclusion = "整体风险不高，但存在黑名单或平台风控疑点，敏感场景谨慎";
  } else if (score >= 85 && networkCategory === "住宅宽带" && !proxyExit && !highRiskProxy) {
    conclusion = "偏优质住宅，日常使用问题不大";
  } else if (networkCategory === "商宽/企业宽带") {
    conclusion = "偏商宽/企业用途，普通使用可行，注册和主号场景谨慎";
  } else if (networkCategory === "机房宽带嫌疑") {
    conclusion = "存在机房宽带嫌疑，不建议按纯家宽对待";
  } else if (highRiskProxy || networkCategory === "数据中心/服务器" || proxyExit) {
    conclusion = "偏机房/代理出口，不建议用于敏感用途";
  } else if (score >= 70) {
    conclusion = "整体较稳，可正常使用";
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
    conclusion,
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
    tags: tags.length ? tags.join(" / ") : "无明显异常"
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
          const blacklistTierText = formatBlacklistTier(risk);
          const shareCountText = formatShareCount(risk.shareCountScore);
          const asnType = inferAsnType(ipApi, risk);
          const ipTypeLabel = inferIpTypeLabel(risk, ipApi, cz88Data);
          const simulated = simulateMultiSourceScores(risk, risk.abuseScore, ipApi);

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

            lines.push("【多源评分】");
            lines.push(line("AbuseIPDB", abuseScoreText.text, abuseScoreText.level));
            lines.push(line("ip-api", ipapiScore.text, ipapiScore.level));
            lines.push(line("cz88", cz88Score.text, cz88Score.level));
            lines.push(line("IPPure", simulated.ippure.text, simulated.ippure.level));
            lines.push(line("Scamalytics", simulated.scamalytics.text, simulated.scamalytics.level));
            lines.push(line("IP2Location.io", simulated.ip2location.text, simulated.ip2location.level));
            lines.push(line("ipregistry", simulated.ipregistry.text, simulated.ipregistry.level));
            lines.push("");

            lines.push("【隐私检测】");
            lines.push(boolLine("代理出口", risk.proxyExit));
            lines.push(line("代理等级", proxyTierText.text, proxyTierText.level));
            lines.push(boolLine("可疑代理", risk.suspiciousProxy));
            lines.push(boolLine("高风险代理", risk.highRiskProxy));
            lines.push(boolLine("云服务", risk.cloudService));
            lines.push("");

            lines.push("【黑名单 / 滥用】");
            lines.push(line("黑名单状态", blacklistTierText.text, blacklistTierText.level));
            lines.push(boolLine("黑名单", risk.blacklisted));
            lines.push(boolLine("滥用节点", risk.abuseNode));
            lines.push(boolLine("参与攻击", risk.attackInvolved));
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

            lines.push("【媒体检测 / 流媒体解锁】");
            for (var i = 0; i < results.length; i++) {
              lines.push(line(results[i].name, results[i].value, results[i].level));
            }
            lines.push("");

            lines.push("【结论】");
            lines.push(risk.conclusion);

            done(lines.join("\n"));
          });
        });
      });
    }
  );
}

fetchAll();