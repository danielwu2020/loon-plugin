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

function getNodeDetailText() {
  try {
    if (typeof $environment !== "undefined" && $environment.params) {
      if (typeof $environment.params === "string") {
        return $environment.params;
      }
      return JSON.stringify($environment.params);
    }
    if (typeof $loon !== "undefined" && $loon.node) {
      return String($loon.node);
    }
  } catch (e) {}
  return "-";
}

const NODE_NAME = getNodeName();
const NODE_DETAIL = getNodeDetailText();

/*************** 工具 ***************/
function httpGet(opt, cb) {
  const o = typeof opt === "string" ? { url: opt } : opt;
  $httpClient.get(o, (e, r, d) => cb(e, r, d));
}

function parseJSON(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

function icon(l) {
  if (l === "ok") return "🟢";
  if (l === "warn") return "🟡";
  return "🔴";
}

function line(n, v, l) {
  return icon(l) + " " + n + "：" + v;
}

function boolLine(n, b) {
  return (b ? "🔴 " : "🟢 ") + n + "：" + (b ? "是" : "否");
}

/*************** 真人概率显示 ***************/
function formatHumanScore(score) {
  const n = Number(score);
  if (isNaN(n)) return "-";

  if (n >= 80) return "🟢 " + n + "（很像真人）";
  if (n >= 60) return "🟡 " + n + "（正常偏好）";
  if (n >= 40) return "🟠 " + n + "（可疑，有点像代理）";
  return "🔴 " + n + "（很像代理/机房）";
}

/*************** API ***************/
function checkIPQS(ip, cb) {
  if (!IPQS_KEY) return cb(null);
  const url = `https://ipqualityscore.com/api/json/ip/${IPQS_KEY}/${ip}?strictness=1`;
  httpGet(url, (e, r, d) => cb(parseJSON(d)));
}

function checkAbuse(ip, cb) {
  if (!ABUSEIPDB_KEY) return cb(null);
  httpGet({
    url: `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`,
    headers: { Key: ABUSEIPDB_KEY, Accept: "application/json" }
  }, (e, r, d) => cb(parseJSON(d)));
}

/*************** 媒体 ***************/
function checkNetflix(cb) {
  httpGet("https://www.netflix.com/title/81215567", (e, r) => {
    if (!r) return cb("失败", "fail");
    if (r.status === 200) return cb("可用", "ok");
    if (r.status === 404) return cb("仅自制剧", "warn");
    cb("不可用", "fail");
  });
}

function checkTikTok(cb) {
  httpGet("https://www.tiktok.com", (e, r) => {
    if (!r) return cb("失败", "fail");
    if (r.status === 200) return cb("可访问", "ok");
    cb("不可用", "fail");
  });
}

function checkYouTube(cb) {
  httpGet("https://www.youtube.com/premium", (e, r, d) => {
    if (!d) return cb("失败", "fail");
    const m = d.match(/"countryCode":"(.*?)"/);
    if (m) return cb(m[1], "ok");
    cb("未知", "warn");
  });
}

/*************** 主流程 ***************/
httpGet("http://ip-api.com/json", (e, r, d) => {
  const ipApi = parseJSON(d);
  if (!ipApi) return $done({ title: "错误", message: "IP获取失败" });

  httpGet(`https://www.cz88.net/api/cz88/ip/base?ip=${ipApi.query}`, (e2, r2, d2) => {
    const cz = parseJSON(d2)?.data || {};

    checkIPQS(ipApi.query, (ipqs) => {
      checkAbuse(ipApi.query, (abuse) => {
        let network = cz.netWorkType || (ipApi.hosting ? "机房" : "未知");

        let score = 100;
        if (ipqs?.fraud_score) score = 100 - ipqs.fraud_score;

        let level = score > 85 ? "优秀" : score > 70 ? "良好" : score > 50 ? "一般" : "较差";

        const lines = [];

        lines.push("【节点信息】");
        lines.push("节点名称：" + NODE_NAME);
        lines.push("节点详细：" + NODE_DETAIL);
        lines.push("");

        lines.push("【基础信息】");
        lines.push("IP：" + (ipApi.query || "-"));
        lines.push("国家：" + (ipApi.country || "-"));
        lines.push("地区：" + (ipApi.regionName || "-"));
        lines.push("城市：" + (ipApi.city || "-"));
        lines.push("ISP：" + (cz.isp || ipApi.isp || "-"));
        lines.push("ASN：" + (ipApi.as || "-"));
        lines.push("网络类型：" + network);
        lines.push("真人概率：" + formatHumanScore(cz.score));
        lines.push("时区：" + (ipApi.timezone || "-"));
        lines.push("经纬度：" + ((ipApi.lat ?? "-") + ", " + (ipApi.lon ?? "-")));
        lines.push("");

        lines.push("【IP质量】");
        lines.push("评分：" + score);
        lines.push("等级：" + level);
        if (ipqs) lines.push("IPQS风险分：" + ipqs.fraud_score);
        if (abuse?.data) lines.push("Abuse分：" + abuse.data.abuseConfidenceScore);
        lines.push("");

        lines.push("【代理检测】");
        lines.push(boolLine("VPN", ipqs?.vpn));
        lines.push(boolLine("TOR", ipqs?.tor));
        lines.push(boolLine("机房", ipqs?.hosting));
        lines.push("");

        const checks = [
          { name: "Netflix", run: checkNetflix },
          { name: "TikTok", run: checkTikTok },
          { name: "YouTube", run: checkYouTube }
        ];

        let res = [], i = 0;
        function next() {
          if (i >= checks.length) {
            lines.push("【媒体检测】");
            res.forEach(x => lines.push(line(x.name, x.v, x.l)));
            return $done({ title: "节点详情 Pro", message: lines.join("\n") });
          }
          checks[i++].run((v, l) => {
            res.push({ name: checks[i - 1].name, v, l });
            next();
          });
        }
        next();
      });
    });
  });
});