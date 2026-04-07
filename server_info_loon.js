/*************************************
 * 节点详情查询 - Loon 适配版
 *************************************/

let message = "";
const envParams = $environment && $environment.params ? $environment.params : null;
const policyName =
  (envParams && envParams.node) ||
  (envParams && envParams.nodeInfo && envParams.nodeInfo.name) ||
  (typeof envParams === "string" ? envParams : "当前节点");

getIPInfo();

function getIPInfo() {
  const url = "http://ip-api.com/json?lang=zh-CN";
  const node = (envParams && envParams.node) ? envParams.node : envParams;

  const opts = {
    url: url,
    node: node
  };

  $httpClient.get(opts, function (error, response, data) {
    if (error) {
      doneWithMessage("查询失败：IP 信息请求异常\n" + String(error));
      return;
    }

    if (!data) {
      doneWithMessage("查询失败：未获取到 IP 信息");
      return;
    }

    fetchDetailInfo(data);
  });
}

function fetchDetailInfo(ipApiBody) {
  let ipData;
  try {
    ipData = JSON.parse(ipApiBody);
  } catch (e) {
    doneWithMessage("查询失败：IP 数据解析错误");
    return;
  }

  if (!ipData.query) {
    doneWithMessage("查询失败：未拿到出口 IP");
    return;
  }

  const url = "https://www.cz88.net/api/cz88/ip/base?ip=" + ipData.query;

  $httpClient.get(url, function (error, response, data) {
    if (error) {
      doneWithMessage("查询失败：详细信息接口异常\n" + String(error));
      return;
    }

    if (!data) {
      doneWithMessage("查询失败：未获取到详细信息");
      return;
    }

    buildMessage(data, ipApiBody);
    $done({
      title: "节点详情查询",
      message: message
    });
  });
}

function buildMessage(cz88Body, ipApiBody) {
  let detail = {};
  let ipData = {};

  try {
    const cz88Json = JSON.parse(cz88Body);
    detail = cz88Json.data || {};
  } catch (e) {}

  try {
    ipData = JSON.parse(ipApiBody);
  } catch (e) {}

  const lines = [];
  lines.push("IP：" + (detail.ip || ipData.query || "-"));
  lines.push("运营商(isp)：" + (detail.isp || ipData.isp || "-"));
  lines.push("网络类型：" + (detail.netWorkType || "-"));
  lines.push("真人概率：" + (detail.score || "-"));
  lines.push(
    "位置：" +
      (detail.countryCode || ipData.countryCode || "-") + "-" +
      (detail.country || ipData.country || "-") + "-" +
      (detail.province || "-") + "-" +
      (detail.city || ipData.city || "-") + "-" +
      (detail.districts || "-")
  );
  lines.push("ZIP：" + (ipData.zip || "-"));
  lines.push("经纬度：" + (ipData.lon || "-") + " / " + (ipData.lat || "-"));
  lines.push("时区：" + (ipData.timezone || "-"));
  lines.push("节点：" + (policyName || "-"));

  message = lines.join("\n");
}

function doneWithMessage(text) {
  $done({
    title: "节点详情查询",
    message: text
  });
}