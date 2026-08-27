/**
 * @author fmz200
 * @function 小红书去广告、净化、解除下载限制、画质增强等
 * @date 2026-08-27 16:00:00
 */

const $ = new Env('小红书');
const url = $request.url;
let rsp_body = $response.body;
if (!rsp_body) {
  $done({});
}
let obj = JSON.parse(rsp_body);
const MEDIA_CACHE_KEY = "fmz200.xiaohongshu.media.v9441";
const MEDIA_LATEST_KEY = "fmz200.xiaohongshu.media.v9441.latest";

if (url.includes("/search/banner_list")) {
  obj.data = {};
} 

if (url.includes("/search/hot_list")) {
  // 热搜列表
  obj.data.items = [];
}

if (url.includes("/search/hint")) {
  // 搜索栏填充词
  obj.data.hint_words = [];
}

if (url.includes("/search/trending?")) {
  // 搜索栏
  obj.data.queries = [];
  obj.data.hint_word = {};
}

if (url.includes("/search/notes?")) {
  // 搜索结果
  if (obj.data.items?.length > 0) {
    obj.data.items = obj.data.items.filter((i) => i.model_type === "note");
  }
}

if (url.includes("/system_service/config?")) {
  // 整体配置
  const item = ["app_theme", "loading_img", "splash", "store"];
  if (obj.data) {
    for (let i of item) {
      delete obj.data[i];
    }
  }
}

if (url.includes("/system_service/splash_config")) {
  // 开屏广告
  if (obj?.data?.ads_groups?.length > 0) {
    for (let i of obj.data.ads_groups) {
      i.start_time = 3818332800; // Unix 时间戳 2090-12-31 00:00:00
      i.end_time = 3818419199; // Unix 时间戳 2090-12-31 23:59:59
      if (i?.ads?.length > 0) {
        for (let ii of i.ads) {
          ii.start_time = 3818332800; // Unix 时间戳 2090-12-31 00:00:00
          ii.end_time = 3818419199; // Unix 时间戳 2090-12-31 23:59:59
        }
      }
    }
  }
}

if (url.includes("/note/imagefeed?") || url.includes("/note/feed?")) {
  console.log('打印原body：' + JSON.stringify(obj));
  // 信息流 图片
  if (obj?.data?.length > 0) {
    if (obj.data[0]?.note_list?.length > 0) {
      for (let item of obj.data[0].note_list) {
        if (item?.media_save_config) {
          // 水印开关
          item.media_save_config.disable_save = false;
          item.media_save_config.disable_watermark = true;
          item.media_save_config.disable_weibo_cover = true;
        }
        if (item?.share_info?.function_entries?.length > 0) {
          // 下载限制
          const addItem = {type: "video_download"};
          let func = item.share_info.function_entries[0];
          if (func?.type !== "video_download") {
            // 向数组开头添加对象
            item.share_info.function_entries.unshift(addItem);
          }
        }
        // 新版下载限制
        if (Array.isArray(item.function_switch)) {
          item.function_switch.forEach(item => {
            if (item?.type === 'image_download') {
              item.enable = true;
            }
          });
        }
        // 复制权限
        const options = item.note_text_press_options;
        if (Array.isArray(options)) {
          const hasCopy = options.some(item => item.key === 'copy');
          if (!hasCopy) {
            options.push({
              key: 'copy',
              extra: ''
            });
          }
        }

        // 处理帖子引用的标签
        if (item.hash_tag) {
          item.hash_tag = item.hash_tag.filter(tag => tag.type !== "interact_vote");
        }
      }

      const images_list = obj.data[0].note_list[0].images_list;
      // 画质增强
      obj.data[0].note_list[0].images_list = imageEnhance(JSON.stringify(images_list));
      // 保存无水印信息
      $.setdata(JSON.stringify(images_list), "fmz200.xiaohongshu.feed.rsp");
      console.log('已存储无水印信息♻️');
    }
  }
} 

if (url.includes("/note/live_photo/save")) {
  console.log('原body：' + rsp_body);
  const rsp = $.getdata("fmz200.xiaohongshu.feed.rsp");
  console.log("读取缓存key[fmz200.xiaohongshu.feed.rsp]的值：" + rsp);
  // console.log("读取缓存val：" + rsp);
  if (rsp == null || rsp.length === 0) {
    console.log('缓存无内容，返回原body');
    $done({body: rsp_body});
  }
  const cache_body = JSON.parse(rsp);
  let new_data = [];
  for (const images of cache_body) {
    if (images.live_photo_file_id) {
      const item = {
        file_id: images.live_photo_file_id,
        video_id: images.live_photo.media.video_id,
        url: images.live_photo.media.stream.h265[0].master_url
      };
      new_data.push(item);
    }
  }
  if (obj.data.datas) {
    replaceUrlContent(obj.data.datas, new_data);
  } else {
    obj = {"code": 0, "success": true, "msg": "fmz200创建响应体成功", "data": {"datas": new_data}};
  }
  console.log('新body：' + JSON.stringify(obj));
} 

