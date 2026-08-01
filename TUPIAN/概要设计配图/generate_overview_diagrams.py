from __future__ import annotations

import math
import os
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont


OUT_DIR = Path(__file__).resolve().parent
W = 1800

FONT_REGULAR_CANDIDATES = [
    r"C:\Windows\Fonts\NotoSansSC-VF.ttf",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]
FONT_BOLD_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyhbd.ttf",
    r"C:\Windows\Fonts\simhei.ttf",
]

COLORS = {
    "bg": "#f7fbf8",
    "panel": "#ffffff",
    "line": "#2f3b35",
    "muted": "#6b7d73",
    "soft": "#e8f5ee",
    "soft2": "#eef7fb",
    "soft3": "#fff3e6",
    "primary": "#27c07d",
    "primary_dark": "#157a51",
    "blue": "#5ba4cb",
    "orange": "#f3a33a",
    "rose": "#d98787",
    "purple": "#8c7bd9",
    "gray": "#d9e4de",
    "dark": "#17231d",
    "danger": "#ba1a1a",
}


def pick_font(candidates: list[str]) -> str:
    for path in candidates:
        if os.path.exists(path):
            return path
    return ""


FONT_REG = pick_font(FONT_REGULAR_CANDIDATES)
FONT_BOLD = pick_font(FONT_BOLD_CANDIDATES)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_REG
    if path:
        return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    if not text:
        return 0, 0
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    result: list[str] = []

    def tokenize(raw: str) -> list[str]:
        tokens: list[str] = []
        buf = ""
        for ch in raw:
            if ch.isascii() and (ch.isalnum() or ch in "._-:/"):
                buf += ch
            else:
                if buf:
                    tokens.append(buf)
                    buf = ""
                tokens.append(ch)
        if buf:
            tokens.append(buf)
        return tokens

    for raw in str(text).split("\n"):
        line = ""
        for token in tokenize(raw):
            trial = line + token
            if text_size(draw, trial, font)[0] <= max_width or not line:
                line = trial
            else:
                result.append(line)
                line = token
        result.append(line)
    return result


