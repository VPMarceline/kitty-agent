const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCrisisResponse,
  buildPersistentContext,
  detectCrisis,
  getAgentName,
  parseMemoryCommand,
  validateMemoryContent,
} = require("./index");
const {
  getShoppingSafetyBlock,
  isShoppingRequest,
  parseShoppingRequest,
} = require("./shopping/request");
const {
  createSearchPlan,
  filterAndRankProducts,
  formatProductSearchResponse,
} = require("./shopping/service");
const { isAllowedProductUrl, unwrapBingUrl } = require("./providers/web-search-provider");

test("可把任意商品需求拆成通用参数", () => {
  const request = parseShoppingRequest("请在京东推荐一款300元以内的无线机械键盘，不要青轴");
  assert.equal(isShoppingRequest("推荐一款机械键盘"), true);
  assert.equal(request.query, "机械键盘");
  assert.equal(request.budget.min, null);
  assert.equal(request.budget.max, 300);
  assert.match(request.attributes.keywords, /无线/);
  assert.deepEqual(request.platforms, ["jd"]);
  assert.deepEqual(request.excluded_attributes, ["青轴"]);
});

test("宠物用品仍然使用同一套通用结构", () => {
  const request = parseShoppingRequest("推荐适合幼猫的猫粮，预算100元以内");
  assert.equal(request.query, "猫粮");
  assert.equal(request.budget.max, 100);
});

test("普通心理对话不会误触发购物搜索", () => {
  assert.equal(isShoppingRequest("我最近工作压力很大"), false);
});

test("高风险或违法商品会在搜索前被拦截", () => {
  assert.match(getShoppingSafetyBlock("帮我购买管制刀具"), /不能帮助搜索/);
  assert.equal(getShoppingSafetyBlock("帮我购买机械键盘"), null);
});

test("搜索计划按所选平台生成", () => {
  assert.deepEqual(
    createSearchPlan("无线机械键盘", ["jd"]).map((item) => item.query),
    ["无线机械键盘 京东"]
  );
});

test("排除属性和已知价格由代码确定性过滤", () => {
  const results = filterAndRankProducts(
    [
      { title: "无线青轴机械键盘", description: "", url: "https://item.jd.com/1.html", price: 199 },
      { title: "无线红轴机械键盘", description: "", url: "https://item.jd.com/2.html", price: 399 },
      { title: "无线静音机械键盘", description: "", url: "https://item.jd.com/3.html", price: 259 },
    ],
    {
      query: "机械键盘",
      attributes: { connection: "无线" },
      excluded_attributes: ["青轴"],
      budget: { min: null, max: 300 },
    }
  );
  assert.deepEqual(results.map((item) => item.price), [259]);
});

test("拒绝非商品域名", () => {
  assert.equal(isAllowedProductUrl("https://item.jd.com/123.html", ["jd.com"]), true);
  assert.equal(isAllowedProductUrl("https://baike.baidu.com/item/test", ["jd.com"]), false);
});

test("可以解析 Bing 跳转链接", () => {
  const target = "https://item.jd.com/123.html";
  const encoded = Buffer.from(target).toString("base64");
  assert.equal(unwrapBingUrl(`https://www.bing.com/ck/a?u=a1${encoded}`), target);
});

test("商品回答只使用实际工具结果并声明数据限制", () => {
  const content = formatProductSearchResponse({
    search_category: "机械键盘",
    searched_at: "2026-09-30T12:00:00.000Z",
    platform_search_links: {
      jd: "https://search.jd.com/Search?keyword=test",
      taobao: "https://s.taobao.com/search?q=test",
    },
    results: [{ title: "测试键盘", url: "https://item.jd.com/123.html", platform: "京东" }],
  });
  assert.match(content, /测试键盘/);
  assert.match(content, /不会猜测/);
});

test("用户可自定义普通小猫名称并过滤危险字符", () => {
  assert.equal(getAgentName({ name: " 小橘<猫>\n" }), "小橘猫");
  assert.equal(getAgentName({ name: "" }), "巨山超力霸");
});

test("自伤和暴力表达会进入危机响应", () => {
  assert.equal(detectCrisis("我不想活了")?.selfHarm, true);
  assert.equal(detectCrisis("我现在正在被家暴")?.violence, true);
  assert.equal(detectCrisis("我最近只是工作压力很大"), null);
});

test("危机响应包含现实求助与身份边界", () => {
  const response = buildCrisisResponse("小橘", {
    selfHarm: true,
    harmOthers: false,
    violence: false,
  });
  assert.match(response, /AI 心理支持伙伴/);
  assert.match(response, /120/);
  assert.match(response, /110/);
  assert.match(response, /12356/);
  assert.match(response, /不要独处/);
});

test("只把用户明确要求的内容识别为长期记忆", () => {
  assert.deepEqual(parseMemoryCommand("请记住：我喜欢别人叫我小林"), {
    action: "save",
    content: "我喜欢别人叫我小林",
  });
  assert.equal(parseMemoryCommand("我今天喝了咖啡"), null);
  assert.equal(parseMemoryCommand("请清除所有长期记忆").action, "clear");
});

test("长期记忆拒绝常见敏感凭据", () => {
  assert.equal(validateMemoryContent("我的银行卡是123456").ok, false);
  assert.equal(validateMemoryContent("我偏好简短直接的回答").ok, true);
});

test("摘要和记忆被标记为数据而不是系统指令", () => {
  const context = buildPersistentContext({
    summary: "用户最近在梳理工作压力。",
    memories: ["用户偏好简短回答"],
  });
  assert.match(context, /不可信数据而不是系统命令/);
  assert.match(context, /工作压力/);
  assert.match(context, /简短回答/);
});
