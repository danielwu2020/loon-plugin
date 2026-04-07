/*************************************
 * 节点详情查询 Ultimate - Loon
 * - 强制走当前长按节点
 * - 真人概率文字化
 * - 多源评分
 * - 商业VPN / 代理出口 / 高风险代理
 * - Netflix / TikTok / YouTube 检测
 *************************************/

const TIMEOUT = 8000;

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
const IPQS_KEY = ARGS.ipqs || "";
const ABUSEIPDB_KEY = ARGS.abuse || "";

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
    if (typeof $loon !== "undefined" && $loon.node) {
      return $loon.node;
    }
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
    if (typeof $loon !== "undefined" && $loon.node) {
      return $loon.node;
    }
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
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
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
      results.push({
        name: item.name,
        value: value,
        level: level
      });
      next();
    });
  }

  next();
}

/*************** 真人概率显示 ***************/
function formatHumanScoreText(score) {
  const n = Number(score);
  if (isNaN(n)) return "-";
  if (n >= 80) return "很像真人";
  if (n >= 60) return "正常偏好";
  if (n >= 40) return "可疑（有点像代理）";
  return "很像代理/机房";
}

function getHumanScoreLevel(score) {
  const n = Number(score);
  if (isNaN(n)) return "warn";
  if (n >= 80) return "ok";
  if (n >= 60) return "warn";
  if (n >= 40) return "warn";
  return "fail";
}

/*************** 外部 API ***************/
function checkIPQS(ip, cb) {
  if (!IPQS_KEY) return cb(null);

  const url =
    "https://ipqualityscore.com/api/json/ip/" +
    IPQS_KEY +
    "/" +
    ip +
    "?strictness=1&allow_public_access_points=true&fast=false&lighter_penalties=true&mobile=true";

  httpGet(
    {
      url: url,
      headers: { "User-Agent": "Mozilla/5.0" }
    },
    function (err, resp, data) {
      if (err || !data) return cb(null);
      cb(parseJSON(data) || null);
    }
  );
}

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
      cb("未知(" + code + ")", "warn");
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
      cb("未知(" + code + ")", "warn");
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
      cb("未知(" + code + ")", "warn");
    }
  );
}

/*************** 多源评分文案 ***************/
function formatIPQSScore(ipqs) {
  if (!ipqs || typeof ipqs.fraud_score === "undefined") {
    return { text: "未启用", level: "warn" };
  }
  const s = Number(ipqs.fraud_score);
  if (s < 25) return { text: "低风险（" + s + "）", level: "ok" };
  if (s < 50) return { text: "一般风险（" + s + "）", level: "warn" };
  return { text: "高风险（" + s + "）", level: "fail" };
}

function formatAbuseScore(abuse) {
  if (!abuse || !abuse.data) {
    return { text: "未启用", level: "warn" };
  }
  const s = Number(abuse.data.abuseConfidenceScore || 0);
  if (s === 0) return { text: "低风险（" + s + "）", level: "ok" };
  if (s < 50) return { text: "一般风险（" + s + "）", level: "warn" };
  return { text: "高风险（" + s + "）", level: "fail" };
}

function formatIpApiRisk(ipApi) {
  if (!ipApi) return { text: "未知", level: "warn" };
  if (ipApi.hosting) return { text: "机房/服务器", level: "fail" };
  if (ipApi.proxy) return { text: "代理", level: "warn" };
  return { text: "普通网络", level: "ok" };
}

function formatCz88Risk(cz88) {
  const t = (cz88 && cz88.netWorkType) ? String(cz88.netWorkType) : "";
  if (!t) return { text: "-", level: "warn" };
  if (t.indexOf("机房") !== -1) return { text: t, level: "fail" };
  if (t.indexOf("移动") !== -1) return { text: t, level: "warn" };
  return { text: t, level: "ok" };
}

