let body = $response.body || "";
const url = $request.url || "";

if (!/instagram\.com\/(p|reel|tv)\//i.test(url)) {
  $done({ body });
}

function decodeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeUrl(str) {
  if (!str) return "";
  return decodeHtml(str)
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\/g, "");
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function areaOf(item) {
  return toNumber(item.width) * toNumber(item.height);
}

function uniqBy(arr, keyFn) {
  const seen = new Map();
  arr.forEach(item => {
    const key = keyFn(item);
    if (!seen.has(key)) seen.set(key, item);
  });
  return [...seen.values()];
}

function safePush(arr, item) {
  if (!item || !item.url) return;
  const u = normalizeUrl(item.url);
  if (!/^https?:\/\//i.test(u)) return;
  arr.push({
    url: u,
    width: toNumber(item.width),
    height: toNumber(item.height),
    type: item.type || "image"
  });
}

function pickLargest(items) {
  if (!items || !items.length) return null;
  return [...items].sort((a, b) => {
    const diff = areaOf(b) - areaOf(a);
    if (diff !== 0) return diff;
    return (b.url || "").length - (a.url || "").length;
  })[0];
}

function groupByCleanUrl(list) {
  const groups = new Map();
  list.forEach(item => {
    const key = (item.url || "").replace(/\?.*$/, "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.values()];
}

function parseJsonObjectFromMarker(html, marker) {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  let start = html.indexOf("{", idx);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) {
      return html.slice(start, i + 1);
    }
  }

  return null;
}

function tryParseJSON(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

function deepWalk(node, visitor) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach(v => deepWalk(v, visitor));
    return;
  }
  if (typeof node === "object") {
    visitor(node);
    Object.keys(node).forEach(k => deepWalk(node[k], visitor));
  }
}

function extractFromStructuredJson(html) {
  const images = [];
  const videos = [];

  const markers = [
    'window._sharedData',
    '"xdt_api__v1__media__shortcode__web_info"',
    '"items"',
    '"graphql"'
  ];

  markers.forEach(marker => {
    const objStr = parseJsonObjectFromMarker(html, marker);
    const data = tryParseJSON(objStr);
    if (!data) return;

    deepWalk(data, obj => {
      if (obj.image_versions2 && Array.isArray(obj.image_versions2.candidates)) {
        obj.image_versions2.candidates.forEach(c => {
          safePush(images, {
            url: c.url,
            width: c.width,
            height: c.height,
            type: "image"
          });
        });
      }

      if (Array.isArray(obj.display_resources)) {
        obj.display_resources.forEach(c => {
          safePush(images, {
            url: c.src || c.url,
            width: c.config_width || c.width,
            height: c.config_height || c.height,
            type: "image"
          });
        });
      }

      if (Array.isArray(obj.video_versions)) {
        obj.video_versions.forEach(v => {
          safePush(videos, {
            url: v.url,
            width: v.width,
            height: v.height,
            type: "video"
          });
        });
      }

      if (obj.video_url) {
        safePush(videos, {
          url: obj.video_url,
          width: obj.width,
          height: obj.height,
          type: "video"
        });
      }

      if (obj.display_url) {
        safePush(images, {
          url: obj.display_url,
          width: obj.dimensions && obj.dimensions.width,
          height: obj.dimensions && obj.dimensions.height,
          type: "image"
        });
      }

      if (obj.thumbnail_src) {
        safePush(images, {
          url: obj.thumbnail_src,
          width: obj.dimensions && obj.dimensions.width,
          height: obj.dimensions && obj.dimensions.height,
          type: "image"
        });
      }
    });
  });

  return { images, videos };
}

function extractByRegex(html) {
  const images = [];
  const videos = [];
  let m;

  const patterns = [
    { re: /"video_url":"(https:[^"]+)"/ig, type: "video" },
    { re: /"display_url":"(https:[^"]+)"/ig, type: "image" },
    { re: /"image_url":"(https:[^"]+)"/ig, type: "image" },
    { re: /"thumbnail_src":"(https:[^"]+)"/ig, type: "image" },
    { re: /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["'][^>]*>/ig, type: "video" },
    { re: /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/ig, type: "image" }
  ];

  patterns.forEach(item => {
    while ((m = item.re.exec(html)) !== null) {
      if (item.type === "video") {
        safePush(videos, { url: m[1], type: "video" });
      } else {
        safePush(images, { url: m[1], type: "image" });
      }
    }
  });

  const tripleRe = /"url"\s*:\s*"([^"]+)"[\s\S]{0,180}?"width"\s*:\s*(\d+)[\s\S]{0,180}?"height"\s*:\s*(\d+)/ig;
  while ((m = tripleRe.exec(html)) !== null) {
    const u = normalizeUrl(m[1]);
    if (/\.mp4(\?|$)/i.test(u)) {
      safePush(videos, { url: u, width: m[2], height: m[3], type: "video" });
    } else {
      safePush(images, { url: u, width: m[2], height: m[3], type: "image" });
    }
  }

  const rawVideoUrls = html.match(/https:\\\/\\\/[^"'<>]+\.mp4[^"'<>]*/ig) || [];
  const rawImageUrls = html.match(/https:\\\/\\\/[^"'<>]+\.(?:jpg|jpeg|png|webp)[^"'<>]*/ig) || [];

  rawVideoUrls.forEach(v => safePush(videos, { url: v, type: "video" }));
  rawImageUrls.forEach(i => safePush(images, { url: i, type: "image" }));

  return { images, videos };
}

function extractMedia(html) {
  const a = extractFromStructuredJson(html);
  const b = extractByRegex(html);

  const images = uniqBy([...a.images, ...b.images], x => x.url);
  const videos = uniqBy([...a.videos, ...b.videos], x => x.url);

  const finalImages = groupByCleanUrl(images)
    .map(group => pickLargest(group))
    .filter(Boolean)
    .sort((x, y) => areaOf(y) - areaOf(x));

  const finalVideos = groupByCleanUrl(videos)
    .map(group => pickLargest(group))
    .filter(Boolean)
    .sort((x, y) => areaOf(y) - areaOf(x));

  return { images: finalImages, videos: finalVideos };
}

function label(item) {
  if (item.width && item.height) return ` (${item.width}×${item.height})`;
  return "";
}

function buildButtons(media) {
  const btns = [];

  media.videos.forEach((v, i) => {
    btns.push(`
      <a class="igdl-btn igdl-video" href="${v.url}" target="_blank" rel="noopener">
        下载视频 ${i + 1}${label(v)}
      </a>
    `);
  });

  media.images.forEach((img, i) => {
    btns.push(`
      <a class="igdl-btn igdl-image" href="${img.url}" target="_blank" rel="noopener">
        下载图片 ${i + 1}${label(img)}
      </a>
    `);
  });

  if (!btns.length) {
    btns.push(`
      <div class="igdl-empty">
        这条链接没抓到公开资源。通常是这条内容被 Instagram 登录墙拦住了，或者页面结构变了。
      </div>
    `);
  }

  return btns.join("");
}

const media = extractMedia(body);

const injectHtml = `
<style>
#igdl-wrap{
  position:fixed;
  left:12px;
  right:12px;
  bottom:18px;
  z-index:999999;
  background:rgba(0,0,0,.88);
  backdrop-filter:blur(10px);
  border-radius:14px;
  padding:12px;
  box-shadow:0 8px 24px rgba(0,0,0,.28);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
}
#igdl-title{
  color:#fff;
  font-size:14px;
  font-weight:700;
  margin-bottom:8px;
}
#igdl-sub{
  color:rgba(255,255,255,.82);
  font-size:12px;
  line-height:1.4;
  margin-bottom:10px;
}
#igdl-list{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.igdl-btn{
  display:inline-block;
  text-decoration:none;
  padding:10px 12px;
  border-radius:10px;
  font-size:13px;
  font-weight:600;
  color:#fff !important;
}
.igdl-video{ background:#5851db; }
.igdl-image{ background:#e1306c; }
.igdl-empty{
  color:#fff;
  font-size:13px;
  line-height:1.5;
  opacity:.92;
}
#igdl-close{
  position:absolute;
  top:8px;
  right:10px;
  color:#fff;
  font-size:18px;
  cursor:pointer;
  opacity:.9;
}
</style>

<div id="igdl-wrap">
  <div id="igdl-close" onclick="document.getElementById('igdl-wrap').remove()">×</div>
  <div id="igdl-title">Instagram 免登录优先下载</div>
  <div id="igdl-sub">优先尝试从公开源码提取资源，抓不到说明该页面公开数据没放出来</div>
  <div id="igdl-list">
    ${buildButtons(media)}
  </div>
</div>
`;

if (/<\/body>/i.test(body)) {
  body = body.replace(/<\/body>/i, injectHtml + "</body>");
} else {
  body += injectHtml;
}

$done({ body });
