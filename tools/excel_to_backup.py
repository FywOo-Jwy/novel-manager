#!/usr/bin/env python3
"""
Excel 书单 → App 备份 zip 转换工具

把小说书单 Excel 转成 App 可导入的 backup.zip（内含 backup.json，manifest
格式与 App 的 importBackup 完全一致），无需封面/epub 文件（files 为空）。

列映射（A–M，与用户提供的表头对应）：
  A 日期       → reading_logs（多分段；日期 YYYY.MM.DD[-/～]YYYY.MM.DD，卷数区间 卷1～6）
  B 简中译名   → books.title_cn（必填，空则跳过该行）
  C 日文原名   → books.title_jp
  D 作者       → books.author
  E 画师       → books.illustrator
  F 文库       → books.publisher
  G 卷数       → books.total_volumes（去前导零，支持小数）
  H 最后出版日期 → books.latest_publish_date（ISO，用于「最新出版」排序）
  I 类型       → 标签（按空格拆分，自动生成 tags + book_tags，group_id=1 默认分组）
  J 情况       → books.reading_status + books.reading_volume
  K 方式       → books.reading_method
  L 费用       → books.cost（"/" 或空 → null）
  M 回本       → books.recovered（同上）

用法：
  python excel_to_backup.py 书单.xlsx [-o 输出.zip] [--json-only]

默认输出与 Excel 同目录的 novel-manager-backup.zip。
"""

import argparse
import json
import re
import sys
import zipfile
from datetime import date, datetime, timezone

import openpyxl

APP_KEY = 'novel-manager'
BACKUP_VERSION = 1
DEFAULT_GROUP_COLOR = '#D0BCFF'

# 列索引（0-based，对应 A–M）
COL_DATE = 0        # A
COL_TITLE_CN = 1    # B
COL_TITLE_JP = 2    # C
COL_AUTHOR = 3      # D
COL_ILLUSTRATOR = 4 # E
COL_PUBLISHER = 5   # F
COL_TOTAL_VOL = 6   # G
COL_LAST_PUB = 7    # H → books.latest_publish_date
COL_TYPE = 8        # I
COL_STATUS = 9      # J
COL_METHOD = 10     # K
COL_COST = 11       # L
COL_RECOVERED = 12  # M


def cell(v):
    """单元格 → 去空白字符串（None/空 → ''）。"""
    if v is None:
        return ''
    return str(v).strip()