if (url.includes("/note/widgets")) {
  const item = ["cooperate_binds", "generic", "note_next_step", "widget_list"];
  if (obj?.data) {
    for (let i of item) {
      delete obj.data[i];
    }
  }
} 

if (url.includes("/v3/note/videofeed?")) {
  // 信息流 视频
  if (obj?.data?.length > 0) {
    for (let item of obj.data) {
      if (item?.media_save_config) {
        // 水印
        item.media_save_config.disable_save = false;
        item.media_save_config.disable_watermark = true;
        item.media_save_config.disable_weibo_cover = true;
      }
      if (item?.share_info?.function_entries?.length > 0) {
        // 下载限制
        const addItem = {type: "video_download"};
        let func = item.share_info.function_entries[0];
        if (func?.type !== "video_download") {
          // 向数组开头添加对象
          item.share_info.function_entries.unshift(addItem);
        }
      }
    }
  }
}

// 信息流 视频
if (url.includes("/v4/note/videofeed")) {
  let videoData = [];
  if (obj.data?.length > 0) {
    for (let item of obj.data) {
      // 强制开启权限
      if (item?.media_save_config) {
        item.media_save_config.disable_save = false;
        item.media_save_config.disable_watermark = true;
        item.media_save_config.disable_weibo_cover = true;
      }

      // 处理 function_switch (修复按钮置灰)
      if (item?.function_switch?.length > 0) {
        for (let switchItem of item.function_switch) {
          if (switchItem.type === "video_download") {
            switchItem.enable = true;
            if (switchItem.reason) delete switchItem.reason;
          }
        }
      }

      // 添加下载按钮（如果未存在）
      if (item?.share_info?.function_entries?.length > 0) {
        const hasDownload = item.share_info.function_entries.some(entry => entry.type === "video_download");
        if (!hasDownload) {
          console.log(`添加下载按钮: ${item.id}`);
          item.share_info.function_entries.push({type: "video_download"});
        }
      }

      // 提取最佳视频流 (修复逻辑：分辨率相同优先选码率高的)
      const h265List = item?.video_info_v2?.media?.stream?.h265 || [];
      const h264List = item?.video_info_v2?.media?.stream?.h264 || [];

      const selectedStream = selectBestStream(h265List, h264List);
      // 存入缓存数组
      if (item?.id && selectedStream?.master_url) {
        const data = {
          id: item.id,
          url: selectedStream.master_url
        };
        console.log(`提取成功 ➜ ${item.id} → ${selectedStream.stream_desc}`);
        videoData.push(data);
        console.log(`[缓存] ID:${item.id} | 规格:${selectedStream.quality_type} | 码率:${selectedStream.avg_bitrate}`);
      } else {
        console.log(`未找到可用视频: ${item.id}`);
      }
    }
    // 写入本地持久化缓存
    $.setdata(JSON.stringify(videoData), "redBookVideoFeed");
    console.log(`已缓存普通视频 ${videoData.length} 条`);
  }
}

// 视频保存请求
if (url.includes("/v10/note/video/save")) {
  let videoFeed = JSON.parse($.getdata("redBookVideoFeed")); // 读取持久化存储
  if (obj.data?.note_id !== "" && videoFeed?.length > 0) {
    for (let item of videoFeed) {
      if (item.id === obj.data.note_id) {
        obj.data.download_url = item.url;
      }
    }
  }
  // 解除下载限制
  if (obj.data?.disable) {
    delete obj.data.disable;
    delete obj.data.msg;
    obj.data.status = 2;
  }
}

// 9.44.1 兼容：接口版本、笔记层级和视频流字段均改为动态识别。
// 保留上方旧版处理逻辑，避免影响仍在使用旧接口的客户端。
const isWatermarkFeedUrl = /\/api\/sns\/v\d+\/(?:(?:note\/(?:imagefeed|feed|videofeed|detail(?:feed)?))|(?:homefeed|followfeed))(?:[/?]|$)/.test(url);
const isMediaSaveUrl = /\/api\/sns\/v\d+\/note\/(?:(?:video|image|media)\/(?:save|download)|(?:save|download))(?:[/?]|$)/.test(url);

if (isWatermarkFeedUrl) {
  processWatermarkFeed(obj);
}

if (isMediaSaveUrl) {
  processMediaSave(obj);
}

if (url.includes("/user/followings/followfeed")) {
  // 关注页信息流 可能感兴趣的人
  if (obj?.data?.items?.length > 0) {
    // 白名单
    obj.data.items = obj.data.items.filter((i) => i?.recommend_reason === "friend_post");
  }
} 