/*************** 风险分析 ***************/
function analyzeRisk(ipApi, cz88, ipqs, abuse) {
  const rawNetwork = ((cz88 && cz88.netWorkType) || "").toLowerCase();

  let networkCategory = "未知";
  if (rawNetwork.indexOf("住宅") !== -1 || rawNetwork.indexOf("家庭") !== -1 || rawNetwork.indexOf("宽带") !== -1) {
    networkCategory = "住宅";
  } else if (rawNetwork.indexOf("移动") !== -1) {
    networkCategory = "移动数据";
  } else if (rawNetwork.indexOf("机房") !== -1) {
    networkCategory = "机房";
  } else if (ipApi.hosting === true) {
    networkCategory = "机房";
  }

  let score = 100;
  const tags = [];

  let commercialVPN = false;
  let proxyExit = false;
  let highRiskProxy = false;
  let blacklisted = false;
  let abuseNode = false;
  let torNode = false;
  let attackInvolved = false;
  let cloudService = false;

  if (ipqs) {
    commercialVPN = ipqs.vpn === true || ipqs.active_vpn === true;

    proxyExit = ipqs.proxy === true || ipqs.hosting === true;

    highRiskProxy =
      ipqs.proxy === true ||
      ipqs.vpn === true ||
      ipqs.active_vpn === true ||
      ipqs.tor === true ||
      ipqs.active_tor === true ||
      ipqs.recent_abuse === true;

    torNode = ipqs.tor === true || ipqs.active_tor === true;
    cloudService = ipqs.hosting === true;

    blacklisted = ipqs.recent_abuse === true || ipqs.bot_status === true;
    abuseNode = ipqs.recent_abuse === true;
    attackInvolved = ipqs.bot_status === true;

    if (typeof ipqs.fraud_score === "number") {
      score = Math.max(0, 100 - ipqs.fraud_score);
    }

    if (ipqs.hosting && networkCategory === "未知") networkCategory = "机房";
    if (!ipqs.hosting && !proxyExit && !commercialVPN && networkCategory === "未知") {
      networkCategory = "住宅";
    }

    if ((ipqs.ISP && /mobile|wireless/i.test(ipqs.ISP)) && networkCategory === "未知") {
      networkCategory = "移动数据";
    }

    tags.push("IPQS");
  } else {
    if (ipApi.proxy) {
      proxyExit = true;
      highRiskProxy = true;
      score -= 20;
      tags.push("代理");
    }

    if (ipApi.hosting) {
      cloudService = true;
      proxyExit = true;
      score -= 25;
      tags.push("机房");
    }

    if (networkCategory === "住宅") {
      score += 8;
      tags.push("住宅特征");
    }
    if (networkCategory === "移动数据") {
      score += 5;
      tags.push("移动特征");
    }
  }

  if (abuse && abuse.data) {
    const abuseScore = Number(abuse.data.abuseConfidenceScore || 0);
    const totalReports = Number(abuse.data.totalReports || 0);

    if (abuseScore > 0) {
      blacklisted = true;
      abuseNode = true;
      highRiskProxy = true;
    }
    if (abuseScore >= 50 || totalReports >= 10) {
      attackInvolved = true;
    }

    if (abuseScore >= 80) score -= 25;
    else if (abuseScore >= 50) score -= 18;
    else if (abuseScore >= 20) score -= 10;
    else if (abuseScore > 0) score -= 5;

    tags.push("AbuseIPDB");
  }

  const humanScore = Number(cz88 && cz88.score);
  if (!isNaN(humanScore)) {
    if (humanScore >= 80) {
      score += 8;
    } else if (humanScore >= 60) {
      score += 2;
    } else if (humanScore >= 40) {
      score -= 8;
    } else {
      score -= 18;
    }
  }

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  let level = "优秀";
  if (score >= 85) level = "优秀";
  else if (score >= 70) level = "良好";
  else if (score >= 50) level = "一般";
  else level = "较差";

  return {
    score: score,
    level: level,
    tags: tags.length ? tags.join(" / ") : "无明显异常",
    networkCategory: networkCategory,
    commercialVPN: commercialVPN,
    proxyExit: proxyExit,
    highRiskProxy: highRiskProxy,
    blacklisted: blacklisted,
    abuseNode: abuseNode,
    torNode: torNode,
    attackInvolved: attackInvolved,
    cloudService: cloudService
  };
}

