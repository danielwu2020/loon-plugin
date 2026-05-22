/**
 * 低端影视 - Forward 模块适配版
 */

const baseUrl = 'https://www.ddys.run';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function init(cfg) {
  return "";
}

async function home() {
  return {
    class: [
      { type_id: "1", type_name: "电影" },
      { type_id: "2", type_name: "电视剧" },
      { type_id: "4", type_name: "动漫" },
      { type_id: "3", type_name: "纪录片" }
    ],
    filters: {}
  };
}

async function homeVod() {
  return { list: [] };
}

async function category(tid, pg = 1, filter, extend) {
  const url = `${baseUrl}/list/${tid}--------${pg}---.html`;

  const res = await req(url, {
    headers: {
      'User-Agent': UA,
      'Referer': baseUrl + '/'
    }
  });

  const html = res.content || res || "";
  if (!html) return { list: [] };

  const cards = pdfa(html, '.stui-vodlist__box, .post-box, article, .m-item');

  const list = cards.map(item => {
    let vId = pdfh(item, 'a&&href');
    if (vId && !vId.startsWith('http')) vId = baseUrl + vId;

    let pic =
      pdfh(item, 'img&&data-original') ||
      pdfh(item, '.stui-vodlist__thumb&&data-original') ||
      pdfh(item, 'img&&data-src') ||
      pdfh(item, 'img&&src');

    if (pic && pic.startsWith('//')) pic = 'https:' + pic;
    if (pic && pic.startsWith('/')) pic = baseUrl + pic;

    let name =
      pdfh(item, 'h2&&Text') ||
      pdfh(item, '.title&&Text') ||
      pdfh(item, 'a&&title') ||
      pdfh(item, 'img&&alt');

    return {
      vod_name: name ? name.trim() : "未知",
      vod_pic: pic || "",
      vod_remarks: pdfh(item, '.pic-text&&Text') || pdfh(item, '.post-date&&Text') || "",
      vod_id: vId
    };
  }).filter(it => it.vod_id && it.vod_id.includes('http'));

  return {
    page: Number(pg),
    pagecount: list.length >= 10 ? Number(pg) + 1 : Number(pg),
    limit: 20,
    total: 999,
    list
  };
}

async function detail(id) {
  const vodId = Array.isArray(id) ? id[0] : id;

  const res = await req(vodId, {
    headers: {
      'User-Agent': UA,
      'Referer': baseUrl + '/'
    }
  });

  const html = res.content || res || "";

  const title =
    pdfh(html, 'h1&&Text') ||
    pdfh(html, '.post-title&&Text');

  let pic =
    pdfh(html, '.post-content img&&src') ||
    pdfh(html, '.stui-content__thumb img&&src');

  if (pic && pic.startsWith('//')) pic = 'https:' + pic;
  if (pic && pic.startsWith('/')) pic = baseUrl + pic;

  const items = pdfa(html, '.post-content a[href*="/v/"], .stui-content__playlist li a');

  const episodes = items.map(it => {
    const name = pdfh(it, 'a&&Text') || '播放';
    let href = pdfh(it, 'a&&href');

    if (href && !href.startsWith('http')) href = baseUrl + href;

    return `${name.trim()}$${href}`;
  }).filter(x => x.includes('http'));

  return {
    list: [{
      vod_id: vodId,
      vod_name: title ? title.trim() : "未知",
      vod_pic: pic || "",
      vod_play_from: '低端影视',
      vod_play_url: episodes.length ? episodes.join('#') : `立即播放$${vodId}`,
      vod_content: pdfh(html, '.post-content p&&Text') || ""
    }]
  };
}

async function search(wd, quick, pg = 1) {
  const url = `${baseUrl}/?s=${encodeURIComponent(wd)}`;

  const res = await req(url, {
    headers: {
      'User-Agent': UA,
      'Referer': baseUrl + '/'
    }
  });

  const html = res.content || res || "";

  const list = pdfa(html, '.post-box, article, .stui-vodlist__box').map(item => {
    let vId = pdfh(item, 'a&&href');
    if (vId && !vId.startsWith('http')) vId = baseUrl + vId;

    let pic = pdfh(item, 'img&&data-original') || pdfh(item, 'img&&data-src') || pdfh(item, 'img&&src');

    if (pic && pic.startsWith('//')) pic = 'https:' + pic;
    if (pic && pic.startsWith('/')) pic = baseUrl + pic;

    return {
      vod_name: pdfh(item, 'h2&&Text') || pdfh(item, '.title&&Text') || pdfh(item, 'a&&title') || "未知",
      vod_pic: pic || "",
      vod_id: vId
    };
  }).filter(it => it.vod_id);

  return { list };
}

async function play(flag, id, flags) {
  return {
    parse: 1,
    url: id,
    header: {
      'User-Agent': UA,
      'Referer': baseUrl + '/'
    }
  };
}

module.exports = {
  init,
  home,
  homeVod,
  category,
  detail,
  search,
  play
};