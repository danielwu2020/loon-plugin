const STORE_KEY = "RebuildNodeLineJsonByRE";

(async function () {
  try {
    log("NodeLinkCheck Fixed Start");

    const envInfo = getEnvInfo();
    const nodeName = envInfo.nodeName || "未知节点";
    const policyName = envInfo.policyName || "";
    const mapping = getJSON(STORE_KEY, {});

    log("环境信息: " + JSON.stringify(envInfo));
    log("节点名称: " + nodeName);

    const match = findNodeRecord(nodeName, mapping) || findNodeRecord(policyName, mapping);
    const inferredType = inferTypeFromName(nodeName || policyName);
    const nodeType = normalizeType((match && match.type) || inferredType || "unknown");
    const server = (match && match.server) || "未知";

    log("匹配结果: " + JSON.stringify(match || {}));
    log("推断类型: " + inferredType);
    log("最终类型: " + nodeType);
    log("入口服务器: " + server);

    const exitInfo = await queryGeoIPByCurrentProxy();
    log("出口IP信息: " + JSON.stringify(exitInfo));

    let entryInfo = null;
    if (match && match.server && match.server !== "未知") {
      try {
        entryInfo = await queryGeoIPByHost(match.server);
        log("入口IP信息: " + JSON.stringify(entryInfo));
      } catch (e) {
        log("入口查询失败: " + String(e));
      }
    }

    const resultText = buildResultText({
      nodeName,
      policyName,
      nodeType,
      server,
      exitInfo,
      entryInfo,
      matched: !!match,
      inferred: !!inferredType
    });

    notify("代理链路检测", resultText);
    done();
  } catch (e) {
    const err = String(e && e.message ? e.message : e);
    const stack = String(e && e.stack ? e.stack : "");
    log("脚本报错: " + err);
    if (stack) log(stack);

    notify(
      "代理链路检测报错",
      [
        "脚本运行异常",
        "",
        "错误信息:",
        err,
        "",
        stack ? "错误堆栈:\n" + stack : "无堆栈信息"
      ].join("\n")
    );
    done();
  }
})();

function getEnvInfo() {
  const result = {
    nodeName: "",
    policyName: "",
    raw: null
  };

  try {
    if (typeof $environment !== "undefined" && $environment) {
      result.raw = $environment;

      if ($environment.params) {
        if (typeof $environment.params === "string") {
          result.nodeName = $environment.params;
        } else if (typeof $environment.params === "object") {
          result.nodeName =
            $environment.params.node ||
            $environment.params.name ||
            $environment.params.proxy ||
            $environment.params.tag ||
            "";

          result.policyName =
            $environment.params.policy ||
            $environment.params.selectPolicy ||
            "";
        }
      }

      if (!result.nodeName && $environment.node) {
        result.nodeName = $environment.node;
      }
    }
  } catch (e) {
    log("读取环境失败: " + String(e));
  }

  return result;
}

function getJSON(key, defVal) {
  try {
    const raw = readStore(key);
    return raw ? JSON.parse(raw) : defVal;
  } catch (e) {
    log("读取JSON失败 " + key + ": " + String(e));
    return defVal;
  }
}

function readStore(key) {
  try {
    if (typeof $persistentStore !== "undefined") {
      return $persistentStore.read(key);
    }
  } catch (e) {}

  try {
    if (typeof $prefs !== "undefined") {
      return $prefs.valueForKey(key);
    }
  } catch (e) {}

  return null;
}

function findNodeRecord(nodeName, mapping) {
  if (!nodeName || !mapping || typeof mapping !== "object") return null;

  if (mapping[nodeName]) return mapping[nodeName];

  const target = normalizeNodeName(nodeName);

  for (const key in mapping) {
    if (normalizeNodeName(key) === target) {
      return mapping[key];
    }
  }

  for (const key in mapping) {
    const a = normalizeNodeName(key);
    if (a && target && (a.includes(target) || target.includes(a))) {
      return mapping[key];
    }
  }

  return null;
}

