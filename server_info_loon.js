/*************************************
 * 节点详情查询 Pro Max - Loon
 *************************************/

const TIMEOUT = 8000;

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

function icon(status) {
  if (status === "ok") return "✅";
  if (status === "warn") return "⚠️";
  return "❌";
}

function formatResult(name, value, level) {
  return icon(level) + " " + name + "：" + value;
}

function done(msg) {
  $done({
    title: "节点详情查询 Pro Max",
    message: msg
  });
}

function calcIPQuality(ipApi, cz88) {
  let score = 100;
  const tags = [];

  const isp = (cz88 && cz88.isp) || ipApi.isp || "";
  const org = ipApi.org || "";
  const asName = ipApi.as || "";
  const text = [isp, org, asName].join(" ").toLowerCase();

  if (ipApi.proxy === true) {
    score -= 35;
    tags.push("疑似代理");
  }
  if (ipApi.hosting === true) {
    score -= 30;
    tags.push("机房托管");
  }
  if (/datacamp|colo|hosting|cloud|amazon|aws|google|oracle|microsoft|azure|digitalocean|vultr|linode|ovh|contabo|aliyun|tencent/.test(text)) {
    score -= 20;
    tags.push("云厂商特征");
  }
  if (/residential|broadband|wireless|telecom|mobile|communications|comcast|verizon|att|china mobile|china unicom|china telecom/.test(text)) {
    score += 8;
    tags.push("运营商特征");
  }

  if (cz88 && cz88.netWorkType) {
    const netType = String(cz88.netWorkType).toLowerCase();
    if (netType.includes("机房")) {
      score -= 25;
      tags.push("机房网络");
    }
    if (netType.includes("家庭") || netType.includes("宽带") || netType.includes("住宅")) {
      score += 10;
      tags.push("住宅网络");
    }
    if (netType.includes("移动")) {
      score += 5;
      tags.push("移动网络");
    }
  }

  if (cz88 && cz88.score) {
    const raw = Number(cz88.score);
    if (!isNaN(raw)) {
      if (raw >= 80) {
        score += 8;
        tags.push("真人概率高");
      } else if (raw < 40) {
        score -= 12;
        tags.push("真人概率低");
      }
    }
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
    tags: tags.length ? tags.join(" / ") : "无明显异常"
  };
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

/*************** 媒体 / AI 检测 ***************/

function checkNetflix(cb) {
  httpGet({
    url: "https://www.netflix.com/title/81215567",
    headers: { "User-Agent": "Mozilla/5.0" }
  }, function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    if (code === 200) return cb("可用", "ok");
    if (code === 404) return cb("仅自制剧", "warn");
    if (code === 403) return cb("被拒绝", "fail");
    cb("未知(" + code + ")", "warn");
  });
}

function checkDisney(cb) {
  httpGet({
    url: "https://www.disneyplus.com",
    headers: { "User-Agent": "Mozilla/5.0" }
  }, function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    const body = data || "";
    if (code === 200 && /disney/i.test(body)) return cb("可访问", "ok");
    if (code === 403) return cb("被拒绝", "fail");
    cb("未知(" + code + ")", "warn");
  });
}

function checkYouTubePremium(cb) {
  httpGet({
    url: "https://www.youtube.com/premium",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en"
    }
  }, function (err, resp, data) {
    if (err || !resp || !data) return cb("检测失败", "fail");
    const body = data;
    const match = body.match(/"countryCode":"(.*?)"/);
    if (match && match[1]) return cb(match[1], "ok");
    const code = resp.status || resp.statusCode || 0;
    cb("未知(" + code + ")", "warn");
  });
}

function checkPrimeVideo(cb) {
  httpGet({
    url: "https://www.primevideo.com",
    headers: { "User-Agent": "Mozilla/5.0" }
  }, function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    if (code === 200) return cb("可访问", "ok");
    if (code === 403) return cb("被拒绝", "fail");
    cb("未知(" + code + ")", "warn");
  });
}

function checkSpotify(cb) {
  httpGet({
    url: "https://spclient.wg.spotify.com/signup/public/v1/account?validate=1&email=test%40gmail.com",
    headers: { "User-Agent": "Mozilla/5.0" }
  }, function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    if (code === 200 || code === 202 || code === 204) return cb("可注册/可访问", "ok");
    if (code === 403) return cb("受限", "fail");
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
    if (code === 200 && (/tiktok/i.test(body) || /<html/i.test(body))) return cb("可访问", "ok");
    if (code === 403) return cb("被拒绝", "fail");
    if (code === 301 || code === 302) return cb("重定向", "warn");
    cb("未知(" + code + ")", "warn");
  });
}

