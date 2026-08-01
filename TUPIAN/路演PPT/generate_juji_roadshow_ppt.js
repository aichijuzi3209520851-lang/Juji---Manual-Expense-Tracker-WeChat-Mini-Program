const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const imageSize = require("image-size");

const pptx = new pptxgen();
pptx.defineLayout({ name: "JUJI_16_9", width: 10, height: 5.625 });
pptx.layout = "JUJI_16_9";
pptx.author = "橘记 Juji";
pptx.company = "橘记";
pptx.subject = "竞赛路演汇报";
pptx.title = "橘记 Juji - 大模型驱动的对话式智能记账微信小程序";
pptx.lang = "zh-CN";
pptx.theme = {
  headFontFace: "Microsoft YaHei",
  bodyFontFace: "Microsoft YaHei",
  lang: "zh-CN"
};
pptx.layout = "JUJI_16_9";
pptx.margin = 0;

const ROOT = path.resolve(__dirname, "..", "..");
const TUPIAN = path.join(ROOT, "TUPIAN");
const OVERVIEW = path.join(TUPIAN, "概要设计配图");
const DB_DESIGN = path.join(TUPIAN, "数据库设计配图");
const DB_SHOTS = path.join(TUPIAN, "数据库");
const DOCS = path.join(ROOT, "docs");
const OUT_DIR = __dirname;
const OUT_FILE = path.join(OUT_DIR, "橘记_作品展示路演汇报.pptx");

const assets = {
  xiaoju: path.join(DOCS, "xiaoju.png"),
  home: path.join(TUPIAN, "首页展示.png"),
  record: path.join(TUPIAN, "记一笔界面展示.png"),
  aiBilling: path.join(TUPIAN, "小橘帮忙记账的界面展示.png"),
  aiChat: path.join(TUPIAN, "小橘对话界面展示.png"),
  stats: path.join(TUPIAN, "统计页面展示.png"),
  aiNote: path.join(TUPIAN, "小橘的便签展示界面.png"),
  profile: path.join(TUPIAN, "我的页面展示.png"),
  aiLetter: path.join(TUPIAN, "小橘心里话功能界面展示.png"),
  titleData: path.join(TUPIAN, "称号数据展示界面.png"),
  theme: path.join(TUPIAN, "主题选择与设置界面展示.png"),
  featureMap: path.join(TUPIAN, "前端页面示例图.png"),
  budget: path.join(TUPIAN, "预算界面展示.png"),
  detail: path.join(TUPIAN, "账单详情页面展示.png"),
  architecture: path.join(OVERVIEW, "图2-1_橘记系统五层架构图.png"),
  aiFlow: path.join(OVERVIEW, "图6-2_对话记账运行流程图.png"),
  dataAccess: path.join(DB_DESIGN, "图2-1_数据访问架构图.png"),
  dataModel: path.join(DB_DESIGN, "图3-1_数据模型实体关系图.png"),
  permission: path.join(DB_DESIGN, "图9-1_数据权限三层防线示意图.png"),
  cloudFunctions: path.join(DB_SHOTS, "云函数.png"),
  dbCollections: path.join(DB_SHOTS, "数据库集合管理.png"),
  dbPermission: path.join(DB_SHOTS, "数据权限.png"),
  dbCalls: path.join(DB_SHOTS, "数据库调用总览.png"),
  storage: path.join(DB_SHOTS, "存储管理.png")
};

const theme = {
  primary: "27C07D",
  primaryDeep: "159764",
  mint: "CBF3F0",
  mintSoft: "EAF8F1",
  bg: "F6FBF8",
  surface: "FFFFFF",
  text: "17211D",
  muted: "60796D",
  line: "CFE5D8",
  orange: "FF9F1C",
  orangeSoft: "FFF0D5",
  blue: "5BA4CB",
  blueSoft: "E8F5FB",
  purple: "8B5CF6",
  purpleSoft: "F0ECFF",
  pink: "FB7299",
  pinkSoft: "FFF0F5",
  red: "BA1A1A",
  gray: "F5F7F6",
  gray2: "E8EFEB",
  dark: "0F1F19"
};

const W = 10;
const H = 5.625;
const S = pptx.ShapeType;

function checkAssets() {
  const missing = Object.entries(assets).filter(([, p]) => !fs.existsSync(p));
  if (missing.length) {
    throw new Error("缺少素材:\n" + missing.map(([k, p]) => `${k}: ${p}`).join("\n"));
  }
}

function meta(imgPath) {
  return imageSize.imageSize ? imageSize.imageSize(imgPath) : imageSize(imgPath);
}

