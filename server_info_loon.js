/*************************************
 * 节点详情查询 Ultimate - Loon
 * 保留：
 * - IP详细信息
 * - 真人概率
 * - 网络类型（住宅/机房/移动）
 * - 代理/黑名单倾向
 * - 媒体：Netflix / TikTok / YouTube
 *************************************/

const TIMEOUT = 8000;

/*************** 环境兼容 ***************/
function getNodeName() {
  try {
    if (typeof $environment !== "undefined" && $environment.params) {
      return (
        $environment.params.node ||
        ($environment.params.nodeInfo && $environment.params.nodeInfo.name)
      );
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
      return $environment.params.node || $environment.params;
    }
    if (typeof $loon !== "undefined" && $loon.node) {
      return $loon.node;
    }
  } catch (e) {}
  return null;
}

const nodeName = getNodeName();
const nodeParam = getNodeParam();

/*************** 工具 ***************/
function httpGet(target, callback) {
  const opts = typeof target === "string" ? { url: target } : target;
  if (nodeParam) opts.node = nodeParam;
  if (!opts.timeout) opts.timeout = TIMEOUT;
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

/*************** 媒体检测 ***************/
function checkNetflix(cb) {
  httpGet({
    url: "https://www.netflix.com/title/81215567",
    headers: { "User-Agent": "Mozilla/5.0" }
  }, function (err, resp) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    if (code === 200) return cb("可用", "ok");
    if (code === 404) return cb("仅自制剧", "warn");
    if (code === 403) return cb("被拒绝", "fail");
    cb("未知(" + code + ")", "warn");
  });
}

function checkTikTok(cb) {
  httpGet({
    url: "https://www.tiktok.com/",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en"
    }
  }, function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    const body = data || "";
    if (code === 200 && body) return cb("可访问", "ok");
    if (code === 403) return cb("被拒绝", "fail");
    if (code === 301 || code === 302) return cb("重定向", "warn");
    cb("未知(" + code + ")", "warn");
  });
}

function checkYouTube(cb) {
  httpGet({
    url: "https://www.youtube.com/premium",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en"
    }
  }, function (err, resp, data) {
    if (err || !resp || !data) return cb("检测失败", "fail");
    const match = data.match(/"countryCode":"(.*?)"/);
    if (match && match[1]) return cb("Premium地区 " + match[1], "ok");
    const code = resp.status || resp.statusCode || 0;
    if (code === 200) return cb("可访问", "warn");
    cb("未知(" + code + ")", "warn");
  });
}

