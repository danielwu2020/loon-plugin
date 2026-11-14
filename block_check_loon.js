/**
 * 节点阻断检测 - Loon 移植版
 * 原作者: RavelloH (https://github.com/RavelloH)
 * 原版: https://gist.githubusercontent.com/RavelloH/383354955aa3800e1d7e98666e11e16f/raw/block_check.js
 * 移植: 兼容 Loon Generic Script 的节点上下文、$httpClient、$done(htmlMessage)
 *
 * [Script] (Loon 3.5.1 Build 983+)
 * generic then script("block_check_loon.js") with tag="节点阻断检测", img_url="bolt.horizontal.icloud.fill.system", timeout=45
 *
 * 使用: 在 Loon 的节点页面长按目标节点，选择「节点阻断检测」。
 * 请勿作为 cron 运行；需要节点上下文才能取得节点名称、地址、端口。
 */

var IP_API = "http://ip-api.com/json?lang=zh-CN";
var CHECK_HOST = "https://check-host.net";
var GP_API = "https://api.globalping.io/v1/measurements";
var TIMEOUT = 8000;
var TITLE = "   🌐 节点阻断检测";

// 为保持与原版一致：代理请求走选中节点；本机、Check-Host、Globalping 走 DIRECT。
function fetchJSON(url, method, node, body, headers) {
  return new Promise(function(resolve, reject) {
    var opts = {
      url: url,
      timeout: TIMEOUT,
      headers: headers || { "Accept": "application/json" },
      node: node
    };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    try {
      var callback = function(error, response, data) {
        if (error) return reject(error);
        if (!response || response.status < 200 || response.status >= 300) {
          return reject("HTTP " + (response ? response.status : "未知状态"));
        }
        try {
          resolve(typeof data === "string" ? JSON.parse(data) : JSON.parse(String(data)));
        } catch (e) {
          reject("JSON 解析失败: " + String(e));
        }
      };
      if (method === "POST") $httpClient.post(opts, callback);
      else $httpClient.get(opts, callback);
    } catch (e) { reject(e); }
  });
}

function run() {
  var env = (typeof $environment !== "undefined" && $environment) || {};
  var params = env.params || {};
  var info = params.nodeInfo || {};
  var name = params.node || info.name || "";
  if (!name) return done("请在 Loon 节点页面长按某个节点，再运行本脚本");

  // Loon nodeInfo 官方示例: { address: "example.com", name: "节点名称", port: 443, ... }
  // 兼容部分版本可能传递的字符串或其他字段。
  var host = "", port = "";
  if (typeof info === "object" && info !== null) {
    host = info.address || info.server || info.host || "";
    port = info.port || info.server_port || info.serverPort || "";
  }
  if ((!host || !port) && typeof info === "string") {
    try {
      var parsed = JSON.parse(info);
      host = host || parsed.address || parsed.server || parsed.host || "";
      port = port || parsed.port || parsed.server_port || "";
    } catch (_) {}
  }
  startChecks(String(name), String(host), String(port));
}

