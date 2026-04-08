/*
NodeLinkCheck - Loon fixed version
不再因为缺少 RebuildNodeLineJsonByRE 或节点名轻微变化直接报：
[ 没匹配到节点类型 ]

用法：
1. 可配合 Sub-Store 的 Operator.js 使用
2. 也可单独使用；当本地没有映射时，会自动从节点名兜底推断协议
*/

const $ = new Env("代理链路检测修复版");

const STORE_KEY = "RebuildNodeLineJsonByRE";
const DEBUG_KEY = "RebuildNodeLineDebugByRE";

(async () => {
  try {
    const params = getParams();
    const nodeName = getNodeName(params);
    const searchText = getSearchText(params);

    const mapping = $.getjson(STORE_KEY, {}) || {};
    const debugLog = $.getdata(DEBUG_KEY) || "";

    const match = findNodeRecord(nodeName, mapping);
    const inferredType = inferTypeFromName(nodeName);
    const nodeType = normalizeType(
      (match && match.type) || inferredType || "unknown"
    );
    const server = (match && match.server) || "未知";

    const exitInfo = await queryExitInfo();
    const directInfo = await queryDirectInfo();

    const lineTag = detectLineTag(nodeName);
    const compareText = buildCompareText(directInfo, exitInfo, lineTag);

    const title = "代理链路检测";
    const body = [
      "-------------------------",
      `⟦ ${lineTag} ⟧`,
      "-------------------------",
      "",
      `节点名称: ${nodeName || "未知"}`,
      `节点类型: ${renderType(nodeType, !!match, !!inferredType)}`,
      `节点服务端: ${server}`,
      "",
      `入口 IP: ${safe(directInfo.ip)}`,
      `入口地区: ${formatGeo(directInfo)}`,
      `入口 ISP: ${safe(directInfo.isp || directInfo.org)}`,
      "",
      `出口 IP: ${safe(exitInfo.ip)}`,
      `出口地区: ${formatGeo(exitInfo)}`,
      `出口 ISP: ${safe(exitInfo.isp || exitInfo.org)}`,
      "",
      "-----------------------------------",
      compareText,
      "",
      `当前节点 ➟ ${nodeName || "未知"}`
    ].join("\n");

    const foot = buildFoot(match, inferredType, debugLog);

    notify(title, body + foot);
    $.done();
  } catch (e) {
    notify(
      "代理链路检测",
      [
        "-------------------------",
        "⟦ 检测失败 ⟧",
        "-------------------------",
        "",
        String(e && e.message ? e.message : e)
      ].join("\n")
    );
    $.done();
  }
})();

function getParams() {
  if (typeof $environment !== "undefined" && $environment && $environment.params) {
    return $environment.params;
  }
  return {};
}

function getNodeName(params) {
  if (!params) return "";
  if (typeof params === "string") return params;
  return (
    params.node ||
    params.name ||
    params.proxy ||
    params.tag ||
    params.params ||
    ""
  );
}

function getSearchText(params) {
  if (!params) return "";
  if (typeof params === "string") return params;
  return params.search || params.keyword || params.query || "";
}

function normalizeType(type) {
  if (!type) return "unknown";
  const t = String(type).trim().toLowerCase();

  const map = {
    socks: "socks5",
    socks5h: "socks5",
    "socks5-tls": "socks5",
    hy2: "hysteria2",
    hysteria: "hysteria",
    http2: "http",
    https: "https",
    shadowtls: "shadowtls",
    wg: "wireguard"
  };

  return map[t] || t;
}