function checkChatGPT(cb) {
  httpGet({
    url: "https://chatgpt.com/",
    headers: { "User-Agent": "Mozilla/5.0" }
  }, function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    const body = data || "";
    if (code === 200 && (/chatgpt|openai/i.test(body) || /<html/i.test(body))) return cb("可访问", "ok");
    if (code === 403) return cb("被拒绝", "fail");
    cb("未知(" + code + ")", "warn");
  });
}

function checkOpenAIAPI(cb) {
  httpGet({
    url: "https://api.openai.com/v1/models",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Authorization": "Bearer sk-test"
    }
  }, function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    if (code === 401) return cb("可连接", "ok");
    if (code === 403) return cb("被拒绝", "fail");
    if (code === 200) return cb("可连接", "ok");
    cb("未知(" + code + ")", "warn");
  });
}

function checkClaude(cb) {
  httpGet({
    url: "https://claude.ai/",
    headers: { "User-Agent": "Mozilla/5.0" }
  }, function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    const body = data || "";
    if (code === 200 && (/claude|anthropic/i.test(body) || /<html/i.test(body))) return cb("可访问", "ok");
    if (code === 403) return cb("被拒绝", "fail");
    cb("未知(" + code + ")", "warn");
  });
}

function checkGemini(cb) {
  httpGet({
    url: "https://gemini.google.com/",
    headers: { "User-Agent": "Mozilla/5.0" }
  }, function (err, resp, data) {
    if (err || !resp) return cb("检测失败", "fail");
    const code = resp.status || resp.statusCode || 0;
    const body = data || "";
    if (code === 200 && (/gemini|google/i.test(body) || /<html/i.test(body))) return cb("可访问", "ok");
    if (code === 403) return cb("被拒绝", "fail");
    cb("未知(" + code + ")", "warn");
  });
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

        const quality = calcIPQuality(ipApi, cz88Data || {});

        const checks = [
          { name: "Netflix", run: checkNetflix },
          { name: "Disney+", run: checkDisney },
          { name: "YouTube Premium", run: checkYouTubePremium },
          { name: "Prime Video", run: checkPrimeVideo },
          { name: "Spotify", run: checkSpotify },
          { name: "TikTok", run: checkTikTok },
          { name: "ChatGPT", run: checkChatGPT },
          { name: "OpenAI API", run: checkOpenAIAPI },
          { name: "Claude", run: checkClaude },
          { name: "Gemini", run: checkGemini }
        ];

        runChecks(checks, function (results) {
          const lines = [];

          lines.push("【基础信息】");
          lines.push("节点：" + nodeName);
          lines.push("IP：" + (ipApi.query || "-"));
          lines.push("国家/地区：" + (ipApi.country || "-"));
          lines.push("地区：" + (ipApi.regionName || "-"));
          lines.push("城市：" + (ipApi.city || "-"));
          lines.push("ISP：" + ((cz88Data && cz88Data.isp) || ipApi.isp || "-"));
          lines.push("组织：" + (ipApi.org || "-"));
          lines.push("ASN：" + (ipApi.as || "-"));
          lines.push("网络类型：" + ((cz88Data && cz88Data.netWorkType) || "-"));
          lines.push("真人概率：" + ((cz88Data && cz88Data.score) || "-"));
          lines.push("代理标记：" + (ipApi.proxy ? "是" : "否"));
          lines.push("机房标记：" + (ipApi.hosting ? "是" : "否"));
          lines.push("时区：" + (ipApi.timezone || "-"));
          lines.push("经纬度：" + (ipApi.lon || "-") + " / " + (ipApi.lat || "-"));
          lines.push("");

          lines.push("【IP质量】");
          lines.push("综合评分：" + quality.score + " / 100");
          lines.push("质量判断：" + quality.level);
          lines.push("特征：" + quality.tags);
          lines.push("");

          lines.push("【媒体 / AI 检测】");
          for (let i = 0; i < results.length; i++) {
            lines.push(formatResult(results[i].name, results[i].value, results[i].level));
          }

          done(lines.join("\n"));
        });
      });
    }
  );
}

fetchAll();
