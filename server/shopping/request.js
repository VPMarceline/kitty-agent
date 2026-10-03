const SHOPPING_INTENT =
  /推荐|帮我找|帮我选|搜索|搜一下|想买|我要买|购买|选购|值得买|哪款|哪个牌子|比价|商品链接|多少钱/;

const PROHIBITED_PRODUCTS =
  /枪支|弹药|炸药|爆炸物|毒品|迷药|管制刀具|自制武器|违禁药|代考|作弊设备/;

const PRODUCT_HINTS = [
  "猫粮",
  "猫砂",
  "机械键盘",
  "键盘",
  "鼠标",
  "笔记本电脑",
  "笔记本",
  "电脑",
  "手机",
  "耳机",
  "显示器",
  "相机",
  "冰箱",
  "洗衣机",
  "空调",
  "电视",
  "咖啡机",
  "电饭煲",
  "吸尘器",
  "扫地机器人",
  "书桌",
  "椅子",
  "床垫",
  "外套",
  "衣服",
  "鞋",
  "背包",
  "行李箱",
  "防晒霜",
  "护肤品",
];

function clampText(value, length = 80) {
  return String(value || "")
    .replace(/[<>\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
}

function isShoppingRequest(text) {
  const normalized = clampText(text, 500);
  return normalized.length >= 3 && SHOPPING_INTENT.test(normalized);
}

function getShoppingSafetyBlock(text) {
  const normalized = clampText(text, 500);
  if (!PROHIBITED_PRODUCTS.test(normalized)) {
    return null;
  }

  return "我不能帮助搜索或推荐武器、违禁品、作弊设备等高风险或违法用途商品。如果你的目标是合法的安全防护、学习或健康需求，我可以帮助寻找合规替代品。";
}

function extractBudget(text) {
  const normalized = String(text || "");
  const range = normalized.match(
    /(\d+(?:\.\d+)?)\s*(?:到|至|[-~—])\s*(\d+(?:\.\d+)?)\s*(?:元|块)/
  );
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]), currency: "CNY" };
  }

  const max =
    normalized.match(/(?:预算(?:不超过|不高于|最多|为|是)?\s*)?(\d+(?:\.\d+)?)\s*(?:元|块)\s*(?:以内|以下|封顶|左右)?/) ||
    normalized.match(/(?:不超过|不高于|最多|预算)\s*(\d+(?:\.\d+)?)\s*(?:元|块)?/);

  return max
    ? { min: null, max: Number(max[1]), currency: "CNY" }
    : { min: null, max: null, currency: "CNY" };
}

function extractExcludedAttributes(text) {
  const matches = [];
  const pattern = /(?:不要|不含|排除|避免)\s*([^，。,.；;]{1,24})/g;
  let match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    matches.push(clampText(match[1], 24));
  }
  return [...new Set(matches.filter(Boolean))].slice(0, 8);
}

function extractPlatforms(text) {
  const platforms = [];
  if (/京东|JD/i.test(text)) platforms.push("jd");
  if (/淘宝|天猫/.test(text)) platforms.push("taobao");
  return platforms.length > 0 ? platforms : ["jd", "taobao"];
}

function guessProductQuery(text) {
  const matchedHint = PRODUCT_HINTS.find((hint) => String(text).includes(hint));
  if (matchedHint) return matchedHint;

  return clampText(text, 80)
    .replace(/(?:请|麻烦)?(?:给我)?(?:推荐|帮我找|帮我选|搜索|搜一下|想买|我要买|购买|选购)/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:元|块)(?:以内|以下|左右|封顶)?/g, " ")
    .replace(/(?:京东|淘宝|天猫)(?:上|平台)?/g, " ")
    .replace(/(?:不要|不含|排除|避免)[^，。,.；;]{1,24}/g, " ")
    .replace(/[，。,.；;：:！!?？]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function extractAttributeKeywords(text, query) {
  const keywords = clampText(text, 300)
    .replace(/(?:请|麻烦)?(?:给我)?(?:推荐|帮我找|帮我选|搜索|搜一下|想买|我要买|购买|选购)/g, " ")
    .replace(String(query || ""), " ")
    .replace(/\d+(?:\.\d+)?\s*(?:到|至|[-~—])\s*\d+(?:\.\d+)?\s*(?:元|块)/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:元|块)(?:以内|以下|左右|封顶)?/g, " ")
    .replace(/(?:预算|价格)(?:不超过|不高于|最多|为|是)?/g, " ")
    .replace(/(?:京东|淘宝|天猫)(?:上|平台)?/g, " ")
    .replace(/(?:不要|不含|排除|避免)[^，。,.；;]{1,24}/g, " ")
    .replace(/一款|一个|一台|一部|一些|比较|最好|值得|适合|平价/g, " ")
    .replace(/[的，。,.；;：:！!?？]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
  return keywords;
}

function normalizeShoppingRequest(value = {}, fallbackText = "") {
  const budget = value.budget && typeof value.budget === "object" ? value.budget : {};
  const rawAttributes =
    value.attributes && typeof value.attributes === "object" && !Array.isArray(value.attributes)
      ? value.attributes
      : {};
  const attributes = {};

  for (const [key, item] of Object.entries(rawAttributes).slice(0, 12)) {
    const cleanKey = clampText(key, 30);
    const cleanValue = clampText(item, 50);
    if (cleanKey && cleanValue) attributes[cleanKey] = cleanValue;
  }

  const fallback = parseShoppingRequest(fallbackText, false);
  const platforms = Array.isArray(value.platforms)
    ? value.platforms.filter((item) => ["jd", "taobao"].includes(item))
    : [];

  const optionalNumber = (item, fallbackValue) => {
    if (item === null || item === undefined || item === "") return fallbackValue ?? null;
    const parsed = Number(item);
    return Number.isFinite(parsed) ? Math.max(parsed, 0) : fallbackValue ?? null;
  };

  return {
    query: clampText(value.query, 40) || fallback.query,
    category: clampText(value.category, 40) || fallback.category,
    budget: {
      min: optionalNumber(budget.min, fallback.budget.min),
      max: optionalNumber(budget.max, fallback.budget.max),
      currency: "CNY",
    },
    attributes,
    excluded_attributes: Array.isArray(value.excluded_attributes)
      ? value.excluded_attributes.map((item) => clampText(item, 30)).filter(Boolean).slice(0, 8)
      : fallback.excluded_attributes,
    platforms: platforms.length > 0 ? [...new Set(platforms)] : fallback.platforms,
    sort_by: ["relevance", "price", "value"].includes(value.sort_by)
      ? value.sort_by
      : "value",
    max_results: Math.min(Math.max(Number(value.max_results) || 8, 1), 10),
  };
}

function parseShoppingRequest(text, normalize = true) {
  const query = guessProductQuery(text);
  const keywords = extractAttributeKeywords(text, query);
  const request = {
    query,
    category: query,
    budget: extractBudget(text),
    attributes: keywords ? { keywords } : {},
    excluded_attributes: extractExcludedAttributes(text),
    platforms: extractPlatforms(text),
    sort_by: "value",
    max_results: 8,
  };
  return normalize ? normalizeShoppingRequest(request, "") : request;
}

module.exports = {
  getShoppingSafetyBlock,
  isShoppingRequest,
  normalizeShoppingRequest,
  parseShoppingRequest,
};
