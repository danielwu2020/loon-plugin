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

function uniqBy(arr, keyFn) {
  const map = new Map();
  arr.forEach(item => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()];
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function areaOf(item) {
  return toNumber(item.width) * toNumber(item.height);
}

function safePushMedia(arr, item) {
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

function pickLargest(list) {
  if (!list || !list.length) return null;
  const sorted = [...list].sort((a, b) => {
    const areaDiff = areaOf(b) - areaOf(a);
    if (areaDiff !== 0) return areaDiff;
    return (b.url || "").length - (a.url || "").length;
  });
  return sorted[0];
}

function groupByBaseUrl(list) {
  const groups = new Map();

  list.forEach(item => {
    const key = (item.url || "").replace(/\?.*$/, "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  return [...groups.values()];
}

function extractJsonCandidates(html) {
  const candidates = [];

  // image_versions2 candidates with width/height
  let m;
  const imageVersions2Re =
    /"image_versions2"\s*:\s*\{[\s\S]*?"candidates"\s*:\s*\[([\s\S]*?)\]\s*\}/ig;
  while ((m = imageVersions2Re.exec(html)) !== null) {
    candidates.push({ type: "image_versions2", raw: m[1] });
  }

  // display_resources array
  const displayResourcesRe =
    /"display_resources"\s*:\s*\[([\s\S]*?)\]/ig;
  while ((m = displayResourcesRe.exec(html)) !== null) {
    candidates.push({ type: "display_resources", raw: m[1] });
  }

  // video_versions array
  const videoVersionsRe =
    /"video_versions"\s*:\s*\[([\s\S]*?)\]/ig;
  while ((m = videoVersionsRe.exec(html)) !== null) {
    candidates.push({ type: "video_versions", raw: m[1] });
  }

  return candidates;
}

function parseResourceObjects(raw, type) {
  const results = [];

  // 匹配 url + width + height
  const tripleRe =
    /"url"\s*:\s*"([^"]+)"[\s\S]*?"width"\s*:\s*(\d+)[\s\S]*?"height"\s*:\s*(\d+)/ig;
  let m;
  while ((m = tripleRe.exec(raw)) !== null) {
    safePushMedia(results, {
      url: m[1],
      width: m[2],
      height: m[3],
      type
    });
  }

  // 兼容字段顺序不同
  const tripleRe2 =
    /"width"\s*:\s*(\d+)[\s\S]*?"height"\s*:\s*(\d+)[\s\S]*?"url"\s*:\s*"([^"]+)"/ig;
  while ((m = tripleRe2.exec(raw)) !== null) {
    safePushMedia(results, {
      url: m[3],
      width: m[1],
      height: m[2],
      type
    });
  }

  return results;
}

function extractMedia(html) {
  const images = [];
  const videos = [];

  // 1) og 标签，兜底
  let m;
  const ogVideoRe =
    /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["'][^>]*>/ig;
  const ogImageRe =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/ig;

  while ((m = ogVideoRe.exec(html)) !== null) {
    safePushMedia(videos, { url: m[1], type: "video" });
  }
  while ((m = ogImageRe.exec(html)) !== null) {
    safePushMedia(images, { url: m[1], type: "image" });
  }

  // 2) 抓 structured arrays，优先拿大尺寸
  const jsonBlocks = extractJsonCandidates(html);
  jsonBlocks.forEach(block => {
    const parsed = parseResourceObjects(block.raw, block.type.includes("video") ? "video" : "image");
    parsed.forEach(item => {
      if (item.type === "video") safePushMedia(videos, item);
      else safePushMedia(images, item);
    });
  });

  // 3) 常见字段
  const directFieldPatterns = [
    { re: /"video_url":"(https:[^"]+)"/ig, type: "video" },
    { re: /"display_url":"(https:[^"]+)"/ig, type: "image" },
    { re: /"image_url":"(https:[^"]+)"/ig, type: "image" },
    { re: /"thumbnail_src":"(https:[^"]+)"/ig, type: "image" }
  ];

  directFieldPatterns.forEach(item => {
    while ((m = item.re.exec(html)) !== null) {
      if (item.type === "video") {
        safePushMedia(videos, { url: m[1], type: "video" });
      } else {
        safePushMedia(images, { url: m[1], type: "image" });
      }
    }
  });

  // 4) 通用 url + width + height 抓取
  const genericTripleRe =
    /"url"\s*:\s*"([^"]+)"[\s\S]{0,200}?"width"\s*:\s*(\d+)[\s\S]{0,200}?"height"\s*:\s*(\d+)/ig;
  while ((m = genericTripleRe.exec(html)) !== null) {
    const u = normalizeUrl(m[1]);
    if (/\.mp4(\?|$)/i.test(u) || /video/i.test(u)) {
      safePushMedia(videos, { url: u, width: m[2], height: m[3], type: "video" });
    } else {
      safePushMedia(images, { url: u, width: m[2], height: m[3], type: "image" });
    }
  }

  // 5) 纯直链兜底
  const rawVideoUrls = html.match(/https:\\\/\\\/[^"'<>]+\.mp4[^"'<>]*/ig) || [];
  const rawImageUrls = html.match(/https:\\\/\\\/[^"'<>]+\.(?:jpg|jpeg|png|webp)[^"'<>]*/ig) || [];

  rawVideoUrls.forEach(v => safePushMedia(videos, { url: v, type: "video" }));
  rawImageUrls.forEach(i => safePushMedia(images, { url: i, type: "image" }));

  // 去重
  const uniqImages = uniqBy(images, x => x.url);
  const uniqVideos = uniqBy(videos, x => x.url);

  // 同一资源多版本时，保留最大
  const groupedImages = groupByBaseUrl(uniqImages).map(group => pickLargest(group)).filter(Boolean);
  const groupedVideos = groupByBaseUrl(uniqVideos).map(group => pickLargest(group)).filter(Boolean);

  // 再按面积排序，最大的排前面
  groupedImages.sort((a, b) => areaOf(b) - areaOf(a));
  groupedVideos.sort((a, b) => areaOf(b) - areaOf(a));

  return {
    images: groupedImages,
    videos: groupedVideos
  };
}

function sizeLabel(item) {
  if (item.width && item.height) {
    return ` (${item.width}×${item.height})`;
  }
  return "";
}

function buildButtons(media) {
  const btns = [];

  // 视频一般直接给最大版本
  media.videos.forEach((v, idx) => {
    btns.push(`
      <a class="igdl-btn igdl-video" href="${v.url}" target="_blank" rel="noopener">
        最大视频 ${idx + 1}${sizeLabel(v)}
      </a>
    `);
  });

  // 图片按尺寸从大到小列出
  media.images.forEach((i, idx) => {
    btns.push(`
      <a class="igdl-btn igdl-image" href="${i.url}" target="_blank" rel="noopener">
        最大图片 ${idx + 1}${sizeLabel(i)}
      </a>
    `);
  });

  if (!btns.length) {
    btns.push(`<div class="igdl-empty">没抓到最大资源，可能需要登录，或者 Instagram 页面结构又改了。</div>`);
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
  margin-bottom:10px;
}
#igdl-sub{
  color:rgba(255,255,255,.82);
  font-size:12px;
  margin-bottom:10px;
  line-height:1.4;
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
  <div id="igdl-title">Instagram 最大尺寸下载</div>
  <div id="igdl-sub">已优先按分辨率从大到小筛选</div>
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
