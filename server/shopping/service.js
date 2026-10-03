const { searchSogou } = require("../providers/web-search-provider");
const { normalizeShoppingRequest } = require("./request");

function buildPlatformSearchLinks(query) {
  const encoded = encodeURIComponent(query);
  return {
    jd: `https://search.jd.com/Search?keyword=${encoded}`,
    taobao: `https://s.taobao.com/search?q=${encoded}`,
  };
}

function buildSearchQuery(request) {
  const usefulAttributes = Object.values(request.attributes || {})
    .map(String)
    .filter(Boolean)
    .slice(0, 3);
  return [...new Set([request.query, ...usefulAttributes])].join(" ").trim().slice(0, 80);
}

function createSearchPlan(baseQuery, platforms = ["jd", "taobao"]) {
  const plans = [];
  if (platforms.includes("jd")) {
    plans.push({ platform: "京东", query: `${baseQuery} 京东`, allowedHosts: ["jd.com"] });
  }
  if (platforms.includes("taobao")) {
    plans.push(
      { platform: "天猫", query: `${baseQuery} 天猫`, allowedHosts: ["tmall.com"] },
      { platform: "淘宝", query: `${baseQuery} 淘宝`, allowedHosts: ["taobao.com"] }
    );
  }
  return plans;
}

function scoreProduct(item, request) {
  const haystack = `${item.title} ${item.description}`.toLowerCase();
  const queryTokens = request.query.toLowerCase().split(/\s+/).filter(Boolean);
  const attributeTokens = Object.values(request.attributes || {}).map((item) => String(item).toLowerCase());
  let score = queryTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 30 : 0), 0);
  score += attributeTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 10 : 0), 0);
  score += /jd\.com|taobao\.com|tmall\.com/.test(item.url) ? 10 : 0;
  score += item.price !== null ? 5 : 0;
  return score;
}

function filterAndRankProducts(items, request) {
  const excluded = request.excluded_attributes.map((item) => item.toLowerCase());
  return items
    .filter((item) => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      if (excluded.some((word) => text.includes(word))) return false;
      if (request.budget.max !== null && item.price !== null && item.price > request.budget.max) return false;
      if (request.budget.min !== null && item.price !== null && item.price < request.budget.min) return false;
      return true;
    })
    .map((item) => ({ ...item, recommendation_score: scoreProduct(item, request) }))
    .sort((a, b) => b.recommendation_score - a.recommendation_score);
}

async function searchProducts(input = {}) {
  const request = normalizeShoppingRequest(input);
  if (!request.query || request.query.length < 2) throw new Error("商品名称过短，请补充要购买的商品类别");

  const baseQuery = buildSearchQuery(request);
  const searchPlan = createSearchPlan(baseQuery, request.platforms);
  const responses = await Promise.allSettled(searchPlan.map((plan) => searchSogou(plan)));
  const merged = [];
  const seen = new Set();
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const item of response.value) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        merged.push(item);
      }
    }
  }

  return {
    request,
    search_category: baseQuery,
    searched_at: new Date().toISOString(),
    search_plan: searchPlan.map((item) => item.query),
    search_diagnostics: responses.map((response, index) => ({
      query: searchPlan[index].query,
      status: response.status,
      result_count: response.status === "fulfilled" ? response.value.length : 0,
      error: response.status === "rejected" ? String(response.reason?.message || response.reason) : null,
    })),
    platform_search_links: buildPlatformSearchLinks(baseQuery),
    results: filterAndRankProducts(merged, request).slice(0, request.max_results),
  };
}

function isDirectProductPage(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "item.jd.com" ||
      parsed.hostname === "detail.tmall.com" ||
      (/\.taobao\.com$/.test(parsed.hostname) && /\/list\/item\/|\/item\.htm/.test(parsed.pathname))
    );
  } catch {
    return false;
  }
}

function formatProductSearchResponse(result) {
  const searchedAt = new Date(result.searched_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const direct = result.results.filter((item) => isDirectProductPage(item.url));
  const candidates = (direct.length > 0 ? direct : result.results).slice(0, 5);
  const links = result.platform_search_links;
  if (candidates.length === 0) {
    return [
      `本猫已在 ${searchedAt} 搜索“${result.search_category}”，但没有取得可验证的商品页。`,
      "你可以打开平台搜索页继续筛选：",
      links.jd ? `- [京东搜索](${links.jd})` : null,
      links.taobao ? `- [淘宝搜索](${links.taobao})` : null,
    ].filter(Boolean).join("\n");
  }

  const lines = [`本猫已在 ${searchedAt} 检索“${result.search_category}”。以下是可打开的候选商品页：`, ""];
  candidates.forEach((item, index) => lines.push(`${index + 1}. [${item.title}](${item.url})（${item.platform}）`));
  lines.push(
    "",
    "搜索摘要通常没有可靠的实时到手价、库存和完整规格，因此我不会猜测这些信息。请打开商品页核对价格、型号、参数和售后；价格以结算页为准。",
    "",
    "你也可以把候选商品的价格和参数发给我，我可以继续按预算与要求进行确定性比较。"
  );
  return lines.join("\n");
}

module.exports = {
  buildPlatformSearchLinks,
  createSearchPlan,
  filterAndRankProducts,
  formatProductSearchResponse,
  searchProducts,
};
