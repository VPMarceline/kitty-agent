const cheerio = require("cheerio");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36";

function unwrapBingUrl(href) {
  try {
    const url = new URL(href);
    if (!/(^|\.)bing\.com$/i.test(url.hostname)) return href;
    const encodedTarget = url.searchParams.get("u");
    if (!encodedTarget?.startsWith("a1")) return href;
    return Buffer.from(encodedTarget.slice(2), "base64").toString("utf8");
  } catch {
    return href;
  }
}

function isAllowedProductUrl(url, allowedHosts) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowedHosts.some(
      (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
    );
  } catch {
    return false;
  }
}

async function resolveSogouUrl(href) {
  const url = new URL(href, "https://www.sogou.com");
  if (url.hostname !== "www.sogou.com" || url.pathname !== "/link") return url.href;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    const html = await response.text();
    const scriptMatch = html.match(/window\.location\.replace\(["']([^"']+)["']\)/i);
    const metaMatch = html.match(/URL=['"]?([^'" >]+)/i);
    return scriptMatch?.[1] || metaMatch?.[1] || url.href;
  } catch {
    return url.href;
  }
}

async function searchSogou({ query, platform, allowedHosts }) {
  const searchUrl = new URL("https://www.sogou.com/web");
  searchUrl.searchParams.set("query", query);
  const response = await fetch(searchUrl, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`搜索服务返回 ${response.status}`);

  const $ = cheerio.load(await response.text());
  const candidates = [];
  $(".vrwrap, .rb").each((index, element) => {
    const linkElement = $(element).find("h3 a").first();
    const title = linkElement.text().replace(/\s+/g, " ").trim().slice(0, 180);
    const href = linkElement.attr("href") || "";
    const description = $(element)
      .find(".str-text-info, .ft, .text-layout")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    if (title && href) candidates.push({ title, href, description });
  });

  const resolved = await Promise.all(
    candidates.slice(0, 12).map(async (item) => ({
      ...item,
      url: unwrapBingUrl(await resolveSogouUrl(item.href)),
    }))
  );

  return resolved
    .filter((item) => isAllowedProductUrl(item.url, allowedHosts))
    .map((item) => ({
      title: item.title,
      url: item.url,
      description: item.description,
      source: new URL(item.url).hostname,
      platform,
      price: null,
      currency: "CNY",
      attributes: {},
      merchant: null,
      fetched_at: new Date().toISOString(),
      verified: false,
    }));
}

module.exports = { isAllowedProductUrl, searchSogou, unwrapBingUrl };
