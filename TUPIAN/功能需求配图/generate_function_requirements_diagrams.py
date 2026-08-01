from __future__ import annotations

import importlib.util
import math
from pathlib import Path
from xml.sax.saxutils import escape


OUT_DIR = Path(__file__).resolve().parent
BASE_SCRIPT = OUT_DIR.parent / "概要设计配图" / "generate_overview_diagrams.py"

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


def ellipse(
    d: Diagram,
    x: int,
    y: int,
    w: int,
    h: int,
    fill: str,
    outline: str | None = None,
    width: int = 2,
    shadow: bool = False,
) -> tuple[int, int, int, int]:
    if shadow:
        d.draw.ellipse((x + 5, y + 7, x + w + 5, y + h + 7), fill=(*hex_to_rgb("#dce8e1"), 255))
    d.draw.ellipse((x, y, x + w, y + h), fill=(*hex_to_rgb(fill), 255), outline=(*hex_to_rgb(outline or fill), 255), width=width)
    attrs = f'cx="{x + w / 2}" cy="{y + h / 2}" rx="{w / 2}" ry="{h / 2}" fill="{fill}"'
    if outline:
        attrs += f' stroke="{outline}" stroke-width="{width}"'
    if shadow:
        attrs += ' filter="url(#shadow)"'
    d.svg.append(f"<ellipse {attrs}/>")
    return (x, y, w, h)