function stripDecorations(name) {
  if (!name) return "";
  return String(name)
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, "")
    .replace(/[\[\]()（）【】「」『』]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findNodeRecord(nodeName, mapping) {
  if (!nodeName || !mapping || typeof mapping !== "object") return null;

  if (mapping[nodeName]) return mapping[nodeName];

  const normalizedTarget = stripDecorations(nodeName).toLowerCase();

  for (const key of Object.keys(mapping)) {
    if (stripDecorations(key).toLowerCase() === normalizedTarget) {
      return mapping[key];
    }
  }

  for (const key of Object.keys(mapping)) {
    const a = stripDecorations(key).toLowerCase();
    const b = normalizedTarget;
    if (a && b && (a.includes(b) || b.includes(a))) {
      return mapping[key];
    }
  }

  return null;
}

function inferTypeFromName(name) {
  const n = String(name || "").toLowerCase();

  const rules = [
    ["hysteria2", /(hysteria2|hy2)\b/],
    ["hysteria", /\bhysteria\b/],
    ["tuic", /\btuic\b/],
    ["vless", /\bvless\b/],
    ["vmess", /\bvmess\b/],
    ["trojan", /\btrojan\b/],
    ["ssr", /\bssr\b/],
    ["ss", /(^|[\s_\-|\[])(ss)(?=$|[\s_\-|\]])/],
    ["snell", /\bsnell\b/],
    ["http", /\bhttp\b/],
    ["https", /\bhttps\b/],
    ["socks5", /(socks5|socks)\b/],
    ["wireguard", /(wireguard|\bwg\b)/],
    ["shadowtls", /\bshadowtls\b/],
    ["anytls", /\banytls\b/]
  ];

  for (const [type, reg] of rules) {
    if (reg.test(n)) return type;
  }
  return "";
}

function detectLineTag(name) {
  const text = String(name || "");
  if (/IEPL/i.test(text)) return "IEPL专线";
  if (/IPLC/i.test(text)) return "IPLC专线";
  if (/专线/i.test(text)) return "内网专线";
  return "防火墙";
}

async function queryExitInfo() {
  const urls = [
    "https://api.ip.sb/geoip",
    "https://ipapi.co/json/",
    "https://ipinfo.io/json"
  ];

  for (const url of urls) {
    try {
      const res = await httpGetJson(url, 8000);
      const info = normalizeGeoResponse(res);
      if (info && info.ip) return info;
    } catch (_) {}
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

async function queryDirectInfo() {
  /*
    这里依然尽量做“入口查询”。
    某些环境下脚本请求同样会走当前节点，因此入口/出口可能相同。
    不再因此报错，只做友好展示。
  */
  const urls = [
    "https://api.ip.sb/geoip",
    "https://ipapi.co/json/"
  ];

  for (const url of urls) {
    try {
      const res = await httpGetJson(url, 5000);
      const info = normalizeGeoResponse(res);
      if (info && info.ip) return info;
    } catch (_) {}
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

function normalizeGeoResponse(data) {
  if (!data || typeof data !== "object") return null;

  return {
    ip: data.ip || data.query || "",
    country:
      data.country ||
      data.country_name ||
      data.countryCode ||
      data.country_code ||
      "",
    region: data.region || data.regionName || data.region_code || "",
    city: data.city || "",
    isp: data.isp || data.asn_organization || data.org || data.organization || "",
    org: data.org || data.asn || ""
  };
}

function buildCompareText(entry, exit, lineTag) {
  const a = (entry.country || "").toUpperCase();
  const b = (exit.country || "").toUpperCase();

  if (!a || !b || a === "未知" || b === "未知") {
    return "结果说明: 已完成通用检测，但入口/出口信息不完整";
  }

  if (a === b && a === "CN") {
    return `结果说明: 入口与出口同为 ${a}，当前更像国内落地 / 非跨境链路`;
  }

  if (a === b && a !== "CN") {
    return `结果说明: 入口与出口同为 ${a}，当前更像单区落地 / 同地区链路`;
  }

  if (a !== b && b === "CN") {
    return `结果说明: 入口 ${a}，出口 ${b}，识别为回国方向链路（${lineTag}）`;
  }

  if (a !== b && a === "CN") {
    return `结果说明: 入口 ${a}，出口 ${b}，识别为出国方向链路（${lineTag}）`;
  }

  return `结果说明: 入口 ${a}，出口 ${b}，识别为跨地区链路（${lineTag}）`;
}

function buildFoot(match, inferredType, debugLog) {
  const notes = [];

  if (match) {
    notes.push("匹配方式: 本地映射");
  } else if (inferredType) {
    notes.push("匹配方式: 节点名兜底推断");
  } else {
    notes.push("匹配方式: 未识别协议，已按通用方式检测");
  }

  if (debugLog) {
    notes.push("提示: 本地存在调试日志缓存");
  }

  return "\n\n" + notes.join(" | ");
}

function renderType(type, matched, inferred) {
  if (matched) return `${type}（映射）`;
  if (inferred) return `${type}（推断）`;
  return `${type}（通用）`;
}

function formatGeo(info) {
  const arr = [info.country, info.region, info.city].filter(Boolean);
  return arr.length ? arr.join(" / ") : "未知";
}

function safe(v) {
  return v || "未知";
}

function notify(title, body) {
  if (typeof $notification !== "undefined") {
    $notification.post(title, "", body);
  } else if (typeof $notify !== "undefined") {
    $notify(title, "", body);
  } else {
    console.log(title + "\n\n" + body);
  }
}

function httpGetJson(url, timeout) {
  return new Promise((resolve, reject) => {
    const req = {
      url,
      timeout: timeout || 8000,
      headers: {
        "User-Agent": "Loon NodeLinkCheck Fixed/1.0",
        Accept: "application/json,text/plain,*/*"
      }
    };

    if (typeof $httpClient !== "undefined") {
      $httpClient.get(req, (err, resp, data) => {
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
        (resp) => {
          try {
            resolve(JSON.parse(resp.body));
          } catch (e) {
            reject(e);
          }
        },
        (err) => reject(err)
      );
      return;
    }

    reject(new Error("No supported request API"));
  });
}

function Env(name) {
  return {
    name,
    getdata(key) {
      try {
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(key);
        if (typeof $prefs !== "undefined") return $prefs.valueForKey(key);
      } catch (_) {}
      return null;
    },
    setdata(val, key) {
      try {
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(val, key);
        if (typeof $prefs !== "undefined") return $prefs.setValueForKey(val, key);
      } catch (_) {}
      return false;
    },
    getjson(key, defVal) {
      try {
        const raw = this.getdata(key);
        return raw ? JSON.parse(raw) : defVal;
      } catch (_) {
        return defVal;
      }
    },
    done(obj = {}) {
      if (typeof $done !== "undefined") $done(obj);
    }
  };
}