function startChecks(tag, host, port) {
  var pA = fetchJSON(IP_API, "GET", tag)
    .then(function(d) { return { src: "node", ok: d && d.status === "success", data: d }; })
    .catch(function(e) { console.log("[节点代理] " + e); return { src: "node", ok: false }; });

  var pB = fetchJSON(IP_API, "GET", "DIRECT")
    .then(function(d) { return { src: "direct", ok: d && d.status === "success", data: d }; })
    .catch(function(e) { console.log("[本机网络] " + e); return { src: "direct", ok: false }; });

  var pC;
  if (host && port) {
    var target = /^:/.test(port) ? host + port : host + ":" + port;
    var checkUrl = CHECK_HOST + "/check-tcp?host=" + encodeURIComponent(target) + "&max_nodes=10";
    pC = fetchJSON(checkUrl, "GET", "DIRECT")
      .then(function(d) {
        if (!d || !d.ok || !d.request_id) return { src: "remote", ok: false, error: "提交失败" };
        var rid = d.request_id;
        var nodeList = d.nodes || {};
        var nodeNames = Object.keys(nodeList);
        var countryMap = {};
        nodeNames.forEach(function(n) {
          var item = nodeList[n];
          if (item && item.length >= 1) countryMap[n] = item[0];
        });
        return new Promise(function(resolve) {
          setTimeout(function() {
            fetchJSON(CHECK_HOST + "/check-result/" + encodeURIComponent(rid), "GET", "DIRECT")
              .then(function(res) {
                var reachable = false;
                var items = [];
                nodeNames.forEach(function(n) {
                  var cc = countryMap[n] || "";
                  var flag = cc ? getFlag(cc) : "🌍";
                  var nr = res && res[n];
                  var ms = '<code style="font-family: Menlo, Monaco, monospace; font-size: 12px">--.--ms</code>';
                  // check-host: [[{time: <秒>}]] 在部分版本返回数组嵌套，兼容两种。
                  var result = nr && Array.isArray(nr) && nr.length ? nr[0] : null;
                  if (Array.isArray(result)) result = result[0];
                  if (result && typeof result.time === "number") {
                    reachable = true;
                    ms = '<code style="font-family: Menlo, Monaco, monospace; font-size: 12px">' + formatMs(result.time * 1000) + '</code>';
                  }
                  items.push({ flag: flag, ms: ms });
                });
                resolve({ src: "remote", ok: reachable, data: items });
              })
              .catch(function(e) {
                console.log("[远端查询] " + e);
                resolve({ src: "remote", ok: false, error: "查询失败" });
              });
          }, 3500);
        });
      })
      .catch(function(e) {
        console.log("[远端提交] " + e);
        return { src: "remote", ok: false, error: "请求失败" };
      });
  } else {
    pC = Promise.resolve({ src: "remote", ok: false, error: "无地址信息" });
  }

  Promise.all([pA, pB, pC]).then(function(results) {
    var node = results[0], direct = results[1], checkHost = results[2];
    // 与原版相同的触发条件：本机可联网 + 海外 TCP 可达 + 被测代理不通。
    if (direct.ok && checkHost.ok && !node.ok && host && port) {
      runGlobalping(tag, host, port, node, direct, checkHost);
    } else {
      render(tag, node, direct, checkHost, null);
    }
  }).catch(function(e) { done("检测异常: " + String(e)); });
}

function runGlobalping(tag, host, port, node, direct, checkHost) {
  var body = {
    type: "ping",
    target: host,
    measurementOptions: { port: parseInt(port, 10), protocol: "TCP" },
    locations: [{ country: "CN", tags: ["eyeball-network"] }],
    limit: 12
  };
  fetchJSON(GP_API, "POST", "DIRECT", body, { "Content-Type": "application/json", "Accept": "application/json" })
    .then(function(d) {
      if (!d || !d.id) { render(tag, node, direct, checkHost, null); return; }
      setTimeout(function() {
        fetchJSON(GP_API + "/" + encodeURIComponent(d.id), "GET", "DIRECT")
          .then(function(data) { render(tag, node, direct, checkHost, data); })
          .catch(function(e) {
            console.log("[国内探测查询] " + e);
            render(tag, node, direct, checkHost, null);
          });
      }, 6000);
    })
    .catch(function(e) {
      console.log("[国内探测提交] " + e);
      render(tag, node, direct, checkHost, null);
    });
}

function classifyISP(network) {
  var n = String(network || "").toLowerCase();
  if (n.indexOf("unicom") !== -1) return "中国联通";
  if (n.indexOf("chinanet") !== -1 || n.indexOf("telecom") !== -1) return "中国电信";
  if (n.indexOf("mobile") !== -1) return "中国移动";
  return null;
}

