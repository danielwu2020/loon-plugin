/*************************************
 * 节点详情查询 Ultimate（完整详细版 / 无IPQS）
 * 数据源：
 * - ip-api
 * - cz88
 * - AbuseIPDB
 * 功能：
 * - 强制走当前长按节点
 * - 基础信息
 * - 网络画像
 * - 家宽 / 数据中心 / 移动网络
 * - 真人概率中文化
 * - 综合评分
 * - 风控值 / 原生感 / 共享感
 * - 多源评分
 * - 代理 / 风险判断
 * - 黑名单 / 滥用
 * - Netflix / TikTok / YouTube 检测
 * - 最终结论
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

/*************** 基础工具 ***************/
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

/*************** 真人概率 ***************/
function formatHumanScoreText(score) {
  const n = Number(score);
  if (isNaN(n)) return "-";
  if (n >= 80) return "很像真人";
  if (n >= 60) return "正常偏好";
  if (n >= 40) return "可疑（有点像代理）";
  return "很像代理/机房";
}

function formatHumanScoreFull(score) {
  const n = Number(score);
  if (isNaN(n)) return "-";
  return n + "（" + formatHumanScoreText(n) + "）";
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

/*************** 多源文案 ***************/
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
  const t = (cz88 && cz88.netWorkType) ? String(cz88.netWorkType) : "";
  if (!t) return { text: "未返回", level: "warn" };
  if (t.indexOf("机房") !== -1 || t.indexOf("数据中心") !== -1) {
    return { text: t, level: "fail" };
  }
  if (t.indexOf("移动") !== -1) {
    return { text: t, level: "warn" };
  }
  return { text: t, level: "ok" };
}

/*************** 风控值 / 原生感 / 共享感 ***************/
function formatRiskValue(value) {
  const n = Number(value);
  if (isNaN(n)) return { text: "-", level: "warn" };
  if (n <= 20) return { text: n + "（低）", level: "ok" };
  if (n <= 40) return { text: n + "（偏低）", level: "ok" };
  if (n <= 60) return { text: n + "（中）", level: "warn" };
  if (n <= 80) return { text: n + "（偏高）", level: "fail" };
  return { text: n + "（高）", level: "fail" };
}

function formatNativeFeel(score) {
  const n = Number(score);
  if (isNaN(n)) return { text: "-", level: "warn" };
  if (n >= 80) return { text: n + "（高原生）", level: "ok" };
  if (n >= 55) return { text: n + "（一般原生）", level: "warn" };
  return { text: n + "（低原生）", level: "fail" };
}

function formatSharedFeel(score) {
  const n = Number(score);
  if (isNaN(n)) return { text: "-", level: "warn" };
  if (n <= 25) return { text: n + "（低共享）", level: "ok" };
  if (n <= 60) return { text: n + "（中共享）", level: "warn" };
  return { text: n + "（高共享）", level: "fail" };
}

