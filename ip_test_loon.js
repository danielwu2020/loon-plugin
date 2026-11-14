/**
 * 节点 IP 风险检测 - Loon Generic 适配版
 * 原作者: Roddy-D; Quantumult X 转写: RavelloH
 * 原版: https://gist.github.com/RavelloH/d4152389cd810a402b641a625ce83857
 * Loon 适配: 复用原版六源检测思路与风险分档，适配节点选择和 Loon HTTP API。
 *
 * 配置 (Loon 3.5.1 Build 983+):
 * [Script]
 * generic then script("https://raw.githubusercontent.com/danielwu2020/loon-plugin/main/ip_test_loon.js") with tag="节点IP风险检测", img_url="shield.checkerboard.system", timeout=65
 *
 * 在 Loon 节点列表中长按节点 -> 选择「节点IP风险检测」。
 * 所有网络探测均通过被选节点发起；无节点上下文不会运行，防止误把本机 IP 当节点 IP。
 * 部分服务使用网页解析，网页结构变化或反爬限制可能导致“获取失败”。
 */

var IP_API = 'http://ip-api.com/json?lang=zh-CN';
var IPIFY = 'https://api64.ipify.org?format=json';
var IPPURE_URL = 'https://my.ippure.com/v1/info';
var IPAPI_IS_URL = 'https://api.ipapi.is/';
var TIMEOUT = 8000; // 单次请求毫秒
var TITLE = '🔍 节点 IP 风险检测';
var finished = false;