function contain(imgPath, box) {
  const m = meta(imgPath);
  const rw = box.w / m.width;
  const rh = box.h / m.height;
  const r = Math.min(rw, rh);
  const w = m.width * r;
  const h = m.height * r;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function cover(imgPath, box) {
  const m = meta(imgPath);
  const rw = box.w / m.width;
  const rh = box.h / m.height;
  const r = Math.max(rw, rh);
  const w = m.width * r;
  const h = m.height * r;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function shadow(opacity = 0.12, blur = 2, offset = 1) {
  return { type: "outer", color: "000000", opacity, blur, offset, angle: 45 };
}

function bg(slide, color = theme.bg) {
  slide.background = { color };
}

function addPageNum(slide, n) {
  if (n === 1) return;
  slide.addShape(S.roundRect, {
    x: 9.18, y: 5.12, w: 0.48, h: 0.28,
    fill: { color: theme.primary },
    line: { color: theme.primary },
    rectRadius: 0.12
  });
  slide.addText(String(n).padStart(2, "0"), {
    x: 9.18, y: 5.165, w: 0.48, h: 0.15,
    margin: 0, align: "center", valign: "middle",
    fontFace: "Arial", fontSize: 8.5, color: "FFFFFF", bold: true
  });
}

function addHeader(slide, n, title, section) {
  slide.addText(section || "JUJI ROADSHOW", {
    x: 0.55, y: 0.34, w: 2.5, h: 0.2,
    margin: 0, fontFace: "Arial", fontSize: 7.5,
    charSpacing: 1.2, color: theme.primaryDeep, bold: true
  });
  slide.addText(title, {
    x: 0.55, y: 0.58, w: 7.8, h: 0.5,
    margin: 0, fontFace: "Microsoft YaHei", fontSize: 25,
    color: theme.text, bold: true, fit: "shrink"
  });
  slide.addShape(S.ellipse, {
    x: 8.92, y: 0.44, w: 0.25, h: 0.25,
    fill: { color: theme.orange },
    line: { color: theme.orange }
  });
  slide.addShape(S.ellipse, {
    x: 9.17, y: 0.44, w: 0.25, h: 0.25,
    fill: { color: theme.primary },
    line: { color: theme.primary }
  });
  addPageNum(slide, n);
}

function addText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x, y, w, h, margin: opts.margin ?? 0.03,
    fontFace: opts.fontFace || "Microsoft YaHei",
    fontSize: opts.fontSize || 13,
    color: opts.color || theme.text,
    bold: !!opts.bold,
    align: opts.align || "left",
    valign: opts.valign || "top",
    breakLine: opts.breakLine,
    fit: opts.fit || "shrink",
    paraSpaceAfterPt: opts.paraSpaceAfterPt || 0,
    rotate: opts.rotate || 0
  });
}

function addCard(slide, x, y, w, h, opts = {}) {
  const shapeOpts = {
    x, y, w, h,
    fill: { color: opts.fill || theme.surface, transparency: opts.transparency || 0 },
    line: { color: opts.line || theme.line, transparency: opts.lineTransparency || 0, width: opts.lineWidth || 0.7 },
    rectRadius: opts.radius || 0.16
  };
  if (opts.shadow !== false) shapeOpts.shadow = shadow(opts.shadowOpacity || 0.08, 1.5, 0.8);
  slide.addShape(S.roundRect, shapeOpts);
}

function addTag(slide, text, x, y, w, color = theme.primary, fill = theme.mintSoft) {
  slide.addShape(S.roundRect, {
    x, y, w, h: 0.28,
    fill: { color: fill },
    line: { color: fill },
    rectRadius: 0.13
  });
  addText(slide, text, x + 0.08, y + 0.06, w - 0.16, 0.12, {
    fontSize: 8.5, color, bold: true, align: "center"
  });
}

function addImageContain(slide, imgPath, x, y, w, h, opts = {}) {
  if (opts.bg) {
    addCard(slide, x, y, w, h, { fill: opts.bg, line: opts.line || opts.bg, radius: opts.radius || 0.14, shadowOpacity: opts.shadowOpacity || 0.06 });
  }
  const d = contain(imgPath, { x, y, w, h });
  slide.addImage({ path: imgPath, x: d.x, y: d.y, w: d.w, h: d.h, altText: opts.alt || path.basename(imgPath) });
}

function addImageCover(slide, imgPath, x, y, w, h, opts = {}) {
  const d = cover(imgPath, { x, y, w, h });
  if (opts.bg) addCard(slide, x, y, w, h, { fill: opts.bg, line: opts.bg, radius: opts.radius || 0.14, shadowOpacity: 0.05 });
  slide.addImage({ path: imgPath, x: d.x, y: d.y, w: d.w, h: d.h, altText: opts.alt || path.basename(imgPath) });
}

function addPhone(slide, imgPath, x, y, w, h, label, opts = {}) {
  addShapePhoneShadow(slide, x, y, w, h, opts);
  addImageContain(slide, imgPath, x + 0.05, y + 0.05, w - 0.1, h - 0.1);
  if (label) {
    addTag(slide, label, x + 0.18, y + h - 0.42, Math.min(w - 0.36, 1.7), opts.labelColor || theme.primary, opts.labelFill || "FFFFFF");
  }
}

function addShapePhoneShadow(slide, x, y, w, h, opts = {}) {
  slide.addShape(S.roundRect, {
    x, y, w, h,
    fill: { color: opts.frame || "111111", transparency: opts.frameTransparency || 0 },
    line: { color: opts.frame || "111111", transparency: 100 },
    rectRadius: 0.28,
    shadow: shadow(opts.shadowOpacity || 0.16, 2.2, 1.1)
  });
  slide.addShape(S.roundRect, {
    x: x + 0.04, y: y + 0.04, w: w - 0.08, h: h - 0.08,
    fill: { color: opts.inner || "FFFFFF" },
    line: { color: opts.inner || "FFFFFF", transparency: 100 },
    rectRadius: 0.25
  });
}

function addIconCircle(slide, text, x, y, color = theme.primary, fill = theme.mintSoft) {
  slide.addShape(S.ellipse, {
    x, y, w: 0.46, h: 0.46,
    fill: { color: fill },
    line: { color: fill }
  });
  addText(slide, text, x, y + 0.12, 0.46, 0.16, {
    fontSize: 9.5, color, bold: true, align: "center"
  });
}

function addBullet(slide, title, body, x, y, w, accent = theme.primary) {
  addIconCircle(slide, "", x, y + 0.02, accent, accent === theme.orange ? theme.orangeSoft : theme.mintSoft);
  slide.addShape(S.ellipse, {
    x: x + 0.16, y: y + 0.18, w: 0.14, h: 0.14,
    fill: { color: accent },
    line: { color: accent }
  });
  addText(slide, title, x + 0.58, y, w - 0.58, 0.24, { fontSize: 13.8, bold: true });
  addText(slide, body, x + 0.58, y + 0.3, w - 0.58, 0.42, { fontSize: 10.5, color: theme.muted });
}

