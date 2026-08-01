from __future__ import annotations

import importlib.util
from pathlib import Path


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


def connect(
    d: Diagram,
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
    color: str = COLORS["muted"],
    start: str = "right",
    end: str = "left",
    width: int = 3,
) -> None:
    ax, ay = edge_mid(a, start)
    bx, by = edge_mid(b, end)
    dx = 8 if start == "right" else -8 if start == "left" else 0
    dy = 8 if start == "bottom" else -8 if start == "top" else 0
    ex = -8 if end == "left" else 8 if end == "right" else 0
    ey = -8 if end == "top" else 8 if end == "bottom" else 0
    d.arrow(ax + dx, ay + dy, bx + ex, by + ey, color, width)


def fig_2_1() -> None:
    d = Diagram("图 2-1  数据访问架构图", "Database Access Architecture", 1260)
    d.label(145, 170, "小程序端", COLORS["soft"], COLORS["primary_dark"], 260)
    d.label(610, 170, "微信云开发 SDK", COLORS["soft2"], COLORS["blue"], 300)
    d.label(1010, 170, "云函数服务端", COLORS["soft2"], COLORS["blue"], 300)
    d.label(1415, 170, "CloudBase 资源", "#fff7eb", COLORS["orange"], 300)

    page_read = d.box(110, 255, 330, 135, "读路径页面", "home / stats / budget\nprofile / detail", fill="#ffffff", accent=COLORS["primary"])
    db_api = d.box(570, 255, 330, 135, "wx.cloud.database()", "客户端直连读取\n按 _openid 自动隔离", fill="#ffffff", accent=COLORS["blue"])
    nosql_read = d.box(1390, 255, 330, 135, "CloudBase NoSQL", "bills / budgets / users\nclient_logs / ai_usage_limits", fill="#ffffff", accent=COLORS["primary"])

    page_write = d.box(110, 570, 330, 150, "写路径页面", "record / categories / themes\nprofile / login", fill="#ffffff", accent=COLORS["orange"])
    call_fn = d.box(570, 570, 330, 150, "callFunction()", "wx.cloud.callFunction\n写操作统一入口\n不传可信 openid", fill="#ffffff", accent=COLORS["blue"], title_size=25, body_size=18)
    funcs = d.box(980, 570, 345, 150, "业务云函数", "quickstart / bills / budgets\nclearUserData / dataMigration", fill="#ffffff", accent=COLORS["purple"])
    nosql_write = d.box(1390, 520, 330, 135, "NoSQL 写入", "服务端校验后写集合\ncreate / update / delete", fill="#ffffff", accent=COLORS["primary"])
    storage = d.box(1390, 710, 330, 120, "云存储", "avatars / bills / exports\n头像、照片、导出文件", fill="#ffffff", accent=COLORS["blue"])

    connect(d, page_read, db_api, COLORS["primary"], width=4)
    d.text(330, 235, "读：页面直接查询", 20, COLORS["primary_dark"], bold=True, max_width=260, align="center")
    connect(d, db_api, nosql_read, COLORS["primary"], width=4)
    d.text(930, 235, "_openid 由数据库规则过滤", 20, COLORS["primary_dark"], bold=True, max_width=380, align="center")

    connect(d, page_write, call_fn, COLORS["orange"], width=4)
    connect(d, call_fn, funcs, COLORS["orange"], width=4)
    connect(d, funcs, nosql_write, COLORS["primary"], width=4)
    connect(d, funcs, storage, COLORS["blue"], width=4)
    d.text(865, 760, "服务端：cloud.getWXContext().OPENID", 21, COLORS["purple"], bold=True, max_width=430, align="center")

    d.box(130, 910, 410, 150, "数据库层", "集合权限：仅创建者可读写\nCloudBase 自动注入 _openid", fill=COLORS["soft"], accent=COLORS["primary"])
    d.box(695, 910, 410, 150, "服务端层", "写操作在云函数获取 OPENID\n拒绝客户端伪造身份", fill=COLORS["soft2"], accent=COLORS["blue"])
    d.box(1260, 910, 410, 150, "代码层", "update/delete 前读取原文档\n比对 _openid 后再执行", fill="#fff7eb", accent=COLORS["orange"])
    d.label(560, 1120, "访问原则：客户端高频读，服务端可信写，身份隔离贯穿全链路", "#ffffff", COLORS["primary_dark"], 720)
    d.save("图2-1_数据访问架构图")