function analyzeBlockSource(gpData) {
  var results = gpData && gpData.results;
  if (!Array.isArray(results)) return null;
  var ispGroups = {};
  results.forEach(function(r) {
    var probe = r && r.probe || {};
    var isp = classifyISP(probe.network);
    if (!isp) return;
    if (!ispGroups[isp]) ispGroups[isp] = { probes: [], reachable: false };
    var res = r.result || {};
    var stats = res.stats || {};
    var ok = res.status === "finished" && Number(stats.rcv) > 0;
    var ms = ok ? formatMs(Number(stats.avg) || 0) : "--.--ms";
    if (ok) ispGroups[isp].reachable = true;
    ispGroups[isp].probes.push({ city: cnCity(probe.city || "未知"), ok: ok, ms: ms });
  });

  var reachableIsps = [], blockedIsps = [];
  var keys = Object.keys(ispGroups);
  keys.forEach(function(k) {
    if (ispGroups[k].probes.length === 0) return;
    if (ispGroups[k].reachable) reachableIsps.push(k); else blockedIsps.push(k);
  });
  var conclusion;
  if (keys.length === 0) {
    conclusion = "❓ 国内探针不足，无法确定阻断来源";
  } else if (reachableIsps.length === 0) {
    conclusion = keys.length === 3
      ? "🚫 疑似 GFW 全局阻断 — 国内三大运营商探针均无法访问"
      : "🚫 国内已采样运营商均不可达，疑似阻断（样本不足以确定范围）";
  } else if (blockedIsps.length > 0) {
    conclusion = "🚫 疑似运营商级拦截 — " + blockedIsps.join("、") + " 不可达，" + reachableIsps.join("、") + " 正常";
  } else {
    conclusion = keys.length === 3
      ? "✅ 国内三大运营商探针均可达，请检查客户端配置"
      : "✅ 国内已采样运营商可达，请检查客户端配置（样本未覆盖全部运营商）";
  }
  return { ispGroups: ispGroups, conclusion: conclusion };
}

function cnCity(en) {
  var map = {
    "Beijing": "北京", "Shanghai": "上海", "Guangzhou": "广州", "Shenzhen": "深圳",
    "Chengdu": "成都", "Hangzhou": "杭州", "Wuhan": "武汉", "Nanjing": "南京",
    "Tianjin": "天津", "Xi'an": "西安", "Changsha": "长沙", "Zhengzhou": "郑州",
    "Jinan": "济南", "Qingdao": "青岛", "Dalian": "大连", "Xiamen": "厦门",
    "Fuzhou": "福州", "Kunming": "昆明", "Hefei": "合肥", "Ningbo": "宁波",
    "Suzhou": "苏州", "Wuxi": "无锡", "Changzhou": "常州", "Guilin": "桂林",
    "Nanning": "南宁", "Haikou": "海口", "Sanya": "三亚", "Guiyang": "贵阳",
    "Lanzhou": "兰州", "Urumqi": "乌市", "Hohhot": "呼市", "Harbin": "哈市",
    "Changchun": "长春", "Shenyang": "沈阳", "Shijiazhuang": "石市", "Taiyuan": "太原",
    "Xuzhou": "徐州", "Yancheng": "盐城", "Taishan": "台山", "Nanchang": "南昌",
    "Foshan": "佛山", "Dongguan": "东莞", "Zhuhai": "珠海", "Zhongshan": "中山",
    "Huizhou": "惠州"
  };
  return map[en] || en;
}

function formatMs(ms) {
  ms = Number(ms);
  if (!isFinite(ms)) return "--.--ms";
  if (ms >= 10000) return Math.floor(ms) + "ms";
  if (ms >= 1000) return Math.floor(ms).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "ms";
  if (ms >= 100) return ms.toFixed(1) + "ms";
  if (ms >= 10) return ms.toFixed(2) + "ms";
  if (ms <= 0) return "0.00ms";
  return ms.toFixed(3) + "ms";
}