/*************** 核心分析 ***************/
function analyzeRisk(ipApi, cz88, abuse) {
  const rawNetwork = String((cz88 && cz88.netWorkType) || "");
  const rawLower = rawNetwork.toLowerCase();
  const humanScore = Number(cz88 && cz88.score);

  const isResidential =
    rawLower.indexOf("住宅") !== -1 ||
    rawLower.indexOf("家庭") !== -1 ||
    rawLower.indexOf("宽带") !== -1;

  const isDatacenter =
    rawLower.indexOf("机房") !== -1 ||
    rawLower.indexOf("数据中心") !== -1 ||
    ipApi.hosting === true;

  const isMobile =
    rawLower.indexOf("移动") !== -1;

  let networkCategory = "普通网络";
  if (isResidential) {
    networkCategory = "住宅";
  } else if (isMobile) {
    networkCategory = "移动数据";
  } else if (isDatacenter) {
    networkCategory = "机房";
  }

  let score = 100;
  const tags = [];

  let proxyExit = false;
  let highRiskProxy = false;
  let cloudService = false;
  let blacklisted = false;
  let abuseNode = false;
  let attackInvolved = false;

  /***** ip-api部分 *****/
  if (ipApi.proxy === true) {
    proxyExit = true;
    highRiskProxy = true;
    score -= 18;
    if (tags.indexOf("代理出口") === -1) tags.push("代理出口");
  }

  if (ipApi.hosting === true) {
    cloudService = true;
    proxyExit = true;
    score -= 22;
    if (tags.indexOf("机房托管") === -1) tags.push("机房托管");
  }

  /***** cz88网络类型 *****/
  if (networkCategory === "住宅") {
    score += 10;
  } else if (networkCategory === "移动数据") {
    score += 4;
    if (tags.indexOf("移动网络") === -1) tags.push("移动网络");
  } else if (networkCategory === "机房") {
    score -= 15;
    if (tags.indexOf("机房网络") === -1) tags.push("机房网络");
  }

  /***** 真人概率 *****/
  if (!isNaN(humanScore)) {
    if (humanScore >= 80) {
      score += 8;
    } else if (humanScore >= 60) {
      score += 2;
    } else if (humanScore >= 40) {
      score -= 8;
      if (tags.indexOf("真人概率偏低") === -1) tags.push("真人概率偏低");
    } else {
      score -= 18;
      if (tags.indexOf("高度可疑") === -1) tags.push("高度可疑");
      highRiskProxy = true;
    }
  }

  /***** AbuseIPDB *****/
  if (abuse && abuse.data) {
    const abuseScore = Number(abuse.data.abuseConfidenceScore || 0);
    const totalReports = Number(abuse.data.totalReports || 0);

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
  }

  /***** 风控值 / 原生感 / 共享感（推断版） *****/
  let riskValue = 0;
  let nativeFeel = 50;
  let sharedFeel = 20;

  // 风控值：越高越危险
  if (ipApi.proxy === true) riskValue += 25;
  if (ipApi.hosting === true) riskValue += 25;
  if (isDatacenter) riskValue += 15;
  if (isMobile) riskValue += 5;

  if (!isNaN(humanScore)) {
    if (humanScore >= 80) riskValue -= 10;
    else if (humanScore >= 60) riskValue -= 3;
    else if (humanScore >= 40) riskValue += 8;
    else riskValue += 18;
  }

  if (abuse && abuse.data) {
    const abuseScore2 = Number(abuse.data.abuseConfidenceScore || 0);
    const totalReports2 = Number(abuse.data.totalReports || 0);

    riskValue += Math.min(30, Math.round(abuseScore2 * 0.3));
    if (totalReports2 >= 10) riskValue += 10;
    else if (totalReports2 > 0) riskValue += 4;
  }

  if (riskValue < 0) riskValue = 0;
  if (riskValue > 100) riskValue = 100;

  // 原生感：越高越像真实当地用户
  if (isResidential) nativeFeel += 28;
  if (isMobile) nativeFeel += 12;
  if (isDatacenter) nativeFeel -= 30;
  if (ipApi.hosting === true) nativeFeel -= 25;
  if (ipApi.proxy === true) nativeFeel -= 20;

  if (!isNaN(humanScore)) {
    if (humanScore >= 80) nativeFeel += 18;
    else if (humanScore >= 60) nativeFeel += 8;
    else if (humanScore >= 40) nativeFeel -= 8;
    else nativeFeel -= 20;
  }

  if (abuse && abuse.data) {
    const abuseScore3 = Number(abuse.data.abuseConfidenceScore || 0);
    nativeFeel -= Math.min(15, Math.round(abuseScore3 * 0.15));
  }

  if (nativeFeel < 0) nativeFeel = 0;
  if (nativeFeel > 100) nativeFeel = 100;

  // 共享感：越高越像多人共用出口
  if (ipApi.hosting === true) sharedFeel += 30;
  if (ipApi.proxy === true) sharedFeel += 20;
  if (isDatacenter) sharedFeel += 20;
  if (isResidential) sharedFeel -= 10;
  if (isMobile) sharedFeel += 5;

  if (!isNaN(humanScore)) {
    if (humanScore >= 80) sharedFeel -= 8;
    else if (humanScore >= 60) sharedFeel -= 3;
    else if (humanScore >= 40) sharedFeel += 8;
    else sharedFeel += 15;
  }

  if (abuse && abuse.data) {
    const abuseScore4 = Number(abuse.data.abuseConfidenceScore || 0);
    const totalReports4 = Number(abuse.data.totalReports || 0);

    sharedFeel += Math.min(20, Math.round(abuseScore4 * 0.2));
    if (totalReports4 >= 10) sharedFeel += 10;
  }

  if (sharedFeel < 0) sharedFeel = 0;
  if (sharedFeel > 100) sharedFeel = 100;

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  let level = "优秀";
  if (score >= 85) level = "优秀";
  else if (score >= 70) level = "良好";
  else if (score >= 50) level = "一般";
  else level = "较差";

  let conclusion = "普通可用";
  if (score >= 85 && networkCategory === "住宅" && !proxyExit && !blacklisted) {
    conclusion = "优质住宅IP，可放心使用";
  } else if (score >= 70 && !blacklisted && networkCategory !== "机房") {
    conclusion = "整体较稳，可正常使用";
  } else if (networkCategory === "机房" || proxyExit) {
    conclusion = "偏机房/代理出口，注册与风控场景需谨慎";
  }
  if (blacklisted || attackInvolved) {
    conclusion = "存在滥用或攻击风险，建议更换节点";
  }

  return {
    score: score,
    level: level,
    tags: tags.length ? tags.join(" / ") : "无明显异常",
    networkCategory: networkCategory,
    isResidential: isResidential,
    isDatacenter: isDatacenter,
    isMobile: isMobile,
    proxyExit: proxyExit,
    highRiskProxy: highRiskProxy,
    cloudService: cloudService,
    blacklisted: blacklisted,
    abuseNode: abuseNode,
    attackInvolved: attackInvolved,
    conclusion: conclusion,
    riskValue: riskValue,
    nativeFeel: nativeFeel,
    sharedFeel: sharedFeel
  };
}