def fig_3_1() -> None:
    d = Diagram("图 3-1  数据模型实体关系图", "NoSQL Entity Relationship", 1240)
    users = d.box(685, 500, 430, 190, "users / _openid", "用户根文档\nnickname, avatarUrl, gender\ncustomCategories[], theme\nbudgetDefault", fill=COLORS["soft"], accent=COLORS["primary"], title_size=30, body_size=21)
    bills = d.box(1195, 230, 440, 185, "bills", "type, amount, category, date\nnote, photoUrl, mood\ncreatedAt", fill="#ffffff", accent=COLORS["orange"])
    budgets = d.box(1195, 805, 440, 160, "budgets", "month(YYYY-MM), amount\ncreatedAt, updatedAt\n一用户一月一条", fill="#ffffff", accent=COLORS["blue"])
    limits = d.box(165, 805, 460, 185, "ai_usage_limits", "_id = openid_date_feature\ndate, feature, count, limit\ncreatedAt, updatedAt", fill="#ffffff", accent=COLORS["purple"])
    logs = d.box(165, 230, 460, 165, "client_logs", "type, message, stack\nroute, createdAt\n前端异常监控", fill="#ffffff", accent=COLORS["rose"])

    routes = [
        ((users[0] + users[2], users[1] + 55), edge_mid(bills, "left"), "账单归属", COLORS["orange"]),
        ((users[0] + users[2], users[1] + users[3] - 35), edge_mid(budgets, "left"), "预算归属", COLORS["blue"]),
        ((users[0], users[1] + users[3] - 35), edge_mid(limits, "right"), "AI 限流", COLORS["purple"]),
        ((users[0], users[1] + 55), edge_mid(logs, "right"), "异常日志", COLORS["rose"]),
    ]
    for start, end, label, color in routes:
        d.arrow(start[0], start[1], end[0], end[1], color, 3)
        lx = (start[0] + end[0]) // 2 - 55
        ly = (start[1] + end[1]) // 2 - 18
        d.text(lx, ly, label, 18, color, bold=True, max_width=120, align="center")

    d.box(635, 230, 530, 115, "逻辑关联键", "所有集合通过 _openid 归属于同一微信用户；数据库层不使用 JOIN。", fill="#ffffff", accent=COLORS["primary"], title_size=24, body_size=20)
    d.box(200, 1030, 390, 120, "内嵌文档", "users.customCategories[]\n小规模列表随用户档案读取", fill=COLORS["soft"], accent=COLORS["primary"], title_size=24, body_size=19)
    d.box(705, 1030, 390, 120, "幂等计数器", "ai_usage_limits._id\nopenid_date_feature", fill=COLORS["soft2"], accent=COLORS["purple"], title_size=24, body_size=19)
    d.box(1210, 1030, 390, 120, "月份归档", "budgets.month\n按月 upsert 防重复", fill="#fff7eb", accent=COLORS["orange"], title_size=24, body_size=19)
    d.save("图3-1_数据模型实体关系图")


