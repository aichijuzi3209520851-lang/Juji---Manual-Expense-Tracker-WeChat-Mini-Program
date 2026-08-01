from __future__ import annotations

import base64
import importlib.util
import math
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw


OUT_DIR = Path(__file__).resolve().parent
ASSET_DIR = OUT_DIR.parent
PROJECT_ROOT = OUT_DIR.parents[1]
BASE_SCRIPT = ASSET_DIR / "概要设计配图" / "generate_overview_diagrams.py"

spec = importlib.util.spec_from_file_location("overview_diagrams", BASE_SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load drawing base: {BASE_SCRIPT}")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.OUT_DIR = OUT_DIR

Diagram = base.Diagram
COLORS = base.COLORS
center = base.center
edge_mid = base.edge_mid
hex_to_rgb = base.hex_to_rgb
W = base.W


SCREENSHOTS = {
    "record": ASSET_DIR / "记一笔界面展示.png",
    "home": ASSET_DIR / "首页展示.png",
    "stats": ASSET_DIR / "统计页面展示.png",
    "budget": ASSET_DIR / "预算界面展示.png",
    "profile": ASSET_DIR / "我的页面展示.png",
    "ai_record": ASSET_DIR / "小橘帮忙记账的界面展示.png",
    "themes": ASSET_DIR / "主题选择与设置界面展示.png",
}


THEMES = {
    "fresh": {
        "name": "温馨玫瑰 fresh",
        "primary": "#785655",
        "accent": "#6a7855",
        "bg": "#fffaf8",
        "container": "#f7cac9",
        "text": "#241918",
    },
    "dark": {
        "name": "夜猫子 dark",
        "primary": "#d4a574",
        "accent": "#a8c986",
        "bg": "#1a1a1f",
        "container": "#3d2d22",
        "text": "#f3ece6",
    },
    "mint": {
        "name": "清爽薄荷 mint",
        "primary": "#27c07d",
        "accent": "#5ba4cb",
        "bg": "#f7fbf8",
        "container": "#c5f0d9",
        "text": "#17231d",
    },
    "skyBlue": {
        "name": "蓝天白云 skyBlue",
        "primary": "#38bdf8",
        "accent": "#7e69cf",
        "bg": "#f5fbff",
        "container": "#cceeff",
        "text": "#062638",
    },
}


def connect(
    d: Diagram,
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
    color: str = COLORS["muted"],
    start: str = "right",
    end: str = "left",
    width: int = 3,
    dash: str | None = None,
) -> None:
    ax, ay = edge_mid(a, start)
    bx, by = edge_mid(b, end)
    dx = 10 if start == "right" else -10 if start == "left" else 0
    dy = 10 if start == "bottom" else -10 if start == "top" else 0
    ex = -10 if end == "left" else 10 if end == "right" else 0
    ey = -10 if end == "top" else 10 if end == "bottom" else 0
    d.arrow(ax + dx, ay + dy, bx + ex, by + ey, color, width, dash)


def connect_centers(
    d: Diagram,
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
    color: str,
    width: int = 3,
) -> None:
    dx = center(b)[0] - center(a)[0]
    dy = center(b)[1] - center(a)[1]
    if abs(dx) >= abs(dy):
        connect(d, a, b, color, "right" if dx > 0 else "left", "left" if dx > 0 else "right", width)
    else:
        connect(d, a, b, color, "bottom" if dy > 0 else "top", "top" if dy > 0 else "bottom", width)


def label(
    d: Diagram,
    x: int,
    y: int,
    text: str,
    color: str = COLORS["primary"],
    w: int = 260,
) -> tuple[int, int, int, int]:
    d.label(x, y, text, "#ffffff", color, w)
    return (x, y, w, 42)


def ellipse(
    d: Diagram,
    x: int,
    y: int,
    w: int,
    h: int,
    text: str,
    accent: str = COLORS["primary"],
    fill: str = "#ffffff",
) -> tuple[int, int, int, int]:
    d.draw.ellipse((x + 4, y + 7, x + w + 4, y + h + 7), fill=(*hex_to_rgb("#dce8e1"), 255))
    d.draw.ellipse((x, y, x + w, y + h), fill=(*hex_to_rgb(fill), 255), outline=(*hex_to_rgb(COLORS["gray"]), 255), width=2)
    d.svg.append(f'<ellipse cx="{x + w / 2}" cy="{y + h / 2}" rx="{w / 2}" ry="{h / 2}" fill="{fill}" stroke="{COLORS["gray"]}" stroke-width="2" filter="url(#shadow)"/>')
    d.text(x + 20, y + h // 2 - 23, text, 21, accent, bold=True, max_width=w - 40, align="center")
    return (x, y, w, h)


def diamond(
    d: Diagram,
    x: int,
    y: int,
    w: int,
    h: int,
    title: str,
    body: str = "",
    accent: str = COLORS["orange"],
) -> tuple[int, int, int, int]:
    pts = [(x + w // 2, y), (x + w, y + h // 2), (x + w // 2, y + h), (x, y + h // 2)]
    d.draw.polygon(pts, fill=(*hex_to_rgb("#ffffff"), 255), outline=(*hex_to_rgb(COLORS["gray"]), 255))
    d.draw.line(pts + [pts[0]], fill=(*hex_to_rgb(COLORS["gray"]), 255), width=2)
    pt_str = " ".join(f"{px},{py}" for px, py in pts)
    d.svg.append(f'<polygon points="{pt_str}" fill="#ffffff" stroke="{COLORS["gray"]}" stroke-width="2"/>')
    d.text(x + 45, y + h // 2 - 35, title, 22, accent, bold=True, max_width=w - 90, align="center")
    if body:
        d.text(x + 52, y + h // 2 + 4, body, 18, COLORS["muted"], max_width=w - 104, align="center")
    return (x, y, w, h)


def fit_cover(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert("RGBA")
    iw, ih = im.size
    scale = max(w / iw, h / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, (nw - w) // 2)
    top = max(0, (nh - h) // 2)
    return im.crop((left, top, left + w, top + h))


def add_raster_image(
    d: Diagram,
    path: Path,
    x: int,
    y: int,
    w: int,
    h: int,
    radius: int = 22,
) -> None:
    if not path.exists():
        d.rounded_rect(x, y, w, h, radius, "#ffffff", COLORS["gray"], 2)
        d.text(x + 25, y + h // 2 - 16, f"缺少素材\n{path.name}", 20, COLORS["danger"], max_width=w - 50, align="center")
        return
    im = fit_cover(Image.open(path), w, h)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w, h), radius, fill=255)
    d.image.paste(im, (x, y), mask)
    mime = "image/jpeg" if path.suffix.lower() in [".jpg", ".jpeg"] else "image/png"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    clip_id = f"clip_{abs(hash((str(path), x, y, w, h))) % 10_000_000}"
    d.svg.append(f'<defs><clipPath id="{clip_id}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}"/></clipPath></defs>')
    d.svg.append(
        f'<image href="data:{mime};base64,{data}" x="{x}" y="{y}" width="{w}" height="{h}" '
        f'preserveAspectRatio="xMidYMid slice" clip-path="url(#{clip_id})"/>'
    )


def phone_frame(
    d: Diagram,
    x: int,
    y: int,
    w: int,
    h: int,
    image_path: Path | None = None,
    screen_fill: str = "#ffffff",
) -> tuple[int, int, int, int]:
    d.rounded_rect(x, y, w, h, 48, "#111111", "#111111", 1, shadow=True)
    d.rounded_rect(x + 28, y + 38, w - 56, h - 76, 34, screen_fill, screen_fill, 1)
    d.rounded_rect(x + w // 2 - 38, y + 20, 76, 8, 4, "#2d2d2d", "#2d2d2d", 1)
    screen = (x + 28, y + 38, w - 56, h - 76)
    if image_path:
        add_raster_image(d, image_path, *screen, radius=32)
    return screen


def annotate(
    d: Diagram,
    text: str,
    lx: int,
    ly: int,
    tx: int,
    ty: int,
    color: str,
    w: int = 210,
) -> None:
    d.label(lx, ly, text, "#ffffff", color, w)
    start_x = lx + (w if lx < tx else 0)
    d.arrow(start_x, ly + 21, tx, ty, color, 3)


def screenshot_figure(
    title: str,
    subtitle: str,
    filename: str,
    image_path: Path,
    annotations: list[tuple[str, int, int, int, int, str]],
    height: int = 1240,
    phone: tuple[int, int, int, int] = (670, 190, 460, 900),
    note: str | None = None,
) -> None:
    d = Diagram(title, subtitle, height)
    screen = phone_frame(d, *phone, image_path)
    for text, lx, ly, tx, ty, color in annotations:
        annotate(d, text, lx, ly, tx, ty, color)
    if note:
        d.label(520, height - 88, note, "#ffffff", COLORS["primary_dark"], 760)
    d.save(filename)


def draw_mini_screen(d: Diagram, x: int, y: int, w: int, h: int, theme: dict[str, str], title: str) -> None:
    d.rounded_rect(x, y, w, h, 28, theme["bg"], COLORS["gray"], 2, shadow=True)
    d.rounded_rect(x + 22, y + 24, w - 44, 98, 24, theme["primary"], theme["primary"], 1)
    d.text(x + 45, y + 45, title, 22, theme["text"] if theme["primary"] == "#d4a574" else "#ffffff", bold=True, max_width=w - 90)
    d.text(x + 45, y + 78, "今日消费  ¥128.50", 17, theme["text"] if theme["primary"] == "#d4a574" else "#ffffff", max_width=w - 90)
    d.rounded_rect(x + 24, y + 150, w - 48, 68, 18, theme["container"], theme["container"], 1)
    d.text(x + 44, y + 170, "预算进度  42%", 17, theme["text"], max_width=w - 90)
    for i, (cat, amt) in enumerate([("餐饮", "18.00"), ("交通", "6.00"), ("日用", "40.00")]):
        yy = y + 245 + i * 76
        d.rounded_rect(x + 24, yy, w - 48, 56, 18, "#ffffff" if theme["name"].find("夜猫子") < 0 else "#25252d", COLORS["gray"], 1)
        d.text(x + 46, yy + 15, cat, 16, theme["text"], bold=True, max_width=120)
        d.text(x + w - 145, yy + 15, f"¥{amt}", 16, theme["primary"], bold=True, max_width=110, align="right")


def fig_2_1() -> None:
    d = Diagram("图 2-1  橘记系统总体架构图", "System Architecture", 1260)
    layers = [
        ("前端层", "10 个页面 + 自定义 TabBar + utils 工具层", "login / guide / home / stats / record / budget / profile / categories / themes / detail\n主题注入、事件总线、表单校验、频率限制、内容安全前置检查", COLORS["soft"], COLORS["primary"]),
        ("服务层", "CloudBase 云函数服务", "quickstartFunctions、bills、budgets、exportBills、aiPoster、dataMigration\nclearUserData、aiChat、contentSafety：统一获取 OPENID、校验、清洗和写入", COLORS["soft2"], COLORS["blue"]),
        ("数据与外部能力层", "NoSQL + 云存储 + 混元大模型", "bills / budgets / users / ai_usage_limits / client_logs\n头像、账单照片、导出文件；hunyuan-v3 / hy3-preview；msgSecCheck v2", "#fff7eb", COLORS["orange"]),
    ]
    y = 190
    prev = None
    for title, sub, body, fill, accent in layers:
        b = d.box(140, y, 1520, 230, title, sub, fill=fill, accent=accent, title_size=32, body_size=22)
        d.text(455, y + 72, body, 22, COLORS["dark"], max_width=1050, line_gap=6)
        if prev:
            connect(d, prev, b, COLORS["muted"], "bottom", "top", 3)
        prev = b
        y += 315
    d.label(530, 1135, "设计原则：小程序直接读、服务端统一写、AI 能力可降级、数据以 _openid 隔离", "#ffffff", COLORS["primary_dark"], 760)
    d.save("图2-1_橘记系统总体架构图")


def fig_3_1() -> None:
    d = Diagram("图 3-1  功能模块结构图", "Functional Module Map", 1480)
    root = d.box(690, 175, 420, 120, "橘记 Juji", "对话式智能记账小程序", fill=COLORS["soft"], accent=COLORS["primary"], title_size=34, body_size=22)
    modules = [
        ("登录与引导", "页面：login / guide\n函数：quickstartFunctions", 110, 385, COLORS["blue"]),
        ("首页仪表盘", "页面：home / detail\n函数：bills(delete)", 520, 385, COLORS["primary"]),
        ("手动记账", "页面：record / categories\n函数：bills(create/update)", 930, 385, COLORS["orange"]),
        ("统计复盘", "页面：stats\nAI 评论 + periodKey 缓存", 1340, 385, COLORS["blue"]),
        ("预算管理", "页面：budget\n函数：budgets upsert", 110, 820, COLORS["orange"]),
        ("个人中心", "页面：profile\naiPoster / exportBills\ndataMigration / clearUserData", 520, 820, COLORS["purple"]),
        ("AI 智能中枢", "页面：profile / stats / record\n函数：aiChat / aiPoster", 930, 820, COLORS["purple"]),
        ("主题系统", "页面：themes + custom-tab-bar\ntheme.js / eventBus", 1340, 820, COLORS["rose"]),
    ]
    coords = []
    for title, body, x, y, accent in modules:
        coords.append((x, y, 330, 185, accent, title, body))
    for x, y, w, h, accent, title, body in coords:
        connect(d, root, (x, y, w, h), accent, "bottom", "top", 2)
    for x, y, w, h, accent, title, body in coords:
        d.box(x, y, w, h, title, body, fill="#ffffff", accent=accent, title_size=25, body_size=19)
    sec = d.box(710, 1210, 380, 130, "横切关注点", "隐私授权 / 内容安全\n服务端 OPENID / client_logs", fill="#ffffff", accent=COLORS["primary"], title_size=26, body_size=20)
    connect(d, root, sec, COLORS["primary"], "bottom", "top", 3, dash="8 8")
    d.label(520, 1390, "结构说明：功能模块覆盖用户路径，安全、主题和 AI 能力贯穿多页面", "#ffffff", COLORS["primary_dark"], 760)
    d.save("图3-1_功能模块结构图")


def fig_3_2() -> None:
    d = Diagram("图 3-2  核心数据流时序图", "Core Data Sequence", 1260)
    actors = [
        ("用户", 130, COLORS["primary"]),
        ("record 记账页", 405, COLORS["orange"]),
        ("validate / rateLimiter", 720, COLORS["blue"]),
        ("bills 云函数", 1045, COLORS["purple"]),
        ("NoSQL bills", 1350, COLORS["primary"]),
        ("home 首页", 1580, COLORS["blue"]),
    ]
    xs = []
    for name, x, color in actors:
        d.box(x - 100, 170, 200, 75, name, "", fill="#ffffff", accent=color, title_size=20)
        d.line(x, 260, x, 1080, COLORS["gray"], 2, dash="10 10")
        xs.append(x)
    steps = [
        (0, 1, 330, "填写金额/分类/日期/备注", COLORS["orange"]),
        (1, 2, 425, "前端校验字段与频率", COLORS["blue"]),
        (2, 1, 520, "校验通过 / 错误提示", COLORS["blue"]),
        (1, 3, 620, "wx.cloud.callFunction('bills')", COLORS["purple"]),
        (3, 3, 715, "getWXContext().OPENID\n二次校验 + 清洗", COLORS["purple"]),
        (3, 4, 835, "写入 bills 集合", COLORS["primary"]),
        (4, 3, 930, "返回 docId / success", COLORS["primary"]),
        (3, 1, 1015, "保存成功", COLORS["purple"]),
        (1, 5, 1100, "switchTab / onShow 重新拉取", COLORS["blue"]),
    ]
    for a, b, y, text, color in steps:
        if a == b:
            d.rounded_rect(xs[a] + 22, y - 28, 210, 58, 16, "#ffffff", COLORS["gray"], 1)
            d.text(xs[a] + 42, y - 18, text, 16, color, bold=True, max_width=175, line_gap=2)
            d.arrow(xs[a] + 205, y - 28, xs[a] + 205, y + 28, color, 2)
        else:
            d.arrow(xs[a] + (15 if b > a else -15), y, xs[b] - (15 if b > a else -15), y, color, 3)
            d.text(min(xs[a], xs[b]) + 35, y - 36, text, 17, color, bold=True, max_width=260)
    d.label(565, 1160, "关键点：写操作不信任客户端 openid，最终由云函数使用服务端 OPENID 写入", "#ffffff", COLORS["primary_dark"], 700)
    d.save("图3-2_核心数据流时序图")


def fig_4_1() -> None:
    d = Diagram("图 4-1  数据库集合关系图", "Database Collection Relationship", 1240)
    users = d.box(690, 460, 420, 190, "users / _openid", "用户根档案\nnickname / avatarUrl / gender\ntheme / budgetDefault\ncustomCategories[]", fill=COLORS["soft"], accent=COLORS["primary"], title_size=29, body_size=20)
    entities = [
        ("bills", "每笔收支\namount / type / category / date\nphotoUrl / mood / note", 1235, 215, COLORS["orange"]),
        ("budgets", "月度预算\nmonth=YYYY-MM\n一用户一月一条", 1235, 770, COLORS["blue"]),
        ("ai_usage_limits", "AI 用量限制\n_id=openid_date_feature\ncount / limit / feature", 145, 770, COLORS["purple"]),
        ("client_logs", "客户端异常日志\ntype / route / message\nstack / createdAt", 145, 215, COLORS["rose"]),
    ]
    boxes = []
    for title, body, x, y, accent in entities:
        boxes.append(d.box(x, y, 420, 170, title, body, fill="#ffffff", accent=accent, title_size=27, body_size=19))
    for b, color, tag in zip(boxes, [COLORS["orange"], COLORS["blue"], COLORS["purple"], COLORS["rose"]], ["账单归属", "预算归属", "AI 限流", "异常归属"]):
        connect_centers(d, users, b, color, 3)
        mx, my = (center(users)[0] + center(b)[0]) // 2, (center(users)[1] + center(b)[1]) // 2
        d.text(mx - 55, my - 18, tag, 18, color, bold=True, max_width=110, align="center")
    d.box(600, 190, 600, 110, "逻辑关系键", "所有集合通过 _openid 归属于同一微信用户；NoSQL 不做 JOIN，按业务查询聚合。", fill="#ffffff", accent=COLORS["primary"], title_size=24, body_size=19)
    d.label(585, 1130, "数据隔离：数据库权限 + 云函数 OPENID + 代码所有权校验", "#ffffff", COLORS["primary_dark"], 640)
    d.save("图4-1_数据库集合关系图")


def fig_5_1() -> None:
    d = Diagram("图 5-1  登录与引导流程图", "Login & Guide Flow", 1180)
    steps = [
        ("启动 app.js", "CloudBase 初始化\n主题迁移", 130, 240, COLORS["primary"]),
        ("隐私协议检查", "未授权则弹窗\n同意后继续", 455, 240, COLORS["orange"]),
        ("读取 guide_done", "wx.Storage\n判断是否首次", 780, 240, COLORS["blue"]),
        ("静默登录", "quickstartFunctions\n获取 OPENID", 1105, 240, COLORS["purple"]),
        ("进入 guide", "4 屏引导\n完成后写标记", 625, 560, COLORS["blue"]),
        ("进入首页", "switchTab(home)\nonShow 拉取数据", 1105, 560, COLORS["primary"]),
    ]
    boxes = []
    for title, body, x, y, color in steps:
        boxes.append(d.box(x, y, 260, 120, title, body, fill="#ffffff", accent=color, title_size=24, body_size=18))
    for i in range(3):
        connect(d, boxes[i], boxes[i + 1], [COLORS["orange"], COLORS["blue"], COLORS["purple"]][i])
    connect(d, boxes[2], boxes[4], COLORS["blue"], "bottom", "top")
    connect(d, boxes[4], boxes[5], COLORS["primary"])
    connect(d, boxes[3], boxes[5], COLORS["primary"], "bottom", "top")
    diamond(d, 775, 455, 230, 130, "首次使用？", "否 → 登录\n是 → 引导", COLORS["orange"])
    d.label(585, 1020, "状态落点：globalData.openid、currentTheme、Storage guide_done/theme/user_themes", "#ffffff", COLORS["primary_dark"], 760)
    d.save("图5-1_登录与引导流程图")


def draw_guide_icon(d: Diagram, cx: int, cy: int, kind: str) -> None:
    if kind == "speed":
        d.circle(cx, cy, 34, COLORS["orange"], outline="#ffffff", width=4)
        d.line(cx - 62, cy - 14, cx - 34, cy - 14, COLORS["orange"], 5)
        d.line(cx - 72, cy + 4, cx - 36, cy + 4, COLORS["orange"], 5)
        d.line(cx - 54, cy + 22, cx - 28, cy + 22, COLORS["orange"], 5)
        d.circle(cx + 10, cy - 8, 7, "#ffffff")
    elif kind == "palette":
        for ox, oy, col in [(-20, -8, COLORS["rose"]), (8, -20, COLORS["blue"]), (20, 10, COLORS["orange"]), (-8, 20, COLORS["primary"])]:
            d.circle(cx + ox, cy + oy, 18, col, outline="#ffffff", width=3)
        d.circle(cx, cy, 32, "#ffffff", outline=COLORS["gray"], width=2)
    elif kind == "letter":
        d.rounded_rect(cx - 42, cy - 28, 84, 56, 10, "#ffffff", COLORS["purple"], 3)
        d.line(cx - 42, cy - 28, cx, cy + 8, COLORS["purple"], 3)
        d.line(cx + 42, cy - 28, cx, cy + 8, COLORS["purple"], 3)
        d.line(cx - 42, cy + 28, cx - 5, cy, COLORS["purple"], 3)
        d.line(cx + 42, cy + 28, cx + 5, cy, COLORS["purple"], 3)


def fig_5_2() -> None:
    d = Diagram("图 5-2  4 屏引导页运行截图", "Onboarding Screens", 1220)
    pages = [
        ("快", "speed", "极速，毫无负担", "打开即记，三步搞定。"),
        ("美", "palette", "高颜值，会呼吸", "空间计算美学，专属光影质感。"),
        ("心", "letter", "懂账单，更懂你", "小橘写下专属温情信件。"),
        ("伴", "mascot", "认识一下，小橘", "说一句消费，小橘帮你记好账。"),
    ]
    for i, (mark, kind, title, sub) in enumerate(pages):
        x = 120 + i * 410
        phone_frame(d, x, 200, 300, 720, None, "#f7fbf8")
        sx, sy, sw, sh = x + 28, 238, 244, 644
        d.text(sx + 35, sy + 40, mark, 92, "#dceee5", bold=True, max_width=160, align="center")
        d.draw.ellipse((sx + 70, sy + 155, sx + 174, sy + 259), fill=(*hex_to_rgb("#ffffff"), 210), outline=(*hex_to_rgb(COLORS["gray"]), 255), width=2)
        d.svg.append(f'<ellipse cx="{sx + 122}" cy="{sy + 207}" rx="52" ry="52" fill="#ffffff" stroke="{COLORS["gray"]}" stroke-width="2"/>')
        if i == 3:
            draw_mascot(d, sx + 78, sy + 165, 90)
        else:
            draw_guide_icon(d, sx + 122, sy + 207, kind)
        d.text(sx + 24, sy + 330, title, 23, COLORS["dark"], bold=True, max_width=196, align="center")
        d.text(sx + 28, sy + 390, sub, 16, COLORS["muted"], max_width=190, align="center")
        if i == 3:
            d.rounded_rect(sx + 34, sy + 520, 176, 48, 24, COLORS["primary"], COLORS["primary"], 1)
            d.text(sx + 62, sy + 532, "开启记账之旅", 16, "#ffffff", bold=True, max_width=120)
        d.text(x + 78, 950, f"第 {i + 1} 屏", 20, [COLORS["primary"], COLORS["blue"], COLORS["purple"], COLORS["orange"]][i], bold=True, max_width=140, align="center")
    d.label(470, 1110, "运行逻辑：swiper 切屏 + 动效重触发 + 完成后写入 guide_done", "#ffffff", COLORS["primary_dark"], 860)
    d.save("图5-2_4屏引导页运行截图")


def fig_5_3() -> None:
    screenshot_figure(
        "图 5-3  记账页运行截图",
        "Record Page Screenshot",
        "图5-3_记账页运行截图",
        SCREENSHOTS["record"],
        [
            ("收支切换", 260, 300, 705, 250, COLORS["orange"]),
            ("金额输入", 230, 430, 790, 350, COLORS["primary"]),
            ("分类网格", 230, 560, 830, 560, COLORS["blue"]),
            ("照片/心情", 1180, 470, 1010, 640, COLORS["purple"]),
            ("备注与日期", 1180, 660, 1000, 760, COLORS["orange"]),
            ("保存按钮", 1180, 870, 900, 980, COLORS["primary"]),
        ],
        note="页面能力：收支、分类、金额、日期、照片、心情、备注一次完成",
    )


def fig_5_4() -> None:
    d = Diagram("图 5-4  记账数据校验流程图", "Billing Validation Flow", 1240)
    steps = [
        ("表单输入", "type / amount / category\ndate / note / photoUrl", 145, 230, COLORS["primary"]),
        ("validateBill", "金额 > 0\n最多两位小数\n分类 <= 20 字", 460, 230, COLORS["blue"]),
        ("rateLimiter", "保存 3s 防抖\n每日 500 笔上限", 775, 230, COLORS["orange"]),
        ("contentSafety", "备注/分类敏感词\n必要时云端复检", 1090, 230, COLORS["rose"]),
        ("bills 云函数", "服务端 OPENID\n二次校验 + 清洗", 1405, 230, COLORS["purple"]),
        ("NoSQL 写入", "bills.add/update\n返回 success/docId", 775, 620, COLORS["primary"]),
    ]
    boxes = [d.box(x, y, 260, 130, t, b, fill="#ffffff", accent=c, title_size=23, body_size=18) for t, b, x, y, c in steps]
    for i in range(4):
        connect(d, boxes[i], boxes[i + 1], [COLORS["blue"], COLORS["orange"], COLORS["rose"], COLORS["purple"]][i])
    connect(d, boxes[4], boxes[5], COLORS["primary"], "bottom", "right")
    fail1 = d.box(480, 600, 260, 115, "前端失败", "toast 提示\n不调用云函数", fill="#fff6f6", accent=COLORS["danger"], title_size=23, body_size=18)
    fail2 = d.box(1110, 600, 270, 115, "云端失败", "返回错误码\n前端提示重试", fill="#fff6f6", accent=COLORS["danger"], title_size=23, body_size=18)
    connect(d, boxes[1], fail1, COLORS["danger"], "bottom", "top")
    connect(d, boxes[4], fail2, COLORS["danger"], "bottom", "top")
    d.label(530, 1065, "关键约束：前端校验提升体验，云函数校验保证数据可信", "#ffffff", COLORS["primary_dark"], 740)
    d.save("图5-4_记账数据校验流程图")


def fig_5_5() -> None:
    screenshot_figure(
        "图 5-5  首页仪表盘运行截图",
        "Home Dashboard Screenshot",
        "图5-5_首页仪表盘运行截图",
        SCREENSHOTS["home"],
        [
            ("渐变 hero", 250, 265, 790, 245, COLORS["primary"]),
            ("今日/昨日消费", 230, 405, 790, 360, COLORS["blue"]),
            ("预算进度", 1180, 400, 995, 450, COLORS["orange"]),
            ("季节标签", 230, 610, 785, 565, COLORS["purple"]),
            ("按日流水", 1180, 720, 990, 820, COLORS["primary"]),
        ],
        note="首页职责：消费概览、预算提醒、账单列表入口",
    )


def fig_5_6() -> None:
    screenshot_figure(
        "图 5-6  统计页运行截图",
        "Stats Page Screenshot",
        "图5-6_统计页运行截图",
        SCREENSHOTS["stats"],
        [
            ("月份切换", 250, 255, 790, 240, COLORS["blue"]),
            ("收支切换", 245, 405, 795, 375, COLORS["primary"]),
            ("趋势图", 230, 560, 815, 585, COLORS["orange"]),
            ("排行榜", 1180, 550, 990, 700, COLORS["purple"]),
            ("AI 便签评论", 1180, 820, 985, 900, COLORS["primary"]),
        ],
        note="统计页以当前工程实现为准：趋势、排行与 AI 便签评论组合展示",
    )


def fig_5_7() -> None:
    screenshot_figure(
        "图 5-7  预算页运行截图",
        "Budget Page Screenshot",
        "图5-7_预算页运行截图",
        SCREENSHOTS["budget"],
        [
            ("预算进度环", 240, 290, 820, 290, COLORS["primary"]),
            ("预算设置", 1180, 320, 990, 405, COLORS["orange"]),
            ("达成率历史", 225, 560, 790, 585, COLORS["blue"]),
            ("消费节奏卡", 1180, 620, 995, 700, COLORS["purple"]),
            ("Top3 分类", 1180, 870, 990, 930, COLORS["primary"]),
        ],
        note="预算页职责：设置月预算、观察进度、给出日均消费建议",
    )


def fig_5_8() -> None:
    screenshot_figure(
        "图 5-8  个人中心运行截图",
        "Profile Page Screenshot",
        "图5-8_个人中心运行截图",
        SCREENSHOTS["profile"],
        [
            ("头像昵称", 245, 250, 810, 230, COLORS["primary"]),
            ("记账足迹", 220, 425, 785, 430, COLORS["blue"]),
            ("AI 信件/称号", 1180, 475, 1010, 525, COLORS["purple"]),
            ("数据导出", 225, 700, 785, 760, COLORS["orange"]),
            ("清除数据", 1180, 820, 995, 895, COLORS["rose"]),
        ],
        note="个人中心聚合用户档案、成长反馈、AI 陪伴和数据管理",
    )


def draw_mascot(d: Diagram, x: int, y: int, s: int) -> None:
    d.draw.ellipse((x + int(0.1 * s), y + int(0.78 * s), x + int(0.9 * s), y + int(1.0 * s)), fill=(*hex_to_rgb("#dfe9df"), 255))
    d.draw.ellipse((x + int(0.18 * s), y + int(0.1 * s), x + int(0.82 * s), y + int(0.78 * s)), fill=(*hex_to_rgb("#f7a531"), 255), outline=(*hex_to_rgb("#e08118"), 255), width=max(2, s // 35))
    d.svg.append(f'<ellipse cx="{x + s * 0.5}" cy="{y + s * 0.44}" rx="{s * 0.32}" ry="{s * 0.34}" fill="#f7a531" stroke="#e08118" stroke-width="{max(2, s // 35)}"/>')
    d.draw.ellipse((x + int(0.42 * s), y - int(0.02 * s), x + int(0.70 * s), y + int(0.20 * s)), fill=(*hex_to_rgb("#27c07d"), 255), outline=(*hex_to_rgb("#157a51"), 255), width=max(2, s // 45))
    d.svg.append(f'<ellipse cx="{x + s * 0.56}" cy="{y + s * 0.09}" rx="{s * 0.14}" ry="{s * 0.11}" fill="#27c07d" stroke="#157a51" stroke-width="{max(2, s // 45)}"/>')
    for ex in [0.38, 0.62]:
        d.draw.ellipse((x + int((ex - 0.04) * s), y + int(0.35 * s), x + int((ex + 0.04) * s), y + int(0.43 * s)), fill=(20, 35, 29, 255))
        d.svg.append(f'<ellipse cx="{x + ex * s}" cy="{y + 0.39 * s}" rx="{0.04 * s}" ry="{0.04 * s}" fill="#14231d"/>')
    d.draw.arc((x + int(0.38 * s), y + int(0.45 * s), x + int(0.62 * s), y + int(0.62 * s)), 10, 170, fill=(*hex_to_rgb("#7a3f10"), 255), width=max(2, s // 35))
    d.svg.append(f'<path d="M {x + 0.38*s:.1f} {y + 0.53*s:.1f} Q {x + 0.5*s:.1f} {y + 0.64*s:.1f} {x + 0.62*s:.1f} {y + 0.53*s:.1f}" fill="none" stroke="#7a3f10" stroke-width="{max(2, s // 35)}" stroke-linecap="round"/>')
    d.line(x + int(0.18 * s), y + int(0.50 * s), x - int(0.04 * s), y + int(0.36 * s), "#e08118", max(2, s // 28))
    d.line(x + int(0.82 * s), y + int(0.50 * s), x + int(1.05 * s), y + int(0.30 * s), "#e08118", max(2, s // 28))
    d.line(x + int(0.33 * s), y + int(0.76 * s), x + int(0.22 * s), y + int(0.92 * s), "#e08118", max(2, s // 30))
    d.line(x + int(0.67 * s), y + int(0.76 * s), x + int(0.78 * s), y + int(0.92 * s), "#e08118", max(2, s // 30))


def fig_5_9() -> None:
    d = Diagram("图 5-9  小橘吉祥物形象图", "Juji Mascot", 1120)
    d.rounded_rect(420, 220, 960, 620, 36, "#ffffff", COLORS["gray"], 2, shadow=True)
    draw_mascot(d, 770, 330, 260)
    d.text(775, 630, "小橘", 44, COLORS["primary_dark"], bold=True, max_width=250, align="center")
    d.text(675, 700, "橘子身体、薄荷叶、微笑表情、招手动作", 24, COLORS["muted"], max_width=450, align="center")
    annotate(d, "薄荷叶", 340, 270, 905, 315, COLORS["primary"], 150)
    annotate(d, "橘子主体", 265, 430, 850, 475, COLORS["orange"], 170)
    annotate(d, "友好表情", 1180, 430, 890, 465, COLORS["purple"], 170)
    annotate(d, "招手陪伴", 1180, 270, 1040, 395, COLORS["blue"], 170)
    d.label(510, 970, "设计用途：引导页、AI 助手、空态提示和情感化反馈", "#ffffff", COLORS["primary_dark"], 780)
    d.save("图5-9_小橘吉祥物形象图")


def fig_5_10() -> None:
    d = Diagram("图 5-10  对话式记账端云协同流程图", "Conversational Billing Swimlane", 1360)
    lanes = [
        ("用户", 90, 400, COLORS["primary"], COLORS["soft"]),
        ("小程序前端", 520, 400, COLORS["blue"], COLORS["soft2"]),
        ("aiChat / bills", 950, 400, COLORS["orange"], "#fff7eb"),
        ("混元 / NoSQL", 1380, 330, COLORS["purple"], "#f6f2ff"),
    ]
    for title, x, w, color, fill in lanes:
        d.rounded_rect(x, 175, w, 1040, 28, fill, COLORS["gray"], 2)
        d.rect(x, 175, w, 58, color, color)
        d.text(x + 30, 190, title, 25, "#ffffff", bold=True, max_width=w - 60, align="center")
    nodes = [
        ("口语输入", "中午吃饭18\n冰红茶4 电费40", 155, 315, COLORS["primary"]),
        ("发送上下文", "messages + categories[]\n+ today", 575, 315, COLORS["blue"]),
        ("内容安全", "本地敏感词\nmsgSecCheck", 1005, 315, COLORS["rose"]),
        ("模型解析", "返回 JSON\nintent/reply/bills[]", 1425, 315, COLORS["purple"]),
        ("服务端清洗", "金额/分类/备注\n最多 10 笔", 1005, 555, COLORS["orange"]),
        ("待确认卡", "金额/备注可编辑\n新分类可勾选", 575, 555, COLORS["primary"]),
        ("用户确认", "确认 / 修改 / 删除", 155, 690, COLORS["primary"]),
        ("batchCreate", "调用 bills 云函数\n批量写入", 575, 835, COLORS["orange"]),
        ("NoSQL 写入", "bills 集合\n_openid 归属", 1425, 835, COLORS["primary"]),
        ("刷新页面", "home / stats\nonShow 拉取", 575, 1060, COLORS["blue"]),
    ]
    boxes = {t: d.box(x, y, 320, 135, t, body, fill="#ffffff", accent=c, title_size=23, body_size=18) for t, body, x, y, c in nodes}
    links = [
        ("口语输入", "发送上下文", COLORS["primary"]),
        ("发送上下文", "内容安全", COLORS["blue"]),
        ("内容安全", "模型解析", COLORS["purple"]),
        ("模型解析", "服务端清洗", COLORS["orange"]),
        ("服务端清洗", "待确认卡", COLORS["primary"]),
        ("待确认卡", "用户确认", COLORS["primary"]),
        ("用户确认", "batchCreate", COLORS["orange"]),
        ("batchCreate", "NoSQL 写入", COLORS["primary"]),
        ("NoSQL 写入", "刷新页面", COLORS["blue"]),
    ]
    for a, b, color in links:
        connect_centers(d, boxes[a], boxes[b], color)
    d.label(490, 1260, "关键点：AI 只生成待确认数据，最终写入必须经用户确认和服务端校验", "#ffffff", COLORS["primary_dark"], 820)
    d.save("图5-10_对话式记账端云协同流程图")


def fig_5_11() -> None:
    screenshot_figure(
        "图 5-11  待确认账单卡运行截图",
        "AI Confirmation Card Screenshot",
        "图5-11_待确认账单卡运行截图",
        SCREENSHOTS["ai_record"],
        [
            ("AI 解析结果", 240, 270, 800, 330, COLORS["purple"]),
            ("多笔账单", 220, 430, 800, 500, COLORS["primary"]),
            ("金额可编辑", 220, 560, 860, 560, COLORS["orange"]),
            ("删除单行", 1180, 470, 980, 520, COLORS["rose"]),
            ("新分类勾选", 1180, 720, 940, 760, COLORS["orange"]),
            ("确认写入", 1180, 900, 930, 900, COLORS["primary"]),
        ],
        note="交互原则：AI 解析后不直接入库，用户确认后才批量写入",
    )


def fig_6_1() -> None:
    d = Diagram("图 6-1  云函数调用关系总图", "Cloud Function Call Map", 1380)
    front = d.box(90, 245, 360, 760, "前端页面区", "login / guide\nhome / detail\nrecord / categories\nstats / budget\nprofile / themes", fill=COLORS["soft"], accent=COLORS["primary"], title_size=28, body_size=22)
    service = d.box(590, 205, 620, 845, "CloudBase 云函数服务区", "9 个核心业务云函数，统一承接登录、记账、预算、AI、安全和数据管理能力", fill="#ffffff", accent=COLORS["blue"], title_size=28, body_size=20)
    external = d.box(1360, 245, 350, 760, "外部能力区", "", fill="#fff7eb", accent=COLORS["orange"], title_size=28, body_size=22)

    groups = [
        ("基础与账单服务", "quickstartFunctions\nbills\nbudgets", 650, 370, COLORS["orange"]),
        ("AI 服务", "aiChat\naiPoster", 650, 610, COLORS["purple"]),
        ("数据管理服务", "exportBills\ndataMigration\nclearUserData", 650, 810, COLORS["blue"]),
        ("安全审核服务", "contentSafety", 930, 610, COLORS["rose"]),
    ]
    group_boxes = []
    for title, body, x, y, color in groups:
        group_boxes.append(d.box(x, y, 250, 150, title, body, fill="#ffffff", accent=color, title_size=21, body_size=18))

    resources = [
        ("NoSQL", "bills / budgets / users\nai_usage_limits / client_logs", 1410, 390, COLORS["primary"]),
        ("云存储", "头像 / 照片 / 导出文件", 1410, 575, COLORS["blue"]),
        ("混元大模型", "hunyuan-v3 / hy3-preview", 1410, 760, COLORS["purple"]),
        ("内容安全", "msgSecCheck v2", 1410, 945, COLORS["rose"]),
    ]
    resource_boxes = [d.box(x, y, 250, 120, title, body, fill="#ffffff", accent=color, title_size=22, body_size=17) for title, body, x, y, color in resources]

    connect(d, front, service, COLORS["blue"], "right", "left", 4)
    connect(d, service, external, COLORS["orange"], "right", "left", 4)
    connect(d, group_boxes[0], resource_boxes[0], COLORS["primary"], "right", "left", 3)
    connect(d, group_boxes[1], resource_boxes[2], COLORS["purple"], "right", "left", 3)
    connect(d, group_boxes[2], resource_boxes[0], COLORS["primary"], "right", "left", 2)
    connect(d, group_boxes[2], resource_boxes[1], COLORS["blue"], "right", "left", 3)
    connect(d, group_boxes[3], resource_boxes[3], COLORS["rose"], "right", "left", 3)

    d.label(175, 1075, "调用入口：wx.cloud.callFunction()", "#ffffff", COLORS["primary_dark"], 340)
    d.label(685, 1125, "服务端统一获取 OPENID、校验参数、过滤敏感内容、执行业务写入", "#ffffff", COLORS["primary_dark"], 690)
    d.label(485, 1260, "说明：空占位 generateImage-WtU3mJ 不计入核心业务云函数", "#ffffff", COLORS["primary_dark"], 820)
    d.save("图6-1_云函数调用关系总图")


def fig_7_1() -> None:
    d = Diagram("图 7-1  对话记账解析三级容错流程图", "AI JSON Fallback Flow", 1260)
    steps = [
        ("模型原始输出", "raw text", 690, 180, COLORS["purple"]),
        ("第 1 层：剥离代码块", "匹配 ```json ... ```\n取代码块内部文本", 620, 350, COLORS["blue"]),
        ("第 2 层：截取 JSON 对象", "从第一个 { 到最后一个 }\n容忍前后多余文字", 620, 535, COLORS["orange"]),
        ("第 3 层：JSON.parse", "解析 intent / reply / bills[]", 620, 720, COLORS["primary"]),
    ]
    boxes = [d.box(x, y, 560, 125, t, b, fill="#ffffff", accent=c, title_size=25, body_size=19) for t, b, x, y, c in steps]
    for i in range(len(boxes) - 1):
        connect(d, boxes[i], boxes[i + 1], COLORS["muted"], "bottom", "top")
    ok = d.box(280, 950, 360, 130, "成功", "sanitizeBills\n最多 10 笔 + 分类标记", fill=COLORS["soft"], accent=COLORS["primary"], title_size=26, body_size=19)
    fail = d.box(1160, 950, 360, 130, "失败", "原文作为普通聊天回复\nbills=[] / fallback", fill="#fff6f6", accent=COLORS["danger"], title_size=26, body_size=19)
    connect(d, boxes[-1], ok, COLORS["primary"], "bottom", "top")
    connect(d, boxes[-1], fail, COLORS["danger"], "bottom", "top")
    d.label(570, 1145, "容错目标：模型输出不稳定时，不阻断聊天体验，也不写入不可信账单", "#ffffff", COLORS["primary_dark"], 760)
    d.save("图7-1_对话记账解析三级容错流程图")


def fig_7_2() -> None:
    d = Diagram("图 7-2  主题色 HSL 推导示意图", "HSL Theme Derivation", 1200)
    primary = d.box(120, 310, 360, 170, "输入 primary", "用户选择色值\n如 #27c07d", fill=COLORS["soft"], accent=COLORS["primary"], title_size=27, body_size=20)
    hsl = d.box(585, 310, 360, 170, "hexToHsl()", "得到 h / s / l\n并进行 clamp", fill=COLORS["soft2"], accent=COLORS["blue"], title_size=27, body_size=20)
    accent = d.box(1050, 310, 360, 170, "accent=h+60°", "互补偏暖/偏冷辅助色\n用于 hero 渐变", fill="#fff7eb", accent=COLORS["orange"], title_size=27, body_size=20)
    derived = [
        ("容器色", "primaryContainer\nprimaryLight", 260, 660, COLORS["primary"]),
        ("语义文字色", "onPrimary\ntext / textSecondary", 635, 660, COLORS["blue"]),
        ("渐变 token", "gradient-hero\ngradient-hero-soft", 1010, 660, COLORS["orange"]),
        ("双阴影 token", "shadow-soft\nshadow-card / elevated", 1385, 660, COLORS["purple"]),
    ]
    for a, b, c in [(primary, hsl, COLORS["blue"]), (hsl, accent, COLORS["orange"])]:
        connect(d, a, b, c)
    boxes = []
    for title, body, x, y, color in derived:
        b = d.box(x, y, 270, 135, title, body, fill="#ffffff", accent=color, title_size=23, body_size=18)
        boxes.append(b)
        connect(d, hsl if title != "渐变 token" else accent, b, color, "bottom", "top")
    for i, theme in enumerate(["#27c07d", "#5ba4cb", "#f3a33a", "#8c7bd9"]):
        d.draw.ellipse((310 + i * 310, 910, 390 + i * 310, 990), fill=(*hex_to_rgb(theme), 255))
        d.svg.append(f'<ellipse cx="{350 + i * 310}" cy="950" rx="40" ry="40" fill="{theme}"/>')
    d.label(530, 1080, "实现位置：utils/theme.js generateCustomVars() 与 getThemeStyleString()", "#ffffff", COLORS["primary_dark"], 760)
    d.save("图7-2_主题色HSL推导示意图")


def fig_8_1() -> None:
    d = Diagram("图 8-1  四套预设主题对比图", "Preset Theme Comparison", 1220)
    for i, key in enumerate(["fresh", "dark", "mint", "skyBlue"]):
        theme = THEMES[key]
        x = 110 + i * 420
        d.text(x + 8, 178, theme["name"], 23, theme["primary"], bold=True, max_width=320, align="center")
        draw_mini_screen(d, x, 230, 320, 720, theme, "首页")
        d.rounded_rect(x + 40, 985, 240, 52, 26, theme["primary"], theme["primary"], 1)
        d.text(x + 82, 999, theme["primary"], 18, "#ffffff" if key != "dark" else "#1a1a1f", bold=True, max_width=150, align="center")
    d.label(475, 1125, "对比维度：主色、背景色、容器色、文字色和相同页面组件的视觉差异", "#ffffff", COLORS["primary_dark"], 850)
    d.save("图8-1_四套预设主题对比图")


def fig_8_2() -> None:
    d = Diagram("图 8-2  Design Token 体系层级图", "Design Token Hierarchy", 1240)
    levels = [
        ("基础色", "primary / accent / error\nincome / expense", 140, 230, COLORS["primary"]),
        ("语义色", "surface / bg / border\ntext / textSecondary", 510, 230, COLORS["blue"]),
        ("派生 token", "gradient-hero\nshadow-soft / card / elevated", 880, 230, COLORS["orange"]),
        ("组件变量", "card / hero / button\ntabbar / form / chart", 1250, 230, COLORS["purple"]),
        ("页面样式", "home / record / stats\nbudget / profile / themes", 690, 650, COLORS["primary"]),
    ]
    boxes = [d.box(x, y, 300, 150, t, b, fill="#ffffff", accent=c, title_size=25, body_size=19) for t, b, x, y, c in levels]
    for i in range(3):
        connect(d, boxes[i], boxes[i + 1], [COLORS["blue"], COLORS["orange"], COLORS["purple"]][i])
    for b in boxes[:4]:
        connect(d, b, boxes[4], COLORS["gray"], "bottom", "top", 2)
    storage = d.box(230, 790, 360, 130, "持久化", "Storage: theme / user_themes\n最多 5 个自定义主题", fill=COLORS["soft"], accent=COLORS["primary"], title_size=24, body_size=18)
    event = d.box(1210, 790, 360, 130, "分发机制", "eventBus: themeChanged\n页面 onShow 重新应用", fill=COLORS["soft2"], accent=COLORS["blue"], title_size=24, body_size=18)
    connect(d, storage, boxes[4], COLORS["primary"], "right", "left")
    connect(d, boxes[4], event, COLORS["blue"], "right", "left")
    d.label(520, 1115, "核心原因：小程序 CSS 变量继承限制，派生 token 需在 JS 中计算为实际值", "#ffffff", COLORS["primary_dark"], 780)
    d.save("图8-2_DesignToken体系层级图")


def draw_tab_icon(d: Diagram, cx: int, cy: int, kind: str, color: str) -> None:
    if kind == "home":
        d.line(cx - 18, cy + 2, cx, cy - 16, color, 3)
        d.line(cx, cy - 16, cx + 18, cy + 2, color, 3)
        d.rounded_rect(cx - 13, cy + 2, 26, 22, 4, "#eef7f2", color, 3)
    elif kind == "stats":
        d.line(cx - 18, cy + 18, cx - 4, cy + 3, color, 3)
        d.line(cx - 4, cy + 3, cx + 8, cy + 9, color, 3)
        d.line(cx + 8, cy + 9, cx + 20, cy - 12, color, 3)
        d.circle(cx + 20, cy - 12, 4, color)
    elif kind == "budget":
        d.circle(cx, cy, 20, "#eef7f2", outline=color, width=3)
        d.line(cx, cy, cx, cy - 18, color, 3)
        d.line(cx, cy, cx + 15, cy + 8, color, 3)
    elif kind == "profile":
        d.circle(cx, cy - 10, 9, color)
        d.draw.arc((cx - 19, cy, cx + 19, cy + 32), 200, 340, fill=(*hex_to_rgb(color), 255), width=3)
        d.svg.append(f'<path d="M {cx - 18} {cy + 20} Q {cx} {cy + 4} {cx + 18} {cy + 20}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round"/>')


def fig_8_3() -> None:
    d = Diagram("图 8-3  自定义 TabBar 截图", "Custom TabBar Mock", 1060)
    d.rounded_rect(450, 230, 900, 520, 44, "#ffffff", COLORS["gray"], 2, shadow=True)
    d.text(760, 285, "页面内容区域", 28, COLORS["muted"], bold=True, max_width=280, align="center")
    shell = (535, 600, 730, 130)
    d.rounded_rect(*shell, 46, "rgba(255,255,255,0.85)" if False else "#ffffff", COLORS["gray"], 2, shadow=True)
    items = [
        ("首页", "home", 610, COLORS["primary"]),
        ("统计", "stats", 760, COLORS["blue"]),
        ("记账", "record", 900, COLORS["orange"]),
        ("预算", "budget", 1040, COLORS["purple"]),
        ("我的", "profile", 1190, COLORS["rose"]),
    ]
    for label_text, kind, cx, color in items:
        if label_text == "记账":
            d.draw.ellipse((cx - 42, 560, cx + 42, 644), fill=(*hex_to_rgb(COLORS["primary"]), 255), outline=(*hex_to_rgb("#ffffff"), 255), width=6)
            d.svg.append(f'<ellipse cx="{cx}" cy="602" rx="42" ry="42" fill="{COLORS["primary"]}" stroke="#ffffff" stroke-width="6"/>')
            d.text(cx - 16, 575, "+", 42, "#ffffff", bold=True, max_width=32, align="center")
            d.text(cx - 34, 660, "记账", 17, COLORS["primary"], bold=True, max_width=70, align="center")
        else:
            d.draw.ellipse((cx - 28, 615, cx + 28, 671), fill=(*hex_to_rgb("#eef7f2"), 255), outline=(*hex_to_rgb(COLORS["gray"]), 255), width=1)
            d.svg.append(f'<ellipse cx="{cx}" cy="643" rx="28" ry="28" fill="#eef7f2" stroke="{COLORS["gray"]}" stroke-width="1"/>')
            draw_tab_icon(d, cx, 643, kind, color)
            d.text(cx - 34, 680, label_text, 17, COLORS["muted"], max_width=70, align="center")
    annotate(d, "毛玻璃外壳", 260, 610, 545, 620, COLORS["blue"], 190)
    annotate(d, "中间凸起按钮", 1220, 520, 935, 585, COLORS["orange"], 210)
    annotate(d, "5 个 Tab", 1210, 690, 1040, 670, COLORS["primary"], 160)
    d.label(505, 925, "实现文件：custom-tab-bar/index.wxml + index.wxss，选中态由 selected pagePath 控制", "#ffffff", COLORS["primary_dark"], 790)
    d.save("图8-3_自定义TabBar截图")


def fig_9_1() -> None:
    d = Diagram("图 9-1  内容安全双层审核流程图", "Content Safety Review Flow", 1180)
    user = d.box(140, 260, 300, 130, "用户输入", "账单备注 / 分类\n小橘聊天消息", fill="#ffffff", accent=COLORS["primary"], title_size=25, body_size=19)
    local = d.box(565, 260, 360, 130, "第一层：本地规则", "BLOCK_PATTERNS\n快速拦截高风险词", fill=COLORS["soft"], accent=COLORS["orange"], title_size=25, body_size=19)
    cloud = d.box(1050, 260, 360, 130, "第二层：微信安全", "contentSafety 云函数\nmsgSecCheck v2", fill=COLORS["soft2"], accent=COLORS["blue"], title_size=25, body_size=19)
    pass_box = d.box(565, 650, 330, 130, "通过", "允许 AI 解析\n或允许提交账单", fill=COLORS["soft"], accent=COLORS["primary"], title_size=27, body_size=20)
    block_box = d.box(1050, 650, 330, 130, "拦截 / 降级", "toast 提示\nAI fallback 回复", fill="#fff6f6", accent=COLORS["danger"], title_size=27, body_size=20)
    connect(d, user, local, COLORS["orange"])
    connect(d, local, cloud, COLORS["blue"])
    connect(d, cloud, pass_box, COLORS["primary"], "bottom", "top")
    connect(d, local, block_box, COLORS["danger"], "bottom", "top")
    connect(d, cloud, block_box, COLORS["danger"], "bottom", "top")
    d.label(500, 1015, "策略：先本地低成本拦截，再云端复检；云端异常时按场景降级，不写入风险内容", "#ffffff", COLORS["primary_dark"], 820)
    d.save("图9-1_内容安全双层审核流程图")


def fig_11_1() -> None:
    d = Diagram("图 11-1  部署流程图", "Deployment Flow", 1180)
    steps = [
        ("1 导入项目", "微信开发者工具\nAppID wx5c263d2b6496fe2d", COLORS["primary"]),
        ("2 部署云函数", "右键上传并部署\n安装依赖", COLORS["orange"]),
        ("3 创建集合", "bills / budgets / users\nai_usage_limits / client_logs", COLORS["blue"]),
        ("4 配置权限", "创建者可读写\n云函数服务端写入", COLORS["purple"]),
        ("5 开通混元", "小程序成长计划\nCloudBase AI 扩展", COLORS["primary"]),
        ("6 可选 LBS key", "如启用地点能力\n再配置密钥", COLORS["rose"]),
    ]
    boxes = []
    for i, (title, body, color) in enumerate(steps):
        x = 130 + (i % 3) * 520
        y = 260 + (i // 3) * 330
        boxes.append(d.box(x, y, 390, 145, title, body, fill="#ffffff", accent=color, title_size=24, body_size=18))
    for i in range(2):
        connect(d, boxes[i], boxes[i + 1], COLORS["muted"])
    connect(d, boxes[2], boxes[3], COLORS["muted"], "bottom", "top")
    connect(d, boxes[3], boxes[4], COLORS["muted"])
    connect(d, boxes[4], boxes[5], COLORS["muted"])
    d.box(540, 865, 720, 110, "验收检查", "真机预览：登录、记一笔、首页刷新、AI 对话、导出、主题切换均可运行", fill=COLORS["soft"], accent=COLORS["primary"], title_size=25, body_size=19)
    d.label(565, 1040, "部署结果：小程序前端 + CloudBase 云函数 + NoSQL + 云存储 + 混元能力闭环", "#ffffff", COLORS["primary_dark"], 730)
    d.save("图11-1_部署流程图")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fig_2_1()
    fig_3_1()
    fig_3_2()
    fig_4_1()
    fig_5_1()
    fig_5_2()
    fig_5_3()
    fig_5_4()
    fig_5_5()
    fig_5_6()
    fig_5_7()
    fig_5_8()
    fig_5_9()
    fig_5_10()
    fig_5_11()
    fig_6_1()
    fig_7_1()
    fig_7_2()
    fig_8_1()
    fig_8_2()
    fig_8_3()
    fig_9_1()
    fig_11_1()
    print(f"Generated detail design diagrams in: {OUT_DIR}")


if __name__ == "__main__":
    main()