if (url.includes("/v4/followfeed")) {
  // 关注列表
  if (obj?.data?.items?.length > 0) {
    // recommend_user 可能感兴趣的人
    obj.data.items = obj.data.items.filter((i) => !["recommend_user"].includes(i.recommend_reason));
  }
}  

if (url.includes("/recommend/user/follow_recommend")) {
  // 用户详情页 你可能感兴趣的人
  if (obj?.data?.title === "你可能感兴趣的人" && obj?.data?.rec_users?.length > 0) {
    obj.data = {};
  }
} 

if (url.includes("/v6/homefeed")) {
  if (obj?.data?.length > 0) {
    // 信息流广告
    let newItems = [];
    for (let item of obj.data) {
      if (item?.model_type === "live_v2") {
        // 信息流-直播
      } else if (item?.hasOwnProperty("ads_info")) {
        // 信息流-赞助
      } else if (item?.hasOwnProperty("card_icon")) {
        // 信息流-带货
      } else if (item?.note_attributes?.includes("goods")) {
        // 信息流-商品
      } else {
        if (item?.related_ques) {
          delete item.related_ques;
        }
        newItems.push(item);
      }
    }
    obj.data = newItems;
  }
}

// 加载评论区
if (url.includes("/api/sns/v5/note/comment/list?") || url.includes("/api/sns/v3/note/comment/sub_comments?")) {
  replaceRedIdWithFmz200(obj.data);
  let livePhotos = [];
  let commentVideos = [];
  let note_id = "";
  if (obj.data?.comments?.length > 0) {
    note_id = obj.data.comments[0].note_id;
    for (const comment of obj.data.comments) {
      // comment_type: 0-文字，2-图片/live，3-表情包，5-视频
      fixCommentType(comment);
      extractLivePhotos(comment.pictures, livePhotos, comment.id);

      // 子评论处理
      if (comment.sub_comments?.length > 0) {
        for (const sub_comment of comment.sub_comments) {
          fixCommentType(sub_comment);
          extractLivePhotos(sub_comment.pictures, livePhotos, comment.id, "_sub");
        }
      }

      // 评论视频处理 
      if (comment?.videos?.length > 0) {
        for (const video of comment.videos) {
          if (video?.video_id && video?.video_info) {
            try {
              const videoObj = JSON.parse(video.video_info);
              // 选择最佳画质
              const streams = selectBestStream(videoObj?.stream?.h265, videoObj?.stream?.h264);
              if (streams?.master_url) {
                commentVideos.push({
                  videId: video.video_id,
                  videoUrl: streams.master_url,
                  commentId: comment.id,
                  noteId: note_id,
                  width: streams.width,
                  height: streams.height,
                  bitrate: streams.video_bitrate,
                  hdr: streams.hdr_type === 1
                });
              }
            } catch (e) {
              console.log("评论视频处理出错", e);
            }
          }
        }
      }
      
    }
  }
  console.log("本次note_id：" + note_id);
  // 存储评论实况照片
  if (livePhotos.length > 0) {
    let commitsRsp;
    const commitsCache = $.getdata("fmz200.xiaohongshu.comments.rsp");
    console.log("读取缓存val：" + commitsCache);
    if (!commitsCache) {
      commitsRsp = {noteId: note_id, livePhotos: livePhotos};
    } else {
      commitsRsp = JSON.parse(commitsCache);
      console.log("缓存note_id：" + commitsRsp.noteId);
      if (commitsRsp.noteId === note_id) {
        console.log("增量数据");
        commitsRsp.livePhotos = deduplicateLivePhotos(commitsRsp.livePhotos.concat(livePhotos));
      } else {
        console.log("更换数据");
        commitsRsp = {noteId: note_id, livePhotos: livePhotos};
      }
    }
    console.log("写入缓存val：" + JSON.stringify(commitsRsp));
    $.setdata(JSON.stringify(commitsRsp), "fmz200.xiaohongshu.comments.rsp");
  }

  // 存储评论视频信息
  if (commentVideos.length > 0) {
    let videosCache;
    const commitsCache = $.getdata("fmz200.xiaohongshu.comments.videos.rsp");
    if (!commitsCache) {
      videosCache = {noteId: note_id, videos: commentVideos};
    } else {
      videosCache = JSON.parse(commitsCache);
      console.log("[commentVideos]缓存note_id：" + videosCache.noteId);
      if (videosCache.noteId === note_id) {
        console.log("[commentVideos]增量数据");
        videosCache.videos = deduplicateLivePhotos(videosCache.videos.concat(commentVideos));
      } else {
        console.log("[commentVideos]更换数据");
        videosCache = {noteId: note_id, videos: commentVideos};
      }
    }
    console.log("[commentVideos]写入缓存val：" + JSON.stringify(videosCache));
    $.setdata(JSON.stringify(videosCache), "fmz200.xiaohongshu.comments.videos.rsp");
  }
}

