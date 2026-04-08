const STORE_KEY = "RebuildNodeLineJsonByRE";

(async function () {
  try {
    const nodeName = getNodeName();
    const mapping = getJSON(STORE_KEY, {});
    const match = findNodeRecord(nodeName, mapping);
    const inferredType = inferTypeFromName(nodeName);
    const nodeType = normalizeType((match && match.type) || inferredType || "unknown");
    const server = (match && match.server) || "未知";

    const exitInfo = await queryIPInfo();

    const msg = [
      "-------------------------",
      "⟦ 代理链路检测修复版 ⟧",
      "-------------------------",
      "",
      "节点名称: " + (nodeName || "未知"),
      "节点类型: " + nodeType,
      "节点服务端: " + server,
      "",
      "出口 IP: " + safe(exitInfo.ip),
      "出口地区: " + formatGeo(exitInfo),
      "出口 ISP: " + safe(exitInfo.isp || exitInfo.org),
      "",
      match
        ? "匹配方式: 本地映射"
        : inferredType
        ? "匹配方式: 节点名推断"
        : "匹配方式: 通用检测"
    ].join("\n");

    notify("代理链路检测", msg);
    done();
  } catch (e) {
    notify(
      "代理链路检测报错",
      [
        "脚本运行异常",
        "",
        "错误信息:",
        String(e && e.message ? e.message : e),
        "",
        "错误堆栈:",
        String(e && e.stack ? e.stack : "无")
      ].join("\n")
    );
    done();
  }
})();

function getNodeName() {
  try {
    if (typeof $environment !== "undefined" && $environment) {
      if (typeof $environment.params === "string") return $environment.params;
      if ($environment.params && typeof $environment.params === "object") {
        return (
          $environment.params.node ||
          $environment.params.name ||
          $environment.params.proxy ||
          $environment.params.tag ||
          ""
        );
      }
    }
  } catch (e) {}
  return "";
}

function getJSON(key, defVal) {
  try {
    const raw = readStore(key);
    return raw ? JSON.parse(raw) : defVal;
  } catch (e) {
    return defVal;
  }
}

function readStore(key) {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(key);
  } catch (e) {}
  try {
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(key);
  } catch (e) {}
  return null;
}

function findNodeRecord(nodeName, mapping) {
  if (!nodeName || !mapping || typeof mapping !== "object") return null;

  if (mapping[nodeName]) return mapping[nodeName];

  const target = stripName(nodeName).toLowerCase();

  for (const key in mapping) {
    if (stripName(key).toLowerCase() === target) {
      return mapping[key];
    }
  }

  for (const key in mapping) {
    const a = stripName(key).toLowerCase();
    if (a.includes(target) || target.includes(a)) {
      return mapping[key];
    }
  }

  return null;
}

function stripName(name) {
  return String(name || "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  if (/(^|[\s_\-|\[])(ss)(?=$|[\s_\-|\]])/.test(n)) return "ss";
  if (/snell/.test(n)) return "snell";
  if (/socks5|socks/.test(n)) return "socks5";
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

function queryIPInfo() {
  return new Promise((resolve, reject) => {
    const req = {
      url: "https://api.ip.sb/geoip",
      timeout: 8000,
      headers: {
        "User-Agent": "Loon NodeLinkCheck Fixed",
        "Accept": "application/json"
      }
    };

    if (typeof $httpClient !== "undefined") {
      $httpClient.get(req, function (err, resp, data) {
        if (err) return reject(err);
        try {
          const json = JSON.parse(data);
          resolve({
            ip: json.ip || "",
            country: json.country || "",
            region: json.region || "",
            city: json.city || "",
            isp: json.isp || json.organization || "",
            org: json.org || ""
          });
        } catch (e) {
          reject(e);
        }
      });
      return;
    }

    reject(new Error("当前环境不支持 $httpClient"));
  });
}

function formatGeo(info) {
  const arr = [];
  if (info.country) arr.push(info.country);
  if (info.region) arr.push(info.region);
  if (info.city) arr.push(info.city);
  return arr.length ? arr.join(" / ") : "未知";
}

function safe(v) {
  return v || "未知";
}

function notify(title, body) {
  try {
    if (typeof $notification !== "undefined") {
      $notification.post(title, "", body);
      return;
    }
  } catch (e) {}

  try {
    if (typeof $notify !== "undefined") {
      $notify(title, "", body);
      return;
    }
  } catch (e) {}

  console.log(title + "\n" + body);
}

function done() {
  if (typeof $done !== "undefined") $done({});
}