var WidgetMetadata = {
  id: "jable.video",
  title: "Jable 视频",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "Jable 视频源，详情显示演员、演员头像及评论",
  author: "EL",
  site: "https://jable.tv/",
  modules: [
    {
      title: "搜索",
      functionName: "search",
      params: [
        {
          name: "keyword",
          title: "关键词",
          type: "input",
          value: ""
        }
      ]
    },
    {
      title: "最新",
      functionName: "latest",
      params: []
    },
    {
      title: "热门",
      functionName: "hot",
      params: []
    },
    {
      title: "中文字幕",
      functionName: "subtitle",
      params: []
    }
  ]
};

const BASE = "https://jable.tv";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";

async function getHtml(url) {
  const res = await Widget.http.get(url, {
    headers: {
      "User-Agent": UA,
      "Referer": BASE + "/",
      "Accept": "text/html,*/*"
    }
  });
  return String(res?.data || "");
}

function text(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(reg, str) {
  const m = String(str || "").match(reg);
  return m ? String(m[1] || m[0] || "").trim() : "";
}

function abs(url) {
  url = String(url || "").trim();
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}

function parseList(html) {
  const list = [];
  const blocks = html.match(/<div[^>]+class=["'][^"']*(video-img-box|video-card|card|item)[^"']*["'][\s\S]{0,6000}?<\/div>/gi) || [];

  for (const b of blocks) {
    const href = pick(/href=["']([^"']+)["']/i, b);
    if (!href) continue;

    const title =
      pick(/title=["']([^"']+)["']/i, b) ||
      pick(/alt=["']([^"']+)["']/i, b) ||
      text(b);

    const img =
      pick(/data-src=["']([^"']+)["']/i, b) ||
      pick(/data-original=["']([^"']+)["']/i, b) ||
      pick(/src=["']([^"']+)["']/i, b);

    list.push({
      id: abs(href),
      type: "url",
      title: title,
      posterPath: abs(img),
      backdropPath: abs(img),
      mediaType: "movie",
      description: "",
      link: abs(href),
      videoUrl: abs(href)
    });
  }

  return list;
}

async function latest(params = {}) {
  const html = await getHtml(BASE + "/new-release/");
  return parseList(html);
}

async function hot(params = {}) {
  const html = await getHtml(BASE + "/hot/");
  return parseList(html);
}

async function subtitle(params = {}) {
  const html = await getHtml(BASE + "/categories/chinese-subtitle/");
  return parseList(html);
}

async function search(params = {}) {
  const keyword = params.keyword || params.query || params.title || "";
  if (!keyword) return [];

  const html = await getHtml(BASE + "/search/" + encodeURIComponent(keyword) + "/");
  return parseList(html);
}

async function loadDetail(item) {
  const url = item.id || item.link || item.videoUrl || item.url;
  const html = await getHtml(url);

  const title =
    pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html);

  const poster =
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/poster=["']([^"']+)["']/i, html);

  const actorBlocks = html.match(/<a[^>]+href=["'][^"']*\/models\/[^"']+["'][\s\S]*?<\/a>/gi) || [];
  const actors = [];

  for (const a of actorBlocks) {
    const name = text(a);
    const href = pick(/href=["']([^"']+)["']/i, a);
    const avatar =
      pick(/data-src=["']([^"']+)["']/i, a) ||
      pick(/data-original=["']([^"']+)["']/i, a) ||
      pick(/src=["']([^"']+)["']/i, a);

    if (!name) continue;

    actors.push({
      name: name,
      url: abs(href),
      avatar: abs(avatar)
    });
  }

  const commentBlocks = html.match(/<div[^>]+class=["'][^"']*(comment|reply|media)[^"']*["'][\s\S]{0,3000}?<\/div>/gi) || [];
  const comments = [];

  for (const c of commentBlocks.slice(0, 10)) {
    const t = text(c);
    if (t && t.length > 3) comments.push(t);
  }

  const actorText = actors.length
    ? actors.map(a => a.avatar ? `${a.name}\n头像：${a.avatar}` : a.name).join("\n\n")
    : "暂无演员信息";

  const commentText = comments.length
    ? comments.join("\n\n")
    : "暂无评论";

  let m3u8 =
    pick(/(https?:\/\/[^"'\\]+\.m3u8[^"'\\]*)/i, html) ||
    pick(/source[^>]+src=["']([^"']+\.m3u8[^"']*)["']/i, html) ||
    pick(/hlsUrl\s*[:=]\s*["']([^"']+)["']/i, html);

  m3u8 = String(m3u8 || "")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

  return {
    id: url,
    type: "url",
    title: text(title) || item.title,
    posterPath: abs(poster) || item.posterPath,
    backdropPath: abs(poster) || item.backdropPath,
    mediaType: "movie",
    description: `演员：\n${actorText}\n\n评论：\n${commentText}`,
    link: url,
    videoUrl: m3u8 || url,
    headers: {
      "User-Agent": UA,
      "Referer": url
    }
  };
}