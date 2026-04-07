/*************************************
 * 节点详情查询 Ultimate - Loon（最终版）
 * ✔ 网络类型（住宅/机房/移动）
 * ✔ IP质量
 * ✔ 代理/黑名单倾向
 * ✔ 媒体：Netflix / TikTok / YouTube
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
  $done({
    title: "节点详情查询 Ultimate",
    message: msg
  });
}

/*************** 媒体检测 ***************/
function checkNetflix(cb) {
  httpGet("https://www.netflix.com/title/81215567", function (err, resp) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    if (code === 200) return cb("可用", "ok");
    if (code === 404) return cb("仅自制剧", "warn");
    if (code === 403) return cb("被拒绝", "fail");
    cb("未知(" + code + ")", "warn");
  });
}

function checkTikTok(cb) {
  httpGet("https://www.tiktok.com/", function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    if (code === 200 && data) return cb("可访问", "ok");
    if (code === 403) return cb("被拒绝", "fail");
    cb("未知", "warn");
  });
}

function checkYouTube(cb) {
  httpGet("https://www.youtube.com/premium", function (err, resp, data) {
    if (err || !resp || !data) return cb("检测失败", "fail");
    const match = data.match(/"countryCode":"(.*?)"/);
    if (match) return cb(match[1], "ok");
    cb("未知", "warn");
  });
}

/*************** 风险判断 ***************/
function analyzeRisk(ipApi, cz88) {

  const networkType = ((cz88 && cz88.netWorkType) || "").toLowerCase();

  const isHosting = ipApi.hosting === true;
  const isProxy = ipApi.proxy === true;

  // ⭐ 核心：网络类型判断
  let networkCategory = "未知";

  if (networkType.includes("住宅") || networkType.includes("家庭") || networkType.includes("宽带")) {
    networkCategory = "住宅";
  } else if (networkType.includes("移动")) {
    networkCategory = "移动";
  } else if (networkType.includes("机房") || isHosting) {
    networkCategory = "机房";
  } else if (isHosting) {
    networkCategory = "机房";
  }

  // 简化评分
  let score = 100;

  if (isProxy) score -= 25;
  if (isHosting) score -= 25;
  if (networkCategory === "机房") score -= 15;
  if (networkCategory === "住宅") score += 10;

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  let level = "较差";
  if (score >= 85) level = "优秀";
  else if (score >= 70) level = "良好";
  else if (score >= 50) level = "一般";

  return {
    score,
    level,
    networkCategory,
    proxy: isProxy,
    hosting: isHosting
  };
}

/*************** 主流程 ***************/
function fetchAll() {
  httpGet("http://ip-api.com/json?lang=zh-CN", function (err, res, data) {

    if (!data) return done("IP查询失败");

    const ipApi = parseJSON(data);
    if (!ipApi || !ipApi.query) return done("解析失败");

    httpGet("https://www.cz88.net/api/cz88/ip/base?ip=" + ipApi.query,
      function (e2, r2, d2) {

        let cz88 = null;
        if (d2) {
          const obj = parseJSON(d2);
          if (obj && obj.data) cz88 = obj.data;
        }

        const risk = analyzeRisk(ipApi, cz88 || {});

        const checks = [
          { name: "Netflix", run: checkNetflix },
          { name: "TikTok", run: checkTikTok },
          { name: "YouTube", run: checkYouTube }
        ];

        let results = [];
        let i = 0;

        function next() {
          if (i >= checks.length) return finish();
          checks[i++].run(function (v, l) {
            results.push({ name: checks[i-1].name, value: v, level: l });
            next();
          });
        }

        function finish() {
          const lines = [];

          lines.push("【基础信息】");
          lines.push("节点：" + nodeName);
          lines.push("IP：" + ipApi.query);
          lines.push("国家：" + ipApi.country);
          lines.push("ISP：" + ipApi.isp);
          lines.push("网络类型：" + risk.networkCategory); // ⭐ 已加
          lines.push("");

          lines.push("【IP质量】");
          lines.push("评分：" + risk.score);
          lines.push("等级：" + risk.level);
          lines.push("");

          lines.push("【代理风险】");
          lines.push(boolLine("代理IP", risk.proxy));
          lines.push(boolLine("机房IP", risk.hosting));
          lines.push("");

          lines.push("【媒体检测】");
          for (let r of results) {
            lines.push(line(r.name, r.value, r.level));
          }

          done(lines.join("\n"));
        }

        next();
      }
    );
  });
}

fetchAll();