/*************** 风险 / 网络类型判断 ***************/
function analyzeRisk(ipApi, cz88) {
  const isp = ((cz88 && cz88.isp) || ipApi.isp || "").toLowerCase();
  const org = (ipApi.org || "").toLowerCase();
  const asn = (ipApi.as || "").toLowerCase();
  const networkType = ((cz88 && cz88.netWorkType) || "").toLowerCase();
  const full = [isp, org, asn, networkType].join(" ");

  const cloudKeywords = [
    "amazon", "aws", "google", "microsoft", "azure", "oracle", "digitalocean",
    "linode", "vultr", "ovh", "contabo", "hetzner", "aliyun", "alibaba",
    "tencent", "cloudflare", "choopa"
  ];

  const vpnKeywords = [
    "vpn", "nord", "surfshark", "expressvpn", "mullvad", "purevpn", "pia",
    "proxy", "shadowsocks", "wireguard", "openvpn", "v2ray"
  ];

  const publicProxyKeywords = [
    "proxy", "public proxy", "open proxy", "socks", "http proxy", "reseller"
  ];

  const torKeywords = ["tor", "onion"];
  const abuseKeywords = ["abuse", "spam", "bot", "crawler", "scanner", "malware"];

  function hasAny(arr) {
    for (var i = 0; i < arr.length; i++) {
      if (full.indexOf(arr[i]) !== -1) return true;
    }
    return false;
  }

  const isHosting = ipApi.hosting === true || full.indexOf("datacenter") !== -1 || networkType.indexOf("机房") !== -1;
  const isCloud = hasAny(cloudKeywords) || isHosting;
  const isAnonymousVPN = ipApi.proxy === true && (hasAny(vpnKeywords) || isCloud);
  const isPublicProxy = ipApi.proxy === true && hasAny(publicProxyKeywords);
  const isTor = hasAny(torKeywords);
  const suspiciousProxy = ipApi.proxy === true || isHosting || isCloud;
  const blacklisted = suspiciousProxy && (isPublicProxy || isCloud || isTor);
  const abuseNode = suspiciousProxy && (hasAny(abuseKeywords) || isPublicProxy || isTor);
  const attackInvolved = isTor || hasAny(abuseKeywords) || (ipApi.proxy === true && isHosting);
  const datacenterProxy = isHosting || isCloud;

  let networkCategory = "未知";
  if (networkType.indexOf("住宅") !== -1 || networkType.indexOf("家庭") !== -1 || networkType.indexOf("宽带") !== -1) {
    networkCategory = "住宅";
  } else if (networkType.indexOf("移动") !== -1) {
    networkCategory = "移动";
  } else if (networkType.indexOf("机房") !== -1 || isHosting || isCloud) {
    networkCategory = "机房";
  }

  let score = 100;
  const tags = [];

  if (ipApi.proxy) { score -= 25; tags.push("代理"); }
  if (ipApi.hosting) { score -= 25; tags.push("机房"); }
  if (isCloud) { score -= 15; tags.push("云服务"); }
  if (isAnonymousVPN) { score -= 12; tags.push("匿名VPN"); }
  if (isPublicProxy) { score -= 15; tags.push("公共代理"); }
  if (isTor) { score -= 35; tags.push("TOR"); }
  if (blacklisted) { score -= 15; tags.push("黑名单倾向"); }
  if (abuseNode) { score -= 10; tags.push("滥用节点倾向"); }
  if (attackInvolved) { score -= 10; tags.push("攻击历史倾向"); }

  if (networkCategory === "住宅") {
    score += 8;
    tags.push("住宅特征");
  }
  if (networkCategory === "移动") {
    score += 5;
    tags.push("移动特征");
  }

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  let level = "较差";
  if (score >= 85) level = "优秀";
  else if (score >= 70) level = "良好";
  else if (score >= 50) level = "一般";

  return {
    score: score,
    level: level,
    tags: tags.length ? tags.join(" / ") : "无明显异常",
    anonymousVPN: isAnonymousVPN,
    datacenterProxy: datacenterProxy,
    publicProxy: isPublicProxy,
    suspiciousProxy: suspiciousProxy,
    blacklisted: blacklisted,
    abuseNode: abuseNode,
    torNode: isTor,
    attackInvolved: attackInvolved,
    cloudService: isCloud,
    networkCategory: networkCategory
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

        const risk = analyzeRisk(ipApi, cz88Data || {});

        const checks = [
          { name: "Netflix", run: checkNetflix },
          { name: "TikTok", run: checkTikTok },
          { name: "YouTube", run: checkYouTube }
        ];

        runChecks(checks, function (results) {
          const lines = [];

          lines.push("【基础信息】");
          lines.push("节点：" + nodeName);
          lines.push("IP：" + (ipApi.query || "-"));
          lines.push("国家/地区：" + (ipApi.country || "-"));
          lines.push("地区：" + (ipApi.regionName || "-"));
          lines.push("城市：" + (ipApi.city || "-"));
          lines.push("ZIP：" + (ipApi.zip || "-"));
          lines.push("ISP：" + ((cz88Data && cz88Data.isp) || ipApi.isp || "-"));
          lines.push("组织：" + (ipApi.org || "-"));
          lines.push("ASN：" + (ipApi.as || "-"));
          lines.push("网络类型：" + (risk.networkCategory || "-"));
          lines.push("原始网络标记：" + ((cz88Data && cz88Data.netWorkType) || "-"));
          lines.push("真人概率：" + ((cz88Data && cz88Data.score) || "-"));
          lines.push("时区：" + (ipApi.timezone || "-"));
          lines.push("经纬度：" + (ipApi.lon || "-") + " / " + (ipApi.lat || "-"));
          lines.push("");

          lines.push("【IP质量】");
          lines.push("综合评分：" + risk.score + " / 100");
          lines.push("质量判断：" + risk.level);
          lines.push("特征：" + risk.tags);
          lines.push("");

          lines.push("【代理检测】");
          lines.push(boolLine("匿名VPN", risk.anonymousVPN));
          lines.push(boolLine("机房代理", risk.datacenterProxy));
          lines.push(boolLine("公共代理", risk.publicProxy));
          lines.push(boolLine("可疑代理", risk.suspiciousProxy));
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
    }
  );
}

fetchAll();