function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function render(tag, node, direct, remote, gpData) {
  var nOk = node && node.ok;
  var dOk = direct && direct.ok;
  var rOk = remote && remote.ok;
  var parts = [];

  var nodeStr = '<span style="font-weight: bold">节点代理</span>: ' + (nOk ? "✅ 正常" : "❌ 不可达");
  if (nOk && node.data) {
    var d = node.data;
    nodeStr += '<br/><span style="font-weight: bold">IP</span>: ' + escapeHtml(d.query || "未知");
    nodeStr += '<br/><span style="font-weight: bold">位置</span>: ' + escapeHtml([d.country, d.regionName, d.city].filter(Boolean).join(" - "));
    nodeStr += '<br/><span style="font-weight: bold">ISP</span>: ' + escapeHtml(d.isp || "未知");
  }
  parts.push(nodeStr);
  parts.push('<span style="font-weight: bold">本机网络</span>: ' + (dOk ? "✅ 正常" : "❌ 异常"));

  var remoteStr = '<span style="font-weight: bold">远端探测</span>: ' + (rOk ? "✅ 可达" : "❌ 不可达");
  if (remote && remote.data && remote.data.length) {
    for (var i = 0; i < remote.data.length; i += 2) {
      var left = remote.data[i], right = remote.data[i + 1];
      remoteStr += '<br/>' + left.flag + " " + left.ms;
      if (right) remoteStr += "&emsp;&emsp;" + right.flag + " " + right.ms;
    }
  } else if (remote && remote.error) {
    remoteStr += '<br/>' + escapeHtml(remote.error);
  }
  parts.push(remoteStr);

  var analysis = gpData && gpData.results ? analyzeBlockSource(gpData) : null;
  if (analysis) {
    var ispOrder = ["中国电信", "中国联通", "中国移动"];
    var ispAbbr = { "中国电信": "电信", "中国联通": "联通", "中国移动": "移动" };
    var allProbes = [];
    ispOrder.forEach(function(key) {
      var group = analysis.ispGroups[key];
      if (!group) return;
      group.probes.forEach(function(p) {
        allProbes.push({ label: ispAbbr[key] + "·" + p.city, ms: p.ms, ok: p.ok });
      });
    });
    var domesticReachable = allProbes.some(function(p) { return p.ok; });
    var gpStr = '<span style="font-weight: bold">国内探测</span>: ' + (domesticReachable ? "✅ 可达" : "❌ 不可达");
    for (var j = 0; j < allProbes.length; j += 2) {
      var first = allProbes[j], second = allProbes[j + 1];
      gpStr += '<br/>' + escapeHtml(first.label) + ' <code style="font-family: Menlo, Monaco, monospace; font-size: 12px; color: ' + (first.ok ? "#4CAF50" : "#f44336") + '">' + first.ms + '</code>';
      if (second) gpStr += '&emsp;&emsp;' + escapeHtml(second.label) + ' <code style="font-family: Menlo, Monaco, monospace; font-size: 12px; color: ' + (second.ok ? "#4CAF50" : "#f44336") + '">' + second.ms + '</code>';
    }
    parts.push(gpStr);
  }

  parts.push('<span style="font-weight: bold">📋 诊断结论</span>');
  if (!dOk) parts.push('⚠️ 本机网络异常');
  else if (nOk && rOk) parts.push('✅ 节点正常');
  else if (!nOk && rOk && dOk) parts.push(analysis && analysis.conclusion ? analysis.conclusion : '🚫 疑似被运营商/GFW 阻断');
  else if (!nOk && !rOk && dOk) parts.push('💤 节点离线（或外部探测服务不可用）');
  else parts.push('❓ 数据不完整');
  parts.push('<span style="font-weight: bold">节点</span>: <span style="color: #467fcf">' + escapeHtml(tag || "当前节点") + '</span>');

  var html = parts.join('<br/><br/>');
  $done({ title: TITLE, htmlMessage: '<div style="font-family: -apple-system; font-size: large">' + html + '</div>', content: stripHtml(html) });
}

function stripHtml(s) {
  return s.replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&emsp;/g, "  ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function getFlag(cc) {
  if (!cc || cc.length !== 2) return "🌍";
  var cp = cc.toUpperCase().split("").map(function(c) { return 127397 + c.charCodeAt(0); });
  return String.fromCodePoint.apply(null, cp);
}

function done(msg) {
  $done({
    title: TITLE,
    htmlMessage: '<div style="font-family: -apple-system; font-size: large"><span style="font-weight: bold">🛑 ' + escapeHtml(msg) + '</span></div>',
    content: "🛑 " + msg
  });
}

run();