function normalizeNodeName(name) {
  return String(name || "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, "")
    .replace(/[【】\[\]（）()「」『』]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function inferTypeFromName(name) {
  const n = String(name || "").toLowerCase();

  if (/hysteria2|hy2/.test(n)) return "hysteria2";
  if (/hysteria/.test(n)) return "hysteria";
  if (/tuic/.test(n)) return "tuic";
  if (/vless/.test(n)) return "vless";
  if (/vmess/.test(n)) return "vmess";
  if (/trojan/.test(n)) return "trojan";
  if (/ssr/.test(n)) return "ssr";
  if (/(^|[\s_\-|])(ss)(?=$|[\s_\-|])/.test(n)) return "ss";
  if (/snell/.test(n)) return "snell";
  if (/socks5|socks/.test(n)) return "socks5";
  if (/https/.test(n)) return "https";
  if (/http/.test(n)) return "http";
  if (/wireguard|wg/.test(n)) return "wireguard";
  if (/shadowtls/.test(n)) return "shadowtls";
  if (/anytls/.test(n)) return "anytls";

  return "";
}

function normalizeType(type) {
  const t = String(type || "").trim().toLowerCase();

  const map = {
    socks: "socks5",
    socks5h: "socks5",
    hy2: "hysteria2",
    wg: "wireguard"
  };

  return map[t] || t || "unknown";
}

async function queryGeoIPByCurrentProxy() {
  const urls = [
    "http://ip-api.com/json/?lang=zh-CN",
    "https://api.ip.sb/geoip",
    "https://ipapi.co/json/"
  ];

  for (const url of urls) {
    try {
      const data = await httpGetJSON(url, 8000);
      const info = normalizeGeoResult(data);
      if (info && info.ip) return info;
    } catch (e) {
      log("出口查询失败: " + url + " | " + String(e));
    }
  }

  return {
    ip: "未知",
    country: "未知",
    region: "",
    city: "",
    isp: "未知",
    org: ""
  };
}

async function queryGeoIPByHost(host) {
  const cleanHost = String(host || "").trim();
  if (!cleanHost) throw new Error("host empty");

  const urls = [
    `http://ip-api.com/json/${encodeURIComponent(cleanHost)}?lang=zh-CN`,
    `https://api.ip.sb/geoip/${encodeURIComponent(cleanHost)}`
  ];

  for (const url of urls) {
    try {
      const data = await httpGetJSON(url, 8000);
      const info = normalizeGeoResult(data);
      if (info && (info.ip || info.country !== "未知")) return info;
    } catch (e) {
      log("入口查询失败: " + url + " | " + String(e));
    }
  }

  throw new Error("query host geo failed");
}

function normalizeGeoResult(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  return {
    ip: data.query || data.ip || "",
    country: data.country || data.country_name || data.countryCode || data.country_code || "未知",
    region: data.regionName || data.region || "",
    city: data.city || "",
    isp: data.isp || data.asn_organization || data.organization || data.org || "",
    org: data.org || data.as || ""
  };
}

function buildResultText(ctx) {
  const lineType = detectLineType(ctx.entryInfo, ctx.exitInfo);
  const matchTypeText = ctx.matched
    ? "映射匹配"
    : ctx.inferred
    ? "节点名推断"
    : "通用模式";

  const lines = [
    "-------------------------",
    "⟦ 代理链路检测 ⟧",
    "-------------------------",
    "",
    "节点名称: " + safe(ctx.nodeName),
    ctx.policyName ? "策略名称: " + safe(ctx.policyName) : null,
    "节点类型: " + safe(ctx.nodeType),
    "入口服务器: " + safe(ctx.server),
    "识别方式: " + matchTypeText,
    "",
    "出口 IP: " + safe(ctx.exitInfo.ip),
    "出口地区: " + formatGeo(ctx.exitInfo),
    "出口 ISP: " + safe(ctx.exitInfo.isp || ctx.exitInfo.org),
    "",
    ctx.entryInfo
      ? "入口 IP: " + safe(ctx.entryInfo.ip)
      : "入口 IP: 未获取到",
    ctx.entryInfo
      ? "入口地区: " + formatGeo(ctx.entryInfo)
      : "入口地区: 未获取到",
    ctx.entryInfo
      ? "入口 ISP: " + safe(ctx.entryInfo.isp || ctx.entryInfo.org)
      : "入口 ISP: 未获取到",
    "",
    "链路判断: " + lineType
  ].filter(Boolean);

  return lines.join("\n");
}

function detectLineType(entryInfo, exitInfo) {
  if (!exitInfo || !exitInfo.country || exitInfo.country === "未知") {
    return "已获取出口信息，但无法完整判断";
  }

  if (!entryInfo || !entryInfo.country || entryInfo.country === "未知") {
    return "已获取出口信息，入口信息不足";
  }

  const a = String(entryInfo.country).toUpperCase();
  const b = String(exitInfo.country).toUpperCase();

  if ((a === "中国" || a === "CN") && (b === "中国" || b === "CN")) {
    return "国内链路";
  }

  if ((a === "中国" || a === "CN") && !(b === "中国" || b === "CN")) {
    return "出国方向";
  }

  if (!(a === "中国" || a === "CN") && (b === "中国" || b === "CN")) {
    return "回国方向";
  }

  if (a === b) {
    return "同地区落地";
  }

  return "跨地区链路";
}

function formatGeo(info) {
  if (!info) return "未知";
  const arr = [];
  if (info.country) arr.push(info.country);
  if (info.region) arr.push(info.region);
  if (info.city) arr.push(info.city);
  return arr.length ? arr.join(" / ") : "未知";
}

function safe(v) {
  return v || "未知";
}

function httpGetJSON(url, timeout) {
  return new Promise((resolve, reject) => {
    const req = {
      url: url,
      timeout: timeout || 8000,
      headers: {
        "User-Agent": "Loon-NodeLinkCheck-Fixed",
        "Accept": "application/json,text/plain,*/*"
      }
    };

    if (typeof $httpClient !== "undefined") {
      $httpClient.get(req, function (err, resp, data) {
        if (err) return reject(err);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
      return;
    }

    if (typeof $task !== "undefined") {
      $task.fetch(req).then(
        function (resp) {
          try {
            resolve(JSON.parse(resp.body));
          } catch (e) {
            reject(e);
          }
        },
        function (err) {
          reject(err);
        }
      );
      return;
    }

    reject(new Error("No supported HTTP API"));
  });
}

function notify(title, body) {
  try {
    if (typeof $notification !== "undefined") {
      $notification.post(title, "", body);
      return;
    }
  } catch (e) {
    console.log("通知失败1: " + String(e));
  }

  try {
    if (typeof $notify !== "undefined") {
      $notify(title, "", body);
      return;
    }
  } catch (e) {
    console.log("通知失败2: " + String(e));
  }

  console.log(title + "\n" + body);
}

function log(msg) {
  try {
    console.log(msg);
  } catch (e) {}
}

function done() {
  if (typeof $done !== "undefined") {
    $done({});
  }
}