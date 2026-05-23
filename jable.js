const baseUrl = 'https://jable.tv';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

async function reqHtml(url) {
  const res = await req(url, {
    headers: {
      'User-Agent': UA,
      'Referer': baseUrl + '/'
    }
  });
  return res.content || '';
}

async function init(cfg) {
  return '';
}

async function home() {
  return {
    class: [
      { type_id: '/new-release/', type_name: '最新' },
      { type_id: '/hot/', type_name: '热门' },
      { type_id: '/categories/chinese-subtitle/', type_name: '中文字幕' },
      { type_id: '/categories/censored/', type_name: '有码' },
      { type_id: '/categories/uncensored/', type_name: '无码' }
    ],
    filters: {}
  };
}

async function homeVod() {
  return { list: [] };
}

async function category(tid, pg, filter, extend) {
  let url = baseUrl + tid;
  if (pg > 1) {
    url = baseUrl + tid.replace(/\/$/, '') + '/' + pg + '/';
  }

  const html = await reqHtml(url);
  const $ = cheerio.load(html);
  const list = [];

  $('.video-img-box, .video-card, .card, .item').each((i, el) => {
    const a = $(el).find('a').first();
    const href = a.attr('href');
    if (!href) return;

    const img = $(el).find('img').first();

    list.push({
      vod_id: href.startsWith('http') ? href : baseUrl + href,
      vod_name:
        a.attr('title') ||
        $(el).find('.title').text().trim() ||
        $(el).text().trim(),
      vod_pic:
        img.attr('data-src') ||
        img.attr('data-original') ||
        img.attr('src') ||
        '',
      vod_remarks:
        $(el).find('.duration, .badge, .label').first().text().trim()
    });
  });

  return {
    page: pg,
    pagecount: pg + 1,
    limit: 24,
    total: 9999,
    list
  };
}

async function detail(id) {
  const html = await reqHtml(id);
  const $ = cheerio.load(html);

  const title =
    $('h1').first().text().trim() ||
    $('h4').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    '';

  const pic =
    $('meta[property="og:image"]').attr('content') ||
    $('.video-cover img').attr('src') ||
    $('video').attr('poster') ||
    '';

  const actors = [];
  $('a[href*="/models/"], .models a, .model a').each((i, el) => {
    const name = $(el).text().trim();
    const href = $(el).attr('href');
    const img = $(el).find('img').first();

    const avatar =
      img.attr('data-src') ||
      img.attr('data-original') ||
      img.attr('src') ||
      '';

    if (!name) return;

    actors.push({
      name,
      href: href ? (href.startsWith('http') ? href : baseUrl + href) : '',
      avatar
    });
  });

  const comments = [];
  $('.comment, .comment-item, .comments .media, .reply').each((i, el) => {
    const user =
      $(el).find('.user, .username, .name, .author').first().text().trim();

    const text =
      $(el).find('.text, .content, p').first().text().trim() ||
      $(el).text().trim();

    if (!text || text.length < 2) return;

    comments.push(user ? `${user}：${text}` : text);
  });

  const actorContent = actors.length
    ? actors.map(a => {
        return a.avatar
          ? `${a.name}\n头像：${a.avatar}`
          : a.name;
      }).join('\n\n')
    : '暂无演员信息';

  const commentContent = comments.length
    ? comments.slice(0, 10).join('\n\n')
    : '暂无评论';

  return {
    list: [{
      vod_id: id,
      vod_name: title,
      vod_pic: pic,
      type_name: 'Jable',
      vod_actor: actors.map(a => a.name).join(', '),
      vod_director: '',
      vod_area: '',
      vod_year: '',
      vod_content:
        `演员：\n${actorContent}\n\n` +
        `评论：\n${commentContent}`,
      vod_play_from: 'Jable',
      vod_play_url: `${title || '播放'}$${id}`
    }]
  };
}

async function play(flag, id, flags) {
  const html = await reqHtml(id);

  let playUrl = '';

  const m3u8 = html.match(/https?:\/\/[^"'\\]+\.m3u8[^"'\\]*/i);
  if (m3u8) {
    playUrl = m3u8[0].replace(/\\\//g, '/');
  }

  return {
    parse: playUrl ? 0 : 1,
    url: playUrl || id,
    header: {
      'User-Agent': UA,
      'Referer': id
    }
  };
}

async function search(wd, quick, pg) {
  const url = `${baseUrl}/search/${encodeURIComponent(wd)}/${pg > 1 ? pg + '/' : ''}`;
  const html = await reqHtml(url);
  const $ = cheerio.load(html);
  const list = [];

  $('.video-img-box, .video-card, .card, .item').each((i, el) => {
    const a = $(el).find('a').first();
    const href = a.attr('href');
    if (!href) return;

    const img = $(el).find('img').first();

    list.push({
      vod_id: href.startsWith('http') ? href : baseUrl + href,
      vod_name:
        a.attr('title') ||
        $(el).find('.title').text().trim() ||
        $(el).text().trim(),
      vod_pic:
        img.attr('data-src') ||
        img.attr('data-original') ||
        img.attr('src') ||
        '',
      vod_remarks:
        $(el).find('.duration, .badge, .label').first().text().trim()
    });
  });

  return {
    page: pg,
    pagecount: pg + 1,
    list
  };
}

export default {
  init,
  home,
  homeVod,
  category,
  detail,
  play,
  search
};