class Diagram:
    def __init__(self, title: str, subtitle: str, height: int):
        self.title = title
        self.subtitle = subtitle
        self.width = W
        self.height = height
        self.image = Image.new("RGBA", (self.width, self.height), (*hex_to_rgb(COLORS["bg"]), 255))
        self.draw = ImageDraw.Draw(self.image)
        self.svg: list[str] = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" viewBox="0 0 {self.width} {self.height}">',
            "<defs>",
            '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">'
            '<feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0d2a1d" flood-opacity="0.10"/>'
            "</filter>",
            "</defs>",
            f'<rect width="{self.width}" height="{self.height}" fill="{COLORS["bg"]}"/>',
        ]
        self.header()

    def header(self) -> None:
        self.rounded_rect(70, 40, self.width - 140, 90, 28, "#ffffff", COLORS["gray"], 2, shadow=True)
        self.text(104, 66, self.title, 34, COLORS["dark"], bold=True, max_width=1000)
        self.text(self.width - 730, 72, self.subtitle, 22, COLORS["muted"], max_width=600, align="right")
        self.circle(self.width - 95, 85, 18, COLORS["primary"], outline="#ffffff", width=4)

    def rounded_rect(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        r: int,
        fill: str,
        outline: str | None = None,
        width: int = 1,
        shadow: bool = False,
    ) -> None:
        if shadow:
            self.draw.rounded_rectangle((x + 5, y + 7, x + w + 5, y + h + 7), r, fill=(*hex_to_rgb("#dce8e1"), 255))
        self.draw.rounded_rectangle((x, y, x + w, y + h), r, fill=(*hex_to_rgb(fill), 255), outline=(*hex_to_rgb(outline or fill), 255), width=width)
        attrs = f'x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'
        if outline:
            attrs += f' stroke="{outline}" stroke-width="{width}"'
        if shadow:
            attrs += ' filter="url(#shadow)"'
        self.svg.append(f"<rect {attrs}/>")

    def rect(self, x: int, y: int, w: int, h: int, fill: str, outline: str | None = None, width: int = 1) -> None:
        self.draw.rectangle((x, y, x + w, y + h), fill=(*hex_to_rgb(fill), 255), outline=(*hex_to_rgb(outline or fill), 255), width=width)
        attrs = f'x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"'
        if outline:
            attrs += f' stroke="{outline}" stroke-width="{width}"'
        self.svg.append(f"<rect {attrs}/>")

    def circle(self, cx: int, cy: int, r: int, fill: str, outline: str | None = None, width: int = 1) -> None:
        self.draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*hex_to_rgb(fill), 255), outline=(*hex_to_rgb(outline or fill), 255), width=width)
        attrs = f'cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"'
        if outline:
            attrs += f' stroke="{outline}" stroke-width="{width}"'
        self.svg.append(f"<circle {attrs}/>")

    def line(self, x1: int, y1: int, x2: int, y2: int, color: str = COLORS["line"], width: int = 3, dash: str | None = None) -> None:
        self.draw.line((x1, y1, x2, y2), fill=(*hex_to_rgb(color), 255), width=width)
        attrs = f'x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"'
        if dash:
            attrs += f' stroke-dasharray="{dash}"'
        self.svg.append(f"<line {attrs}/>")

    def arrow(self, x1: int, y1: int, x2: int, y2: int, color: str = COLORS["primary_dark"], width: int = 4, dash: str | None = None) -> None:
        self.line(x1, y1, x2, y2, color, width, dash)
        angle = math.atan2(y2 - y1, x2 - x1)
        head = 18
        spread = 0.55
        pts = [
            (x2, y2),
            (x2 - head * math.cos(angle - spread), y2 - head * math.sin(angle - spread)),
            (x2 - head * math.cos(angle + spread), y2 - head * math.sin(angle + spread)),
        ]
        self.draw.polygon(pts, fill=(*hex_to_rgb(color), 255))
        pt_str = " ".join(f"{int(x)},{int(y)}" for x, y in pts)
        self.svg.append(f'<polygon points="{pt_str}" fill="{color}"/>')

    def text(
        self,
        x: int,
        y: int,
        text: str,
        size: int,
        color: str = COLORS["dark"],
        bold: bool = False,
        max_width: int | None = None,
        align: str = "left",
        line_gap: int = 8,
    ) -> int:
        font = load_font(size, bold)
        lines = wrap_lines(self.draw, text, font, max_width or 99999)
        line_h = int(size * 1.25)
        for idx, line in enumerate(lines):
            tw, _ = text_size(self.draw, line, font)
            tx = x
            if align == "center" and max_width:
                tx = x + (max_width - tw) // 2
            elif align == "right" and max_width:
                tx = x + max_width - tw
            ty = y + idx * (line_h + line_gap)
            self.draw.text((tx, ty), line, font=font, fill=(*hex_to_rgb(color), 255))
            weight = "700" if bold else "400"
            self.svg.append(
                f'<text x="{tx}" y="{ty + size}" font-family="Microsoft YaHei,Noto Sans SC,SimHei,sans-serif" '
                f'font-size="{size}" font-weight="{weight}" fill="{color}">{escape(line)}</text>'
            )
        return y + len(lines) * (line_h + line_gap)

    def label(self, x: int, y: int, text: str, fill: str = COLORS["soft"], color: str = COLORS["primary_dark"], w: int | None = None) -> None:
        font = load_font(22, True)
        tw, _ = text_size(self.draw, text, font)
        lw = w or tw + 34
        self.rounded_rect(x, y, lw, 42, 21, fill, fill, 1)
        self.text(x + 17, y + 8, text, 20, color, bold=True, max_width=lw - 34)

    def box(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        title: str,
        body: str = "",
        fill: str = "#ffffff",
        accent: str = COLORS["primary"],
        outline: str = COLORS["gray"],
        title_size: int = 26,
        body_size: int = 19,
    ) -> tuple[int, int, int, int]:
        self.rounded_rect(x, y, w, h, 24, fill, outline, 2, shadow=True)
        self.rect(x, y, 10, h, accent, accent)
        title_end = self.text(x + 28, y + 22, title, title_size, COLORS["dark"], bold=True, max_width=w - 56)
        if body:
            self.text(x + 28, max(y + 58, title_end + 6), body, body_size, COLORS["muted"], max_width=w - 56, line_gap=5)
        return (x, y, w, h)

    def save(self, filename: str) -> None:
        png = OUT_DIR / f"{filename}.png"
        svg = OUT_DIR / f"{filename}.svg"
        self.image.save(png)
        self.svg.append("</svg>")
        svg.write_text("\n".join(self.svg), encoding="utf-8")


def center(box: tuple[int, int, int, int]) -> tuple[int, int]:
    x, y, w, h = box
    return x + w // 2, y + h // 2


def edge_mid(box: tuple[int, int, int, int], side: str) -> tuple[int, int]:
    x, y, w, h = box
    if side == "top":
        return x + w // 2, y
    if side == "bottom":
        return x + w // 2, y + h
    if side == "left":
        return x, y + h // 2
    return x + w, y + h // 2