// 下载评论区live图/评论区视频
if (url.includes("/api/sns/v1/interaction/comment/video/download?")) {
  const commitsCache = $.getdata("fmz200.xiaohongshu.comments.rsp");
  const commitsVideoCache = $.getdata("fmz200.xiaohongshu.comments.videos.rsp");
  console.log("读取缓存val：" + commitsCache);
  console.log("目标video_id：" + obj.data.video.video_id);
  if (commitsCache) {
    let commitsRsp = JSON.parse(commitsCache);
    if (commitsRsp.livePhotos.length > 0 && obj.data?.video) {
      for (const item of commitsRsp.livePhotos) {
        // console.log("缓存video_id：" + item.videId);
        if (item.videId === obj.data.video.video_id) {
          console.log("匹配到无水印链接：" + item.videoUrl);
          obj.data.video.video_url = item.videoUrl;
          break;
        }
      }
    }
  } else if (commitsVideoCache){
    let commitsVideoRsp = JSON.parse(commitsVideoCache);
    if (commitsVideoRsp.videos.length > 0 && obj.data?.video) {
      for (const item of commitsVideoRsp.videos) {
        // console.log("缓存video_id：" + item.videId);
        if (item.videId === obj.data.video.video_id) {
          console.log("[commentVideos]匹配到无水印链接：" + item.videoUrl);
          obj.data.video.video_url = item.videoUrl;
          break;
        }
      }
    }
  } else {
    console.log(`没有[${obj.data?.video.video_id}]的无水印地址`);
  }
}

$done({body: JSON.stringify(obj)});

function processWatermarkFeed(root) {
  const notes = collectNoteItems(root?.data ?? root);
  if (notes.length === 0) {
    console.log("[9.44.1] 未识别到笔记对象，保留原响应");
    return;
  }

  const updates = [];
  let latest = null;
  let livePhotoImages = null;

  for (const note of notes) {
    unlockNoteDownload(note);

    const noteId = getNoteId(note);
    const bestStream = selectBestStreamFromNote(note);
    const imageLists = getImageLists(note);
    const imageUrls = [];

    for (const entry of imageLists) {
      if (!livePhotoImages && entry.list.length > 0) {
        livePhotoImages = entry.list;
      }
      for (const image of entry.list) {
        const imageUrl = getBestImageUrl(image);
        if (imageUrl && !imageUrls.includes(imageUrl)) imageUrls.push(imageUrl);
      }
      note[entry.key] = imageEnhance(JSON.stringify(entry.list));
    }

    if (noteId && (bestStream?.url || imageUrls.length > 0)) {
      const media = {
        id: noteId,
        videoUrl: bestStream?.url || "",
        imageUrls
      };
      updates.push(media);
      if (!latest) latest = media;
    }
  }

  if (livePhotoImages?.length > 0) {
    $.setdata(JSON.stringify(livePhotoImages), "fmz200.xiaohongshu.feed.rsp");
  }

  if (updates.length > 0) {
    const oldCache = readJsonCache(MEDIA_CACHE_KEY, []);
    const updateIds = new Set(updates.map(item => item.id));
    const merged = updates.concat(oldCache.filter(item => item?.id && !updateIds.has(String(item.id))));
    $.setdata(JSON.stringify(merged.slice(0, 100)), MEDIA_CACHE_KEY);
    $.setdata(JSON.stringify(latest), MEDIA_LATEST_KEY);

    // 同步旧版缓存键，确保 v10 保存接口仍可直接读取。
    const videoCache = merged
      .filter(item => item.videoUrl)
      .map(item => ({id: item.id, url: item.videoUrl}));
    if (videoCache.length > 0) {
      $.setdata(JSON.stringify(videoCache.slice(0, 100)), "redBookVideoFeed");
    }
    console.log(`[9.44.1] 已缓存 ${updates.length} 条笔记媒体信息`);
  }
}

function processMediaSave(root) {
  const cache = readJsonCache(MEDIA_CACHE_KEY, []);
  const latest = readJsonCache(MEDIA_LATEST_KEY, null);
  const noteId = extractRequestedNoteId(root);
  let media = noteId ? cache.find(item => String(item?.id) === String(noteId)) : null;
  if (!media) media = latest;

  const data = root?.data && typeof root.data === "object" ? root.data : root;
  unlockRestrictionFlags(data);

  if (!media) {
    console.log(`[9.44.1] 保存接口未命中媒体缓存，note_id=${noteId || "未知"}`);
    return;
  }

  if (/\/note\/(?:image|media)\/(?:save|download)/.test(url) && media.imageUrls?.length > 0) {
    patchImageDownloadResponse(data, media.imageUrls);
    console.log(`[9.44.1] 已替换 ${media.imageUrls.length} 个原图地址`);
    return;
  }

  if (media.videoUrl) {
    patchVideoDownloadResponse(data, media.videoUrl);
    console.log(`[9.44.1] 已替换无水印视频地址，note_id=${media.id}`);
  }
}