def fig_4_1() -> None:
    d = Diagram("图 4-1  bills 访问模式图", "Bills Access Pattern", 1300)
    hub = d.box(700, 480, 400, 220, "bills 集合", "核心账单数据\n_openid, type, amount, category\ndate, note, photoUrl, mood\ncreatedAt", fill=COLORS["soft"], accent=COLORS["orange"], title_size=30, body_size=21)

    nodes = {
        "home": d.box(160, 230, 365, 155, "home 首页", "最近账单 / 月度总支出\nwhere _openid + date\norderBy date desc", fill="#ffffff", accent=COLORS["primary"], body_size=18),
        "stats": d.box(670, 210, 460, 155, "stats 统计页", "按月/半年聚合\n分类排行与趋势\nwhere _openid + date range", fill="#ffffff", accent=COLORS["primary"], body_size=18),
        "record": d.box(160, 520, 365, 170, "record 记账页", "create / update\nbatchCreate <= 10\n客户端校验 + 服务端校验", fill="#ffffff", accent=COLORS["orange"], body_size=18),
        "detail": d.box(160, 820, 365, 155, "detail 详情页", "按 _id 读取单条\n编辑前用 _editBillId 桥接\n删除走 bills 云函数", fill="#ffffff", accent=COLORS["blue"], body_size=18),
        "profile": d.box(1245, 230, 390, 170, "profile / dataMigration", "JSON export / import\n批量恢复 bills\n导入前剥离 _id/_openid", fill="#ffffff", accent=COLORS["purple"], body_size=18),
        "export": d.box(1245, 540, 390, 155, "exportBills", "CSV 导出\n读取 bills + 用户昵称\n写入云存储 exports", fill="#ffffff", accent=COLORS["blue"], body_size=18),
        "storage": d.box(1245, 850, 390, 145, "云存储 bills/", "photoUrl 指向账单照片\nclearUserData 清理文件", fill="#ffffff", accent=COLORS["blue"], body_size=18),
    }

    for key in ["home", "stats", "record", "detail"]:
        connect(d, nodes[key], hub, COLORS["primary"] if key in ["home", "stats"] else COLORS["orange"], "right", "left", 3)
    connect(d, hub, nodes["profile"], COLORS["purple"], "right", "left", 3)
    connect(d, hub, nodes["export"], COLORS["blue"], "right", "left", 3)
    connect(d, hub, nodes["storage"], COLORS["blue"], "right", "left", 3)

    d.box(610, 825, 580, 130, "所有权校验", "update/delete 前先读取 bills.doc(billId)，确认 _openid === OPENID 后执行。", fill="#fff7eb", accent=COLORS["orange"], title_size=24, body_size=20)
    d.box(610, 1010, 580, 145, "索引建议", "idx_bills_user_date：_openid + date\nidx_bills_user_created：_openid + createdAt", fill="#ffffff", accent=COLORS["primary"], title_size=24, body_size=18)
    d.label(590, 1180, "访问特征：高频读集中在日期范围查询，低频写统一走 bills 云函数", "#ffffff", COLORS["primary_dark"], 720)
    d.save("图4-1_bills访问模式图")


def fig_6_1() -> None:
    d = Diagram("图 6-1  users 集合内嵌结构示意图", "Users Document Structure", 1360)
    root = d.box(130, 255, 410, 185, "users 文档", "_id, _openid\ncreatedAt, lastLoginAt\n用户数据根节点", fill=COLORS["soft"], accent=COLORS["primary"], title_size=28, body_size=21)

    profile = d.box(700, 195, 390, 200, "基础资料字段", "nickname\navatarUrl\ngender / birthday / occupation\nbudgetDefault", fill="#ffffff", accent=COLORS["blue"], title_size=25, body_size=21)
    cats = d.box(700, 485, 390, 260, "customCategories[]", "[\n  { name: '咖啡', icon: 'coffee' },\n  { name: '宠物', icon: 'pet' }\n]\n小规模内嵌，随用户读取", fill="#ffffff", accent=COLORS["orange"], title_size=25, body_size=20)
    theme = d.box(700, 835, 390, 150, "theme", "当前主题 id\nmint / sunset / ocean / forest\n或本地自定义主题 id", fill="#ffffff", accent=COLORS["purple"], title_size=25, body_size=20)
    local_theme = d.box(1215, 835, 390, 155, "wx.Storage user_themes[]", "本地保存自定义主题列表\n主题切换时同步 users.theme\n当前实现不作为云端数组", fill="#fff7eb", accent=COLORS["orange"], title_size=24, body_size=19)

    connect(d, root, profile, COLORS["blue"], width=3)
    connect(d, root, cats, COLORS["orange"], width=3)
    connect(d, root, theme, COLORS["purple"], width=3)
    connect(d, theme, local_theme, COLORS["orange"], width=3)

    d.box(140, 560, 390, 130, "app.js syncUserInfo()", "首次登录创建 users\n再次登录更新 lastLoginAt", fill="#ffffff", accent=COLORS["primary"], title_size=23, body_size=19)
    d.box(140, 750, 390, 135, "profile 页", "更新 nickname/avatarUrl\ngender/birthday/occupation", fill="#ffffff", accent=COLORS["blue"], title_size=23, body_size=19)
    d.box(140, 940, 390, 135, "record / categories 页", "增删 customCategories\n对话记账可追加新分类", fill="#ffffff", accent=COLORS["orange"], title_size=23, body_size=19)
    d.box(140, 1130, 390, 120, "themes 页", "切换 theme\n自定义主题写入 Storage", fill="#ffffff", accent=COLORS["purple"], title_size=23, body_size=19)
    d.label(670, 1165, "设计取舍：用户档案低频更新，分类小列表内嵌；主题列表留在本地缓存以降低云端写入", "#ffffff", COLORS["primary_dark"], 820)
    d.save("图6-1_users集合内嵌结构示意图")