function addStep(slide, n, title, body, x, y, w, h, accent = theme.primary) {
  addCard(slide, x, y, w, h, { fill: "FFFFFF", line: accent, lineTransparency: 20, radius: 0.14, shadowOpacity: 0.06 });
  slide.addShape(S.ellipse, {
    x: x + 0.15, y: y + 0.18, w: 0.36, h: 0.36,
    fill: { color: accent },
    line: { color: accent }
  });
  addText(slide, String(n), x + 0.15, y + 0.27, 0.36, 0.12, { fontSize: 9.5, color: "FFFFFF", bold: true, align: "center" });
  addText(slide, title, x + 0.62, y + 0.16, w - 0.78, 0.25, { fontSize: 13, bold: true });
  addText(slide, body, x + 0.62, y + 0.48, w - 0.78, h - 0.6, { fontSize: 9.7, color: theme.muted });
}

function addMiniMetric(slide, value, label, x, y, w, accent = theme.primary) {
  addCard(slide, x, y, w, 0.86, { fill: "FFFFFF", line: theme.line, radius: 0.14, shadowOpacity: 0.05 });
  addText(slide, value, x + 0.12, y + 0.16, w - 0.24, 0.28, { fontSize: 20, color: accent, bold: true, align: "center" });
  addText(slide, label, x + 0.08, y + 0.52, w - 0.16, 0.16, { fontSize: 8.8, color: theme.muted, align: "center" });
}

function addTinyPhone(slide, imgPath, x, y, label) {
  addPhone(slide, imgPath, x, y, 1.16, 2.35, label, { shadowOpacity: 0.1 });
}

function addSectionBadge(slide, text, x, y, fill = theme.dark, color = "FFFFFF") {
  slide.addShape(S.roundRect, {
    x, y, w: 1.36, h: 0.36,
    fill: { color: fill },
    line: { color: fill },
    rectRadius: 0.16
  });
  addText(slide, text, x + 0.08, y + 0.1, 1.2, 0.12, { fontSize: 8.8, color, bold: true, align: "center" });
}

function slide1() {
  const slide = pptx.addSlide();
  bg(slide, "F3FBF7");
  slide.addShape(S.rect, { x: 0, y: 0, w: 3.45, h: H, fill: { color: theme.dark }, line: { color: theme.dark } });
  slide.addShape(S.rect, { x: 3.45, y: 0, w: 6.55, h: H, fill: { color: "F3FBF7" }, line: { color: "F3FBF7" } });
  addText(slide, "橘记", 0.58, 0.78, 2.1, 0.72, { fontSize: 48, color: "FFFFFF", bold: true });
  addText(slide, "JUJI", 0.6, 1.55, 1.5, 0.28, { fontFace: "Arial", fontSize: 12, color: theme.orange, bold: true, charSpacing: 1.2 });
  addText(slide, "大模型驱动的\n对话式智能记账\n微信小程序", 0.6, 2.06, 2.35, 1.38, { fontSize: 23, color: "FFFFFF", bold: true, breakLine: true });
  addText(slide, "打开就记，记完就走。\n陪伴你的是 AI 助手「小橘」。", 0.62, 3.76, 2.4, 0.7, { fontSize: 12.8, color: "CFEFE1" });
  addSectionBadge(slide, "竞赛路演汇报", 0.62, 4.72, theme.primary, "FFFFFF");
  addPhone(slide, assets.home, 3.95, 0.55, 1.85, 4.3, "首页");
  addPhone(slide, assets.record, 5.75, 0.75, 1.9, 4.45, "记一笔", { shadowOpacity: 0.12 });
  addPhone(slide, assets.aiBilling, 7.46, 0.42, 1.95, 4.55, "小橘 AI");
  slide.addImage({ path: assets.xiaoju, x: 2.32, y: 0.52, w: 1.18, h: 1.25, altText: "小橘" });
  slide.addShape(S.ellipse, { x: 8.9, y: 0.62, w: 0.18, h: 0.18, fill: { color: theme.orange }, line: { color: theme.orange } });
  slide.addShape(S.ellipse, { x: 9.12, y: 0.62, w: 0.18, h: 0.18, fill: { color: theme.primary }, line: { color: theme.primary } });
}

function slide2() {
  const slide = pptx.addSlide();
  bg(slide);
  addHeader(slide, 2, "汇报路线", "OVERVIEW");
  const items = [
    ["01", "作品定位", "为什么做橘记，以及它解决什么问题", theme.primary, theme.mintSoft],
    ["02", "产品体验", "从记一笔到复盘、预算和成长体系", theme.orange, theme.orangeSoft],
    ["03", "AI 创新", "小橘聊天、问账、对话记账的闭环", theme.blue, theme.blueSoft],
    ["04", "系统实现", "原生小程序 + CloudBase + 混元模型", theme.purple, theme.purpleSoft],
    ["05", "成果展望", "作品价值、工程完整度与后续规划", theme.pink, theme.pinkSoft]
  ];
  items.forEach((it, i) => {
    const x = 0.7 + (i % 3) * 3.0;
    const y = i < 3 ? 1.45 : 3.28;
    const w = i < 3 ? 2.52 : 3.15;
    addCard(slide, x, y, w, 1.35, { fill: it[4], line: it[4], radius: 0.18, shadowOpacity: 0.06 });
    addText(slide, it[0], x + 0.18, y + 0.18, 0.64, 0.34, { fontFace: "Arial", fontSize: 22, color: it[3], bold: true });
    addText(slide, it[1], x + 0.18, y + 0.62, w - 0.36, 0.25, { fontSize: 15, color: theme.text, bold: true });
    addText(slide, it[2], x + 0.18, y + 0.96, w - 0.36, 0.23, { fontSize: 9.5, color: theme.muted });
  });
  slide.addImage({ path: assets.xiaoju, x: 7.72, y: 3.02, w: 1.1, h: 1.16, altText: "小橘" });
  addText(slide, "路线逻辑：先让评委看到作品能解决问题，再展示它为什么有技术含量。", 0.72, 4.88, 7.6, 0.28, { fontSize: 11, color: theme.muted });
}