function collectNoteItems(root) {
  const result = [];
  const visited = new Set();

  const walk = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 12 || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (isNoteLike(value)) result.push(value);
    for (const key of Object.keys(value)) walk(value[key], depth + 1);
  };

  walk(root);
  return result;
}

function isNoteLike(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const hasMedia = item.video_info_v2 || item.video_info || item.video || item.images_list ||
    item.image_list || item.images || item.media_save_config || item.media_save_config_v2;
  const hasControls = item.function_switch || item.share_info || item.note_text_press_options;
  return Boolean(hasMedia || (getNoteId(item) && hasControls));
}

function getNoteId(item) {
  const id = item?.note_id ?? item?.noteId ?? item?.id ?? item?.note_id_str ?? item?.noteIdStr;
  return id === undefined || id === null || id === "" ? "" : String(id);
}

function unlockNoteDownload(note) {
  const configKeys = ["media_save_config", "media_save_config_v2", "save_config"];
  let foundConfig = false;
  for (const key of configKeys) {
    if (note[key] && typeof note[key] === "object") {
      setSaveConfig(note[key]);
      foundConfig = true;
    }
  }
  if (!foundConfig) {
    note.media_save_config = {};
    setSaveConfig(note.media_save_config);
  }

  setExistingBoolean(note, "disable_save", false);
  setExistingBoolean(note, "disable_watermark", true);
  setExistingBoolean(note, "has_watermark", false);
  setExistingBoolean(note, "watermark", false);
  setExistingBoolean(note, "can_save", true);
  setExistingBoolean(note, "allow_save", true);

  if (Array.isArray(note.function_switch)) {
    for (const switchItem of note.function_switch) {
      const type = String(switchItem?.type ?? switchItem?.key ?? "").toLowerCase();
      if (/(?:download|save)/.test(type)) {
        switchItem.enable = true;
        switchItem.enabled = true;
        delete switchItem.reason;
        delete switchItem.disable_reason;
      }
    }
  } else if (note.function_switch && typeof note.function_switch === "object") {
    for (const key of Object.keys(note.function_switch)) {
      if (/(?:download|save)/i.test(key)) note.function_switch[key] = true;
    }
  }

  const entries = note?.share_info?.function_entries;
  if (Array.isArray(entries) && selectBestStreamFromNote(note) && !entries.some(entry => entry?.type === "video_download")) {
    entries.unshift({type: "video_download"});
  }

  if (Array.isArray(note.note_text_press_options) && !note.note_text_press_options.some(item => item?.key === "copy")) {
    note.note_text_press_options.push({key: "copy", extra: ""});
  }
}

function setSaveConfig(config) {
  config.disable_save = false;
  config.disable_watermark = true;
  config.disable_weibo_cover = true;
  setExistingBoolean(config, "has_watermark", false);
  setExistingBoolean(config, "watermark", false);
  setExistingBoolean(config, "can_save", true);
  setExistingBoolean(config, "allow_save", true);
}

function setExistingBoolean(target, key, value) {
  if (Object.prototype.hasOwnProperty.call(target, key)) target[key] = value;
}

function getImageLists(note) {
  const result = [];
  for (const key of ["images_list", "image_list", "images"]) {
    if (Array.isArray(note?.[key])) result.push({key, list: note[key]});
  }
  return result;
}

function getBestImageUrl(image) {
  if (!image || typeof image !== "object") return "";
  for (const key of ["url_size_large", "url_default", "original_url", "url", "url_pre"]) {
    if (typeof image[key] === "string" && image[key]) return image[key];
  }
  const lists = [image.url_info_list, image.info_list];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const candidates = list.filter(item => typeof item?.url === "string" && item.url);
    candidates.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
    if (candidates[0]) return candidates[0].url;
  }
  return "";
}

function selectBestStreamFromNote(note) {
  const roots = [];
  for (const value of [note?.video_info_v2, note?.video_info, note?.video, note?.media]) {
    const parsed = parseMaybeJson(value);
    if (parsed && typeof parsed === "object") roots.push(parsed);
  }
  const candidates = [];
  const visited = new Set();

  const walk = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 8 || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const streamUrl = getStreamUrl(value);
    if (streamUrl) candidates.push({stream: value, url: streamUrl});
    for (const key of Object.keys(value)) {
      if (/(?:stream|media|video|h26[456]|h264|h265|av1|list)/i.test(key)) walk(value[key], depth + 1);
    }
  };

  for (const root of roots) walk(root);
  candidates.sort((a, b) => streamScore(b.stream) - streamScore(a.stream));
  return candidates[0] || null;
}