def fig_7_1() -> None:
    d = Diagram("图 7-1  ai_usage_limits 幂等限流流程图", "AI Usage Limit Flow", 1440)
    steps = [
        ("1. 接收 AI 功能请求", "aiPoster 云函数\nprofileLetter / profileTitle", COLORS["primary"]),
        ("2. 生成日期键", "北京时间 YYYY-MM-DD\n避免跨时区计数偏差", COLORS["blue"]),
        ("3. 构造 docId", "openid_date_feature\nreplace 非法字符为 _", COLORS["purple"]),
        ("4. 查询计数文档", "db.collection('ai_usage_limits').doc(docId).get()", COLORS["blue"]),
        ("5A. 不存在：初始化", "count = 1\nlimit = 30 或 8\ncreatedAt / updatedAt", COLORS["primary"]),
        ("5B. 已存在：检查限额", "count >= limit 则拒绝\n否则 count + 1", COLORS["orange"]),
        ("6. 允许调用 AI", "混元 generateText\n返回 remaining", COLORS["primary"]),
    ]
    boxes = []
    x, y = 470, 185
    for idx, (title, body, accent) in enumerate(steps):
        bx = x if idx not in [4, 5] else (260 if idx == 4 else 820)
        by = y if idx < 4 else 835
        w = 860 if idx < 4 or idx == 6 else 480
        h = 125 if idx < 4 else 150
        if idx == 6:
            by = 1090
            bx = x
            w = 860
            h = 125
        boxes.append(d.box(bx, by, w, h, title, body, fill="#ffffff", accent=accent, title_size=25, body_size=20))
        if idx < 3:
            y += 165

    for a, b in zip(boxes[:4], boxes[1:4]):
        connect(d, a, b, COLORS["muted"], "bottom", "top", 3)
    connect(d, boxes[3], boxes[4], COLORS["primary"], "bottom", "top", 3)
    connect(d, boxes[3], boxes[5], COLORS["orange"], "bottom", "top", 3)
    connect(d, boxes[4], boxes[6], COLORS["primary"], "bottom", "top", 3)
    connect(d, boxes[5], boxes[6], COLORS["orange"], "bottom", "top", 3)

    d.box(120, 245, 260, 170, "功能限额", "profileLetter：30 次/日\nprofileTitle：8 次/日", fill=COLORS["soft"], accent=COLORS["primary"], title_size=24, body_size=20)
    d.box(1380, 245, 260, 170, "拒绝分支", "超过 limit：\n返回 remaining=0\n不调用 AI 模型", fill="#fff4f4", accent=COLORS["danger"], title_size=24, body_size=20)
    d.arrow(1300, 910, 1380, 330, COLORS["danger"], 3)
    d.label(555, 1285, "幂等核心：同一用户、同一日期、同一功能只命中同一个计数文档", "#ffffff", COLORS["primary_dark"], 760)
    d.save("图7-1_ai_usage_limits幂等限流流程图")


def fig_9_1() -> None:
    d = Diagram("图 9-1  数据权限三层防线示意图", "Data Permission Defense", 1260)
    layers = [
        ("第一层：数据库安全规则", "CloudBase 控制台为 5 个集合配置「仅创建者可读写」\n适用于 bills / budgets / users / ai_usage_limits / client_logs", COLORS["primary"], COLORS["soft"]),
        ("第二层：云函数 OPENID", "写操作在服务端执行 cloud.getWXContext().OPENID\n不接收、不信任客户端传入的 openid", COLORS["blue"], COLORS["soft2"]),
        ("第三层：代码级所有权校验", "bills.update/delete 先读取原文档\n确认文档 _openid 与服务端 OPENID 一致后再修改", COLORS["orange"], "#fff7eb"),
    ]
    y = 230
    prev = None
    boxes = []
    for title, body, accent, fill in layers:
        b = d.box(330, y, 1140, 180, title, body, fill=fill, accent=accent, title_size=29, body_size=22)
        boxes.append(b)
        if prev:
            connect(d, prev, b, COLORS["muted"], "bottom", "top", 4)
        prev = b
        y += 260

    d.box(85, 270, 210, 610, "外部请求", "小程序页面\n云函数调用\n数据库查询", fill="#ffffff", accent=COLORS["gray"], title_size=22, body_size=18)
    d.box(1505, 270, 210, 610, "保护结果", "越权读取被过滤\n伪造身份无效\n删改前二次确认", fill="#ffffff", accent=COLORS["primary"], title_size=22, body_size=18)
    d.arrow(295, 575, 330, 575, COLORS["muted"], 3)
    d.arrow(1470, 575, 1505, 575, COLORS["primary"], 3)

    d.box(350, 995, 340, 150, "数据库层覆盖", "bills / budgets / users\nai_usage_limits / client_logs", fill="#ffffff", accent=COLORS["primary"], title_size=22, body_size=17)
    d.box(730, 995, 340, 150, "服务端覆盖", "bills / budgets / dataMigration\nclearUserData / aiPoster", fill="#ffffff", accent=COLORS["blue"], title_size=22, body_size=17)
    d.box(1110, 995, 340, 150, "重点校验", "bills.update\nbills.delete\nclearUserData 当前用户清理", fill="#ffffff", accent=COLORS["orange"], title_size=22, body_size=16)
    d.label(575, 1160, "安全目标：数据库规则兜底，云函数提供可信身份，关键写操作再做显式所有权校验", "#ffffff", COLORS["primary_dark"], 820)
    d.save("图9-1_数据权限三层防线示意图")