/*************** 主流程 ***************/
function fetchAll() {
  httpGet(
    "http://ip-api.com/json?lang=zh-CN&fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query,proxy,hosting",
    function (err1, res1, data1) {
      if (err1 || !data1) {
        return done("IP查询失败\n" + String(err1 || ""));
      }

      const ipApi = parseJSON(data1);
      if (!ipApi || !ipApi.query) {
        return done("IP数据解析失败");
      }

      const cz88Url = "https://www.cz88.net/api/cz88/ip/base?ip=" + ipApi.query;
      httpGet(cz88Url, function (err2, res2, data2) {
        let cz88Data = null;
        if (!err2 && data2) {
          const cz88Json = parseJSON(data2);
          if (cz88Json && cz88Json.data) {
            cz88Data = cz88Json.data;
          }
        }

        checkAbuseIPDB(ipApi.query, function (abuseData) {
          const risk = analyzeRisk(ipApi, cz88Data || {}, abuseData);

          const abuseScore = formatAbuseScore(abuseData);
          const ipapiScore = formatIpApiRisk(ipApi);
          const cz88Score = formatCz88Risk(cz88Data);
          const riskValueText = formatRiskValue(risk.riskValue);
          const nativeFeelText = formatNativeFeel(risk.nativeFeel);
          const sharedFeelText = formatSharedFeel(risk.sharedFeel);

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

            lines.push("【基础信息】");
            lines.push("IP：" + (ipApi.query || "-"));
            lines.push("国家/地区：" + (ipApi.country || "-"));
            lines.push("地区：" + (ipApi.regionName || "-"));
            lines.push("城市：" + (ipApi.city || "-"));
            lines.push("ZIP：" + (ipApi.zip || "-"));
            lines.push("ISP：" + ((cz88Data && cz88Data.isp) || ipApi.isp || "-"));
            lines.push("组织：" + (ipApi.org || "-"));
            lines.push("ASN：" + (ipApi.as || "-"));
            lines.push("时区：" + (ipApi.timezone || "-"));
            lines.push("经纬度：" + (ipApi.lat || "-") + " / " + (ipApi.lon || "-"));
            lines.push("");

            lines.push("【网络画像】");
            lines.push("主类型：" + (risk.networkCategory || "-"));
            lines.push("家宽：" + (risk.isResidential ? "是" : "否"));
            lines.push("数据中心：" + (risk.isDatacenter ? "是" : "否"));
            lines.push("移动网络：" + (risk.isMobile ? "是" : "否"));
            lines.push("原始网络标记：" + ((cz88Data && cz88Data.netWorkType) || "未返回"));
            lines.push("真人概率：" + formatHumanScoreFull(cz88Data && cz88Data.score));
            lines.push("代理标记：" + (ipApi.proxy ? "是" : "否"));
            lines.push("托管标记：" + (ipApi.hosting ? "是" : "否"));
            lines.push("");

            lines.push("【综合评分】");
            lines.push("综合评分：" + risk.score + " / 100");
            lines.push("质量判断：" + risk.level);
            lines.push("特征：" + risk.tags);
            lines.push("");

            lines.push("【风控画像】");
            lines.push(line("风控值", riskValueText.text, riskValueText.level));
            lines.push(line("原生感", nativeFeelText.text, nativeFeelText.level));
            lines.push(line("共享感", sharedFeelText.text, sharedFeelText.level));
            lines.push("");

            lines.push("【多源评分】");
            lines.push(line("AbuseIPDB", abuseScore.text, abuseScore.level));
            lines.push(line("ip-api", ipapiScore.text, ipapiScore.level));
            lines.push(line("cz88", cz88Score.text, cz88Score.level));
            lines.push("");

            lines.push("【代理 / 风险判断】");
            lines.push(boolLine("代理出口", risk.proxyExit));
            lines.push(boolLine("高风险代理", risk.highRiskProxy));
            lines.push(boolLine("云服务", risk.cloudService));
            lines.push("");

            lines.push("【黑名单 / 滥用】");
            lines.push(boolLine("黑名单", risk.blacklisted));
            lines.push(boolLine("滥用节点", risk.abuseNode));
            lines.push(boolLine("参与攻击", risk.attackInvolved));
            if (abuseData && abuseData.data) {
              lines.push("Abuse置信分：" + (abuseData.data.abuseConfidenceScore || 0));
              lines.push("滥用报告数：" + (abuseData.data.totalReports || 0));
            } else {
              lines.push("Abuse置信分：未启用");
            }
            lines.push("");

            lines.push("【媒体检测】");
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