function getStreamUrl(stream) {
  if (!stream || typeof stream !== "object") return "";
  for (const key of ["master_url", "download_url", "video_url", "play_url", "origin_url"]) {
    if (typeof stream[key] === "string" && stream[key]) return stream[key];
  }
  if (Array.isArray(stream.backup_urls) && stream.backup_urls[0]) return stream.backup_urls[0];
  if (typeof stream.url === "string" && stream.url &&
      (stream.width || stream.height || stream.bitrate || stream.avg_bitrate || stream.codec || stream.stream_desc)) {
    return stream.url;
  }
  return "";
}

function streamScore(stream) {
  const area = (Number(stream?.width) || 0) * (Number(stream?.height) || 0);
  const bitrate = Number(stream?.avg_bitrate ?? stream?.video_bitrate ?? stream?.bitrate) || 0;
  const codec = String(stream?.codec ?? stream?.codec_type ?? stream?.stream_desc ?? "").toLowerCase();
  const codecBonus = /h26[56]|hevc/.test(codec) ? 1e12 : 0;
  return codecBonus + area * 1e4 + bitrate;
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function readJsonCache(key, fallback) {
  const value = $.getdata(key);
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch (error) {
    console.log(`[9.44.1] 缓存解析失败 ${key}: ${error}`);
    return fallback;
  }
}

function extractRequestedNoteId(root) {
  const responseId = findFirstValue(root?.data ?? root, ["note_id", "noteId", "note_id_str", "noteIdStr"]);
  if (responseId) return String(responseId);

  const queryMatch = url.match(/[?&](?:note_id|noteId|note_id_str)=([^&#]+)/i);
  if (queryMatch) return decodeURIComponent(queryMatch[1]);

  const body = $request?.body;
  if (!body) return "";
  const parsed = parseMaybeJson(body);
  if (parsed && typeof parsed === "object") {
    const bodyId = findFirstValue(parsed, ["note_id", "noteId", "note_id_str", "noteIdStr"]);
    if (bodyId) return String(bodyId);
  }
  const formMatch = String(body).match(/(?:^|&)(?:note_id|noteId|note_id_str)=([^&]+)/i);
  return formMatch ? decodeURIComponent(formMatch[1]) : "";
}

function findFirstValue(root, keys, depth = 0, visited = new Set()) {
  if (!root || typeof root !== "object" || depth > 8 || visited.has(root)) return "";
  visited.add(root);
  if (!Array.isArray(root)) {
    for (const key of keys) {
      if (root[key] !== undefined && root[key] !== null && root[key] !== "") return root[key];
    }
  }
  for (const value of Object.values(root)) {
    const found = findFirstValue(value, keys, depth + 1, visited);
    if (found !== "") return found;
  }
  return "";
}

function unlockRestrictionFlags(root, depth = 0, visited = new Set()) {
  if (!root || typeof root !== "object" || depth > 10 || visited.has(root)) return;
  visited.add(root);
  if (Array.isArray(root)) {
    for (const item of root) unlockRestrictionFlags(item, depth + 1, visited);
    return;
  }
  setExistingBoolean(root, "disable", false);
  setExistingBoolean(root, "disable_save", false);
  setExistingBoolean(root, "disable_watermark", true);
  setExistingBoolean(root, "has_watermark", false);
  setExistingBoolean(root, "watermark", false);
  setExistingBoolean(root, "can_save", true);
  setExistingBoolean(root, "allow_save", true);
  if (Object.prototype.hasOwnProperty.call(root, "status") && Number(root.status) !== 2) root.status = 2;
  delete root.disable_reason;
  for (const value of Object.values(root)) unlockRestrictionFlags(value, depth + 1, visited);
}

function patchVideoDownloadResponse(data, videoUrl) {
  if (!data || typeof data !== "object") return;
  data.download_url = videoUrl;
  if (Object.prototype.hasOwnProperty.call(data, "video_url")) data.video_url = videoUrl;
  if (Object.prototype.hasOwnProperty.call(data, "url")) data.url = videoUrl;

  const patch = (value, depth = 0, visited = new Set()) => {
    if (!value || typeof value !== "object" || depth > 8 || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) patch(item, depth + 1, visited);
      return;
    }
    for (const key of ["download_url", "video_url", "master_url", "play_url", "origin_url"]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) value[key] = videoUrl;
    }
    if (depth > 0 && Object.prototype.hasOwnProperty.call(value, "url")) value.url = videoUrl;
    for (const key of ["video", "videos", "data", "datas", "media", "stream"]) patch(value[key], depth + 1, visited);
  };
  patch(data);
}

function patchImageDownloadResponse(data, imageUrls) {
  if (!data || typeof data !== "object" || imageUrls.length === 0) return;
  data.download_urls = imageUrls.slice();
  if (Array.isArray(data.urls)) data.urls = imageUrls.slice();

  const targets = [];
  const visited = new Set();
  const collect = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 8 || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) collect(item, depth + 1);
      return;
    }
    if (["url", "download_url", "image_url", "original_url"].some(key => Object.prototype.hasOwnProperty.call(value, key))) {
      targets.push(value);
    }
    for (const key of ["images", "image_list", "images_list", "data", "datas", "files"]) collect(value[key], depth + 1);
  };
  collect(data);

  targets.forEach((target, index) => {
    const imageUrl = imageUrls[Math.min(index, imageUrls.length - 1)];
    for (const key of ["url", "download_url", "image_url", "original_url"]) {
      if (Object.prototype.hasOwnProperty.call(target, key)) target[key] = imageUrl;
    }
  });
}

