WidgetMetadata = {
  id: "jable.video",
  title: "Jable 视频",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "Jable 视频源，详情显示演员、演员头像及评论",
  author: "EL",
  site: "https://jable.tv/",
  globalParams: [],
  modules: [
    {
      id: "home",
      title: "首页",
      functionName: "home",
      type: "video",
      params: [],
    },
    {
      id: "search",
      title: "搜索",
      functionName: "search",
      type: "video",
      params: [],
    },
    {
      id: "detail",
      title: "详情",
      functionName: "detail",
      type: "video",
      params: [],
    },
    {
      id: "play",
      title: "播放",
      functionName: "play",
      type: "video",
      params: [],
    },
  ],
};

const BASE = "https://jable.tv";
const UA = "ForwardWidgets/1.0.2";

function getText(v) {
  return String(v || "").trim();
}

function cleanText(html) {
  return String(html || "")
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

function absUrl(url) {
  url = getText(url);
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}

function pick(reg, text) {
  const m = String(text || "").match(reg);
  return m ? getText(m[1] || m[0]) : "";
}

async function getHtml(url) {
  const res = await Widget.http.get(url, {
    headers: {
      "User-Agent": UA,
      "Referer": BASE + "/",
      "Accept": "text/html,*/*",
    },
  });
  return String(res?.data || "");
}

function parseVideoList(html) {
  const list = [];

  const blocks =
    html.match(/<div[^>]+class=["'][^"']*(?:video-img-box|video-card|card|item)[^"']*["'][\s\S]{0,5000}?<\/div>/gi) || [];

  for (const block of blocks) {
    const href = pick(/href=["']([^"']+)["']/i, block);
    if (!href) continue;

    const title =
      pick(/title=["']([^"']+)["']/i, block) ||
      pick(/alt=["']([^"']+)["']/i, block) ||
      cleanText(block);

    const img =
      pick(/data-src=["']([^"']+)["']/i, block) ||
      pick(/data-original=["']([^"']+)["']/i, block) ||
      pick(/src=["']([^"']+)["']/i, block);

    const remark =
      pick(/<span[^>]+class=["'][^"']*(?:duration|badge|label)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, block);

    list.push({
      id: absUrl(href),
      title: title,
      posterPath: absUrl(img),
      description: cleanText(remark),
    });
  }

  return list;
}

async function home(params) {
  return [
    {
      id: BASE + "/new-release/",
      title: "最新",
      posterPath: "",
      description: "Jable 最新发布",
    },
    {
      id: BASE + "/hot/",
      title: "热门",
      posterPath: "",
      description: "Jable 热门影片",
    },
    {
      id: BASE + "/categories/chinese-subtitle/",
      title: "中文字幕",
      posterPath: "",
      description: "中文字幕影片",
    },
    {
      id: BASE + "/categories/censored/",
      title: "有码",
      posterPath: "",
      description: "有码分类",
    },
    {
      id: BASE + "/categories/uncensored/",
      title: "无码",
      posterPath: "",
      description: "无码分类",
    },
  ];
}

async function search(params) {
  const keyword =
    params?.keyword ||
    params?.query ||
    params?.title ||
    params?.search ||
    "";

  if (!keyword) return [];

  const page = Number(params?.page || params?.pg || 1);
  const url = `${BASE}/search/${encodeURIComponent(keyword)}/${page > 1 ? page + "/" : ""}`;
  const html = await getHtml(url);

  return parseVideoList(html);
}

async function detail(params) {
  const url = params?.id || params?.url || params;
  const html = await getHtml(url);

  const title =
    pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html) ||
    pick(/<h4[^>]*>([\s\S]*?)<\/h4>/i, html);

  const poster =
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/poster=["']([^"']+)["']/i, html);

  const actors = [];
  const actorBlocks =
    html.match(/<a[^>]+href=["'][^"']*\/models\/[^"']+["'][\s\S]*?<\/a>/gi) || [];

  for (const a of actorBlocks) {
    const name = cleanText(a);
    const href = pick(/href=["']([^"']+)["']/i, a);
    const avatar =
      pick(/data-src=["']([^"']+)["']/i, a) ||
      pick(/data-original=["']([^"']+)["']/i, a) ||
      pick(/src=["']([^"']+)["']/i, a);

    if (!name) continue;

    actors.push({
      name,
      url: absUrl(href),
      avatar: absUrl(avatar),
    });
  }

  const comments = [];
  const commentBlocks =
    html.match(/<div[^>]+class=["'][^"']*(?:comment|reply|media)[^"']*["'][\s\S]{0,3000}?<\/div>/gi) || [];

  for (const c of commentBlocks.slice(0, 10)) {
    const text = cleanText(c);
    if (text && text.length > 3) comments.push(text);
  }

  const actorText = actors.length
    ? actors.map(a => {
        return a.avatar
          ? `${a.name}\n头像：${a.avatar}`
          : a.name;
      }).join("\n\n")
    : "暂无演员信息";

  const commentText = comments.length
    ? comments.join("\n\n")
    : "暂无评论";

  return {
    id: url,
    title: cleanText(title),
    posterPath: absUrl(poster),
    description:
      `演员：\n${actorText}\n\n` +
      `评论：\n${commentText}`,
    actors: actors,
    comments: comments,
    url: url,
  };
}

async function play(params) {
  const url = params?.id || params?.url || params;
  const html = await getHtml(url);

  let m3u8 =
    pick(/(https?:\/\/[^"'\\]+\.m3u8[^"'\\]*)/i, html) ||
    pick(/source[^>]+src=["']([^"']+\.m3u8[^"']*)["']/i, html) ||
    pick(/hlsUrl\s*[:=]\s*["']([^"']+)["']/i, html) ||
    pick(/setUrl\(["']([^"']+)["']\)/i, html);

  m3u8 = String(m3u8 || "")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

  return {
    url: m3u8 || url,
    headers: {
      "User-Agent": UA,
      "Referer": url,
    },
  };
}