function slide3() {
  const slide = pptx.addSlide();
  bg(slide, "FFFFFF");
  addHeader(slide, 3, "为什么还需要一个记账工具", "PROBLEM");
  const pains = [
    ["手动麻烦", "每天打开表单逐项输入，习惯很难长期坚持。", theme.primary],
    ["复盘薄弱", "只有流水和饼图，缺少可读的消费反馈。", theme.orange],
    ["缺少陪伴", "传统记账工具像账本，不像能交流的助手。", theme.blue],
    ["安全顾虑", "消费数据敏感，需要清晰的数据隔离和权限设计。", theme.purple]
  ];
  pains.forEach((p, i) => {
    const x = 0.65 + (i % 2) * 3.0;
    const y = 1.36 + Math.floor(i / 2) * 1.62;
    addCard(slide, x, y, 2.68, 1.18, { fill: "FFFFFF", line: p[2], lineTransparency: 35, radius: 0.16, shadowOpacity: 0.07 });
    slide.addShape(S.ellipse, { x: x + 0.18, y: y + 0.18, w: 0.36, h: 0.36, fill: { color: p[2] }, line: { color: p[2] } });
    addText(slide, String(i + 1), x + 0.18, y + 0.27, 0.36, 0.12, { fontFace: "Arial", fontSize: 9, color: "FFFFFF", bold: true, align: "center" });
    addText(slide, p[0], x + 0.66, y + 0.18, 1.65, 0.24, { fontSize: 14, bold: true });
    addText(slide, p[1], x + 0.66, y + 0.52, 1.74, 0.38, { fontSize: 9.8, color: theme.muted });
  });
  addPhone(slide, assets.home, 7.0, 1.02, 1.95, 4.25, "真实账单流水");
  addText(slide, "用户不是不想记账，而是不想为了记账付出过高成本。", 0.72, 4.78, 5.66, 0.36, { fontSize: 15, color: theme.primaryDeep, bold: true });
}

function slide4() {
  const slide = pptx.addSlide();
  bg(slide);
  addHeader(slide, 4, "橘记的解决方案", "SOLUTION");
  addCard(slide, 3.84, 1.45, 2.28, 2.28, { fill: theme.dark, line: theme.dark, radius: 0.28, shadowOpacity: 0.15 });
  slide.addImage({ path: assets.xiaoju, x: 4.43, y: 1.74, w: 1.08, h: 1.14, altText: "小橘" });
  addText(slide, "小橘 AI 助手", 4.06, 2.96, 1.82, 0.28, { fontSize: 15.5, color: "FFFFFF", bold: true, align: "center" });
  addText(slide, "把记账变成对话", 4.12, 3.28, 1.7, 0.18, { fontSize: 9.2, color: "CFEFE1", align: "center" });
  const cards = [
    ["打开就记", "首页与记账页信息密度低，核心动作一步到位。", 0.78, 1.24, theme.primary],
    ["动嘴记账", "一句口语拆成多笔账单，确认后批量写入。", 6.72, 1.24, theme.orange],
    ["自动复盘", "趋势、排行、AI 便签让流水变成反馈。", 0.78, 3.42, theme.blue],
    ["长期陪伴", "足迹、称号、心里话和主题让用户愿意留下。", 6.72, 3.42, theme.purple]
  ];
  cards.forEach(c => {
    addCard(slide, c[2], c[3], 2.18, 1.1, { fill: "FFFFFF", line: c[4], lineTransparency: 30, radius: 0.18, shadowOpacity: 0.06 });
    addText(slide, c[0], c[2] + 0.2, c[3] + 0.18, 1.66, 0.24, { fontSize: 14.3, color: c[4], bold: true });
    addText(slide, c[1], c[2] + 0.2, c[3] + 0.52, 1.74, 0.36, { fontSize: 9.3, color: theme.muted });
  });
  slide.addShape(S.line, { x: 2.95, y: 1.78, w: 0.75, h: 0.55, line: { color: theme.line, width: 1.2 } });
  slide.addShape(S.line, { x: 6.15, y: 1.78, w: 0.55, h: 0.55, line: { color: theme.line, width: 1.2 } });
  slide.addShape(S.line, { x: 2.95, y: 3.95, w: 0.75, h: -0.55, line: { color: theme.line, width: 1.2 } });
  slide.addShape(S.line, { x: 6.15, y: 3.95, w: 0.55, h: -0.55, line: { color: theme.line, width: 1.2 } });
}

function slide5() {
  const slide = pptx.addSlide();
  bg(slide, "FFFFFF");
  addHeader(slide, 5, "产品功能全景", "PRODUCT MAP");
  addPhone(slide, assets.featureMap, 0.62, 1.18, 2.18, 4.2, "前端页面");
  const pages = [
    ["登录", "静默登录 / OPENID"],
    ["引导", "4 页 onboarding"],
    ["首页", "预算 + 流水"],
    ["统计", "趋势 + AI 便签"],
    ["记账", "分类 + 图片 + 心情"],
    ["预算", "进度环 + 节奏建议"],
    ["我的", "足迹 + AI 信件"],
    ["分类", "自创分类 CRUD"],
    ["主题", "Design Token"],
    ["详情", "手账风格账单"]
  ];
  pages.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 3.25 + col * 2.68;
    const y = 1.18 + row * 0.76;
    addCard(slide, x, y, 2.35, 0.55, { fill: row % 2 ? theme.mintSoft : "FFFFFF", line: theme.line, radius: 0.1, shadow: false });
    addText(slide, p[0], x + 0.14, y + 0.13, 0.55, 0.16, { fontSize: 11.2, color: theme.primaryDeep, bold: true });
    addText(slide, p[1], x + 0.76, y + 0.13, 1.35, 0.16, { fontSize: 9, color: theme.muted });
  });
  addCard(slide, 8.55, 1.18, 0.88, 3.6, { fill: theme.dark, line: theme.dark, radius: 0.16, shadowOpacity: 0.1 });
  addText(slide, "CloudBase\nNoSQL\n云函数\n云存储\n混元模型", 8.68, 1.42, 0.6, 2.8, { fontSize: 12.5, color: "FFFFFF", bold: true, align: "center" });
  addText(slide, "前端体验完整，后端能力闭环。", 3.25, 4.92, 4.5, 0.25, { fontSize: 12.5, color: theme.primaryDeep, bold: true });
}