// 小红书画质增强：加载2K分辨率的图片
function imageEnhance(jsonStr) {
  if (!jsonStr) {
    console.error("jsonStr is undefined or null");
    return [];
  }

  const imageQuality = $.getdata("fmz200.xiaohongshu.imageQuality");
  console.log(`Image Quality: ${imageQuality}`);
  if (imageQuality === "original") { // 原始分辨率，PNG格式的图片，占用空间比较大
    console.log("画质设置为-原始分辨率");
    jsonStr = jsonStr.replace(/\?imageView2\/2[^&]*(?:&redImage\/frame\/0)/, "?imageView2/0/format/png&redImage/frame/0");
  } else { // 高像素输出
    console.log("画质设置为-高像素输出");
    const regex1 = /imageView2\/2\/w\/\d+\/format/g;
    jsonStr = jsonStr.replace(regex1, `imageView2/2/w/2160/format`);

    const regex2 = /imageView2\/2\/h\/\d+\/format/g;
    jsonStr = jsonStr.replace(regex2, `imageView2/2/h/2160/format`);
  }
  console.log('图片画质增强完成✅');

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("JSON parsing error: ", e);
    return [];
  }
}

function replaceUrlContent(collectionA, collectionB) {
  console.log('替换无水印的URL');
  // 匹配常见视频格式（扩展名到查询参数之前的部分）
  const videoBaseRegex = /(.*\.(mp4|mov|webm|m3u8|ts|avi|mkv|flv))/i;

  collectionA.forEach(itemA => {
    const itemB = collectionB.find(itemB => itemB.file_id === itemA.file_id);
    if (itemB) {
      console.log(`file_id：${itemA.file_id}匹配到无水印链接`);
      if (itemA.url !== "") {
        const match = itemB.url.match(videoBaseRegex);
        itemA.url = match ? match[1] : itemB.url;
      } else {
        itemA.url = itemB.url;
      }
      itemA.author = "@fmz200"
    }
  });
}

function deduplicateLivePhotos(livePhotos) {
  const seen = new Map();
  livePhotos = livePhotos.filter(item => {
    if (seen.has(item.videId)) {
      return false;
    }
    seen.set(item.videId, true);
    return true;
  });
  return livePhotos;
}

function replaceRedIdWithFmz200(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(item => replaceRedIdWithFmz200(item));
  } else if (typeof obj === 'object' && obj !== null) {
    if ('red_id' in obj) {
      obj.fmz200 = obj.red_id; // 创建新属性fmz200
      delete obj.red_id; // 删除旧属性red_id
    }
    Object.keys(obj).forEach(key => {
      replaceRedIdWithFmz200(obj[key]);
    });
  }
}

/**
 * 从流列表中选择最佳流（优先 H265，降级 H264）
 * @param {Array} h265List - H265 流列表
 * @param {Array} h264List - H264 流列表
 * @returns {Object|null} - 选中的流对象或 null
 */
function selectBestStream(h265List, h264List) {
  // 排序函数：优先分辨率面积，其次平均码率
  const sortStream = (a, b) => {
    const resA = (a.width || 0) * (a.height || 0);
    const resB = (b.width || 0) * (b.height || 0);
    if (resB !== resA) return resB - resA;
    return (b.avg_bitrate || 0) - (a.avg_bitrate || 0);
  };

  const selectFromList = (list) => {
    if (!Array.isArray(list) || list.length === 0) return null;
    const sorted = list.filter(v => !!v.master_url).sort(sortStream);
    return sorted.length > 0 ? sorted[0] : null;
  };

  return selectFromList(h265List) || selectFromList(h264List);
}

/**
 * 修复评论类型（3->2, 1->0）
 * @param {Object} comment - 评论对象
 */