def parse_float(v):
    """去前导零、支持小数；空/非法 → None。"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace('，', '.').replace(',', '.')
    if s in ('', '/', '-', '—'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_money(v):
    """费用/回本："/" 或空 → None，否则数字。"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace('，', '.').replace('￥', '').replace('¥', '')
    if s in ('', '/', '-', '—', '无'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_pub_date(v):
    """H 列「最后出版日期」 → ISO YYYY-MM-DD；空/无法识别 → None。"""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    if s in ('', '/', '-', '—', '未知'):
        return None
    m = re.search(r'(\d{4})\D+(\d{1,2})(?:\D+(\d{1,2}))?', s)
    if not m:
        return None
    year, month = int(m.group(1)), int(m.group(2))
    day = int(m.group(3)) if m.group(3) else 1
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def parse_status(s):
    """J 列「情况」 → (reading_status, reading_volume)。

    空/入库→未读；NN卷完毕/完了→已读；NN卷弃了→弃书；
    NN卷待看/缺卷/等更→在读（连载中）；卷数去前导零。
    """
    s = s or ''
    if not s or '入库' in s:
        return '未读', None
    vol_m = re.search(r'(\d+(?:\.\d+)?)', s)
    vol = float(vol_m.group(1)) if vol_m else None
    if '弃' in s:
        return '弃书', vol
    if '完毕' in s or '完了' in s:
        return '已读', vol
    if '待看' in s or '缺卷' in s or '等更' in s:
        return '在读', vol
    return '未读', None


def parse_method(s):
    """K 列「方式」 → reading_method。兼容直接值与旧「台/电」标记。"""
    s = s or ''
    if s in ('实体书', '电子书', '混合'):
        return s
    if '简中书' in s or '影印书' in s:
        return '实体书'
    has_tai = '台' in s
    has_dian = '电' in s
    if has_tai and has_dian:
        return '混合'
    if has_tai:
        return '实体书'
    if has_dian:
        return '电子书'
    return '电子书'


def norm_date(y, m, d):
    return f"{y}-{int(m):02d}-{int(d):02d}"


def parse_logs(s):
    """A 列「日期」 → list[{start_date,end_date,start_volume,end_volume}]。

    整列为 "/" 或空 → 无记录；多分段用换行/分号分隔；日期区间
    YYYY.MM.DD[-/～]YYYY.MM.DD，卷数区间「卷1～6」。
    """
    s = (s or '').strip()
    if not s or s in ('/', '-', '—'):
        return []
    logs = []
    for seg in re.split(r'[\n;；]+', s):
        seg = seg.strip()
        if not seg or seg in ('/', '-', '—'):
            continue
        start = end = None
        dm = re.search(
            r'(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[-～~]\s*'
            r'(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})',
            seg,
        )
        if dm:
            start = norm_date(dm.group(1), dm.group(2), dm.group(3))
            end = norm_date(dm.group(4), dm.group(5), dm.group(6))
        else:
            sm = re.search(r'(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})', seg)
            if sm:
                start = norm_date(sm.group(1), sm.group(2), sm.group(3))
        sv = ev = None
        vm = re.search(r'卷\s*(\d+(?:\.\d+)?)\s*[-～~]\s*(\d+(?:\.\d+)?)', seg)
        if vm:
            sv = float(vm.group(1))
            ev = float(vm.group(2))
        if start or end or sv is not None or ev is not None:
            logs.append({
                'start_date': start,
                'end_date': end,
                'start_volume': sv,
                'end_volume': ev,
            })
    return logs


def convert(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    now = datetime.now(timezone.utc).isoformat()
    tag_groups = [{'id': 1, 'name': '默认', 'color': DEFAULT_GROUP_COLOR}]

    books = []
    reading_logs = []
    book_tags = []
    tag_index = {}   # 标签名 → id
    next_tag_id = 1
    book_id = 0
    log_id = 0

    for row in rows:
        if row is None:
            continue
        # 补足列数（有些行可能缺列）
        r = list(row) + [None] * (13 - len(row))

        title_cn = cell(r[COL_TITLE_CN])
        if not title_cn:
            continue  # B 列空则跳过该行

        book_id += 1
        status, volume = parse_status(cell(r[COL_STATUS]))
        method = parse_method(cell(r[COL_METHOD]))
        total_vol = parse_float(r[COL_TOTAL_VOL])

        books.append({
            'id': book_id,
            'title_cn': title_cn,
            'title_jp': cell(r[COL_TITLE_JP]) or None,
            'author': cell(r[COL_AUTHOR]) or None,
            'illustrator': cell(r[COL_ILLUSTRATOR]) or None,
            'publisher': cell(r[COL_PUBLISHER]) or None,
            'total_volumes': total_vol,
            'latest_publish_date': parse_pub_date(r[COL_LAST_PUB]),
            'reading_status': status,
            'publication_status': None,
            'reading_volume': volume,
            'reading_method': method,
            'cost': parse_money(r[COL_COST]),
            'recovered': parse_money(r[COL_RECOVERED]),
            'rating': None,
            'review': None,
            'cover_path': None,
            'created_at': now,
            'updated_at': now,
        })

        # 标签：I 列按空格拆分，自动建档（group_id=1 默认分组）
        for name in cell(r[COL_TYPE]).split():
            if name not in tag_index:
                tag_index[name] = next_tag_id
                next_tag_id += 1
            book_tags.append({'book_id': book_id, 'tag_id': tag_index[name]})

        # A 列 → reading_logs
        for lg in parse_logs(cell(r[COL_DATE])):
            log_id += 1
            reading_logs.append({
                'id': log_id,
                'book_id': book_id,
                'start_date': lg['start_date'],
                'end_date': lg['end_date'],
                'start_volume': lg['start_volume'],
                'end_volume': lg['end_volume'],
            })

    tags = [
        {'id': tid, 'name': name, 'group_id': 1}
        for name, tid in sorted(tag_index.items(), key=lambda kv: kv[1])
    ]

    # 文库清单（与 App 内 publishers 表同构，去重保序）
    pub_names = []
    for b in books:
        name = b['publisher']
        if name and name not in pub_names:
            pub_names.append(name)
    publishers = [{'id': i + 1, 'name': n} for i, n in enumerate(pub_names)]

    manifest = {
        'app': APP_KEY,
        'version': BACKUP_VERSION,
        'exportedAt': now,
        'tables': {
            'books': books,
            'reading_logs': reading_logs,
            'tag_groups': tag_groups,
            'tags': tags,
            'book_tags': book_tags,
            'epub_files': [],
            'publishers': publishers,
        },
        'files': [],
    }
    return manifest


def main():
    ap = argparse.ArgumentParser(description='Excel 书单 → App 备份 zip')
    ap.add_argument('xlsx', help='输入 Excel 文件路径')
    ap.add_argument('-o', '--output', help='输出 zip 路径（默认与 Excel 同目录）')
    ap.add_argument('--json-only', action='store_true', help='只输出 backup.json 不打包 zip')
    args = ap.parse_args()

    manifest = convert(args.xlsx)
    n_books = len(manifest['tables']['books'])
    n_tags = len(manifest['tables']['tags'])
    n_logs = len(manifest['tables']['reading_logs'])
    print(f"解析完成：{n_books} 本书，{n_tags} 个标签，{n_logs} 条阅读记录")

    if args.json_only:
        out = args.output or args.xlsx.rsplit('.', 1)[0] + '-backup.json'
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        print(f"已写出 JSON：{out}")
        return

    out = args.output or args.xlsx.rsplit('.', 1)[0] + '-backup.zip'
    json_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('backup.json', json_bytes)
    print(f"已写出 zip：{out}")
    print("在 App「设置 → 导入」中选择此 zip 即可还原。")


if __name__ == '__main__':
    main()