function str(value) { return value === undefined || value === null ? '' : String(value); }
function esc(value) {
  return str(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function plain(value) { return str(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); }
function num(value) {
  var n = Number(value);
  return value === null || value === undefined || value === '' || !isFinite(n) ? null : n;
}
function getJSON(data) {
  if (typeof data === 'string') return JSON.parse(data);
  if (data && typeof data === 'object' && !(data instanceof Uint8Array)) return data;
  throw new Error('无法解析 JSON 响应');
}
function request(url, node, headers) {
  return new Promise(function(resolve, reject) {
    var args = {
      url: url,
      node: node,
      timeout: TIMEOUT,
      headers: headers || {'Accept': 'application/json, text/html;q=0.9,*/*;q=0.8'},
      'auto-redirect': true,
      'auto-cookie': false,
      insecure: false
    };
    try {
      $httpClient.get(args, function(error, response, data) {
        if (error) return reject(new Error(str(error)));
        var status = response && response.status;
        if (!(status >= 200 && status < 300)) return reject(new Error('HTTP ' + str(status || '?')));
        resolve(typeof data === 'string' ? data : str(data));
      });
    } catch (e) { reject(e); }
  });
}
function jsonRequest(url, node, headers) {
  return request(url, node, headers).then(getJSON);
}
function finish(content, html) {
  if (finished) return;
  finished = true;
  // Loon 官方 Generic API 支持 title/content；htmlMessage 仅提供兼容层，不依赖其展示。
  $done({title: TITLE, content: content, htmlMessage: html || ''});
}
function errorDone(msg) {
  var s = '🛑 ' + msg;
  finish(s, '<div style="font-family:-apple-system;font-size:large">' + esc(s) + '</div>');
}
function getNodeName() {
  var env = typeof $environment === 'object' && $environment ? $environment : {};
  var params = env.params || {};
  var info = params.nodeInfo || {};
  if (typeof info === 'string') { try { info = JSON.parse(info); } catch (_) { info = {}; } }
  var candidate = (info && (info.name || info.tag)) || params.node;
  return typeof candidate === 'string' ? candidate.trim() : '';
}
function makeIPInfo(ip, source) {
  source = source || {};
  var loc = source.location || {};
  var asn = source.asn || {};
  return {
    query: ip,
    country: source.country || loc.country || '',
    countryCode: source.countryCode || loc.country_code || loc.country_code2 || '',
    regionName: source.regionName || loc.state || loc.region || '',
    city: source.city || loc.city || '',
    isp: source.isp || asn.org || (source.company && source.company.name) || ''
  };
}
function resolveIP(node) {
  return jsonRequest(IP_API, node).then(function(d) {
    if (d && d.status === 'success' && d.query) return makeIPInfo(d.query, d);
    throw new Error('ip-api 返回无效 IP');
  }).catch(function(err) {
    console.log('[IP 风险检测] ip-api 查询失败，尝试 ipify: ' + err);
    return jsonRequest(IPIFY, node).then(function(d) {
      if (!d || !d.ip) throw new Error('ipify 未返回 IP');
      // fallback 的位置数据亦经相同节点访问；失败时仍显示已取回的真实节点出口 IP。
      return jsonRequest(IPAPI_IS_URL + '?q=' + encodeURIComponent(d.ip), node)
        .then(function(detail) { return makeIPInfo(d.ip, detail); })
        .catch(function() { return makeIPInfo(d.ip, {}); });
    });
  });
}
function guard(name, promise) {
  return promise.then(function(data) { return {ok: true, data: data}; })
    .catch(function(err) {
      console.log('[IP 风险检测] ' + name + ' 获取失败: ' + str(err));
      return {ok: false, data: null};
    });
}
function parseIp2location(html) {
  if (!html) return null;
  var s = str(html), m;
  m = s.match(/Usage\s*Type<\/label>\s*<p[^>]*>\s*\(([A-Z]+)\)/i)
      || s.match(/Usage\s*Type<\/label>\s*<p[^>]*>\s*([A-Z]+(?:\/[A-Z]+)?)\s*</i);
  var ut = m ? m[1] : null;
  m = s.match(/Fraud\s*Score<\/label>\s*<p[^>]*>\s*(\d+)/i);
  var fs = m ? parseInt(m[1], 10) : null;
  m = s.match(/Proxy\s*Type<\/label>\s*<p[^>]*>\s*([^<]+)/i);
  return ut || fs !== null ? {usageType: ut, fraudScore: fs, proxyType: m ? m[1].trim() : ''} : null;
}
function parseIpregistry(html) {
  if (!html) return null;
  var s = str(html), fields = ['Abuser', 'Attacker', 'Bogon', 'Cloud Provider', 'Proxy', 'Relay', 'Tor', 'VPN', 'Anonymous', 'Threat'];
  var out = {}, detected = false;
  fields.forEach(function(field) {
    var key = field.toLowerCase().replace(/ /g, '_');
    var escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp(escaped + '<\\/span>[\\s\\S]{0,300}?<div class="(?:positive|negative)">[\\s\\S]{0,800}?(Yes|No)<\\/div>', 'i');
    var match = s.match(re);
    out[key] = match ? match[1].toLowerCase() === 'yes' : null;
    if (match) detected = true;
  });
  return detected ? out : null;
}
function missing() { return {text: '获取失败 / 暂无评分', sev: -1}; }
function gradeIppure(d) {
  var s = d && num(d.fraudScore);
  if (s === null) return missing();
  if (s >= 80) return {text:'🛑 极高风险 ('+s+')',sev:4};
  if (s >= 70) return {text:'⚠️ 高风险 ('+s+')',sev:3};
  if (s >= 40) return {text:'🔶 中等风险 ('+s+')',sev:1};
  return {text:'✅ 低风险 ('+s+')',sev:0};
}
function gradeIpapi(d) {
  var score = d && d.company && d.company.abuser_score;
  if (score === undefined || score === null || score === '') return missing();
  var m = str(score).match(/([0-9.]+)\s*\(([^)]+)\)/);
  if (m) {
    var levels = {'Very Low':0, 'Low':0, 'Elevated':2, 'High':3, 'Very High':4};
    var sev = levels[m[2]];
    if (sev === undefined) return {text:'❔ '+plain(score),sev:-1};
    var prefix = sev === 4?'🛑 极高风险':sev===3?'⚠️ 高风险':sev===2?'🔶 较高风险':'✅ 低风险';
    return {text:prefix+' ('+(parseFloat(m[1])*100).toFixed(1)+'%, '+m[2]+')',sev:sev};
  }
  return {text:'❔ '+plain(score),sev:-1};
}
function gradeIp2location(d) {
  var s = d && num(d.fraudScore);
  if (s === null) return missing();
  if (s >= 66) return {text:'⚠️ 高风险 ('+s+')',sev:3};
  if (s >= 33) return {text:'🔶 中风险 ('+s+')',sev:1};
  return {text:'✅ 低风险 ('+s+')',sev:0};
}
function gradeScamalytics(html) {
  if (!html) return missing();
  var s = str(html);
  var m = s.match(/Fraud\s*Score[:\s]*(\d+)/i) || s.match(/class=["']score["'][^>]*>(\d+)/i) || s.match(/["']score["']\s*:\s*(\d+)/i);
  if (!m) return missing();
  var score = parseInt(m[1],10);
  if (score >= 90) return {text:'🛑 极高风险 ('+score+')',sev:4};
  if (score >= 60) return {text:'⚠️ 高风险 ('+score+')',sev:3};
  if (score >= 20) return {text:'🔶 中风险 ('+score+')',sev:1};
  return {text:'✅ 低风险 ('+score+')',sev:0};
}
function gradeDbip(html) {
  if (!html) return missing();
  var m = str(html).match(/Estimated threat level for this IP address is\s*<span[^>]*>\s*([^<\s]+)\s*</i);
  if (!m) return missing();
  var level = m[1].toLowerCase();
  if (level==='high') return {text:'⚠️ 高风险 (high)',sev:3};
  if (level==='medium') return {text:'🔶 中风险 (medium)',sev:1};
  if (level==='low') return {text:'✅ 低风险 (low)',sev:0};
  return {text:'❔ '+plain(level),sev:-1};
}
function gradeIpregistry(data) {
  if (!data) return missing();
  var items = [], flags = [ ['proxy','Proxy'], ['tor','Tor'], ['vpn','VPN'], ['cloud_provider','Hosting'], ['abuser','Abuser'] ];
  flags.forEach(function(p) { if (data[p[0]] === true) items.push(p[1]); });
  if (!items.length) return {text:'✅ 低风险（无标记）',sev:0};
  var sev = items.indexOf('Tor') !== -1 || items.indexOf('Abuser') !== -1 ? 3 : (items.length >= 2 ? 2 : 1);
  return {text:(sev===3?'⚠️ 高风险':sev===2?'🔶 较高风险':'🔶 有标记')+' ('+items.join('/')+')',sev:sev};
}
function usageTypeText(ut) {
  var map = {DCH:'🏢 数据中心', WEB:'🏢 数据中心', SES:'🏢 数据中心', CDN:'🌐 CDN', MOB:'📱 蜂窝移动', ISP:'🏠 家庭宽带', COM:'🏬 商业宽带', EDU:'🎓 教育网络', GOV:'🏛️ 政府网络', MIL:'🎖️ 军用网络', ORG:'🏢 组织机构', RES:'🏠 住宅网络'};
  if (!ut) return '';
  var out = [];
  str(ut).toUpperCase().split('/').forEach(function(type) {
    var val = map[type];
    if (val && out.indexOf(val) === -1) out.push(val);
  });
  return out.length ? out.join(' / ') : '❔ '+plain(ut);
}
function getFlag(cc) {
  var s = str(cc).toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return '🌍';
  try {return String.fromCodePoint(127397+s.charCodeAt(0),127397+s.charCodeAt(1));} catch (_) {return '🌍';}
}
function render(node, ipInfo, data) {
  var results = [
    ['IPPure', gradeIppure(data.ippure)],
    ['ipapi.is', gradeIpapi(data.ipapi)],
    ['IP2Location.io', gradeIp2location(data.ip2loc)],
    ['Scamalytics', gradeScamalytics(data.scam)],
    ['DB-IP', gradeDbip(data.dbip)],
    ['ipregistry', gradeIpregistry(data.ipreg)]
  ];
  var risk = [], max = -1, valid = 0;
  results.forEach(function(item) {
    risk.push(item[0] + ': ' + item[1].text);
    if (item[1].sev >= 0) {valid++; max = Math.max(max,item[1].sev);}
  });
  var conclusion;
  if (valid === 0) conclusion = '❔ 无法评估：所有评分源均未返回有效结果';
  else if (max >= 4) conclusion = '🛑 极高风险 — 存在严重风控评分，部分网站/流媒体可能受限';
  else if (max >= 3) conclusion = '⚠️ 高风险 — 存在明显风控标记，建议考虑更换节点';
  else if (max >= 2) conclusion = '🔶 中等风险 — 部分平台存在风控标记';
  else if (max >= 1) conclusion = '🔶 低度风险 — 仅发现轻微风控标记';
  else conclusion = '✅ IP 纯净度良好 — 成功查询的来源中未发现明显高风险标记';

  var geo = [ipInfo.country, ipInfo.regionName, ipInfo.city].filter(Boolean).join(' - ');
  var lines = [
    '节点代理：✅ 正常',
    'IP：'+plain(ipInfo.query),
    '位置：'+getFlag(ipInfo.countryCode)+' '+(geo ? plain(geo) : '未知'),
    'ISP：'+plain(ipInfo.isp || '未知')
  ];
  var ipType = usageTypeText(data.ip2loc && data.ip2loc.usageType);
  if (ipType) lines.push('IP 类型：'+ipType+' (IP2Location)');
  lines.push('', '📊 IP 风险评估');
  lines = lines.concat(risk);
  lines.push('', '📋 诊断结论', conclusion, '', '有效来源：'+valid+'/6', '节点：'+plain(node));
  var text = lines.join('\n');

  // Quantumult X 的 htmlMessage 格式作为可选兼容；Loon 的 content 是可靠主显示。
  var htmlLines = lines.map(function(line) {
    if (!line) return '<br />';
    var safe = esc(line);
    if (/^(📊|📋)/.test(line)) return '<b>'+safe+'</b>';
    return safe;
  });
  var html = '<div style="font-family:-apple-system;font-size:large;line-height:1.6;white-space:normal">'+htmlLines.join('<br />')+'</div>';
  finish(text, html);
}
function start(node) {
  resolveIP(node).then(function(ipInfo) {
    var ip = ipInfo.query;
    var queries = {
      ippure: guard('IPPure', jsonRequest(IPPURE_URL,node)),
      ipapi: guard('ipapi.is', jsonRequest(IPAPI_IS_URL+'?q='+encodeURIComponent(ip),node)),
      ip2loc: guard('IP2Location', request('https://www.ip2location.io/'+encodeURIComponent(ip),node,{'User-Agent':'Mozilla/5.0'}).then(parseIp2location)),
      dbip: guard('DB-IP', request('https://db-ip.com/'+encodeURIComponent(ip),node)),
      scam: guard('Scamalytics', request('https://scamalytics.com/ip/'+encodeURIComponent(ip),node)),
      ipreg: guard('ipregistry', request('https://ipregistry.co/'+encodeURIComponent(ip),node,{'User-Agent':'Mozilla/5.0'}).then(parseIpregistry))
    };
    var names = Object.keys(queries);
    return Promise.all(names.map(function(name) { return queries[name]; })).then(function(arr) {
      var data = {};
      names.forEach(function(name,i) {data[name] = arr[i].ok ? arr[i].data : null;});
      render(node, ipInfo, data);
    });
  }).catch(function(err) {
    console.log('[IP 风险检测] 获取节点出口 IP 失败: '+str(err));
    errorDone('获取节点出口 IP 失败；请检查节点连通性、Loon 的网络权限及脚本日志。');
  });
}
var selectedNode = getNodeName();
if (!selectedNode) errorDone('未获取节点名称，请从 Loon 节点列表长按目标节点执行脚本。');
else start(selectedNode);