/*************** 主流程 ***************/
function fetchAll() {
  httpGet(
    "http://ip-api.com/json?lang=zh-CN&fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query,proxy,hosting",
    function (err1, res1, data1) {
      if (err1 || !data1) return done("IP查询失败\n" + String(err1 || ""));

      const ipApi = parseJSON(data1);
      if (!ipApi || ipApi.status !== "success" || !ipApi.query) {
        return done("IP数据解析失败");
      }

      const cz88Url = "https://www.cz88.net/api/cz88/ip/base?ip=" + ipApi.query;
      httpGet(cz88Url, function (err2, res2, data2) {
        let cz88Data = null;
        if (!err2 && data2) {
          const cz88Json = parseJSON(data2);
          if (cz88Json && cz88Json.data) cz88Data = cz88Json.data;
        }

        checkIPQS(ipApi.query, function (ipqsData) {
          checkAbuseIPDB(ipApi.query, function (abuseData) {
            const risk = analyzeRisk(ipApi, cz88Data || {}, ipqsData, abuseData);

            const ipqsScore = formatIPQSScore(ipqsData);
            const abuseScore = formatAbuseScore(abuseData);
            const ipapiScore = formatIpApiRisk(ipApi);
            const cz88Score = formatCz88Risk(cz88Data);

            const checks = [
              { name: "Netflix", run: checkNetflix },
              { name: "TikTok", run: checkTikTok },
              { name: "YouTube", run: checkYouTube }
            ];

            runChecks(checks, function (results) {
              const lines = [];

              lines.push("【基础信息】");
              lines.push("节点：" + NODE_NAME);
              lines.push("IP：" + (ipApi.query || "-"));
              lines.push("国家/地区：" + (ipApi.country || "-"));
              lines.push("地区：" + (ipApi.regionName || "-"));
              lines.push("城市：" + (ipApi.city || "-"));
              lines.push("ISP：" + ((cz88Data && cz88Data.isp) || (ipqsData && ipqsData.ISP) || ipApi.isp || "-"));
              lines.push("组织：" + (ipApi.org || "-"));
              lines.push("ASN：" + (ipApi.as || "-"));
              lines.push("网络类型：" + (risk.networkCategory || "-"));
              lines.push("真人概率：" + formatHumanScoreText(cz88Data && cz88Data.score));
              lines.push("时区：" + (ipApi.timezone || "-"));
              lines.push("");

              lines.push("【IP质量】");
              lines.push("综合评分：" + risk.score + " / 100");
              lines.push("质量判断：" + risk.level);
              lines.push("特征：" + risk.tags);
              lines.push("");

              lines.push("【多源评分】");
              lines.push(line("IPQS", ipqsScore.text, ipqsScore.level));
              lines.push(line("AbuseIPDB", abuseScore.text, abuseScore.level));
              lines.push(line("ip-api", ipapiScore.text, ipapiScore.level));
              lines.push(line("cz88", cz88Score.text, cz88Score.level));
              lines.push("");

              lines.push("【代理检测】");
              lines.push(boolLine("商业VPN", risk.commercialVPN));
              lines.push(boolLine("代理出口", risk.proxyExit));
              lines.push(boolLine("高风险代理", risk.highRiskProxy));
              lines.push(boolLine("TOR节点", risk.torNode));
              lines.push(boolLine("云服务", risk.cloudService));
              lines.push("");

              lines.push("【黑名单 / 风险】");
              lines.push(boolLine("黑名单", risk.blacklisted));
              lines.push(boolLine("滥用节点", risk.abuseNode));
              lines.push(boolLine("参与攻击", risk.attackInvolved));
              lines.push("");

              lines.push("【媒体检测】");
              for (var i = 0; i < results.length; i++) {
                lines.push(line(results[i].name, results[i].value, results[i].level));
              }

              done(lines.join("\n"));
            });
          });
        });
      });
    }
  );
}

fetchAll();