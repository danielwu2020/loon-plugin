// NodeLinkCheck - SubStore - Loon Compatible Full Version
// Modified for Loon proxy-chain type matching

const $ = new Env("NodeLinkCheck");
const nodes = {};

// 这里放“代理链检测更容易识别”的节点类型
// 先保守支持，避免报“没匹配到节点类型”
const SUPPORTED_TYPES = [
  "ss",
  "ssr",
  "vmess",
  "trojan",
  "http",
  "https",
  "socks5"
];

// 常见别名映射
const TYPE_MAP = {
  socks: "socks5",
  "socks5h": "socks5",
  "socks5-tls": "socks5"
};

// 不想检测的类型可以在这里直接屏蔽
const BLOCKED_TYPES = [
  "direct",
  "reject",
  "reject-drop",
  "url-test",
  "fallback",
  "load-balance",
  "select",
  "chain"
];

function operator(proxies) {
  const result = proxies.map((proxy) => rebuildProxy(proxy)).filter(Boolean);

  $.setjson(nodes, "RebuildNodeLineJsonByRE");
  $.log(`处理完成，共保留 ${result.length} 个可检测节点`);
  return result;
}

function rebuildProxy(proxy) {
  if (!proxy || typeof proxy !== "object") {
    $.log("跳过无效节点：对象不存在");
    return null;
  }

  let { name, server, type } = proxy;

  // 名称兜底
  name = safeString(name, "未命名节点");
  server = safeString(server, "");
  type = normalizeType(type);

  // 没 server 的一般就不是正常单节点
  if (!server) {
    $.log(`跳过节点（缺少 server）: ${name}`);
    return null;
  }

  // 明确屏蔽不应参与链检测的类型
  if (BLOCKED_TYPES.includes(type)) {
    $.log(`跳过屏蔽类型节点: ${name} | ${type}`);
    return null;
  }

  // 只保留检测脚本更容易识别的类型
  if (!SUPPORTED_TYPES.includes(type)) {
    $.log(`跳过不支持的节点类型: ${name} | ${type}`);
    return null;
  }

  const uniqName = getUniqName(name);

  proxy.name = uniqName;
  proxy.type = type;

  nodes[uniqName] = {
    server,
    type
  };

  return proxy;
}