def fig_2_1() -> None:
    d = Diagram("图 2-1  橘记系统五层架构图", "Overview Architecture", 1280)
    layers = [
        ("表现层", "UI 渲染 / 用户交互 / 主题注入", "10 个页面 WXML/WXSS\n自定义 custom-tab-bar\n渐变 hero、表单、图表、弹窗", COLORS["soft"]),
        ("逻辑层", "业务逻辑 / 页面状态 / 生命周期", "页面 JS：login、home、stats、record、budget、profile 等\nonShow 拉取数据并同步主题", COLORS["soft2"]),
        ("工具层", "横切能力复用", "theme / eventBus / rateLimiter / validate\nprivacy / contentSafety / monitor / dbPager / profileHelpers", "#f2f8f4"),
        ("服务层", "服务端校验 / AI 代理 / 数据聚合", "quickstartFunctions、bills、budgets、aiChat、aiPoster\ncontentSafety、dataMigration、clearUserData、exportBills", "#fff7eb"),
        ("数据层", "持久化与外部能力", "NoSQL：bills / budgets / users / ai_usage_limits / client_logs\n云存储：头像、账单照片、导出文件；混元大模型 hy3-preview", "#f6f2ff"),
    ]
    y = 175
    previous = None
    for idx, (name, duty, comp, fill) in enumerate(layers):
        band = d.box(150, y, 1500, 170, name, duty, fill=fill, accent=[COLORS["primary"], COLORS["blue"], COLORS["orange"], COLORS["purple"], COLORS["rose"]][idx])
        d.text(440, y + 36, "包含组件", 22, COLORS["primary_dark"], bold=True, max_width=160)
        d.text(440, y + 72, comp, 21, COLORS["dark"], max_width=1080, line_gap=4)
        if previous:
            px, py = edge_mid(previous, "bottom")
            cx, cy = edge_mid(band, "top")
            d.arrow(px, py + 8, cx, cy - 8, COLORS["muted"], 3)
        previous = band
        y += 205
    d.label(1220, 1180, "核心原则：读写分离 + 服务端校验 + AI 降级", COLORS["soft"], COLORS["primary_dark"], 430)
    d.save("图2-1_橘记系统五层架构图")


