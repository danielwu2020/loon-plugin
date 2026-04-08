/*
 TikTok 国际版下载增强版 for Loon
 功能：
 - 视频：优先 download_addr，无则高码率 play_addr
 - 图集：优先 image_post_info/display_image
 - 单视频 / 图集 自动识别
 - 生成完整下载页
 - 一键复制全部链接
 - 批量打开图片
 - 预览封面
 - 显示作者 / aweme_id / 文案
*/

(function () {
  const reqUrl = $request && $request.url ? $request.url : "";
  const rawBody = $response && $response.body ? $response.body : "";

  function done(body) {
    $done({
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body
    });
  }

  function passthrough() {
    $done({});
  }

  function safeParse(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
  }

  function cleanUrl(url) {
    if (!url) return "";
    return String(url)
      .replace(/([?&])watermark=[^&]*/gi, "$1")
      .replace(/([?&])needwatermark=[^&]*/gi, "$1")
      .replace(/([?&])logo_name=[^&]*/gi, "$1")
      .replace(/([?&])source=[^&]*/gi, "$1")
      .replace(/\?&/, "?")
      .replace(/&&+/g, "&")
      .replace(/[?&]$/, "");
  }

  function pickAweme(data) {
    return (
      data?.aweme_detail ||
      data?.aweme_list?.[0] ||
      data?.item_list?.[0] ||
      data?.aweme_details?.[0] ||
      data?.data?.aweme_detail ||
      data?.data?.aweme_list?.[0] ||
      null
    );
  }

  function getBestBitrateVideo(video) {
    const list = Array.isArray(video?.bit_rate) ? video.bit_rate : [];
    if (!list.length) return [];
    const sorted = list
      .slice()
      .sort((a, b) => {
        const aBr = Number(a?.bit_rate || a?.bitrate || 0);
        const bBr = Number(b?.bit_rate || b?.bitrate || 0);
        return bBr - aBr;
      });
    return sorted.flatMap(x => x?.play_addr?.url_list || []);
  }

  function extractImages(aweme) {
    const out = [];

    const imagePostImages = aweme?.image_post_info?.images || [];
    imagePostImages.forEach(img => {
      out.push(...(img?.display_image?.url_list || []));
      out.push(...(img?.owner_watermark_image?.url_list || []));
    });

    const commonImages = aweme?.images || [];
    commonImages.forEach(img => {
      out.push(...(img?.display_image?.url_list || []));
      out.push(...(img?.url_list || []));
    });

    return uniq(out.map(cleanUrl));
  }

  function extractCover(aweme) {
    const video = aweme?.video || {};
    const covers = [
      ...(video?.origin_cover?.url_list || []),
      ...(video?.cover?.url_list || []),
      ...(video?.dynamic_cover?.url_list || [])
    ];
    return uniq(covers)[0] || "";
  }

  function extractVideo(aweme) {
    const video = aweme?.video || {};

    const downloadUrls = [
      ...(video?.download_addr?.url_list || []),
      ...(video?.download_suffix_logo_addr?.url_list || [])
    ].map(cleanUrl);

    const bestBitrateUrls = getBestBitrateVideo(video).map(cleanUrl);
    const playUrls = [
      ...(video?.play_addr?.url_list || []),
      ...(video?.play_addr_h264?.url_list || [])
    ].map(cleanUrl);

    const ordered = uniq([
      ...downloadUrls,
      ...bestBitrateUrls,
      ...playUrls
    ]);

    return {
      preferred: ordered[0] || "",
      all: ordered
    };
  }

  function extractMeta(aweme) {
    return {
      desc: aweme?.desc || "",
      awemeId: aweme?.aweme_id || "",
      createTime: aweme?.create_time || "",
      authorName:
        aweme?.author?.nickname ||
        aweme?.author?.unique_id ||
        aweme?.author?.short_id ||
        "",
      authorId:
        aweme?.author?.unique_id ||
        aweme?.author?.sec_uid ||
        aweme?.author?.uid ||
        "",
      musicTitle:
        aweme?.music?.title || "",
      statistics: aweme?.statistics || {}
    };
  }

  function isImagePost(images, preferredVideo) {
    return images.length > 0 && !preferredVideo;
  }

  function buildButtonsForVideo(preferredVideo, allVideos) {
    if (!preferredVideo) {
      return `<div class="empty">没提取到视频链接</div>`;
    }

    const allList = allVideos
      .map((u, i) => `
        <a class="subbtn" href="${esc(u)}" target="_blank" rel="noopener">
          备用视频链接 ${i + 1}
        </a>
      `)
      .join("");

    return `
      <a class="mainbtn" href="${esc(preferredVideo)}" target="_blank" rel="noopener">
        ⬇️ 直接下载无水印视频
      </a>
      <button class="copybtn" onclick='copyText(${JSON.stringify(preferredVideo)})'>复制主视频链接</button>
      <details class="details">
        <summary>展开备用链接</summary>
        <div class="stack">${allList || "<div class='empty'>暂无备用链接</div>"}</div>
      </details>
    `;
  }

  function buildButtonsForImages(images) {
    if (!images.length) {
      return `<div class="empty">没提取到图集原图</div>`;
    }

    const items = images
      .map((u, i) => `
        <a class="subbtn" href="${esc(u)}" target="_blank" rel="noopener">
          下载原图 ${i + 1}
        </a>
      `)
      .join("");

    const arrJson = JSON.stringify(images);

    return `
      <button class="mainbtn ghost" onclick='copyText(${JSON.stringify(images.join("\\n"))})'>
        复制全部图片链接
      </button>
      <button class="copybtn" onclick='openBatch(${arrJson})'>批量打开全部原图</button>
      <div class="stack">${items}</div>
    `;
  }

  function buildPreview(cover, preferredVideo, images) {
    if (images.length) {
      return `
        <div class="preview-grid">
          ${images.slice(0, 9).map(u => `<img src="${esc(u)}" loading="lazy" referrerpolicy="no-referrer">`).join("")}
        </div>
      `;
    }

    if (cover) {
      return `
        <div class="cover-wrap">
          <img class="cover" src="${esc(cover)}" loading="eager" referrerpolicy="no-referrer">
          ${preferredVideo ? `<a class="playbtn" href="${esc(preferredVideo)}" target="_blank" rel="noopener">打开视频源</a>` : ""}
        </div>
      `;
    }

    return `<div class="empty">暂无预览</div>`;
  }

  function statLine(stats) {
    const parts = [];
    if (stats?.play_count != null) parts.push(`播放 ${stats.play_count}`);
    if (stats?.digg_count != null) parts.push(`点赞 ${stats.digg_count}`);
    if (stats?.comment_count != null) parts.push(`评论 ${stats.comment_count}`);
    if (stats?.share_count != null) parts.push(`分享 ${stats.share_count}`);
    return parts.join(" · ");
  }

  function buildHtml(data) {
    const {
      meta,
      preferredVideo,
      allVideos,
      images,
      cover,
      sourceUrl
    } = data;

    const imagePost = isImagePost(images, preferredVideo);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>TikTok 下载增强版</title>
<style>
  :root{
    --bg:#0b0c10;
    --card:#151821;
    --card2:#1c2130;
    --text:#f4f7ff;
    --sub:#aeb7cc;
    --line:#2a3145;
    --blue:#4f8cff;
    --blue2:#2f6fff;
    --green:#20c997;
    --red:#ff5d73;
    --shadow:0 10px 28px rgba(0,0,0,.28);
    --radius:18px;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    background:linear-gradient(180deg,#0b0c10 0%,#10131c 100%);
    color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",sans-serif;
    padding:18px 14px 28px;
  }
  .wrap{max-width:880px;margin:0 auto}
  .hero{
    background:linear-gradient(135deg,#151821 0%,#1c2130 100%);
    border:1px solid var(--line);
    border-radius:24px;
    padding:18px;
    box-shadow:var(--shadow);
    margin-bottom:14px;
  }
  .badge{
    display:inline-block;
    padding:6px 10px;
    font-size:12px;
    border-radius:999px;
    background:rgba(79,140,255,.16);
    color:#9ec0ff;
    border:1px solid rgba(79,140,255,.25);
    margin-bottom:12px;
  }
  .title{
    font-size:20px;
    line-height:1.42;
    font-weight:700;
    margin:0 0 10px;
    word-break:break-word;
  }
  .meta,.sub{
    color:var(--sub);
    font-size:13px;
    line-height:1.6;
    word-break:break-all;
  }
  .grid{
    display:grid;
    grid-template-columns:1fr;
    gap:14px;
  }
  .card{
    background:var(--card);
    border:1px solid var(--line);
    border-radius:var(--radius);
    padding:16px;
    box-shadow:var(--shadow);
  }
  .card h3{
    margin:0 0 12px;
    font-size:17px;
  }
  .mainbtn,.subbtn,.copybtn,.playbtn{
    display:block;
    width:100%;
    text-align:center;
    text-decoration:none;
    color:#fff;
    border:none;
    border-radius:14px;
    padding:14px 14px;
    margin:10px 0 0;
    font-size:15px;
    font-weight:650;
    cursor:pointer;
  }
  .mainbtn{
    background:linear-gradient(135deg,var(--blue),var(--blue2));
  }
  .mainbtn.ghost{
    background:linear-gradient(135deg,#1d2434,#25314d);
    border:1px solid #34415d;
  }
  .subbtn{
    background:#232b3d;
    border:1px solid #34415d;
  }
  .copybtn{
    background:linear-gradient(135deg,#1a9f7a,#158b6a);
  }
  .playbtn{
    background:linear-gradient(135deg,#ff6b81,#ff4f6e);
  }
  .stack{display:flex;flex-direction:column}
  .details{
    margin-top:10px;
    border-top:1px dashed #34415d;
    padding-top:10px;
  }
  .details summary{
    color:#9ec0ff;
    cursor:pointer;
    user-select:none;
  }
  .preview-grid{
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:8px;
  }
  .preview-grid img,
  .cover{
    width:100%;
    display:block;
    object-fit:cover;
    border-radius:14px;
    border:1px solid #30394f;
    background:#0e1016;
  }
  .preview-grid img{aspect-ratio:1/1}
  .cover-wrap{display:flex;flex-direction:column;gap:10px}
  .empty{
    color:#8f9ab3;
    font-size:14px;
    padding:12px 0 4px;
  }
  .footer{
    color:#7e879b;
    text-align:center;
    font-size:12px;
    padding:18px 6px 8px;
  }
  .kv{
    display:grid;
    grid-template-columns:92px 1fr;
    gap:8px;
    margin:6px 0;
    font-size:13px;
  }
  .kv .k{color:#91a0bd}
  .kv .v{color:#eef3ff;word-break:break-all}
  .toolbar{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px;
    margin-top:12px;
  }
  @media (min-width:760px){
    .grid{grid-template-columns:1.05fr .95fr}
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="badge">${imagePost ? "图集原图模式" : "视频无水印优先模式"}</div>
      <h1 class="title">${esc(meta.desc || "TikTok 媒体下载")}</h1>
      <div class="meta">作者：${esc(meta.authorName || "未知")} ${meta.authorId ? `(@${esc(meta.authorId)})` : ""}</div>
      <div class="meta">作品ID：${esc(meta.awemeId || "-")}</div>
      ${meta.musicTitle ? `<div class="meta">音乐：${esc(meta.musicTitle)}</div>` : ""}
      ${statLine(meta.statistics) ? `<div class="meta">${esc(statLine(meta.statistics))}</div>` : ""}
      <div class="toolbar">
        <button class="copybtn" onclick='copyText(${JSON.stringify(sourceUrl)})'>复制当前接口链接</button>
        <button class="mainbtn ghost" onclick='copyText(${JSON.stringify(meta.desc || "")})'>复制文案</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>${imagePost ? "🖼 原图下载" : "🎬 视频下载"}</h3>
        ${imagePost ? buildButtonsForImages(images) : buildButtonsForVideo(preferredVideo, allVideos)}
      </div>

      <div class="card">
        <h3>👀 预览</h3>
        ${buildPreview(cover, preferredVideo, images)}
      </div>
    </div>

    <div class="card" style="margin-top:14px;">
      <h3>📦 全部资源</h3>
      ${
        preferredVideo
          ? `
            <div class="kv"><div class="k">主视频</div><div class="v">${esc(preferredVideo)}</div></div>
            <div class="kv"><div class="k">备用数量</div><div class="v">${allVideos.length}</div></div>
          `
          : ""
      }
      ${
        images.length
          ? `
            <div class="kv"><div class="k">原图数量</div><div class="v">${images.length}</div></div>
            <div class="kv"><div class="k">首张图片</div><div class="v">${esc(images[0])}</div></div>
          `
          : ""
      }
    </div>

    <div class="footer">
      说明：优先提取下载源；若接口不给下载源，则退回高码率播放源。少数作品可能仍受接口限制。
    </div>
  </div>

<script>
  function copyText(text){
    try{
      navigator.clipboard.writeText(String(text || "")).then(function(){
        alert("已复制");
      }).catch(function(){
        fallbackCopy(text);
      });
    }catch(e){
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text){
    var el = document.createElement("textarea");
    el.value = String(text || "");
    document.body.appendChild(el);
    el.select();
    try{ document.execCommand("copy"); alert("已复制"); }catch(e){ alert("复制失败"); }
    document.body.removeChild(el);
  }

  function openBatch(arr){
    if(!Array.isArray(arr) || !arr.length){
      alert("没有可打开的图片");
      return;
    }
    arr.forEach(function(u, idx){
      setTimeout(function(){ window.open(u, "_blank"); }, idx * 180);
    });
  }
</script>
</body>
</html>`;
  }

  const json = safeParse(rawBody);
  if (!json) return passthrough();

  const aweme = pickAweme(json);
  if (!aweme) return passthrough();

  const videoInfo = extractVideo(aweme);
  const images = extractImages(aweme);
  const meta = extractMeta(aweme);
  const cover = extractCover(aweme);

  const hasSomething = !!videoInfo.preferred || images.length > 0;
  if (!hasSomething) return passthrough();

  return done(
    buildHtml({
      meta,
      preferredVideo: videoInfo.preferred,
      allVideos: videoInfo.all,
      images,
      cover,
      sourceUrl: reqUrl
    })
  );
})();