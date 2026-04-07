/*************************************
 * 节点详情查询 - Loon 适配版
 * 基于 fmz200 的 Quantumult X 脚本修改
 *************************************/

let message = "";
const envParams = $environment?.params;
const policyName =
  envParams?.node ||
  envParams?.nodeInfo?.name ||
  (typeof envParams === "string" ? envParams : JSON.stringify(envParams || ""));

getIPInfo();

function getIPInfo() {
  const url = "http://ip-api.com/json?lang=zh-CN";
  const opts = {
    policy: envParams?.node || envParams
  };

  const request = {
    url,
    opts,
    timeout: 8000
  };

  $task.fetch(request).then(
    (response) => {
      console.log(response.statusCode + "--ip-api--\n" + response.body);
      if (response.body) {
        fetchDetailInfo(response.body);
      } else {
        doneWithMessage("查询失败：未获取到 IP 信息");
      }
    },
    () => {
      doneWithMessage("查询超时");
    }
  );
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

  const url = `https://www.cz88.net/api/cz88/ip/base?ip=${ipData.query}`;
  console.log("url=" + url);

  const request = {
    url,
    timeout: 8000
  };

  $task.fetch(request).then(
    (response) => {
      console.log(response.statusCode + "--cz88--\n" + response.body);
      if (response.body) {
        buildMessage(response.body, ipApiBody);
        $done({
          title: "节点详情查询",
          htmlMessage: `<pre>${escapeHtml(message)}</pre>`
        });
      } else {
        doneWithMessage("查询失败：未获取到详细信息");
      }
    },
    (reason) => {
      console.log(reason?.error || reason);
      doneWithMessage("查询失败：详细信息接口异常");
    }
  );
}

function buildMessage(cz88Body, ipApiBody) {
  let detail;
  let ipData;

  try {
    detail = JSON.parse(cz88Body).data || {};
    ipData = JSON.parse(ipApiBody);
  } catch (e) {
    doneWithMessage("查询失败：返回数据解析错误");
    return;
  }

  const lines = [];
  lines.push("------------------------------");
  lines.push(`IP：${detail.ip || ipData.query || "-"}`);
  lines.push(`运营商(isp)：${detail.isp || ipData.isp || "-"}`);
  lines.push(`网络类型：${detail.netWorkType || "-"}`);
  lines.push(`真人概率：${detail.score || "-"}`);
  lines.push(
    `位置：${detail.countryCode || ipData.countryCode || "-"}-${detail.country || ipData.country || "-"}-${detail.province || "-"}-${detail.city || ipData.city || "-"}-${detail.districts || "-"}`
  );
  lines.push(`ZIP：${ipData.zip || "-"}`);
  lines.push(`经纬度：${ipData.lon || "-"} / ${ipData.lat || "-"}`);
  lines.push(`时区：${ipData.timezone || "-"}`);
  lines.push("------------------------------");
  lines.push(`节点 ➟ ${policyName || "-"}`);

  message = lines.join("\n");
  console.log("\n" + message);
}

function doneWithMessage(text) {
  $done({
    title: "节点详情查询",
    htmlMessage: `<pre>${escapeHtml(text)}</pre>`
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}