def fig_3_1() -> None:
    d = Diagram("图 3-1  前端模块依赖关系图", "Frontend Dependency Map", 1320)
    d.label(95, 160, "页面模块（10 个）", COLORS["soft"], COLORS["primary_dark"], 250)
    pages = ["login", "guide", "home", "stats", "record", "budget", "profile", "categories", "themes", "detail"]
    page_boxes = {}
    x0, y0 = 95, 225
    for i, p in enumerate(pages):
        x = x0 + (i % 2) * 245
        y = y0 + (i // 2) * 120
        accent = COLORS["orange"] if p in ["record", "profile"] else COLORS["primary"]
        page_boxes[p] = d.box(x, y, 210, 82, p, "", fill="#ffffff", accent=accent, title_size=24)

    d.label(620, 160, "工具模块（9 个 utils）", COLORS["soft2"], COLORS["blue"], 290)
    utils = [
        ("theme.js", "主题注入\n所有页面依赖", 620, 230, COLORS["primary"]),
        ("eventBus.js", "主题变更事件", 955, 230, COLORS["blue"]),
        ("validate.js", "账单/预算校验", 620, 380, COLORS["orange"]),
        ("rateLimiter.js", "3s 防抖\n500 笔/日", 955, 380, COLORS["orange"]),
        ("privacy.js", "敏感能力授权", 620, 530, COLORS["purple"]),
        ("contentSafety.js", "文本安全检查", 955, 530, COLORS["rose"]),
        ("dbPager.js", "分页查询 getAll", 620, 680, COLORS["blue"]),
        ("profileHelpers.js", "星座/主题名/emoji", 955, 680, COLORS["purple"]),
        ("monitor.js", "全局异常上报", 780, 830, COLORS["muted"]),
    ]
    util_boxes = {}
    for name, body, x, y, accent in utils:
        util_boxes[name] = d.box(x, y, 280, 105, name, body, fill="#ffffff", accent=accent, title_size=23, body_size=19)

    d.label(1360, 160, "配置 / 组件", "#fff7eb", COLORS["orange"], 230)
    app_box = d.box(1345, 230, 330, 130, "配置模块", "app.js / app.json / app.wxss\n路由、入口、全局 token", fill="#ffffff", accent=COLORS["orange"])
    tab_box = d.box(1345, 420, 330, 120, "custom-tab-bar", "毛玻璃浮动导航栏\n5 个 Tab 选中态同步", fill="#ffffff", accent=COLORS["primary"])

    for p, b in page_boxes.items():
        sx, sy = edge_mid(b, "right")
        tx, ty = edge_mid(util_boxes["theme.js"], "left")
        d.arrow(sx + 4, sy, tx - 8, ty, COLORS["gray"], 2)
    for p in ["record", "profile"]:
        for u in ["contentSafety.js", "privacy.js"]:
            sx, sy = edge_mid(page_boxes[p], "right")
            tx, ty = edge_mid(util_boxes[u], "left")
            d.arrow(sx + 4, sy, tx - 8, ty, COLORS["rose"] if u == "contentSafety.js" else COLORS["purple"], 3)
    for u in ["validate.js", "rateLimiter.js"]:
        sx, sy = edge_mid(page_boxes["record"], "right")
        tx, ty = edge_mid(util_boxes[u], "left")
        d.arrow(sx + 4, sy, tx - 8, ty, COLORS["orange"], 3)
    for u in ["dbPager.js", "profileHelpers.js"]:
        sx, sy = edge_mid(page_boxes["profile"], "right")
        tx, ty = edge_mid(util_boxes[u], "left")
        d.arrow(sx + 4, sy, tx - 8, ty, COLORS["blue"], 3)
    sx, sy = edge_mid(page_boxes["themes"], "right")
    tx, ty = edge_mid(util_boxes["eventBus.js"], "left")
    d.arrow(sx + 4, sy, tx - 8, ty, COLORS["blue"], 3)
    d.arrow(edge_mid(util_boxes["theme.js"], "right")[0] + 5, edge_mid(util_boxes["theme.js"], "right")[1], edge_mid(tab_box, "left")[0] - 8, edge_mid(tab_box, "left")[1], COLORS["primary"], 3)
    d.arrow(edge_mid(app_box, "left")[0] - 8, edge_mid(app_box, "left")[1], edge_mid(util_boxes["monitor.js"], "right")[0] + 4, edge_mid(util_boxes["monitor.js"], "right")[1], COLORS["muted"], 3)
    d.label(620, 1120, "重点：theme.js 是全页面共同依赖；record/profile 是交互与 AI 能力最集中的页面", "#ffffff", COLORS["primary_dark"], 840)
    d.save("图3-1_前端模块依赖关系图")


def fig_4_1() -> None:
    d = Diagram("图 4-1  云函数调用关系图", "Cloud Functions Call Map", 1320)
    d.label(90, 160, "前端页面", COLORS["soft"], COLORS["primary_dark"], 190)
    front = {
        "login": d.box(90, 235, 290, 80, "login", "静默登录", accent=COLORS["primary"]),
        "record": d.box(90, 345, 290, 100, "record", "保存 / 编辑 / 对话记账", accent=COLORS["orange"]),
        "home/detail": d.box(90, 480, 290, 80, "home / detail", "删除账单", accent=COLORS["primary"]),
        "budget": d.box(90, 595, 290, 80, "budget", "预算 upsert", accent=COLORS["blue"]),
        "profile": d.box(90, 710, 290, 140, "profile", "AI 信件 / 称号\n导入导出 / 清除数据", accent=COLORS["purple"]),
        "client": d.box(90, 890, 290, 80, "record/profile", "文本安全审核", accent=COLORS["rose"]),
    }
    d.label(620, 160, "CloudBase 云函数（Node.js 16.13）", COLORS["soft2"], COLORS["blue"], 420)
    funcs = {
        "quickstartFunctions": d.box(600, 225, 350, 80, "quickstartFunctions", "getOpenId", accent=COLORS["primary"]),
        "bills": d.box(600, 335, 350, 120, "bills", "create / update / delete\nbatchCreate + 服务端校验", accent=COLORS["orange"]),
        "budgets": d.box(600, 490, 350, 80, "budgets", "按月 upsert", accent=COLORS["blue"]),
        "aiChat": d.box(600, 605, 350, 115, "aiChat", "闲聊 / 查账 / 口语记账解析", accent=COLORS["purple"]),
        "aiPoster": d.box(600, 755, 350, 115, "aiPoster", "AI 信件 + 今日称号", accent=COLORS["purple"]),
        "contentSafety": d.box(600, 905, 350, 90, "contentSafety", "msgSecCheck v2 代理", accent=COLORS["rose"]),
        "dataMigration": d.box(1010, 365, 330, 95, "dataMigration", "JSON export / import", accent=COLORS["blue"]),
        "clearUserData": d.box(1010, 500, 330, 95, "clearUserData", "按 _openid 清除数据", accent=COLORS["danger"]),
        "exportBills": d.box(1010, 635, 330, 95, "exportBills", "CSV 导出到云存储", accent=COLORS["blue"]),
    }
    d.label(1430, 160, "外部能力", "#fff7eb", COLORS["orange"], 190)
    ext = {
        "db": d.box(1415, 260, 300, 115, "CloudBase NoSQL", "bills / budgets / users\nai_usage_limits / client_logs", accent=COLORS["primary"]),
        "storage": d.box(1415, 435, 300, 95, "云存储", "头像 / 照片 / 导出文件", accent=COLORS["blue"]),
        "ai": d.box(1415, 595, 300, 95, "混元大模型", "hunyuan-v3 / hy3-preview", accent=COLORS["purple"]),
        "sec": d.box(1415, 755, 300, 95, "微信内容安全", "security.msgSecCheck v2", accent=COLORS["rose"]),
    }
    links = [
        ("login", "quickstartFunctions"), ("record", "bills"), ("home/detail", "bills"), ("budget", "budgets"),
        ("profile", "aiPoster"), ("profile", "dataMigration"), ("profile", "clearUserData"), ("profile", "exportBills"),
        ("record", "aiChat"), ("client", "contentSafety"),
    ]
    for a, b in links:
        d.arrow(edge_mid(front[a], "right")[0] + 6, edge_mid(front[a], "right")[1], edge_mid(funcs[b], "left")[0] - 8, edge_mid(funcs[b], "left")[1], COLORS["muted"], 3)
    for name in ["quickstartFunctions", "bills", "budgets", "dataMigration", "clearUserData", "exportBills", "aiPoster", "aiChat"]:
        target = "db" if name not in ["exportBills"] else "storage"
        d.arrow(edge_mid(funcs[name], "right")[0] + 5, edge_mid(funcs[name], "right")[1], edge_mid(ext[target], "left")[0] - 8, edge_mid(ext[target], "left")[1], COLORS["primary"], 3)
    for name in ["aiChat", "aiPoster"]:
        d.arrow(edge_mid(funcs[name], "right")[0] + 5, edge_mid(funcs[name], "right")[1], edge_mid(ext["ai"], "left")[0] - 8, edge_mid(ext["ai"], "left")[1], COLORS["purple"], 3)
    for name in ["contentSafety", "aiChat"]:
        d.arrow(edge_mid(funcs[name], "right")[0] + 5, edge_mid(funcs[name], "right")[1], edge_mid(ext["sec"], "left")[0] - 8, edge_mid(ext["sec"], "left")[1], COLORS["rose"], 3)
    d.save("图4-1_云函数调用关系图")


def fig_5_1() -> None:
    d = Diagram("图 5-1  全局状态流转图", "Runtime State Flow", 1220)
    columns = [
        ("globalData（内存）", "openid\nuserInfo\ncurrentTheme\neventBus\n_loginPromise\n_editBillId", 110, COLORS["soft"], COLORS["primary"]),
        ("wx.Storage（本地持久化）", "theme / user_themes\nhas_seen_guide\njuji_ai_* periodKey 缓存\njuji_profile_title_*\njuji_heatmap_color", 610, COLORS["soft2"], COLORS["blue"]),
        ("云数据库（服务端）", "users.theme / customCategories\nbills / budgets\nai_usage_limits\nclient_logs", 1110, "#fff7eb", COLORS["orange"]),
    ]
    boxes = []
    for title, body, x, fill, accent in columns:
        boxes.append(d.box(x, 230, 390, 560, title, body, fill=fill, accent=accent, title_size=25, body_size=23))
    d.text(135, 835, "应用运行期快速读写；退出登录后清空登录态", 22, COLORS["muted"], max_width=330)
    d.text(635, 835, "跨页面、跨启动保留；用于主题、缓存与引导", 22, COLORS["muted"], max_width=330)
    d.text(1135, 835, "云端事实来源；按 _openid 隔离", 22, COLORS["muted"], max_width=330)
    d.arrow(805, 215, 310, 215, COLORS["blue"], 4)
    d.text(410, 180, "启动读取 theme / guide 标记", 22, COLORS["blue"], bold=True, max_width=420, align="center")
    d.arrow(310, 930, 805, 930, COLORS["primary"], 4)
    d.text(420, 895, "主题切换写入 Storage，并 emit themeChanged", 22, COLORS["primary_dark"], bold=True, max_width=520, align="center")
    d.arrow(1000, 420, 1110, 420, COLORS["orange"], 4)
    d.text(985, 360, "同步 users.theme", 22, COLORS["orange"], bold=True, max_width=260)
    d.arrow(1110, 680, 1000, 680, COLORS["purple"], 4)
    d.text(850, 640, "AI 用量 / 称号 / 账单数据回读", 22, COLORS["purple"], bold=True, max_width=360, align="center")
    d.box(145, 560, 300, 135, "编辑账单桥接", "Detail → Record\n_editBillId + switchTab", fill="#fff6f6", accent=COLORS["rose"], title_size=22, body_size=19)
    d.label(640, 1035, "状态设计目标：内存负责运行态，本地缓存负责体验，云端负责数据事实", "#ffffff", COLORS["primary_dark"], 620)
    d.save("图5-1_全局状态流转图")


def fig_5_2() -> None:
    d = Diagram("图 5-2  数据库集合间逻辑关系图", "NoSQL Logical Relationship", 1180)
    center_box = d.box(710, 480, 380, 140, "_openid", "微信用户唯一标识\n所有集合的逻辑关联键", fill=COLORS["soft"], accent=COLORS["primary"], title_size=32, body_size=24)
    collections = {
        "users": d.box(120, 220, 470, 180, "users", "nickname, avatarUrl, gender\ncustomCategories[], theme\nbudgetDefault, createdAt", accent=COLORS["primary"]),
        "bills": d.box(1210, 220, 470, 190, "bills", "type, amount, category, date\nnote, photoUrl, mood\ncreatedAt", accent=COLORS["orange"]),
        "budgets": d.box(1210, 705, 470, 160, "budgets", "month(YYYY-MM), amount\ncreatedAt, updatedAt", accent=COLORS["blue"]),
        "ai_usage_limits": d.box(120, 705, 470, 180, "ai_usage_limits", "_id = openid_date_feature\ncount, limit, feature\ncreatedAt, updatedAt", accent=COLORS["purple"]),
        "client_logs": d.box(665, 840, 470, 160, "client_logs", "type, message, stack\nroute, createdAt", accent=COLORS["rose"]),
    }
    routes = {
        "users": (edge_mid(center_box, "left"), edge_mid(collections["users"], "right")),
        "bills": (edge_mid(center_box, "right"), edge_mid(collections["bills"], "left")),
        "budgets": ((center_box[0] + center_box[2], center_box[1] + center_box[3] - 15), edge_mid(collections["budgets"], "left")),
        "ai_usage_limits": ((center_box[0], center_box[1] + center_box[3] - 15), edge_mid(collections["ai_usage_limits"], "right")),
        "client_logs": (edge_mid(center_box, "bottom"), edge_mid(collections["client_logs"], "top")),
    }
    for start, end in routes.values():
        d.arrow(start[0], start[1], end[0], end[1], COLORS["muted"], 3)
    d.label(685, 205, "权限：所有集合均配置“仅创建者可读写”", "#ffffff", COLORS["primary_dark"], 500)
    d.text(690, 260, "服务端云函数再次校验操作者 _openid 与数据所有者匹配，避免越权写入/删除。", 24, COLORS["muted"], max_width=520, align="center")
    d.save("图5-2_数据库集合间逻辑关系图")


def fig_6_1() -> None:
    d = Diagram("图 6-1  app.js 启动初始化流程图", "App Launch Flow", 1450)
    steps = [
        ("1", "检查 wx.cloud 并初始化", "wx.cloud.init({ env, traceUser: true })"),
        ("2", "注册全局错误监控", "initMonitoring()，监听 onError / onUnhandledRejection"),
        ("3", "注册隐私授权监听", "initPrivacyAuthorization()"),
        ("4", "迁移旧版自定义主题", "migrateLegacyCustomTheme()"),
        ("5", "初始化当前主题", "initAppTheme(app)，写入 globalData.currentTheme"),
        ("6", "读取引导页标记", "Storage.has_seen_guide → globalData.hasSeenGuide"),
        ("7", "执行静默登录", "silentLogin() → quickstartFunctions.getOpenId → syncUserInfo()"),
    ]
    x, y = 410, 180
    prev = None
    for num, title, body in steps:
        box = d.box(x, y, 980, 120, f"{num}. {title}", body, fill="#ffffff", accent=COLORS["primary"] if num not in ["4", "7"] else COLORS["orange"], title_size=27, body_size=22)
        d.circle(x - 80, y + 60, 32, COLORS["primary"] if num not in ["4", "7"] else COLORS["orange"], outline="#ffffff", width=5)
        d.text(x - 91, y + 41, num, 24, "#ffffff", bold=True, max_width=24, align="center")
        if prev:
            d.arrow(edge_mid(prev, "bottom")[0], edge_mid(prev, "bottom")[1] + 8, edge_mid(box, "top")[0], edge_mid(box, "top")[1] - 8, COLORS["muted"], 3)
        prev = box
        y += 165
    d.box(80, 220, 210, 190, "异常分支", "若基础库不支持 wx.cloud：\n输出错误并终止初始化", fill="#fff4f4", accent=COLORS["danger"], title_size=24, body_size=20)
    d.box(1450, 1120, 260, 150, "并发保护", "_loginPromise 复用同一个登录请求，完成后置空", fill=COLORS["soft2"], accent=COLORS["blue"], title_size=25, body_size=21)
    d.arrow(1390, 1195, 1450, 1195, COLORS["blue"], 3)
    d.save("图6-1_appjs启动初始化流程图")


def fig_6_2() -> None:
    d = Diagram("图 6-2  对话记账运行流程图", "Conversational Billing Swimlane", 1540)
    lanes = [
        ("前端页面\nrecord / profile", 80, 520, COLORS["soft"], COLORS["primary"]),
        ("aiChat 云函数", 640, 520, COLORS["soft2"], COLORS["blue"]),
        ("混元模型\nhy3-preview", 1200, 520, "#fff7eb", COLORS["orange"]),
    ]
    for title, x, w, fill, accent in lanes:
        d.rounded_rect(x, 175, w, 1220, 28, fill, COLORS["gray"], 2)
        d.rect(x, 175, w, 62, accent, accent)
        d.text(x + 20, 192, title, 25, "#ffffff", bold=True, max_width=w - 40, align="center")

    front_steps = [
        (120, 280, "用户输入口语消费", "如“早餐 8，中午吃饭 20，打印 5 元”"),
        (120, 510, "渲染待确认账单卡", "可编辑金额/备注，可删除行，可选择新分类"),
        (120, 760, "用户确认记账", "点击“确认记账”"),
        (120, 1010, "调用 bills.batchCreate", "≤10 笔/次，批量写入账单"),
    ]
    func_steps = [
        (690, 285, "内容安全前置检查", "本地 BLOCK_PATTERNS + msgSecCheck"),
        (690, 430, "构造模型上下文", "最近 8 条消息 + 用户画像 + categories[] + today"),
        (690, 670, "三级容错解析", "剥 JSON 包裹 → 截取 {...} → JSON.parse"),
        (690, 845, "服务端清洗 bills[]", "金额、分类、备注、日期、敏感词过滤"),
        (690, 1130, "返回结果", "{ intent, reply, bills[] }"),
    ]
    model_steps = [
        (1260, 455, "generateText", "temperature=0.2\n输出严格 JSON"),
        (1260, 625, "结构化账单", "拆分多笔收支\n最多 10 笔"),
    ]
    boxes = []
    for x, y, title, body in front_steps:
        boxes.append(d.box(x, y, 420, 125, title, body, accent=COLORS["primary"], title_size=24, body_size=19))
    fboxes = []
    for x, y, title, body in func_steps:
        fboxes.append(d.box(x, y, 420, 125, title, body, accent=COLORS["blue"], title_size=24, body_size=19))
    mboxes = []
    for x, y, title, body in model_steps:
        mboxes.append(d.box(x, y, 360, 130, title, body, accent=COLORS["orange"], title_size=24, body_size=20))
    d.arrow(edge_mid(boxes[0], "right")[0] + 5, edge_mid(boxes[0], "right")[1], edge_mid(fboxes[0], "left")[0] - 8, edge_mid(fboxes[0], "left")[1], COLORS["primary"], 4)
    d.arrow(edge_mid(fboxes[1], "right")[0] + 5, edge_mid(fboxes[1], "right")[1], edge_mid(mboxes[0], "left")[0] - 8, edge_mid(mboxes[0], "left")[1], COLORS["blue"], 4)
    d.arrow(edge_mid(mboxes[1], "left")[0] - 8, edge_mid(mboxes[1], "left")[1], edge_mid(fboxes[2], "right")[0] + 5, edge_mid(fboxes[2], "right")[1], COLORS["orange"], 4)
    d.arrow(edge_mid(fboxes[4], "left")[0] - 8, edge_mid(fboxes[4], "left")[1], edge_mid(boxes[1], "right")[0] + 5, edge_mid(boxes[1], "right")[1], COLORS["blue"], 4)
    d.arrow(edge_mid(boxes[1], "bottom")[0], edge_mid(boxes[1], "bottom")[1] + 8, edge_mid(boxes[2], "top")[0], edge_mid(boxes[2], "top")[1] - 8, COLORS["muted"], 3)
    d.arrow(edge_mid(boxes[2], "bottom")[0], edge_mid(boxes[2], "bottom")[1] + 8, edge_mid(boxes[3], "top")[0], edge_mid(boxes[3], "top")[1] - 8, COLORS["muted"], 3)
    for a, b in zip(fboxes, fboxes[1:]):
        d.arrow(edge_mid(a, "bottom")[0], edge_mid(a, "bottom")[1] + 8, edge_mid(b, "top")[0], edge_mid(b, "top")[1] - 8, COLORS["muted"], 3)
    d.label(1040, 1400, "失败降级：模型异常或审核失败 → FALLBACK_REPLY，不写入账单", "#ffffff", COLORS["danger"], 620)
    d.save("图6-2_对话记账运行流程图")


def fig_7_1() -> None:
    d = Diagram("图 7-1  系统接口总体关系图", "System Interface Map", 1300)
    d.rounded_rect(80, 180, 480, 930, 30, COLORS["soft"], COLORS["gray"], 2)
    d.text(230, 205, "前端模块区", 30, COLORS["primary_dark"], bold=True, max_width=180, align="center")
    d.rounded_rect(660, 180, 480, 930, 30, COLORS["soft2"], COLORS["gray"], 2)
    d.text(810, 205, "云函数服务区", 30, COLORS["blue"], bold=True, max_width=200, align="center")
    d.rounded_rect(1240, 180, 480, 930, 30, "#fff7eb", COLORS["gray"], 2)
    d.text(1390, 205, "外部系统区", 30, COLORS["orange"], bold=True, max_width=200, align="center")
    front = [
        ("页面层", "login / guide / home / stats\nrecord / budget / profile\ncategories / themes / detail"),
        ("组件层", "custom-tab-bar"),
        ("工具层", "theme / eventBus / validate\nrateLimiter / privacy\ncontentSafety / monitor / dbPager"),
    ]
    fbs = []
    y = 300
    for title, body in front:
        fbs.append(d.box(125, y, 390, 165, title, body, accent=COLORS["primary"], title_size=26, body_size=19))
        y += 210
    funcs = [
        ("认证与写入", "quickstartFunctions\nbills / budgets"),
        ("AI 服务", "aiChat / aiPoster"),
        ("数据工具", "dataMigration / exportBills\nclearUserData / contentSafety"),
    ]
    cbs = []
    y = 300
    for title, body in funcs:
        cbs.append(d.box(705, y, 390, 155, title, body, accent=COLORS["blue"], title_size=26, body_size=19))
        y += 210
    exts = [
        ("微信 SDK", "wx.login / wx.cloud.database\nwx.cloud.callFunction"),
        ("CloudBase", "NoSQL 数据库 / 云存储\n云函数运行时"),
        ("AI 与审核", "混元 hy3-preview\nsecurity.msgSecCheck v2"),
    ]
    ebs = []
    y = 300
    for title, body in exts:
        ebs.append(d.box(1285, y, 390, 155, title, body, accent=COLORS["orange"], title_size=26, body_size=19))
        y += 210
    for fb in fbs:
        for cb in cbs:
            d.arrow(edge_mid(fb, "right")[0] + 5, edge_mid(fb, "right")[1], edge_mid(cb, "left")[0] - 8, edge_mid(cb, "left")[1], COLORS["muted"], 2)
    for cb in cbs:
        for eb in ebs:
            d.arrow(edge_mid(cb, "right")[0] + 5, edge_mid(cb, "right")[1], edge_mid(eb, "left")[0] - 8, edge_mid(eb, "left")[1], COLORS["muted"], 2)
    d.label(260, 1030, "客户端直读数据库，写操作走云函数", "#ffffff", COLORS["primary_dark"], 440)
    d.label(830, 1030, "服务端获取 OPENID，不信任客户端身份参数", "#ffffff", COLORS["blue"], 500)
    d.label(1280, 1030, "AI、内容安全、存储均由 CloudBase 统一承载", "#ffffff", COLORS["orange"], 430)
    d.save("图7-1_系统接口总体关系图")


def fig_9_1() -> None:
    d = Diagram("图 9-1  内容安全双层架构图", "Content Safety Architecture", 1220)
    pipeline = [
        ("用户文本输入", "备注 / 自定义分类 / 心情 / AI 对话", COLORS["primary"]),
        ("第一层：本地正则", "BLOCK_PATTERNS 快速拦截\n赌博、色情、毒品、枪爆、诈骗、自伤、暴恐", COLORS["orange"]),
        ("第二层：云端审核", "contentSafety 云函数调用\nsecurity.msgSecCheck v2", COLORS["blue"]),
        ("结果处理", "通过：继续业务流程\n拦截：toast 提示或 FALLBACK_REPLY\n异常：本地兜底，不阻塞主流程", COLORS["purple"]),
    ]
    x, y = 455, 190
    prev = None
    boxes = []
    for title, body, accent in pipeline:
        b = d.box(x, y, 890, 175, title, body, fill="#ffffff", accent=accent, title_size=28, body_size=22)
        boxes.append(b)
        if prev:
            d.arrow(edge_mid(prev, "bottom")[0], edge_mid(prev, "bottom")[1] + 10, edge_mid(b, "top")[0], edge_mid(b, "top")[1] - 10, COLORS["muted"], 4)
        prev = b
        y += 210
    d.box(115, 350, 250, 520, "客户端部署", "record/profile 输入前检查\ncontentSafety.js\nensureSafeText()\ncheckText()", fill=COLORS["soft"], accent=COLORS["primary"], title_size=25, body_size=21)
    d.box(1435, 350, 250, 520, "云端冗余部署", "contentSafety 云函数\naiChat 云函数\naiPoster 云函数\n三处均含 BLOCK_PATTERNS", fill="#fff7eb", accent=COLORS["orange"], title_size=25, body_size=21)
    d.arrow(365, 610, 455, 465, COLORS["primary"], 3)
    d.arrow(1345, 610, 1435, 610, COLORS["orange"], 3)
    d.label(615, 1045, "设计目的：快速拦截明显违规内容，同时用微信语义审核补足隐晦风险", "#ffffff", COLORS["primary_dark"], 700)
    d.save("图9-1_内容安全双层架构图")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fig_2_1()
    fig_3_1()
    fig_4_1()
    fig_5_1()
    fig_5_2()
    fig_6_1()
    fig_6_2()
    fig_7_1()
    fig_9_1()
    print(f"Generated diagrams in: {OUT_DIR}")


if __name__ == "__main__":
    main()