function slide6() {
  const slide = pptx.addSlide();
  bg(slide);
  addHeader(slide, 6, "用户使用旅程", "USER JOURNEY");
  const journey = [
    ["01", "进入", assets.featureMap, "引导理解产品"],
    ["02", "记账", assets.record, "手动或对话录入"],
    ["03", "查看", assets.home, "首页看预算与流水"],
    ["04", "复盘", assets.stats, "趋势排行与 AI 便签"],
    ["05", "成长", assets.profile, "足迹、称号、心里话"]
  ];
  journey.forEach((j, i) => {
    const x = 0.54 + i * 1.88;
    addTinyPhone(slide, j[2], x, 1.32, j[1]);
    slide.addShape(S.ellipse, { x: x + 0.34, y: 3.86, w: 0.42, h: 0.42, fill: { color: i % 2 ? theme.orange : theme.primary }, line: { color: i % 2 ? theme.orange : theme.primary } });
    addText(slide, j[0], x + 0.34, 3.97, 0.42, 0.1, { fontFace: "Arial", fontSize: 8.2, color: "FFFFFF", bold: true, align: "center" });
    addText(slide, j[3], x - 0.05, 4.36, 1.28, 0.26, { fontSize: 8.4, color: theme.muted, align: "center" });
    if (i < journey.length - 1) {
      slide.addShape(S.chevron, { x: x + 1.24, y: 2.44, w: 0.24, h: 0.38, fill: { color: theme.line }, line: { color: theme.line } });
    }
  });
  addText(slide, "设计目标：把“记账”从单次输入，延展成可持续的习惯养成路径。", 0.72, 4.93, 7.3, 0.24, { fontSize: 12, color: theme.primaryDeep, bold: true });
}

function slide7() {
  const slide = pptx.addSlide();
  bg(slide, "FFFFFF");
  addHeader(slide, 7, "首页体验：一眼看懂消费状态", "PRODUCT EXPERIENCE");
  addPhone(slide, assets.home, 0.74, 1.05, 2.28, 4.34, "首页");
  addMiniMetric(slide, "今日 / 昨日", "消费双数字卡", 3.45, 1.25, 1.55, theme.primary);
  addMiniMetric(slide, "预算进度", "未设 / 正常 / 超支三态", 5.22, 1.25, 1.8, theme.blue);
  addMiniMetric(slide, "近 30 条", "按日分组流水", 7.23, 1.25, 1.55, theme.orange);
  addBullet(slide, "渐变 hero 卡", "首屏直接呈现今天与昨天消费，降低信息寻找成本。", 3.46, 2.55, 4.9, theme.primary);
  addBullet(slide, "预算提醒", "预算进度条让用户在首页就能知道是否接近超支。", 3.46, 3.35, 4.9, theme.blue);
  addBullet(slide, "账单流水", "按日分组、显示当日净额，点击进入手账风详情页。", 3.46, 4.15, 4.9, theme.orange);
}

function slide8() {
  const slide = pptx.addSlide();
  bg(slide);
  addHeader(slide, 8, "记一笔体验：低阻力输入", "PRODUCT EXPERIENCE");
  addPhone(slide, assets.record, 7.04, 0.98, 2.12, 4.42, "记一笔");
  const items = [
    ["收 / 支双模式", "滑块切换，入口清晰"],
    ["金额大字输入", "核心数字突出，减少误读"],
    ["分类网格", "8 个预设 + 自创分类"],
    ["照片与心情", "让账单变成生活记录"],
    ["防抖与日上限", "3 秒保存防抖，500 笔/天限制"],
    ["服务端校验", "写入前再次检查金额、日期、分类"]
  ];
  items.forEach((it, i) => {
    const x = 0.72 + (i % 2) * 3.05;
    const y = 1.28 + Math.floor(i / 2) * 1.08;
    addStep(slide, i + 1, it[0], it[1], x, y, 2.62, 0.82, i % 2 ? theme.orange : theme.primary);
  });
  addText(slide, "体验策略：把“必填项”前置，把“情绪和照片”做成可选表达。", 0.84, 4.86, 5.7, 0.24, { fontSize: 12, color: theme.primaryDeep, bold: true });
}

function slide9() {
  const slide = pptx.addSlide();
  bg(slide, "FFFFFF");
  addHeader(slide, 9, "小橘对话记账：从一句话到多笔账单", "AI INNOVATION");
  addPhone(slide, assets.aiBilling, 0.76, 0.98, 2.22, 4.42, "对话记账");
  const steps = [
    ["用户口语输入", "如“中午吃饭 20，打印文件 5 元”"],
    ["AI 结构化解析", "输出 intent / reply / bills 严格 JSON"],
    ["用户确认卡", "金额、备注可编辑，可删除行"],
    ["批量写入", "调用 bills.batchCreate，单次最多 10 笔"]
  ];
  steps.forEach((s, i) => {
    addStep(slide, i + 1, s[0], s[1], 3.48, 1.15 + i * 0.92, 5.36, 0.72, i === 1 ? theme.orange : theme.primary);
    if (i < steps.length - 1) {
      slide.addShape(S.line, { x: 6.0, y: 1.87 + i * 0.92, w: 0, h: 0.18, line: { color: theme.line, width: 1 } });
    }
  });
  addCard(slide, 3.48, 4.82, 5.36, 0.38, { fill: theme.orangeSoft, line: theme.orangeSoft, radius: 0.12, shadow: false });
  addText(slide, "核心创新：AI 负责理解口语，用户保留最终确认权，服务端兜底校验。", 3.62, 4.93, 5.04, 0.1, { fontSize: 10.4, color: theme.text, bold: true, align: "center" });
}

