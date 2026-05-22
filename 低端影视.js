const meta = {
  key: 'ddys',
  name: '低端影视',
  type: 3,
  api: 'ddys.js',
  searchable: 1,
  quickSearch: 1,
  filterable: 0,
  version: '1.0.1',
  date: 1716307200000
};

const baseUrl = 'https://www.ddys.run';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function init(cfg) {
  return '';
}

async function home() {
  return {
    class: [
      { type_id: '1', type_name: '电影' },
      { type_id: '2', type_name: '电视剧' },
      { type_id: '4', type_name: '动漫' },
      { type_id: '3', type_name: '纪录片' }
    ],
    filters: {}
  };
}

async function homeVod() {
  return {
    list: []
  };
}

async function category(tid, pg, filter, extend) {
  pg = pg || 1;

  const url = `${baseUrl}/list/${tid}--------${pg}---.html`;

  const res = await req(url, {
    headers: {
      'User-Agent': UA,
      Referer: baseUrl + '/'
    }
  });

  const html = res.content || '';

  if (!html) {
    return {
      page: 1,
      pagecount: 1,
      limit: 20,
      total: 0,
      list: []
    };
  }

  const cards = pdfa(
    html,
    '.stui-vodlist__box, .post-box, article, .m-item'
  );

  const list = cards
    .map((item) => {
      let vodId = pdfh(item, 'a&&href');

      if (vodId && !vodId.startsWith('http')) {
        vodId = baseUrl + vodId;
      }

      let pic =
        pdfh(item, 'img&&data-original') ||
        pdfh(item, '.stui-vodlist__thumb&&data-original') ||
        pdfh(item, 'img&&data-src') ||
        pdfh(item, 'img&&src') ||
        '';

      if (pic.startsWith('//')) {
        pic = 'https:' + pic;
      }

      if (pic.startsWith('/')) {
        pic = baseUrl + pic;
      }

      let name =
        pdfh(item, 'h2&&Text') ||
        pdfh(item, '.title&&Text') ||
        pdfh(item, 'a&&title') ||
        pdfh(item, 'img&&alt') ||
        '未知';

      let remarks =
        pdfh(item, '.pic-text&&Text') ||
        pdfh(item, '.post-date&&Text') ||
        '';

      return {
        vod_id: vodId,
        vod_name: name.trim(),
        vod_pic: pic,
        vod_remarks: remarks
      };
    })
    .filter((it) => it.vod_id);

  return {
    page: parseInt(pg),
    pagecount:
      list.length >= 10
        ? parseInt(pg) + 1
        : parseInt(pg),
    limit: 20,
    total: 999,
    list
  };
}

async function detail(id) {
  const vodId = Array.isArray(id)
    ? id[0]
    : id;

  const res = await req(vodId, {
    headers: {
      'User-Agent': UA,
      Referer: baseUrl + '/'
    }
  });

  const html = res.content || '';

  if (!html) {
    return {
      list: []
    };
  }

  let title =
    pdfh(html, 'h1&&Text') ||
    pdfh(html, '.post-title&&Text') ||
    '未知';

  let pic =
    pdfh(
      html,
      '.post-content img&&src'
    ) ||
    pdfh(
      html,
      '.stui-content__thumb img&&src'
    ) ||
    '';

  if (pic.startsWith('//')) {
    pic = 'https:' + pic;
  }

  if (pic.startsWith('/')) {
    pic = baseUrl + pic;
  }

  const playItems = pdfa(
    html,
    '.post-content a[href*="/v/"], .stui-content__playlist li a'
  );

  const episodes = playItems
    .map((it) => {
      let name =
        pdfh(it, 'a&&Text') || '播放';

      let href =
        pdfh(it, 'a&&href') || '';

      if (
        href &&
        !href.startsWith('http')
      ) {
        href = baseUrl + href;
      }

      return `${name.trim()}$${href}`;
    })
    .filter((x) => x.includes('http'));

  return {
    list: [
      {
        vod_id: vodId,
        vod_name: title.trim(),
        vod_pic: pic,
        vod_play_from: '低端影视',
        vod_play_url:
          episodes.length > 0
            ? episodes.join('#')
            : `立即播放$${vodId}`,
        vod_content:
          pdfh(
            html,
            '.post-content p&&Text'
          ) || ''
      }
    ]
  };
}

async function search(wd, quick, pg) {
  const url = `${baseUrl}/?s=${encodeURIComponent(
    wd
  )}`;

  const res = await req(url, {
    headers: {
      'User-Agent': UA,
      Referer: baseUrl + '/'
    }
  });

  const html = res.content || '';

  const list = pdfa(
    html,
    '.post-box, article, .stui-vodlist__box'
  )
    .map((item) => {
      let vodId = pdfh(item, 'a&&href');

      if (
        vodId &&
        !vodId.startsWith('http')
      ) {
        vodId = baseUrl + vodId;
      }

      let pic =
        pdfh(item, 'img&&data-original') ||
        pdfh(item, 'img&&data-src') ||
        pdfh(item, 'img&&src') ||
        '';

      if (pic.startsWith('//')) {
        pic = 'https:' + pic;
      }

      if (pic.startsWith('/')) {
        pic = baseUrl + pic;
      }

      let name =
        pdfh(item, 'h2&&Text') ||
        pdfh(item, '.title&&Text') ||
        pdfh(item, 'a&&title') ||
        pdfh(item, 'img&&alt') ||
        '未知';

      return {
        vod_id: vodId,
        vod_name: name.trim(),
        vod_pic: pic
      };
    })
    .filter((it) => it.vod_id);

  return {
    list
  };
}

async function play(flag, id, flags) {
  return {
    parse: 1,
    url: id,
    header: {
      'User-Agent': UA,
      Referer: baseUrl + '/'
    }
  };
}

module.exports = {
  meta,
  init,
  home,
  homeVod,
  category,
  detail,
  search,
  play
};