def fig_10_1() -> None:
    d = Diagram("图 10-1  数据生命周期全景图", "Data Lifecycle Timeline", 1380)
    x0, x1 = 280, 1630
    y0 = 240
    cols = [
        ("首次创建", 360),
        ("日常更新", 640),
        ("导出备份", 920),
        ("清理维护", 1200),
        ("注销/重置", 1480),
    ]
    d.line(x0, y0, x1, y0, COLORS["muted"], 3)
    for label, x in cols:
        d.circle(x, y0, 12, COLORS["primary"])
        d.text(x - 70, y0 - 55, label, 21, COLORS["primary_dark"], bold=True, max_width=140, align="center")

    rows = [
        ("users", COLORS["primary"], "首次登录\nsyncUserInfo", "资料/主题更新", "随 JSON 数据保留", "clearUserData 重置资料", "保留文档或重置默认值"),
        ("bills", COLORS["orange"], "记账创建", "编辑/删除账单", "JSON / CSV 导出", "按用户删除", "clearUserData 清空"),
        ("budgets", COLORS["blue"], "首次设预算", "按月 upsert", "JSON 导出", "随用户数据维护", "clearUserData 清空"),
        ("ai_usage_limits", COLORS["purple"], "首次调用 AI", "count 递增", "无需业务备份", "清理过期日期", "可按 _openid 删除"),
        ("client_logs", COLORS["rose"], "异常首次上报", "持续追加", "按需排障导出", "建议 30 天清理", "可按 _openid 删除"),
        ("云存储", COLORS["blue"], "上传头像/照片", "替换照片/头像", "exports 生成文件", "清理旧导出文件", "删除 avatars/bills 文件"),
    ]
    y = 340
    for name, color, c1, c2, c3, c4, c5 in rows:
        d.box(60, y - 30, 185, 95, name, "", fill="#ffffff", accent=color, title_size=20)
        d.line(250, y + 15, 1630, y + 15, "#d9e4de", 2)
        items = [c1, c2, c3, c4, c5]
        for text, (_, x) in zip(items, cols):
            d.box(x - 105, y - 35, 210, 100, text.split("\n")[0], "\n".join(text.split("\n")[1:]), fill="#ffffff", accent=color, title_size=18, body_size=16)
        y += 155

    d.box(305, 1230, 350, 120, "备份策略", "每周在「我的页」JSON 导出\n大版本发布前额外备份", fill=COLORS["soft"], accent=COLORS["primary"], title_size=22, body_size=17)
    d.box(725, 1230, 350, 120, "恢复策略", "chooseMessageFile 选择 JSON\n分批导入 bills", fill=COLORS["soft2"], accent=COLORS["blue"], title_size=22, body_size=17)
    d.box(1145, 1230, 350, 120, "数据自主权", "clearUserData 清账单/预算/文件\n并重置 users 偏好", fill="#fff7eb", accent=COLORS["orange"], title_size=22, body_size=17)
    d.save("图10-1_数据生命周期全景图")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fig_2_1()
    fig_3_1()
    fig_4_1()
    fig_6_1()
    fig_7_1()
    fig_9_1()
    fig_10_1()
    print(f"Generated database design diagrams in: {OUT_DIR}")


if __name__ == "__main__":
    main()