function normalizeType(type) {
  if (!type) return "";

  const raw = String(type).trim().toLowerCase();

  if (TYPE_MAP[raw]) return TYPE_MAP[raw];

  return raw;
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function getUniqName(name, n = -1) {
  const newName = "" + name + (n >= 0 ? getNumber(n) : "");
  if (nodes[newName]) {
    return getUniqName(name, n + 1);
  }
  return newName;
}

function getNumber(n) {
  const nums = ["¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹", "¹⁰"];
  if (n < nums.length) return nums[n];
  return String(n + 1);
}

/***************** 环境封装（保留原版兼容） *****************/
function Env(t, e) {
  class s {
    constructor(t) {
      this.env = t;
    }
    send(t, e = "GET") {
      t = typeof t === "string" ? { url: t } : t;
      let s = this.get;
      if (e === "POST") s = this.post;
      return new Promise((i, r) => {
        s.call(this, t, (t, s, e) => {
          if (t) r(t);
          else i(s);
        });
      });
    }
    get(t) {
      return this.send.call(this.env, t);
    }
    post(t) {
      return this.send.call(this.env, t, "POST");
    }
  }

  return new (class {
    constructor(t, e) {
      this.name = t;
      this.http = new s(this);
      this.data = null;
      this.dataFile = "box.dat";
      this.logs = [];
      this.isMute = false;
      this.isNeedRewrite = false;
      this.logSeparator = "\n";
      this.encoding = "utf-8";
      this.startTime = new Date().getTime();
      Object.assign(this, e);
      this.log("", `🔔${this.name}, 开始!`);
    }

    isNode() {
      return typeof module !== "undefined" && !!module.exports;
    }
    isQuanX() {
      return typeof $task !== "undefined";
    }
    isSurge() {
      return typeof $httpClient !== "undefined" && typeof $loon === "undefined";
    }
    isLoon() {
      return typeof $loon !== "undefined";
    }
    isShadowrocket() {
      return typeof $rocket !== "undefined";
    }
    isStash() {
      return typeof $environment !== "undefined" && $environment["stash-version"];
    }

    toObj(t, e = null) {
      try {
        return JSON.parse(t);
      } catch {
        return e;
      }
    }
    toStr(t, e = null) {
      try {
        return JSON.stringify(t);
      } catch {
        return e;
      }
    }

    getjson(t, e) {
      let s = e;
      const i = this.getdata(t);
      if (i) {
        try {
          s = JSON.parse(this.getdata(t));
        } catch {}
      }
      return s;
    }

    setjson(t, e) {
      try {
        return this.setdata(JSON.stringify(t), e);
      } catch {
        return false;
      }
    }

    getScript(t) {
      return new Promise((e) => {
        this.get({ url: t }, (t, s, i) => e(i));
      });
    }

    runScript(t, e) {
      return new Promise((s) => {
        let i = this.getdata("@chavy_boxjs_userCfgs.httpapi");
        i = i ? i.replace(/\n/g, "").trim() : i;
        let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");
        r = r ? 1 * r : 20;
        r = e && e.timeout ? e.timeout : r;
        const [o, a] = i.split("@");
        const n = {
          url: `http://${a}/v1/scripting/evaluate`,
          body: { script_text: t, mock_type: "cron", timeout: r },
          headers: { "X-Key": o, Accept: "*/*" }
        };
        this.post(n, (t, e, i) => s(i));
      }).catch((t) => this.logErr(t));
    }

    loaddata() {
      if (!this.isNode()) return {};
      this.fs = this.fs ? this.fs : require("fs");
      this.path = this.path ? this.path : require("path");
      const t = this.path.resolve(this.dataFile);
      const e = this.path.resolve(process.cwd(), this.dataFile);
      const s = this.fs.existsSync(t);
      const i = !s && this.fs.existsSync(e);
      if (!s && !i) return {};
      const r = s ? t : e;
      try {
        return JSON.parse(this.fs.readFileSync(r));
      } catch {
        return {};
      }
    }

    writedata() {
      if (this.isNode()) {
        this.fs = this.fs ? this.fs : require("fs");
        this.path = this.path ? this.path : require("path");
        const t = this.path.resolve(this.dataFile);
        const e = this.path.resolve(process.cwd(), this.dataFile);
        const s = this.fs.existsSync(t);
        const i = !s && this.fs.existsSync(e);
        const r = JSON.stringify(this.data);
        if (s) this.fs.writeFileSync(t, r);
        else if (i) this.fs.writeFileSync(e, r);
        else this.fs.writeFileSync(t, r);
      }
    }

    lodash_get(t, e, s) {
      const i = e.replace(/\[(\d+)\]/g, ".$1").split(".");
      let r = t;
      for (const t of i) {
        r = Object(r)[t];
        if (r === undefined) return s;
      }
      return r;
    }

    lodash_set(t, e, s) {
      if (Object(t) !== t) return t;
      if (!Array.isArray(e)) e = e.toString().match(/[^.[\]]+/g) || [];
      e
        .slice(0, -1)
        .reduce(
          (t, s, i) =>
            Object(t[s]) === t[s]
              ? t[s]
              : (t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}),
          t
        )[e[e.length - 1]] = s;
      return t;
    }

    getdata(t) {
      let e = this.getval(t);
      if (/^@/.test(t)) {
        const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t);
        const r = s ? this.getval(s) : "";
        if (r) {
          try {
            const t = JSON.parse(r);
            e = t ? this.lodash_get(t, i, "") : e;
          } catch {
            e = "";
          }
        }
      }
      return e;
    }

    setdata(t, e) {
      let s = false;
      if (/^@/.test(e)) {
        const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e);
        const o = this.getval(i);
        const a = i ? (o === "null" ? null : o || "{}") : "{}";
        try {
          const e = JSON.parse(a);
          this.lodash_set(e, r, t);
          s = this.setval(JSON.stringify(e), i);
        } catch {
          const o = {};
          this.lodash_set(o, r, t);
          s = this.setval(JSON.stringify(o), i);
        }
      } else {
        s = this.setval(t, e);
      }
      return s;
    }

    getval(t) {
      if (this.isSurge() || this.isLoon()) return $persistentStore.read(t);
      if (this.isQuanX()) return $prefs.valueForKey(t);
      if (this.isNode()) {
        this.data = this.loaddata();
        return this.data[t];
      }
      return (this.data && this.data[t]) || null;
    }

    setval(t, e) {
      if (this.isSurge() || this.isLoon()) return $persistentStore.write(t, e);
      if (this.isQuanX()) return $prefs.setValueForKey(t, e);
      if (this.isNode()) {
        this.data = this.loaddata();
        this.data[e] = t;
        this.writedata();
        return true;
      }
      return (this.data && this.data[e]) || null;
    }

    initGotEnv(t) {
      this.got = this.got ? this.got : require("got");
      this.cktough = this.cktough ? this.cktough : require("tough-cookie");
      this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar();
      if (t) {
        t.headers = t.headers ? t.headers : {};
        if (t.headers.Cookie === undefined && t.cookieJar === undefined) {
          t.cookieJar = this.ckjar;
        }
      }
    }

    get(t, e = () => {}) {
      if (t.headers) {
        delete t.headers["Content-Type"];
        delete t.headers["Content-Length"];
      }
      if (this.isSurge() || this.isLoon()) {
        if (this.isSurge() && this.isNeedRewrite) {
          t.headers = t.headers || {};
          Object.assign(t.headers, { "X-Surge-Skip-Scripting": false });
        }
        $httpClient.get(t, (t, s, i) => {
          if (!t && s) {
            s.body = i;
            s.statusCode = s.status ? s.status : s.statusCode;
            s.status = s.statusCode;
          }
          e(t, s, i);
        });
      } else if (this.isQuanX()) {
        if (this.isNeedRewrite) {
          t.opts = t.opts || {};
          Object.assign(t.opts, { hints: false });
        }
        $task.fetch(t).then(
          (t) => {
            const { statusCode: i, headers: r, body: o } = t;
            e(null, { status: i, statusCode: i, headers: r, body: o }, o);
          },
          (t) => e((t && t.error) || "UndefinedError")
        );
      } else if (this.isNode()) {
        let s = require("iconv-lite");
        this.initGotEnv(t);
        this.got(t)
          .then((t) => {
            const { statusCode: i, headers: o, rawBody: a } = t;
            const n = s.decode(a, this.encoding);
            e(null, { status: i, statusCode: i, headers: o, rawBody: a, body: n }, n);
          })
          .catch((t) => {
            const { message: i, response: r } = t;
            e(i, r, r && s.decode(r.rawBody, this.encoding));
          });
      }
    }

    post(t, e = () => {}) {
      const s = t.method ? t.method.toLowerCase() : "post";
      if (t.body && t.headers && !t.headers["Content-Type"]) {
        t.headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
      if (t.headers) delete t.headers["Content-Length"];

      if (this.isSurge() || this.isLoon()) {
        if (this.isSurge() && this.isNeedRewrite) {
          t.headers = t.headers || {};
          Object.assign(t.headers, { "X-Surge-Skip-Scripting": false });
        }
        $httpClient[s](t, (t, s, i) => {
          if (!t && s) {
            s.body = i;
            s.statusCode = s.status ? s.status : s.statusCode;
            s.status = s.statusCode;
          }
          e(t, s, i);
        });
      } else if (this.isQuanX()) {
        t.method = s;
        if (this.isNeedRewrite) {
          t.opts = t.opts || {};
          Object.assign(t.opts, { hints: false });
        }
        $task.fetch(t).then(
          (t) => {
            const { statusCode: i, headers: r, body: o } = t;
            e(null, { status: i, statusCode: i, headers: r, body: o }, o);
          },
          (t) => e((t && t.error) || "UndefinedError")
        );
      } else if (this.isNode()) {
        let i = require("iconv-lite");
        this.initGotEnv(t);
        const { url: r, ...o } = t;
        this.got[s](r, o)
          .then((t) => {
            const { statusCode: s, headers: o, rawBody: a } = t;
            const n = i.decode(a, this.encoding);
            e(null, { status: s, statusCode: s, headers: o, rawBody: a, body: n }, n);
          })
          .catch((t) => {
            const { message: s, response: r } = t;
            e(s, r, r && i.decode(r.rawBody, this.encoding));
          });
      }
    }

    time(t, e = null) {
      const s = e ? new Date(e) : new Date();
      const i = {
        "M+": s.getMonth() + 1,
        "d+": s.getDate(),
        "H+": s.getHours(),
        "m+": s.getMinutes(),
        "s+": s.getSeconds(),
        "q+": Math.floor((s.getMonth() + 3) / 3),
        S: s.getMilliseconds()
      };
      if (/(y+)/.test(t)) {
        t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length));
      }
      for (let e in i) {
        if (new RegExp("(" + e + ")").test(t)) {
          t = t.replace(
            RegExp.$1,
            RegExp.$1.length == 1 ? i[e] : ("00" + i[e]).substr(("" + i[e]).length)
          );
        }
      }
      return t;
    }

    msg(title = this.name, subt = "", desc = "", opts) {
      const toEnvOpts = (t) => {
        if (!t) return t;
        if (typeof t === "string") {
          if (this.isLoon()) return t;
          if (this.isQuanX()) return { "open-url": t };
          if (this.isSurge()) return { url: t };
          return undefined;
        }
        if (typeof t === "object") {
          if (this.isLoon()) {
            let openUrl = t.openUrl || t.url || t["open-url"];
            let mediaUrl = t.mediaUrl || t["media-url"];
            return { openUrl, mediaUrl };
          }
          if (this.isQuanX()) {
            let openUrl = t["open-url"] || t.url || t.openUrl;
            let mediaUrl = t["media-url"] || t.mediaUrl;
            let updatePasteboard = t["update-pasteboard"] || t.updatePasteboard;
            return { "open-url": openUrl, "media-url": mediaUrl, "update-pasteboard": updatePasteboard };
          }
          if (this.isSurge()) {
            let url = t.url || t.openUrl || t["open-url"];
            return { url };
          }
        }
      };

      if (!this.isMute) {
        if (this.isSurge() || this.isLoon()) $notification.post(title, subt, desc, toEnvOpts(opts));
        else if (this.isQuanX()) $notify(title, subt, desc, toEnvOpts(opts));
      }

      if (!this.isMuteLog) {
        let logs = ["", "==============📣系统通知📣=============="];
        logs.push(title);
        subt && logs.push(subt);
        desc && logs.push(desc);
        console.log(logs.join("\n"));
        this.logs = this.logs.concat(logs);
      }
    }

    log(...t) {
      if (t.length > 0) this.logs = [...this.logs, ...t];
      console.log(t.join(this.logSeparator));
    }

    logErr(t) {
      const s = !this.isSurge() && !this.isQuanX() && !this.isLoon();
      if (s) this.log("", `❗️${this.name}, 错误!`, t.stack);
      else this.log("", `❗️${this.name}, 错误!`, t);
    }

    wait(t) {
      return new Promise((e) => setTimeout(e, t));
    }

    done(t = {}) {
      const e = new Date().getTime();
      const s = (e - this.startTime) / 1000;
      this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`);
      this.log();
      if (this.isSurge() || this.isQuanX() || this.isLoon()) $done(t);
      else if (this.isNode()) process.exit(1);
    }
  })(t, e);
}