function slide10() {
  const slide = pptx.addSlide();
  bg(slide);
  addHeader(slide, 10, "小橘账单问答：AI 不编数字", "AI INNOVATION");
  addPhone(slide, assets.aiChat, 7.0, 0.98, 2.12, 4.42, "账单问答");
  addText(slide, "问题示例", 0.74, 1.28, 1.5, 0.24, { fontSize: 14, color: theme.primaryDeep, bold: true });
  const qs = ["这周花了多少钱？", "本月哪类花得最多？", "这周比上周省了多少？", "今天记了几笔？"];
  qs.forEach((q, i) => addTag(slide, q, 0.72 + (i % 2) * 2.05, 1.74 + Math.floor(i / 2) * 0.52, 1.75, i % 2 ? theme.orange : theme.primary, i % 2 ? theme.orangeSoft : theme.mintSoft));
  addCard(slide, 0.72, 3.02, 5.7, 1.45, { fill: "FFFFFF", line: theme.line, radius: 0.18, shadowOpacity: 0.07 });
  addText(slide, "工程策略", 0.96, 3.22, 1.2, 0.24, { fontSize: 14.5, color: theme.text, bold: true });
  addText(slide, "解析时间范围和问题类型 → 云函数查询 bills → 确定性计算金额 / 分类 / 笔数 → AI 用自然语言表达结果", 0.96, 3.64, 5.18, 0.46, { fontSize: 11, color: theme.muted });
  addCard(slide, 0.72, 4.66, 5.7, 0.45, { fill: theme.dark, line: theme.dark, radius: 0.14, shadowOpacity: 0.08 });
  addText(slide, "让大模型参与表达，不让它决定账本里的数字。", 0.96, 4.82, 5.2, 0.1, { fontSize: 11.5, color: "FFFFFF", bold: true, align: "center" });
}

function slide11() {
  const slide = pptx.addSlide();
  bg(slide, "FFFFFF");
  addHeader(slide, 11, "统计复盘：从流水到反馈", "PRODUCT EXPERIENCE");
  addPhone(slide, assets.stats, 0.74, 0.98, 2.12, 4.42, "统计页");
  addPhone(slide, assets.aiNote, 3.08, 1.08, 2.05, 4.22, "小橘便签");
  addBullet(slide, "趋势折线", "近 30 天消费变化直观呈现，当前值与均值对比。", 5.72, 1.45, 3.38, theme.primary);
  addBullet(slide, "支出排行", "分类金额与占比进度条，帮助用户理解钱去哪了。", 5.72, 2.3, 3.38, theme.orange);
  addBullet(slide, "AI 便签", "昨日 / 上周 / 上月三张评论卡，缓存 periodKey，失败可重试。", 5.72, 3.15, 3.38, theme.blue);
  addBullet(slide, "退避重试", "混元 streamText 串行调用，429 时指数退避。", 5.72, 4.0, 3.38, theme.purple);
}

function slide12() {
  const slide = pptx.addSlide();
  bg(slide);
  addHeader(slide, 12, "我的成长体系：把记账变成长期陪伴", "PRODUCT EXPERIENCE");
  addPhone(slide, assets.profile, 0.72, 0.98, 2.1, 4.42, "我的页");
  addPhone(slide, assets.aiLetter, 2.95, 0.98, 2.1, 4.42, "AI 心里话");
  addPhone(slide, assets.titleData, 5.18, 1.18, 1.86, 4.0, "今日称号");
  addCard(slide, 7.48, 1.24, 1.78, 0.82, { fill: "FFFFFF", line: theme.primary, lineTransparency: 25, radius: 0.16 });
  addText(slide, "记账足迹", 7.68, 1.44, 1.24, 0.18, { fontSize: 13.5, color: theme.primaryDeep, bold: true, align: "center" });
  addCard(slide, 7.48, 2.34, 1.78, 0.82, { fill: "FFFFFF", line: theme.orange, lineTransparency: 25, radius: 0.16 });
  addText(slide, "AI 信件", 7.68, 2.54, 1.24, 0.18, { fontSize: 13.5, color: theme.orange, bold: true, align: "center" });
  addCard(slide, 7.48, 3.44, 1.78, 0.82, { fill: "FFFFFF", line: theme.blue, lineTransparency: 25, radius: 0.16 });
  addText(slide, "每日称号", 7.68, 3.64, 1.24, 0.18, { fontSize: 13.5, color: theme.blue, bold: true, align: "center" });
  addText(slide, "从“记录消费”升级为“记录生活状态”。", 6.75, 4.72, 2.8, 0.28, { fontSize: 12.6, color: theme.primaryDeep, bold: true, align: "center" });
}

