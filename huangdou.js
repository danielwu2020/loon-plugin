/**
 * 黄豆短剧 — Cloudflare Worker 二进制代理
 *
 * 部署：在 Cloudflare Dashboard → Workers & Pages → Create Worker
 * 粘贴此代码 → Deploy → 复制 Worker URL（如 https://huangdou-proxy.xxx.workers.dev）
 *
 * 原理：
 *   Forward App 的 Widget.http.post 无法发送二进制 body（被 JSON.stringify）
 *   此 Worker 充当中继：
 *     1. 模块将加密二进制 body 编码为 base64 字符串发到 Worker
 *     2. Worker 解码 base64 → 原始二进制，转发到黄豆短剧 API
 *     3. Worker 收到二进制响应 → 编码为 base64 → 返回给模块
 *   模块只需收发 base64 字符串（纯 ASCII），完全绕过 Widget.http.post 限制
 *
 * 使用：
 *   在 Forward 模块设置中填入 Worker URL
 *   模块自动检测：有 fetch → 直连；无 fetch → 走 Worker 代理
 */

const LINES = [
  "https://lzlukvca.cc",
  "https://psfxhhox.top",
  "https://sxqirtho.top",
  "https://qicuknlj.top",
  "https://hddj05.com",
  "https://hddj06.com",
  "https://hddj07.com",
  "https://hvthtcpa.top",
];

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    try {
      // 解析请求：JSON { url, body_b64, headers }
      const reqData = await request.json();
      const targetUrl = reqData.url;
      const bodyB64 = reqData.body_b64 || "";
      const headers = reqData.headers || {};

      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Missing url" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // 安全检查：URL 必须是黄豆短剧的线路
      const isAllowed = LINES.some((line) => targetUrl.startsWith(line));
      if (!isAllowed) {
        return new Response(JSON.stringify({ error: "URL not allowed" }), {
          status: 403,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // 解码 base64 body → 二进制
      const bodyBytes = bodyB64
        ? Uint8Array.from(atob(bodyB64), (c) => c.charCodeAt(0))
        : null;

      // 转发到上游
      const fetchOptions = {
        method: "POST",
        headers: headers,
      };
      if (bodyBytes) {
        fetchOptions.body = bodyBytes;
      }

      const upstreamResp = await fetch(targetUrl, fetchOptions);
      const respBuffer = await upstreamResp.arrayBuffer();
      const respBytes = new Uint8Array(respBuffer);

      // 编码响应为 base64
      let respB64 = "";
      const chunkSize = 32768;
      for (let i = 0; i < respBytes.length; i += chunkSize) {
        const chunk = respBytes.subarray(i, Math.min(i + chunkSize, respBytes.length));
        respB64 += btoa(String.fromCharCode.apply(null, chunk));
      }

      return new Response(
        JSON.stringify({
          status: upstreamResp.status,
          body_b64: respB64,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e.message || "Proxy error" }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
