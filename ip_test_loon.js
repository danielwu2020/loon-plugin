/**
 * 节点 IP 风险检测 — 原版判定逻辑 Loon 兼容版
 * 原作者：Roddy-D；Quantumult X 适配：RavelloH
 * 原脚本：https://gist.github.com/RavelloH/d4152389cd810a402b641a625ce83857
 * Loon：将节点上下文、$task.fetch、$done(htmlMessage) 适配为
 *       $environment.params.nodeInfo、$httpClient、$done(content)。
 *
 * 保留：六个服务的地址、解析字段、风险阈值、失败等级、最高等级诊断、文字结论。
 * 唯一必要的行为修复：备用 IP 查询仍通过选中的节点，不会误测本机直连 IP。
 * 原版「ipapi.is Low/Very Low -> sev=2」行为也有意保留，以免评分与原版不同。
 * 此脚本不加载或远程执行 Quantumult X 原版 JS。
 */

var IP_API = 'http://ip-api.com/json?lang=zh-CN';
var IPPURE_URL = 'https://my.ippure.com/v1/info';
var IPAPI_IS_URL = 'https://api.ipapi.is/';
var TIMEOUT = 8000;
var TITLE = ' 🔍 节点 IP 风险检测';
var completed = false;

function toString(v) { return v == null ? '' : String(v); }
function escapeHTML(v) { return toString(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function selectedNode() {
  var ctx = typeof $environment === 'object' && $environment && $environment.params ? $environment.params : {};
  var info = ctx.nodeInfo || {};
  if (typeof info === 'string') { try { info = JSON.parse(info); } catch (e) { info = {}; } }
  var name = (info && (info.name || info.tag)) || ctx.node;
  return typeof name === 'string' ? name.trim() : '';
}
// 只封装网络层：在 Loon 中保证每次检测请求使用当前选中的节点。
function fetchViaNode(url, node, headers) {
  return new Promise(function(resolve, reject) {
    try {
      var p = {url: url, node: node, timeout: TIMEOUT};
      if (headers) p.headers = headers;
      $httpClient.get(p, function(err, res, data) {
        if (err) return reject(new Error(toString(err)));
        var code = res && res.status;
        if (code && (code < 200 || code >= 400)) return reject(new Error('HTTP ' + code));
        resolve({body: data});
      });
    } catch (e) { reject(e); }
  });
}
function finish(text, html) {
  if (completed) return;
  completed = true;
  // Loon Generic 文档明确支持 title/content，htmlMessage 为可选兼容字段。
  $done({title: TITLE, content: text, htmlMessage: html});
}
function done(msg) {
  finish('🛑 ' + msg, '<div style="font-family: -apple-system; font-size: large"><span style="font-weight: bold">🛑 ' + escapeHTML(msg) + '</span></div>');
}
function run() {
  var tag = selectedNode();
  if (!tag) return done('未获取到节点名称，请长按 Loon 节点执行脚本');

  fetchViaNode(IP_API, tag).then(function(r) {
    var d = JSON.parse(r.body);
    if (!d.query) return done('获取节点 IP 失败');
    startChecks(tag, d);
  }).catch(function() {
    // 与原版一样通过 ipapi.is 备用查询；但指定当前节点，防止直连 IP 被当成节点出口。
    fetchViaNode(IPAPI_IS_URL, tag).then(function(r2) {
      var d2 = JSON.parse(r2.body);
      if (d2 && d2.ip) {
        startChecks(tag, {
          query: d2.ip,
          country: d2.location ? d2.location.country : '',
          regionName: '',
          city: d2.location ? d2.location.city : '',
          isp: (d2.asn || {}).org || ''
        });
      } else done('获取节点 IP 失败');
    }).catch(function() { done('获取节点 IP 失败'); });
  });
}
function startChecks(tag, ipInfo) {
  var ip = ipInfo.query;
  var promises = [
    fetchViaNode(IPPURE_URL, tag).then(function(r) { return {key: 'ippure', data: JSON.parse(r.body)}; }).catch(function() {return {key:'ippure',data:null};}),
    fetchViaNode(IPAPI_IS_URL + '?q=' + encodeURIComponent(ip), tag).then(function(r) { return {key:'ipapi',data:JSON.parse(r.body)}; }).catch(function() {return {key:'ipapi',data:null};}),
    fetchViaNode('https://www.ip2location.io/' + encodeURIComponent(ip), tag, {'User-Agent':'Mozilla/5.0'}).then(function(r) {return {key:'ip2loc',data:parseIp2location(r.body)};}).catch(function() {return {key:'ip2loc',data:null};}),
    fetchViaNode('https://db-ip.com/' + encodeURIComponent(ip), tag).then(function(r) {return {key:'dbip',data:r.body};}).catch(function() {return {key:'dbip',data:null};}),
    fetchViaNode('https://scamalytics.com/ip/' + encodeURIComponent(ip), tag).then(function(r) {return {key:'scam',data:r.body};}).catch(function() {return {key:'scam',data:null};}),
    fetchViaNode('https://ipregistry.co/' + encodeURIComponent(ip), tag, {'User-Agent':'Mozilla/5.0'}).then(function(r) {return {key:'ipreg',data:parseIpregistry(r.body)};}).catch(function() {return {key:'ipreg',data:null};})
  ];
  Promise.all(promises).then(function(results) {
    var data = {};
    results.forEach(function(r) { data[r.key] = r.data; });
    render(tag, ipInfo, data);
  }).catch(function(e) { done('检测失败：' + toString(e)); });
}

function parseIp2location(html) {
  if (!html) return null;
  var s = String(html), m;
  m = s.match(/Usage\s*Type<\/label>\s*<p[^>]*>\s*\(([A-Z]+)\)/i);
  if (!m) m = s.match(/Usage\s*Type<\/label>\s*<p[^>]*>\s*([A-Z]+(?:\/[A-Z]+)?)\s*</i);
  var usageType = m ? m[1] : null;
  m = s.match(/Fraud\s*Score<\/label>\s*<p[^>]*>\s*(\d+)/i);
  var fraudScore = m ? parseInt(m[1]) : null;
  m = s.match(/>Proxy<\/label>\s*<p[^>]*>[^<]*<i[^>]*><\/i>\s*(Yes|No)/i);
  var isProxy = m ? m[1].toLowerCase() === 'yes' : false;
  m = s.match(/Proxy\s*Type<\/label>\s*<p[^>]*>\s*([^<]+)/i);
  var proxyType = m ? m[1].trim() : '-';
  m = s.match(/>Threat<\/label>\s*<p[^>]*>\s*([^<]+)/i);
  var threat = m ? m[1].trim() : '-';
  return {usageType:usageType,fraudScore:fraudScore,isProxy:isProxy,proxyType:proxyType,threat:threat};
}
function parseIpregistry(html) {
  if (!html) return null;
  function flag(name, s) {
    var re = new RegExp(name + '</span>[\\s\\S]{0,300}?<div class="(?:positive|negative)">[\\s\\S]{0,800}?(Yes|No)</div>', 'i');
    var m = s.match(re);
    return m ? m[1].trim().toLowerCase() === 'yes' : null;
  }
  var s = String(html), fields = ['Abuser','Attacker','Bogon','Cloud Provider','Proxy','Relay','Tor','VPN','Anonymous','Threat'];
  var r = {}, allNull = true;
  for (var i = 0; i < fields.length; i++) {
    var key = fields[i].toLowerCase().replace(' ', '_');
    r[key] = flag(fields[i], s);
    if (r[key] !== null) allNull = false;
    if (key === 'cloud_provider') r.is_cloud_provider = r[key];
  }
  r.is_proxy = r.proxy;
  r.is_tor = r.tor;
  r.is_vpn = r.vpn;
  r.is_abuser = r.abuser;
  r.is_attacker = r.attacker;
  r.is_bogon = r.bogon;
  r.is_anonymous = r.anonymous;
  r.is_threat = r.threat;
  r.is_relay = r.relay;
  return allNull ? null : r;
}
// ===== 下列评分阈值和缺失值处理均保留原版算法 =====
function gradeIppure(data) {
  if (!data) return {text:'IPPure：获取失败',sev:2};
  var s = data.fraudScore;
  if (s === null || s === undefined) return {text:'IPPure：获取失败',sev:2};
  if (s >= 80) return {text:'🛑 极高风险 ('+s+')',sev:4};
  if (s >= 70) return {text:'⚠️ 高风险 ('+s+')',sev:3};
  if (s >= 40) return {text:'🔶 中等风险 ('+s+')',sev:1};
  return {text:'✅ 低风险 ('+s+')',sev:0};
}
function gradeIpapi(data) {
  if (!data || !data.company) return {text:'ipapi.is：获取失败',sev:2};
  var s = data.company.abuser_score;
  if (!s) return {text:'ipapi.is：无评分',sev:2};
  var m = String(s).match(/([0-9.]+)\s*\(([^)]+)\)/);
  if (!m) return {text:'ipapi.is：'+s,sev:2};
  var pct = (parseFloat(m[1])*100).toFixed(1)+'%';
  var level = m[2];
  var sevMap = {'Very Low':0,'Low':0,'Elevated':2,'High':3,'Very High':4};
  var sev = sevMap[level] || 2; // 原版行为：0 通过 || 运算会变成 2（有意保留）
  var label = sev>=4?'🛑 极高风险':sev>=3?'⚠️ 高风险':sev>=2?'🔶 较高风险':'✅ 低风险';
  return {text:label+' ('+pct+', '+level+')',sev:sev};
}
function gradeIp2location(data) {
  if (!data) return {text:null,sev:-1};
  var s = data.fraudScore;
  if (s === null) return {text:null,sev:-1};
  if (s >= 66) return {text:'⚠️ 高风险 ('+s+')',sev:3};
  if (s >= 33) return {text:'🔶 中风险 ('+s+')',sev:1};
  return {text:'✅ 低风险 ('+s+')',sev:0};
}
function gradeDbip(html) {
  if (!html) return {text:'DB-IP：获取失败',sev:2};
  var m = String(html).match(/Estimated threat level for this IP address is\s*<span[^>]*>\s*([^<\s]+)\s*</i);
  if (!m) return {text:'DB-IP：获取失败',sev:2};
  var t = m[1].toLowerCase();
  if (t==='high') return {text:'⚠️ 高风险 (high)',sev:3};
  if (t==='medium') return {text:'🔶 中风险 (medium)',sev:1};
  if (t==='low') return {text:'✅ 低风险 (low)',sev:0};
  return {text:'DB-IP：'+t,sev:2};
}
function gradeScamalytics(html) {
  if (!html) return {text:'Scamalytics：获取失败',sev:2};
  var m = String(html).match(/Fraud\s*Score[:\s]*(\d+)/i)
    || String(html).match(/class="score"[^>]*>(\d+)/i)
    || String(html).match(/"score"\s*:\s*(\d+)/i);
  if (!m) return {text:'Scamalytics：获取失败',sev:2};
  var s = parseInt(m[1]);
  if (s >= 90) return {text:'🛑 极高风险 ('+s+')',sev:4};
  if (s >= 60) return {text:'⚠️ 高风险 ('+s+')',sev:3};
  if (s >= 20) return {text:'🔶 中风险 ('+s+')',sev:1};
  return {text:'✅ 低风险 ('+s+')',sev:0};
}
function gradeIpregistry(data) {
  if (!data) return {text:'ipregistry：获取失败',sev:2};
  var items = [];
  if (data.is_proxy === true) items.push('Proxy');
  if (data.is_tor === true) items.push('Tor');
  if (data.is_vpn === true) items.push('VPN');
  if (data.is_cloud_provider === true) items.push('Hosting');
  if (data.is_abuser === true) items.push('Abuser');
  if (items.length === 0) return {text:'✅ 低风险（无标记）',sev:0};
  var sev = items.indexOf('Tor')!==-1?3:items.indexOf('Abuser')!==-1?3:items.length>=2?2:1;
  var label = sev>=3?'⚠️ 高风险':sev>=2?'🔶 较高风险':'🔶 有标记';
  return {text:label+' ('+items.join('/')+')',sev:sev};
}
function usageTypeText(ut) {
  if (!ut) return null;
  var map = {'DCH':'🏢 数据中心','WEB':'🏢 数据中心','SES':'🏢 数据中心','CDN':'🌐 CDN',
    'MOB':'📱 蜂窝移动','ISP':'🏠 家庭宽带','COM':'🏬 商业宽带','EDU':'🎓 教育网络',
    'GOV':'🏛️ 政府网络','MIL':'🎖️ 军用网络','ORG':'🏢 组织机构','RES':'🏠 住宅网络'};
  var parts = String(ut).toUpperCase().split('/'), seen = {}, descs = [];
  for (var i=0;i<parts.length;i++) {var d=map[parts[i]]||null;if(d&&!seen[d]){seen[d]=true;descs.push(d);}}
  if (!descs.length) descs.push('❓ '+ut);
  return descs.join(' / ');
}
function getFlag(cc) {
  if (!cc || cc.length!==2) return '🌍';
  if (cc==='TW') cc='CN';
  var cp = cc.toUpperCase().split('').map(function(c){return 127397+c.charCodeAt(0);});
  return String.fromCodePoint.apply(null,cp);
}
function render(tag, ipInfo, data) {
  var ip = ipInfo.query, textParts=[], htmlParts=[];
  function add(t,h){textParts.push(t);htmlParts.push(h);}
  var geo = [ipInfo.country,ipInfo.regionName,ipInfo.city].filter(Boolean).join(' - ');
  add('节点代理：✅ 正常\nIP：'+ip+'\n位置：'+getFlag(ipInfo.countryCode||ipInfo.country)+' '+geo+'\nISP：'+(ipInfo.isp||'未知'),
    '<span style="font-weight: bold">节点代理</span>: ✅ 正常<br/><span style="font-weight: bold">IP</span>: '+escapeHTML(ip)+
    '<br/><span style="font-weight: bold">位置</span>: '+getFlag(ipInfo.countryCode||ipInfo.country)+' '+escapeHTML(geo)+
    '<br/><span style="font-weight: bold">ISP</span>: '+escapeHTML(ipInfo.isp||'未知'));
  var ip2loc = data.ip2loc;
  if (ip2loc && ip2loc.usageType) {
    var typeText = usageTypeText(ip2loc.usageType);
    if(typeText) add('IP 类型：'+typeText+' (IP2Location)', '<span style="font-weight: bold">IP 类型</span>: '+escapeHTML(typeText)+' (IP2Location)');
  }
  var grades=[],labels=[],g;
  g=gradeIppure(data.ippure); if(g.text){grades.push(g);labels.push('IPPure: '+g.text);}
  g=gradeIpapi(data.ipapi); if(g.text){grades.push(g);labels.push('ipapi.is: '+g.text);}
  g=gradeIp2location(ip2loc); if(g.text){grades.push(g);labels.push('IP2Location.io: '+g.text);}
  g=gradeScamalytics(data.scam); if(g.text){grades.push(g);labels.push('Scamalytics: '+g.text);}
  g=gradeDbip(data.dbip); if(g.text){grades.push(g);labels.push('DB-IP: '+g.text);}
  g=gradeIpregistry(data.ipreg); if(g.text){grades.push(g);labels.push('ipregistry: '+g.text);}
  add('📊 IP 风险评估\n'+labels.join('\n'),'<span style="font-weight: bold">📊 IP 风险评估</span>'+labels.map(function(x){return '<br/><code style="font-family: Menlo, Monaco, monospace; font-size: 13px">'+escapeHTML(x)+'</code>';}).join(''));
  var maxSev=0;
  for(var j=0;j<grades.length;j++) maxSev=Math.max(maxSev,grades[j].sev||0);
  add('📋 诊断结论','<span style="font-weight: bold">📋 诊断结论</span>');
  var conclusion, conclusionHtml;
  if(maxSev>=4){conclusion='🛑 极高风险 — 该 IP 被多家风控服务标记，流媒体/网站访问可能受限';conclusionHtml='🛑 <b>极高风险</b> — 该 IP 被多家风控服务标记，流媒体/网站访问可能受限';}
  else if(maxSev>=3){conclusion='⚠️ 高风险 — 该 IP 存在较明显风控标记，建议更换节点';conclusionHtml='⚠️ <b>高风险</b> — 该 IP 存在较明显风控标记，建议更换节点';}
  else if(maxSev>=2){conclusion='🔶 中等风险 — 部分服务有标记，一般使用无碍';conclusionHtml='🔶 <b>中等风险</b> — 部分服务有标记，一般使用无碍';}
  else if(maxSev>=1){conclusion='🔶 低度风险 — 仅个别服务有轻微标记';conclusionHtml='🔶 <b>低度风险</b> — 仅个别服务有轻微标记';}
  else {conclusion='✅ IP 纯净度良好 — 未被主要风控服务标记';conclusionHtml='✅ <b>IP 纯净度良好</b> — 未被主要风控服务标记';}
  add(conclusion,conclusionHtml);
  add('节点：'+tag,'<span style="font-weight: bold">节点</span>: <span style="color: #467fcf">'+escapeHTML(tag)+'</span>');
  var html = '<div style="font-family: -apple-system; font-size: large">'+htmlParts.join('<br/><br/>')+'</div>';
  finish(textParts.join('\n\n'),html);
}
run();