function slide13() {
  const slide = pptx.addSlide();
  bg(slide, "FFFFFF");
  addHeader(slide, 13, "主题个性化：Design Token 驱动", "PERSONALIZATION");
  addPhone(slide, assets.theme, 0.74, 0.98, 2.08, 4.42, "主题选择");
  addCard(slide, 3.22, 1.16, 5.95, 1.0, { fill: theme.mintSoft, line: theme.mintSoft, radius: 0.18, shadowOpacity: 0.05 });
  addText(slide, "60+ CSS 变量", 3.48, 1.38, 1.65, 0.26, { fontSize: 18, color: theme.primaryDeep, bold: true });
  addText(slide, "颜色、渐变、阴影、字号、语义色集中管理，页面统一注入 themeStyle。", 5.28, 1.36, 3.45, 0.28, { fontSize: 10.2, color: theme.muted });
  const tokens = [
    ["--color-primary", "#27c07d", theme.primary],
    ["--color-accent", "#5ba4cb", theme.blue],
    ["--gradient-hero", "primary → accent", theme.orange],
    ["--shadow-card", "高光 + 深影", theme.purple]
  ];
  tokens.forEach((t, i) => {
    const x = 3.22 + (i % 2) * 3.0;
    const y = 2.46 + Math.floor(i / 2) * 0.92;
    addCard(slide, x, y, 2.62, 0.64, { fill: "FFFFFF", line: theme.line, radius: 0.12, shadowOpacity: 0.04 });
    slide.addShape(S.ellipse, { x: x + 0.14, y: y + 0.19, w: 0.25, h: 0.25, fill: { color: t[2] }, line: { color: t[2] } });
    addText(slide, t[0], x + 0.5, y + 0.14, 1.5, 0.16, { fontFace: "Consolas", fontSize: 8.6, color: theme.text, bold: true });
    addText(slide, t[1], x + 0.5, y + 0.36, 1.6, 0.13, { fontSize: 8, color: theme.muted });
  });
  addText(slide, "4 套预设主题 + 8 色自定义调色板 + 最多 5 个用户命名主题。", 3.24, 4.62, 5.8, 0.28, { fontSize: 12, color: theme.primaryDeep, bold: true });
}

function slide14() {
  const slide = pptx.addSlide();
  bg(slide, theme.dark);
  addPageNum(slide, 14);
  slide.addShape(S.ellipse, { x: 0.64, y: 0.56, w: 0.3, h: 0.3, fill: { color: theme.primary }, line: { color: theme.primary } });
  addText(slide, "04", 0.66, 0.66, 0.26, 0.1, { fontFace: "Arial", fontSize: 7.5, color: "FFFFFF", bold: true, align: "center" });
  addText(slide, "技术实现", 0.68, 1.52, 3.2, 0.7, { fontSize: 42, color: "FFFFFF", bold: true });
  addText(slide, "原生小程序 + CloudBase Serverless + 腾讯混元大模型", 0.72, 2.36, 4.6, 0.32, { fontSize: 15, color: "CFEFE1" });
  const stack = [
    ["前端", "WXML / WXSS / JS"],
    ["服务", "9 个有效云函数"],
    ["数据", "NoSQL / 云存储"],
    ["AI", "hy3-preview / 内容安全"]
  ];
  stack.forEach((s, i) => {
    addCard(slide, 5.66, 0.92 + i * 0.88, 3.45, 0.58, { fill: i % 2 ? "18322A" : "143027", line: "24483C", radius: 0.12, shadowOpacity: 0.18 });
    addText(slide, s[0], 5.88, 1.08 + i * 0.88, 0.65, 0.14, { fontSize: 10.8, color: theme.orange, bold: true });
    addText(slide, s[1], 6.66, 1.08 + i * 0.88, 1.9, 0.14, { fontSize: 10.6, color: "FFFFFF" });
  });
  slide.addImage({ path: assets.xiaoju, x: 7.98, y: 3.95, w: 1.04, h: 1.1, altText: "小橘" });
}

function slide15() {
  const slide = pptx.addSlide();
  bg(slide, "FFFFFF");
  addHeader(slide, 15, "系统五层架构", "ARCHITECTURE");
  addImageContain(slide, assets.architecture, 0.56, 1.08, 6.7, 4.12, { bg: "FFFFFF", line: theme.line, radius: 0.14 });
  const points = [
    ["表现层", "10 个页面 + 自定义 TabBar"],
    ["工具层", "theme / eventBus / validate / monitor"],
    ["服务层", "账单、预算、AI、迁移、内容安全"],
    ["数据层", "NoSQL + 云存储 + 混元模型"]
  ];
  points.forEach((p, i) => {
    addCard(slide, 7.56, 1.24 + i * 0.86, 1.82, 0.62, { fill: i % 2 ? theme.mintSoft : theme.blueSoft, line: theme.line, radius: 0.12, shadowOpacity: 0.04 });
    addText(slide, p[0], 7.72, 1.38 + i * 0.86, 0.74, 0.14, { fontSize: 10.5, color: theme.primaryDeep, bold: true });
    addText(slide, p[1], 8.42, 1.37 + i * 0.86, 0.72, 0.2, { fontSize: 7.6, color: theme.muted });
  });
}

function slide16() {
  const slide = pptx.addSlide();
  bg(slide);
  addHeader(slide, 16, "数据访问设计：读写分离 + OPENID 隔离", "DATA ACCESS");
  addImageContain(slide, assets.dataAccess, 0.62, 1.04, 6.4, 4.1, { bg: "FFFFFF", line: theme.line, radius: 0.14 });
  addBullet(slide, "读取路径", "小程序页面直接使用 wx.cloud.database 查询当前用户数据。", 7.28, 1.22, 2.0, theme.primary);
  addBullet(slide, "写入路径", "新增、修改、删除通过云函数完成服务端校验。", 7.28, 2.28, 2.0, theme.orange);
  addBullet(slide, "身份来源", "服务端通过 cloud.getWXContext().OPENID 获取身份。", 7.28, 3.34, 2.0, theme.blue);
  addCard(slide, 7.24, 4.55, 2.08, 0.55, { fill: theme.dark, line: theme.dark, radius: 0.14, shadowOpacity: 0.08 });
  addText(slide, "不信任客户端 openid", 7.42, 4.76, 1.72, 0.1, { fontSize: 9.5, color: "FFFFFF", bold: true, align: "center" });
}

function slide17() {
  const slide = pptx.addSlide();
  bg(slide, "FFFFFF");
  addHeader(slide, 17, "AI 工程链路：可控、可确认、可降级", "AI PIPELINE");
  addImageContain(slide, assets.aiFlow, 0.56, 1.02, 6.75, 4.18, { bg: "FFFFFF", line: theme.line, radius: 0.14 });
  const callouts = [
    ["内容安全", "本地正则 + msgSecCheck v2"],
    ["结构输出", "严格 JSON + 容错解析"],
    ["失败降级", "FALLBACK_REPLY，不写入异常账单"]
  ];
  callouts.forEach((c, i) => {
    addStep(slide, i + 1, c[0], c[1], 7.55, 1.36 + i * 1.1, 1.78, 0.82, [theme.primary, theme.orange, theme.red][i]);
  });
}