def diamond(
    d: Diagram,
    x: int,
    y: int,
    w: int,
    h: int,
    title: str,
    body: str = "",
    fill: str = "#ffffff",
    outline: str = COLORS["gray"],
    accent: str = COLORS["orange"],
) -> tuple[int, int, int, int]:
    pts = [(x + w // 2, y), (x + w, y + h // 2), (x + w // 2, y + h), (x, y + h // 2)]
    d.draw.polygon(pts, fill=(*hex_to_rgb(fill), 255), outline=(*hex_to_rgb(outline), 255))
    d.draw.line(pts + [pts[0]], fill=(*hex_to_rgb(outline), 255), width=2)
    pt_str = " ".join(f"{px},{py}" for px, py in pts)
    d.svg.append(f'<polygon points="{pt_str}" fill="{fill}" stroke="{outline}" stroke-width="2"/>')
    d.text(x + 36, y + h // 2 - 26, title, 22, accent, bold=True, max_width=w - 72, align="center")
    if body:
        d.text(x + 46, y + h // 2 + 8, body, 18, COLORS["muted"], max_width=w - 92, align="center")
    return (x, y, w, h)


def actor(d: Diagram, x: int, y: int, label: str, color: str = COLORS["primary_dark"]) -> tuple[int, int, int, int]:
    d.circle(x + 60, y + 34, 24, "#ffffff", outline=color, width=4)
    d.line(x + 60, y + 60, x + 60, y + 132, color, 4)
    d.line(x + 16, y + 88, x + 104, y + 88, color, 4)
    d.line(x + 60, y + 132, x + 20, y + 190, color, 4)
    d.line(x + 60, y + 132, x + 100, y + 190, color, 4)
    d.text(x, y + 205, label, 22, color, bold=True, max_width=120, align="center")
    return (x, y, 120, 235)


def usecase(d: Diagram, x: int, y: int, w: int, h: int, text: str, accent: str = COLORS["primary"]) -> tuple[int, int, int, int]:
    b = ellipse(d, x, y, w, h, "#ffffff", COLORS["gray"], 2, shadow=True)
    d.text(x + 18, y + h // 2 - 19, text, 20, accent, bold=True, max_width=w - 36, align="center")
    return b


def small_note(d: Diagram, x: int, y: int, text: str, accent: str = COLORS["primary"], w: int = 360) -> None:
    d.label(x, y, text, "#ffffff", accent, w)


def connect_from_circle(
    d: Diagram,
    cx: int,
    cy: int,
    radius: int,
    box: tuple[int, int, int, int],
    color: str,
    width: int = 3,
) -> None:
    bx, by = center(box)
    dx, dy = bx - cx, by - cy
    length = math.hypot(dx, dy) or 1
    sx = int(cx + dx / length * (radius + 12))
    sy = int(cy + dy / length * (radius + 12))
    if abs(dx) >= abs(dy):
        ex = box[0] if dx > 0 else box[0] + box[2]
        ey = max(box[1] + 42, min(by, box[1] + box[3] - 42))
    else:
        ex = max(box[0] + 42, min(bx, box[0] + box[2] - 42))
        ey = box[1] if dy > 0 else box[1] + box[3]
    d.arrow(sx, sy, ex, ey, color, width)


def connect_center_to_box(
    d: Diagram,
    core: tuple[int, int, int, int],
    target: tuple[int, int, int, int],
    color: str,
    width: int = 3,
) -> None:
    dx = center(target)[0] - center(core)[0]
    dy = center(target)[1] - center(core)[1]
    if abs(dx) >= abs(dy):
        start = "right" if dx > 0 else "left"
        end = "left" if dx > 0 else "right"
    else:
        start = "bottom" if dy > 0 else "top"
        end = "top" if dy > 0 else "bottom"
    connect(d, core, target, color, start, end, width)


def fig_2_1() -> None:
    d = Diagram("图 2-1  橘记产品功能全景图", "Product Function Panorama", 1280)
    d.circle(900, 610, 150, COLORS["primary"], outline="#ffffff", width=8)
    d.text(780, 555, "橘记 Juji", 42, "#ffffff", bold=True, max_width=240, align="center")
    d.text(764, 625, "对话式智能记账\n微信小程序", 25, "#ffffff", max_width=270, align="center", line_gap=4)

    modules = [
        ("登录与引导", "微信静默登录\n隐私协议门禁\n首启 4 屏引导", 170, 240, COLORS["blue"]),
        ("记账", "新增 / 编辑 / 删除\n分类、日期、照片、心情\n防抖与日上限", 620, 170, COLORS["orange"]),
        ("智能中枢", "小橘聊天\n对话记账解析\n确定性账单问答", 1070, 170, COLORS["purple"]),
        ("首页仪表盘", "今日/昨日消费\n预算进度条\n账单流水", 1355, 430, COLORS["primary"]),
        ("统计分析", "趋势图 / 排行榜\nAI 便签评论\nperiodKey 缓存", 1260, 760, COLORS["blue"]),
        ("预算管理", "月预算设置\n进度环\nTop3 分类", 850, 930, COLORS["orange"]),
        ("个人中心", "头像昵称\nAI 信件/称号\n导入导出/清除", 430, 930, COLORS["purple"]),
        ("主题系统", "4 套预设\n8 色调色板\nDesign Token", 160, 720, COLORS["rose"]),
        ("安全隐私", "内容安全\n隐私授权\n异常监控", 235, 455, COLORS["primary"]),
    ]
    node_boxes = []
    for title, body, x, y, accent in modules:
        b = d.box(x, y, 300, 178, title, body, fill="#ffffff", accent=accent, title_size=25, body_size=18)
        node_boxes.append((b, accent))
    hub = (750, 460, 300, 300)
    for b, accent in node_boxes:
        connect_from_circle(d, 900, 610, 150, b, accent, 3)

    d.box(695, 790, 410, 95, "产品核心闭环", "记账输入 → 数据沉淀 → 统计复盘 → AI 陪伴 → 长期坚持", fill=COLORS["soft"], accent=COLORS["primary"], title_size=24, body_size=18)
    d.label(565, 1150, "定位：面向个人消费习惯养成的大模型驱动记账工具", "#ffffff", COLORS["primary_dark"], 680)
    d.save("图2-1_橘记产品功能全景图")


def fig_3_1() -> None:
    d = Diagram("图 3-1  功能结构层级图", "Functional Hierarchy", 1680)
    root = d.box(690, 170, 420, 110, "橘记功能需求", "7 大核心模块 + 2 个横切关注点", fill=COLORS["soft"], accent=COLORS["primary"], title_size=30, body_size=22)
    modules = [
        ("AUTH 登录与引导", "FR-AUTH-01 静默登录\nFR-AUTH-02 隐私门禁\nFR-AUTH-03 4 屏引导\nFR-AUTH-04 退出登录", 100, 390, COLORS["blue"]),
        ("REC 记账", "FR-REC-01 新增账单\nFR-REC-02 编辑账单\nFR-REC-03 删除账单\nFR-REC-04 收支切换\nFR-REC-05 自创分类\nFR-REC-09 频率限制", 510, 390, COLORS["orange"]),
        ("HOME 首页", "FR-HOME-01 今日/昨日概览\nFR-HOME-02 预算进度条\nFR-HOME-03 按日分组流水\nFR-HOME-05 进详情/长按删除", 980, 390, COLORS["primary"]),
        ("STAT 统计", "FR-STAT-01 月份切换\nFR-STAT-02 收支切换\nFR-STAT-03 分类占比\nFR-STAT-04 趋势图\nFR-STAT-05 AI 评论", 1390, 390, COLORS["blue"]),
        ("BUD 预算", "FR-BUD-01 月预算设置\nFR-BUD-02 预算进度环\nFR-BUD-03 达成率历史\nFR-BUD-04 消费节奏卡\nFR-BUD-05 Top3 分类", 100, 835, COLORS["orange"]),
        ("PROF 个人中心", "FR-PROF-01 头像昵称\nFR-PROF-03 记账足迹\nFR-PROF-04 AI 信件\nFR-PROF-05 每日称号\nFR-PROF-06/07 导入导出\nFR-PROF-08 数据清除", 510, 835, COLORS["purple"]),
        ("AI 智能中枢", "FR-AI-01 对话解析\nFR-AI-02 待确认卡\nFR-AI-03 新分类勾选\nFR-AI-04 批量写入\nFR-AI-05 小橘闲聊\nFR-AI-06 内容安全", 980, 835, COLORS["purple"]),
        ("THEME 主题系统", "FR-THEME-01 预设主题\nFR-THEME-02 调色板取色\nFR-THEME-03 用户主题 CRUD\nFR-THEME-04 即时换肤", 1390, 835, COLORS["rose"]),
        ("SEC 安全隐私", "隐私协议守卫\n内容安全审核\n服务端 OPENID\n异常监控 client_logs", 690, 1260, COLORS["primary"]),
    ]
    specs = []
    for title, body, x, y, accent in modules:
        h = 330 if "REC" in title or "PROF" in title or "AI" in title else 285
        specs.append((title, body, x, y, 320, h, accent))
    box_coords = [(x, y, w, h) for _, _, x, y, w, h, _ in specs]
    for b in box_coords[:4]:
        d.arrow(edge_mid(root, "bottom")[0], edge_mid(root, "bottom")[1] + 8, edge_mid(b, "top")[0], edge_mid(b, "top")[1] - 8, COLORS["gray"], 2)
    for b in box_coords[4:8]:
        d.arrow(edge_mid(root, "bottom")[0], edge_mid(root, "bottom")[1] + 8, edge_mid(b, "top")[0], edge_mid(b, "top")[1] - 8, COLORS["gray"], 2)
    connect(d, root, box_coords[8], COLORS["primary"], "bottom", "top", 3)
    for title, body, x, y, w, h, accent in specs:
        d.box(x, y, w, h, title, body, fill="#ffffff", accent=accent, title_size=23, body_size=17)
    d.label(575, 1580, "结构原则：核心模块覆盖用户路径，SEC 横切所有输入、云函数与数据访问", "#ffffff", COLORS["primary_dark"], 730)
    d.save("图3-1_功能结构层级图")


def fig_4_1() -> None:
    d = Diagram("图 4-1  系统用例图", "UML Use Case Diagram", 1280)
    user = actor(d, 100, 480, "用户")
    d.rounded_rect(360, 180, 950, 870, 28, COLORS["soft"], COLORS["gray"], 2)
    d.text(740, 205, "橘记小程序系统边界", 28, COLORS["primary_dark"], bold=True, max_width=360, align="center")
    cases = [
        ("自然语言\n对话记账", 470, 310, COLORS["purple"]),
        ("手动新增\n账单", 720, 310, COLORS["orange"]),
        ("编辑/删除\n账单", 970, 310, COLORS["orange"]),
        ("月度消费\n复盘", 470, 520, COLORS["blue"]),
        ("设置月度\n预算", 720, 520, COLORS["blue"]),
        ("导出账单\n数据", 970, 520, COLORS["primary"]),
        ("管理个人\n主题", 470, 730, COLORS["rose"]),
        ("AI 信件\n与称号", 720, 730, COLORS["purple"]),
        ("小橘闲聊\n问账", 970, 730, COLORS["purple"]),
    ]
    usecases = []
    for text, x, y, accent in cases:
        usecases.append((usecase(d, x, y, 180, 92, text, accent), accent))
    for b, accent in usecases:
        d.line(edge_mid(user, "right")[0] + 12, edge_mid(user, "right")[1], edge_mid(b, "left")[0] - 10, edge_mid(b, "left")[1], COLORS["muted"], 2)

    systems = [
        ("微信登录服务", "wx.login\nopenid", 1430, 270, COLORS["blue"]),
        ("混元大模型", "hy3-preview\n文本生成/解析", 1430, 520, COLORS["purple"]),
        ("CloudBase", "数据库 / 云函数\n云存储", 1430, 770, COLORS["primary"]),
    ]
    sys_boxes = []
    for title, body, x, y, accent in systems:
        sys_boxes.append(d.box(x, y, 280, 140, title, body, fill="#ffffff", accent=accent, title_size=23, body_size=18))
    d.line(edge_mid(sys_boxes[0], "left")[0] - 10, edge_mid(sys_boxes[0], "left")[1], edge_mid(usecases[0][0], "right")[0] + 8, edge_mid(usecases[0][0], "right")[1], COLORS["blue"], 2)
    d.line(edge_mid(sys_boxes[1], "left")[0] - 10, edge_mid(sys_boxes[1], "left")[1], edge_mid(usecases[7][0], "right")[0] + 8, edge_mid(usecases[7][0], "right")[1], COLORS["purple"], 2)
    d.line(edge_mid(sys_boxes[1], "left")[0] - 10, edge_mid(sys_boxes[1], "left")[1], edge_mid(usecases[8][0], "right")[0] + 8, edge_mid(usecases[8][0], "right")[1], COLORS["purple"], 2)
    for idx in [1, 2, 3, 4, 5]:
        d.line(edge_mid(sys_boxes[2], "left")[0] - 10, edge_mid(sys_boxes[2], "left")[1], edge_mid(usecases[idx][0], "right")[0] + 8, edge_mid(usecases[idx][0], "right")[1], COLORS["primary"], 2)
    d.save("图4-1_系统用例图")


def fig_4_2() -> None:
    d = Diagram("图 4-2  对话记账用例活动图", "UC-01 Activity Flow", 1480)
    steps = [
        ("开始", "用户打开小橘对话框", 690, 170, COLORS["primary"]),
        ("输入口语消费", "如：中午吃饭18、冰红茶4、电费40", 610, 330, COLORS["primary"]),
        ("内容安全检查", "本地正则 + msgSecCheck", 610, 500, COLORS["orange"]),
        ("调用 aiChat", "携带消息、分类列表、今日日期", 610, 670, COLORS["blue"]),
        ("AI 返回 JSON", "{intent, reply, bills[]}", 610, 840, COLORS["purple"]),
    ]
    boxes = []
    for title, body, x, y, accent in steps:
        boxes.append(d.box(x, y, 580 if title != "开始" else 420, 115, title, body, fill="#ffffff", accent=accent, title_size=26, body_size=20))
    for a, b in zip(boxes, boxes[1:]):
        connect(d, a, b, COLORS["muted"], "bottom", "top", 3)
    decision = diamond(d, 690, 1020, 420, 150, "是否解析出账单？", "intent=bill 且 bills 非空", accent=COLORS["orange"])
    connect(d, boxes[-1], decision, COLORS["muted"], "bottom", "top", 3)
    card = d.box(270, 1230, 440, 135, "展示待确认账单卡", "用户可编辑金额/备注、删除行、勾选新分类", fill="#ffffff", accent=COLORS["primary"], title_size=24, body_size=19)
    reply = d.box(1090, 1230, 440, 135, "展示普通回复", "闲聊 / 查账回复 / 失败兜底提示", fill="#ffffff", accent=COLORS["blue"], title_size=24, body_size=19)
    d.arrow(edge_mid(decision, "left")[0] - 8, edge_mid(decision, "left")[1], edge_mid(card, "top")[0], edge_mid(card, "top")[1] - 8, COLORS["primary"], 3)
    d.arrow(edge_mid(decision, "right")[0] + 8, edge_mid(decision, "right")[1], edge_mid(reply, "top")[0], edge_mid(reply, "top")[1] - 8, COLORS["blue"], 3)
    d.text(575, 1132, "是", 20, COLORS["primary_dark"], bold=True, max_width=40)
    d.text(1180, 1132, "否", 20, COLORS["blue"], bold=True, max_width=40)
    confirm = d.box(270, 1410, 440, 130, "确认记账", "调用 bills.batchCreate，最多 10 笔", fill=COLORS["soft"], accent=COLORS["primary"], title_size=24, body_size=20)
    cancel = d.box(810, 1410, 440, 130, "取消 / 删除行", "清空确认卡或保留对话上下文", fill="#fff7eb", accent=COLORS["orange"], title_size=24, body_size=20)
    connect(d, card, confirm, COLORS["primary"], "bottom", "top", 3)
    d.arrow(edge_mid(card, "right")[0] + 8, edge_mid(card, "right")[1], edge_mid(cancel, "top")[0], edge_mid(cancel, "top")[1] - 8, COLORS["orange"], 3)
    d.save("图4-2_对话记账用例活动图")


def fig_5_1() -> None:
    d = Diagram("图 5-1  登录与引导状态流转图", "Auth & Guide State Machine", 1180)
    states = [
        ("未同意隐私协议", "仅显示隐私协议弹窗\n不可使用功能", 130, 285, COLORS["rose"]),
        ("已同意协议", "写入 juji_privacy_agreed\n准备静默登录", 500, 285, COLORS["primary"]),
        ("静默登录中", "quickstartFunctions.getOpenId\nsyncUserInfo()", 870, 285, COLORS["blue"]),
        ("判断首启", "读取 has_seen_guide", 1240, 285, COLORS["orange"]),
        ("4 屏引导", "快 / 美 / 心 / 伴\n写入 has_seen_guide", 1035, 610, COLORS["purple"]),
        ("首页", "进入主 Tab\nonShow 拉取数据", 1415, 610, COLORS["primary"]),
        ("退出登录", "清空 globalData\n跳转登录页", 610, 820, COLORS["orange"]),
    ]
    boxes = []
    for title, body, x, y, accent in states:
        boxes.append(d.box(x, y, 280, 135, title, body, fill="#ffffff", accent=accent, title_size=23, body_size=18))
    for a, b in zip(boxes[:4], boxes[1:4]):
        connect(d, a, b, COLORS["muted"], "right", "left", 3)
    connect(d, boxes[3], boxes[4], COLORS["purple"], "bottom", "top", 3)
    connect(d, boxes[3], boxes[5], COLORS["primary"], "bottom", "top", 3)
    connect(d, boxes[4], boxes[5], COLORS["primary"], "right", "left", 3)
    connect(d, boxes[5], boxes[6], COLORS["orange"], "bottom", "right", 3)
    d.arrow(edge_mid(boxes[6], "left")[0] - 8, edge_mid(boxes[6], "left")[1], edge_mid(boxes[0], "bottom")[0], edge_mid(boxes[0], "bottom")[1] + 8, COLORS["orange"], 3)
    d.text(1170, 515, "首启", 20, COLORS["purple"], bold=True, max_width=70)
    d.text(1455, 515, "非首启", 20, COLORS["primary_dark"], bold=True, max_width=90)
    d.box(150, 925, 580, 110, "正式版约束", "头像、照片、文件导入导出等敏感能力触发前需 requirePrivacyAuthorization。", fill=COLORS["soft"], accent=COLORS["primary"], title_size=23, body_size=19)
    d.box(920, 925, 580, 110, "当前调试说明", "app.json 中 __usePrivacyCheck__ 暂为 false；提审前应恢复隐私检查。", fill="#fff7eb", accent=COLORS["orange"], title_size=23, body_size=19)
    d.save("图5-1_登录与引导状态流转图")


def fig_5_2() -> None:
    d = Diagram("图 5-2  记账主流程图", "Manual Billing Main Process", 1320)
    chain = [
        ("进入记账页", "record onShow\n加载主题和分类", COLORS["primary"]),
        ("选择收支模式", "expense / income\n动态切换分类网格", COLORS["orange"]),
        ("填写账单信息", "金额、分类、日期\n备注、照片、心情", COLORS["primary"]),
        ("前端校验", "validateBill()\n金额/日期/备注/照片格式", COLORS["blue"]),
        ("频率限制", "3s 防抖\n500 笔/日", COLORS["orange"]),
        ("云函数校验", "bills.create/update\n服务端二次校验", COLORS["purple"]),
        ("写入 bills", "返回成功\n首页和统计刷新", COLORS["primary"]),
    ]
    boxes = []
    y = 170
    for title, body, accent in chain:
        boxes.append(d.box(610, y, 580, 105, title, body, fill="#ffffff", accent=accent, title_size=25, body_size=19))
        y += 155
    for a, b in zip(boxes, boxes[1:]):
        connect(d, a, b, COLORS["muted"], "bottom", "top", 3)
    fail1 = d.box(135, 595, 330, 130, "校验失败", "Toast 提示\n留在当前页面修改", fill="#fff6f6", accent=COLORS["danger"], title_size=24, body_size=19)
    fail2 = d.box(1335, 595, 330, 130, "提交受限", "3s 内重复提交\n或超过 500 笔/日", fill="#fff7eb", accent=COLORS["orange"], title_size=24, body_size=19)
    fail3 = d.box(1335, 910, 330, 130, "云端失败", "金额/分类/照片非法\n或无权限修改", fill="#fff6f6", accent=COLORS["danger"], title_size=24, body_size=19)
    d.arrow(edge_mid(boxes[3], "left")[0] - 10, edge_mid(boxes[3], "left")[1], edge_mid(fail1, "right")[0] + 8, edge_mid(fail1, "right")[1], COLORS["danger"], 3)
    d.arrow(edge_mid(boxes[4], "right")[0] + 10, edge_mid(boxes[4], "right")[1], edge_mid(fail2, "left")[0] - 8, edge_mid(fail2, "left")[1], COLORS["orange"], 3)
    d.arrow(edge_mid(boxes[5], "right")[0] + 10, edge_mid(boxes[5], "right")[1], edge_mid(fail3, "left")[0] - 8, edge_mid(fail3, "left")[1], COLORS["danger"], 3)
    d.label(540, 1210, "关键保护：前端体验校验 + 云函数可信校验 + 所有权校验", "#ffffff", COLORS["primary_dark"], 720)
    d.save("图5-2_记账主流程图")


def fig_5_3() -> None:
    d = Diagram("图 5-3  统计页数据可视化示意", "Stats Page Data Visualization", 1180)
    phone = d.box(160, 190, 540, 850, "统计页面线框", "周期选择 / 收支切换 / 可视化 / AI 评论", fill="#ffffff", accent=COLORS["primary"], title_size=26, body_size=18)
    d.rounded_rect(210, 320, 440, 115, 20, COLORS["soft2"], COLORS["gray"], 2)
    d.text(245, 355, "近 30 天 / 本周 / 本月", 24, COLORS["blue"], bold=True, max_width=370, align="center")
    d.rounded_rect(210, 465, 440, 70, 22, COLORS["soft"], COLORS["gray"], 2)
    d.text(282, 488, "支出", 22, COLORS["primary_dark"], bold=True, max_width=80, align="center")
    d.text(480, 488, "收入", 22, COLORS["muted"], bold=True, max_width=80, align="center")
    d.rounded_rect(210, 575, 440, 215, 22, "#ffffff", COLORS["gray"], 2)
    d.text(240, 610, "趋势折线 / 柱状图", 24, COLORS["dark"], bold=True, max_width=260)
    points = [(250, 735), (310, 690), (370, 725), (430, 705), (500, 655), (580, 735)]
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        d.line(x1, y1, x2, y2, COLORS["primary"], 4)
    for x, y in points:
        d.circle(x, y, 8, "#ffffff", outline=COLORS["primary"], width=4)
    d.rounded_rect(210, 825, 440, 170, 22, "#ffffff", COLORS["gray"], 2)
    for i, (name, pct, col) in enumerate([("餐饮", 72, COLORS["orange"]), ("购物", 38, COLORS["blue"]), ("日用", 22, COLORS["purple"])]):
        y = 860 + i * 42
        d.text(245, y, name, 18, COLORS["dark"], bold=True, max_width=70)
        d.rounded_rect(330, y + 5, 260, 16, 8, COLORS["gray"], COLORS["gray"], 1)
        d.rounded_rect(330, y + 5, int(260 * pct / 100), 16, 8, col, col, 1)
    right = [
        ("数据来源", "bills 集合\n按 _openid + date 范围查询", COLORS["primary"], 820, 230),
        ("可视化区域", "总额趋势\n分类排行榜\nTop 8 占比", COLORS["blue"], 820, 430),
        ("AI 评论", "wx.cloud.extend.AI.streamText()\n昨日 / 上周 / 上月\nperiodKey 缓存", COLORS["purple"], 820, 650),
        ("失败处理", "429 退避重试\n失败不写缓存，允许下次重试", COLORS["orange"], 820, 880),
    ]
    for title, body, accent, x, y in right:
        d.box(x, y, 670, 145, title, body, fill="#ffffff", accent=accent, title_size=25, body_size=20)
    d.arrow(700, 650, 820, 500, COLORS["blue"], 3)
    d.arrow(700, 910, 820, 720, COLORS["purple"], 3)
    d.save("图5-3_统计页数据可视化示意")


def fig_5_4() -> None:
    d = Diagram("图 5-4  对话式记账需求场景图", "Conversational Billing Scenario", 1360)
    lanes = [
        ("用户", 90, 450, COLORS["soft"], COLORS["primary"]),
        ("小程序前端", 585, 450, COLORS["soft2"], COLORS["blue"]),
        ("AI / 云函数", 1080, 450, "#fff7eb", COLORS["orange"]),
    ]
    for title, x, w, fill, accent in lanes:
        d.rounded_rect(x, 185, w, 1040, 26, fill, COLORS["gray"], 2)
        d.rect(x, 185, w, 58, accent, accent)
        d.text(x + 120, 200, title, 26, "#ffffff", bold=True, max_width=200, align="center")
    u1 = d.box(140, 310, 350, 130, "口语输入", "“中午吃饭18、冰红茶4、电费40”", fill="#ffffff", accent=COLORS["primary"], title_size=24, body_size=20)
    f1 = d.box(645, 310, 330, 130, "发送上下文", "messages + categories[] + today", fill="#ffffff", accent=COLORS["blue"], title_size=24, body_size=19)
    a1 = d.box(1135, 310, 340, 130, "混元解析", "输出 bills[] 结构化 JSON", fill="#ffffff", accent=COLORS["orange"], title_size=24, body_size=19)
    a2 = d.box(1135, 535, 340, 220, "解析结果", "1 餐饮 ¥18  午餐\n2 餐饮 ¥4   冰红茶\n3 日用 ¥40  电费\n新分类：按规则处理", fill="#ffffff", accent=COLORS["purple"], title_size=24, body_size=19)
    f2 = d.box(645, 535, 330, 220, "待确认卡", "金额/备注可编辑\n可删除行\n新分类可勾选创建", fill="#ffffff", accent=COLORS["primary"], title_size=24, body_size=19)
    u2 = d.box(140, 650, 350, 130, "用户确认", "确认 / 取消 / 修改金额", fill="#ffffff", accent=COLORS["primary"], title_size=24, body_size=20)
    f3 = d.box(645, 850, 330, 130, "批量写入", "bills.batchCreate\n单次最多 10 笔", fill="#ffffff", accent=COLORS["orange"], title_size=24, body_size=19)
    a3 = d.box(1135, 850, 340, 130, "服务端校验", "金额、日期、分类、备注\n敏感内容过滤", fill="#ffffff", accent=COLORS["blue"], title_size=24, body_size=19)
    f4 = d.box(645, 1060, 330, 110, "刷新页面", "首页 / 统计页 onShow 重新拉取", fill="#ffffff", accent=COLORS["primary"], title_size=24, body_size=19)
    for a, b, color in [(u1, f1, COLORS["primary"]), (f1, a1, COLORS["blue"]), (a1, a2, COLORS["orange"]), (a2, f2, COLORS["purple"]), (f2, u2, COLORS["primary"]), (u2, f3, COLORS["orange"]), (f3, a3, COLORS["orange"]), (a3, f4, COLORS["primary"])]:
        connect(d, a, b, color, "right" if center(a)[0] < center(b)[0] else "left", "left" if center(a)[0] < center(b)[0] else "right", 3)
    d.label(560, 1260, "需求重点：AI 只生成待确认数据，最终写入必须由用户确认并通过服务端校验", "#ffffff", COLORS["primary_dark"], 780)
    d.save("图5-4_对话式记账需求场景图")


def fig_5_5() -> None:
    d = Diagram("图 5-5  待确认账单卡界面示意", "Confirmation Card Wireframe", 1220)
    d.rounded_rect(560, 190, 560, 900, 36, "#111111", "#111111", 2, shadow=True)
    d.rounded_rect(590, 220, 500, 840, 30, COLORS["bg"], COLORS["bg"], 1)
    d.text(710, 270, "小橘 AI 助手", 28, COLORS["dark"], bold=True, max_width=260, align="center")
    d.rounded_rect(635, 360, 410, 78, 18, "#ffffff", COLORS["gray"], 2)
    d.text(665, 383, "帮你理出这几笔，看看对不对~", 20, COLORS["muted"], max_width=350)
    d.rounded_rect(635, 475, 410, 420, 22, "#ffffff", COLORS["gray"], 2, shadow=True)
    rows = [("餐饮", "18.00", "午餐", False), ("餐饮", "4.00", "冰红茶", False), ("日用", "40.00", "电费", True)]
    for i, (cat, amount, note, is_new) in enumerate(rows):
        y = 510 + i * 120
        d.label(665, y, cat, COLORS["soft"], COLORS["primary_dark"], 92)
        d.text(780, y + 8, "¥", 20, COLORS["muted"], max_width=24)
        d.text(825, y + 4, amount, 25, COLORS["dark"], bold=True, max_width=120)
        d.circle(995, y + 22, 18, COLORS["soft"], outline=COLORS["soft"], width=1)
        d.text(987, y + 3, "×", 22, COLORS["primary_dark"], bold=True, max_width=18)
        d.rounded_rect(665, y + 52, 300, 40, 12, COLORS["soft"], COLORS["soft"], 1)
        d.text(682, y + 62, note, 18, COLORS["muted"], max_width=250)
        if is_new:
            d.rounded_rect(835, y + 94, 130, 30, 14, "#fff7eb", "#fff7eb", 1)
            d.text(850, y + 101, "新分类可勾选", 14, COLORS["orange"], bold=True, max_width=100)
    d.rounded_rect(665, 825, 155, 52, 18, COLORS["soft"], COLORS["soft"], 1)
    d.text(714, 842, "取消", 20, COLORS["primary_dark"], bold=True, max_width=60, align="center")
    d.rounded_rect(842, 825, 155, 52, 18, COLORS["primary"], COLORS["primary"], 1)
    d.text(875, 842, "确认记账", 20, "#ffffff", bold=True, max_width=90, align="center")
    annotations = [
        ("分类标签", 230, 505, 665, 530, COLORS["primary"]),
        ("金额输入", 250, 575, 825, 532, COLORS["orange"]),
        ("删除按钮", 1185, 525, 1010, 532, COLORS["rose"]),
        ("备注输入", 235, 675, 675, 680, COLORS["blue"]),
        ("新分类勾选", 1190, 790, 930, 845, COLORS["orange"]),
        ("确认 / 取消", 1190, 930, 920, 850, COLORS["primary"]),
    ]
    for text, tx, ty, px, py, color in annotations:
        d.label(tx, ty, text, "#ffffff", color, 170)
        d.arrow(tx + (170 if tx < 560 else 0), ty + 22, px, py, color, 3)
    d.label(525, 1130, "界面原则：AI 解析结果必须可编辑、可删除、可取消，用户确认后才写入账单", "#ffffff", COLORS["primary_dark"], 760)
    d.save("图5-5_待确认账单卡界面示意")


def fig_6_1() -> None:
    d = Diagram("图 6-1  数据实体关系图", "Data Entity Relationship", 1240)
    users = d.box(690, 470, 420, 190, "users / _openid", "用户根文档\nnickname, avatarUrl, gender\ncustomCategories[], theme\nbudgetDefault", fill=COLORS["soft"], accent=COLORS["primary"], title_size=30, body_size=21)
    entities = [
        ("bills", "每笔收支\namount/type/category/date\nphotoUrl/mood/note", 1235, 225, COLORS["orange"]),
        ("budgets", "月度预算\nmonth=YYYY-MM\n一用户一月一条", 1235, 780, COLORS["blue"]),
        ("ai_usage_limits", "AI 用量\n_id=openid_date_feature\ncount/limit/feature", 145, 780, COLORS["purple"]),
        ("client_logs", "客户端日志\ntype/message/stack\nroute/createdAt", 145, 225, COLORS["rose"]),
    ]
    boxes = []
    for title, body, x, y, accent in entities:
        boxes.append(d.box(x, y, 420, 170, title, body, fill="#ffffff", accent=accent, title_size=28, body_size=20))
    for b, color, label in zip(boxes, [COLORS["orange"], COLORS["blue"], COLORS["purple"], COLORS["rose"]], ["账单归属", "预算归属", "AI 限流", "异常日志"]):
        connect(d, users, b, color, "right" if center(b)[0] > center(users)[0] else "left", "left" if center(b)[0] > center(users)[0] else "right", 3)
        lx = (center(users)[0] + center(b)[0]) // 2 - 50
        ly = (center(users)[1] + center(b)[1]) // 2 - 20
        d.text(lx, ly, label, 18, color, bold=True, max_width=120, align="center")
    d.box(630, 210, 540, 110, "逻辑关联键", "所有实体都通过 _openid 归属于同一微信用户；NoSQL 不使用 JOIN。", fill="#ffffff", accent=COLORS["primary"], title_size=24, body_size=20)
    d.box(250, 1030, 380, 110, "内嵌数组", "users.customCategories[]\n分类小列表随用户档案读取", fill=COLORS["soft"], accent=COLORS["primary"], title_size=22, body_size=18)
    d.box(710, 1030, 380, 110, "幂等限流", "ai_usage_limits docId\nopenid_date_feature", fill=COLORS["soft2"], accent=COLORS["purple"], title_size=22, body_size=18)
    d.box(1170, 1030, 380, 110, "生命周期", "导入/导出/清除/日志清理\n均按 _openid 范围执行", fill="#fff7eb", accent=COLORS["orange"], title_size=22, body_size=18)
    d.save("图6-1_数据实体关系图")


def fig_7_1() -> None:
    d = Diagram("图 7-1  系统外部接口上下文图", "External Interface Context Diagram", 1260)
    core = d.box(710, 500, 380, 180, "橘记小程序", "原生微信小程序\nWXML / WXSS / JS\n自定义 TabBar + 10 页面", fill=COLORS["soft"], accent=COLORS["primary"], title_size=30, body_size=21)
    around = [
        ("微信平台", "wx.login\n隐私协议\nmsgSecCheck v2", 140, 250, COLORS["blue"]),
        ("混元大模型", "hunyuan-v3 / hy3-preview\n对话记账、AI 评论、信件", 1230, 250, COLORS["purple"]),
        ("CloudBase 数据库", "bills / budgets / users\nai_usage_limits / client_logs", 140, 780, COLORS["primary"]),
        ("CloudBase 云函数", "quickstart / bills / budgets\naiChat / aiPoster / dataMigration", 1230, 780, COLORS["orange"]),
        ("CloudBase 云存储", "头像、账单照片\nCSV/JSON 导出文件", 710, 930, COLORS["blue"]),
        ("设备硬件", "相机 / 相册 / 文件选择\n头像与账单照片", 710, 210, COLORS["rose"]),
    ]
    boxes = []
    for title, body, x, y, accent in around:
        boxes.append(d.box(x, y, 420, 155, title, body, fill="#ffffff", accent=accent, title_size=25, body_size=19))
    for b, color in zip(boxes, [COLORS["blue"], COLORS["purple"], COLORS["primary"], COLORS["orange"], COLORS["blue"], COLORS["rose"]]):
        connect_center_to_box(d, core, b, color, 3)
    d.label(545, 1130, "通信约束：HTTPS 传输，JSON 数据交换；写操作通过云函数，AI 流式响应用于统计评论", "#ffffff", COLORS["primary_dark"], 790)
    d.save("图7-1_系统外部接口上下文图")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fig_2_1()
    fig_3_1()
    fig_4_1()
    fig_4_2()
    fig_5_1()
    fig_5_2()
    fig_5_3()
    fig_5_4()
    fig_5_5()
    fig_6_1()
    fig_7_1()
    print(f"Generated function requirement diagrams in: {OUT_DIR}")


if __name__ == "__main__":
    main()