function fixCommentType(comment) {
  if (comment.comment_type === 3) {
    comment.comment_type = 2;
    console.log(`修改评论类型：3->2`);
  }
  if (comment.media_source_type === 1) {
    comment.media_source_type = 0;
    console.log(`修改媒体类型：1->0`);
  }
}

/**
 * 从图片列表中提取live照片
 * @param {Array} pictures - 图片列表
 * @param {Array} livePhotos - live照片数组（会被修改）
 * @param {string} commentId - 评论ID（用于日志）
 * @param {string} prefix - 日志前缀
 */
function extractLivePhotos(pictures, livePhotos, commentId, prefix = "") {
  if (!pictures?.length > 0) return;
  console.log(`${prefix}comment_id: ` + commentId);
  for (const picture of pictures) {
    if (picture.video_id) {
      const picObj = JSON.parse(picture.video_info);
      const bestStream = selectBestStream(picObj.stream?.h265, picObj.stream?.h264);
      if (bestStream?.master_url) {
        console.log(`${prefix}video_id：` + picture.video_id);
        livePhotos.push({
          videId: picture.video_id,
          videoUrl: bestStream.master_url
        });
      }
    }
  }
}

function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise((e, i) => { s.call(this, t, (t, s, r) => { t ? i(t) : e(s) }) }) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `\ud83d\udd14${this.name}, \u5f00\u59cb!`) } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } isShadowrocket() { return "undefined" != typeof $rocket } isStash() { return "undefined" != typeof $environment && $environment["stash-version"] } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; const i = this.getdata(t); if (i) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise(e => { this.get({ url: t }, (t, s, i) => e(i)) }) } runScript(t, e) { return new Promise(s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r; const [o, a] = i.split("@"), n = { url: `http://${a}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: r }, headers: { "X-Key": o, Accept: "*/*" } }; this.post(n, (t, e, i) => s(i)) }).catch(t => this.logErr(t)) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), r = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, r) : i ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let r = t; for (const t of i) if (r = Object(r)[t], void 0 === r) return s; return r } lodash_set(t, e, s) { return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t) } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.lodash_get(t, i, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e), o = this.getval(i), a = i ? "null" === o ? null : o || "{}" : "{}"; try { const e = JSON.parse(a); this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const o = {}; this.lodash_set(o, r, t), s = this.setval(JSON.stringify(o), i) } } else s = this.setval(t, e); return s } getval(t) { return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null } setval(t, e) { return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { if (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]), this.isSurge() || this.isLoon()) this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) }); else if (this.isQuanX()) this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t && t.error || "UndefinedError")); else if (this.isNode()) { let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", (t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } }).then(t => { const { statusCode: i, statusCode: r, headers: o, rawBody: a } = t, n = s.decode(a, this.encoding); e(null, { status: i, statusCode: r, headers: o, rawBody: a, body: n }, n) }, t => { const { message: i, response: r } = t; e(i, r, r && s.decode(r.rawBody, this.encoding)) }) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon()) this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) }); else if (this.isQuanX()) t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t && t.error || "UndefinedError")); else if (this.isNode()) { let i = require("iconv-lite"); this.initGotEnv(t); const { url: r, ...o } = t; this.got[s](r, o).then(t => { const { statusCode: s, statusCode: r, headers: o, rawBody: a } = t, n = i.decode(a, this.encoding); e(null, { status: s, statusCode: r, headers: o, rawBody: a, body: n }, n) }, t => { const { message: s, response: r } = t; e(s, r, r && i.decode(r.rawBody, this.encoding)) }) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } msg(e = t, s = "", i = "", r) { const o = t => { if (!t) return t; if ("string" == typeof t) return this.isLoon() ? t : this.isQuanX() ? { "open-url": t } : this.isSurge() ? { url: t } : void 0; if ("object" == typeof t) { if (this.isLoon()) { let e = t.openUrl || t.url || t["open-url"], s = t.mediaUrl || t["media-url"]; return { openUrl: e, mediaUrl: s } } if (this.isQuanX()) { let e = t["open-url"] || t.url || t.openUrl, s = t["media-url"] || t.mediaUrl, i = t["update-pasteboard"] || t.updatePasteboard; return { "open-url": e, "media-url": s, "update-pasteboard": i } } if (this.isSurge()) { let e = t.url || t.openUrl || t["open-url"]; return { url: e } } } }; if (this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r))), !this.isMuteLog) { let t = ["", "==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { const s = !this.isSurge() && !this.isQuanX() && !this.isLoon(); s ? this.log("", `\u2757\ufe0f${this.name}, \u9519\u8bef!`, t.stack) : this.log("", `\u2757\ufe0f${this.name}, \u9519\u8bef!`, t) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; this.log("", `\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`), this.log(), this.isSurge() || this.isQuanX() || this.isLoon() ? $done(t) : this.isNode() && process.exit(1) } }(t, e) }
