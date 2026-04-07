/*************************************
 * 节点详情查询 - Loon稳定版
 *************************************/

let message = "";

/*************** 关键修复：环境兼容 ***************/
function getNodeName() {
  try {
    if (typeof $environment !== "undefined" && $environment.params) {
      return (
        $environment.params.node ||
        ($environment.params.nodeInfo && $environment.params.nodeInfo.name)
      );
    }

    if (typeof $loon !== "undefined" && $loon.node) {
      return $loon.node;
    }
  } catch (e) {}

  return "当前节点";
}

function getNodeParam() {
  try {
    if (typeof $environment !== "undefined" && $environment.params) {
      return $environment.params.node || $environment.params;
    }

    if (typeof $loon !== "undefined" && $loon.node) {
      return $loon.node;
    }
  } catch (e) {}

  return null;
}

const nodeName = getNodeName();
const nodeParam = getNodeParam();

/*************************************************/

getIPInfo();

function getIPInfo() {
  const url = "http://ip-api.com/json?lang=zh-CN";

  const opts = {
    url: url
  };

  if (nodeParam) {
    opts.node = nodeParam;
  }

  $httpClient.get(opts, function (error, response, data) {
    if (error) {
      done("IP查询失败\n" + error);
      return;
    }

    if (!data) {
      done("未获取到IP信息");
      return;
    }

    fetchDetail(data);
  });
}

function fetchDetail(ipBody) {
  let ipData;

  try {
    ipData = JSON.parse(ipBody);
  } catch (e) {
    done("IP数据解析失败");
    return;
  }

  if (!ipData.query) {
    done("未获取到出口IP");
    return;
  }

  const url = "https://www.cz88.net/api/cz88/ip/base?ip=" + ipData.query;

  $httpClient.get(url, function (error, response, data) {
    if (error) {
      done("详情查询失败\n" + error);
      return;
    }

    if (!data) {
      done("未获取到详情数据");
      return;
    }

    build(ipData, data);
  });
}

function build(ipData, cz88Body) {
  let detail = {};

  try {
    const obj = JSON.parse(cz88Body);
    detail = obj.data || {};
  } catch (e) {}

  const lines = [];
  lines.push("IP：" + (detail.ip || ipData.query || "-"));
  lines.push("ISP：" + (detail.isp || ipData.isp || "-"));
  lines.push("网络类型：" + (detail.netWorkType || "-"));
  lines.push("真人概率：" + (detail.score || "-"));
  lines.push(
    "位置：" +
      (ipData.country || "-") + "-" +
      (ipData.regionName || "-") + "-" +
      (ipData.city || "-")
  );
  lines.push("经纬度：" + (ipData.lon || "-") + "/" + (ipData.lat || "-"));
  lines.push("节点：" + nodeName);

  message = lines.join("\n");

  done(message);
}

function done(msg) {
  $done({
    title: "节点详情查询",
    message: msg
  });
}