function slide18() {
  const slide = pptx.addSlide();
  bg(slide);
  addHeader(slide, 18, "数据模型：5 个集合支撑完整闭环", "DATA MODEL");
  addImageContain(slide, assets.dataModel, 0.58, 1.02, 6.5, 4.18, { bg: "FFFFFF", line: theme.line, radius: 0.14 });
  const cols = [
    ["bills", "账单流水\n金额、分类、日期、照片、心情", theme.orange],
    ["budgets", "预算记录\n按月 upsert，一月一条", theme.blue],
    ["users", "用户资料\n头像、主题、自定义分类", theme.primary],
    ["ai_usage_limits", "AI 限流\nopenid_date_feature 幂等 ID", theme.purple],
    ["client_logs", "异常日志\n前端错误与路由记录", theme.pink]
  ];
  cols.forEach((c, i) => {
    addCard(slide, 7.32, 1.1 + i * 0.76, 2.05, 0.52, { fill: "FFFFFF", line: c[2], lineTransparency: 28, radius: 0.1, shadowOpacity: 0.03 });
    addText(slide, c[0], 7.48, 1.2 + i * 0.76, 0.98, 0.13, { fontFace: "Consolas", fontSize: 8.7, color: c[2], bold: true });
    addText(slide, c[1], 8.42, 1.15 + i * 0.76, 0.78, 0.24, { fontSize: 6.6, color: theme.muted });
  });
}

function slide19() {
  const slide = pptx.addSlide();
  bg(slide, "FFFFFF");
  addHeader(slide, 19, "安全与部署：真实 CloudBase 落地", "SECURITY & DEPLOYMENT");
  const grid = [
    [assets.cloudFunctions, "云函数"],
    [assets.dbCollections, "数据库集合"],
    [assets.dbPermission, "数据权限"],
    [assets.dbCalls, "调用概览"],
    [assets.storage, "云存储"]
  ];
  grid.forEach((g, i) => {
    const x = 0.62 + (i % 3) * 2.18;
    const y = i < 3 ? 1.18 : 3.18;
    addCard(slide, x, y, 1.86, 1.34, { fill: theme.gray, line: theme.line, radius: 0.12, shadowOpacity: 0.06 });
    addImageContain(slide, g[0], x + 0.08, y + 0.1, 1.7, 0.88);
    addText(slide, g[1], x + 0.1, y + 1.08, 1.65, 0.12, { fontSize: 8.8, color: theme.text, bold: true, align: "center" });
  });
  addCard(slide, 7.34, 1.26, 2.0, 3.72, { fill: theme.dark, line: theme.dark, radius: 0.18, shadowOpacity: 0.12 });
  addText(slide, "三层防线", 7.62, 1.58, 1.44, 0.28, { fontSize: 17, color: "FFFFFF", bold: true, align: "center" });
  addText(slide, "1. 数据库仅创建者可读写\n2. 云函数服务端 OPENID\n3. 修改/删除前所有权校验\n\n补充：内容安全、AI 限流、异常日志、导入导出、数据清除。", 7.62, 2.14, 1.42, 2.05, { fontSize: 10.2, color: "DDF5E9", align: "left" });
  addTag(slide, "可运行 / 可追踪 / 可恢复", 7.55, 4.48, 1.56, theme.orange, "25382F");
}

function slide20() {
  const slide = pptx.addSlide();
  bg(slide, theme.dark);
  addPageNum(slide, 20);
  addText(slide, "橘记 Juji", 0.72, 0.72, 2.3, 0.42, { fontSize: 28, color: "FFFFFF", bold: true });
  addText(slide, "让记账从工具，变成愿意坚持的生活陪伴。", 0.74, 1.22, 4.5, 0.28, { fontSize: 15.5, color: "CFEFE1" });
  const cols = [
    ["产品价值", "低阻力记账\n预算提醒\n统计复盘\n成长陪伴", theme.primary],
    ["技术价值", "原生小程序\nCloudBase Serverless\n混元大模型\n权限与安全防线", theme.orange],
    ["未来规划", "OCR 票据识别\n更细预算建议\n多维消费报告\n更丰富的小橘人格", theme.blue]
  ];
  cols.forEach((c, i) => {
    addCard(slide, 0.72 + i * 3.05, 2.05, 2.56, 2.18, { fill: i === 1 ? "25382F" : "193029", line: "2D4D41", radius: 0.2, shadowOpacity: 0.16 });
    slide.addShape(S.ellipse, { x: 1.02 + i * 3.05, y: 2.32, w: 0.36, h: 0.36, fill: { color: c[2] }, line: { color: c[2] } });
    addText(slide, c[0], 1.5 + i * 3.05, 2.31, 1.22, 0.24, { fontSize: 15, color: "FFFFFF", bold: true });
    addText(slide, c[1], 1.0 + i * 3.05, 2.88, 2.0, 0.9, { fontSize: 11.2, color: "DDF5E9", align: "center" });
  });
  slide.addImage({ path: assets.xiaoju, x: 8.24, y: 0.64, w: 0.95, h: 1.0, altText: "小橘" });
  addText(slide, "谢谢观看", 3.72, 4.82, 2.5, 0.28, { fontSize: 18, color: "FFFFFF", bold: true, align: "center" });
}

async function main() {
  checkAssets();
  [slide1, slide2, slide3, slide4, slide5, slide6, slide7, slide8, slide9, slide10,
   slide11, slide12, slide13, slide14, slide15, slide16, slide17, slide18, slide19, slide20]
    .forEach(fn => fn());
  await pptx.writeFile({ fileName: OUT_FILE });
  console.log(OUT_FILE);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
