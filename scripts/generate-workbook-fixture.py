"""
Generates the reference import fixture src/test/fixtures/finances-fictif.xlsx:
a fictional workbook with the structure of the "Finances.xlsm" workbook
(one sheet per month, columns Date | Montant | Type de dépense | Libellé,
G2 = "Budget initial", F2 = "Budget restant").

Every amount, date and label is invented (seeded PRNG, deterministic output).
The file reproduces the cases the importer must handle:
  - formulas with cached values (F2, G2 carry-over, an amount typed as a formula),
  - an amount typed as text ("-(1,2+1,2)"), text dates, undated rows
    (blank date or "sans date"),
  - salaries dated in the previous month, one date typed with the wrong year,
  - a refund (positive amount in an expense category),
  - a row without amount (Avril2026, row 43), header spelling variants from Mars2026,
  - five missing months (May to September 2026) and a hand-typed G2 in Octobre2026,
  - a "Prix café :" tracker cell (Novembre2025!O16) and label spelling variants
    ("Café", "Cafe", "CAFÉ"…, "Ticket bus", "Ticket Bus"…),
  - a non-monthly sheet ("Synthèse") that the importer ignores.

Usage: python3 scripts/generate-workbook-fixture.py [output.xlsx]
"""
import datetime as dt
import random
import sys
import zipfile
from xml.sax.saxutils import escape

OUT = sys.argv[1] if len(sys.argv) > 1 else "src/test/fixtures/finances-fictif.xlsx"
R = random.Random(20261023)

# (sheet name, year, month, number of imported rows)
SHEETS = [
    ("Novembre2025", 2025, 11, 50),
    ("Decembre2025", 2025, 12, 52),
    ("Janvier2026", 2026, 1, 50),
    ("Fevrier2026", 2026, 2, 45),
    ("Mars2026", 2026, 3, 78),
    ("Avril2026", 2026, 4, 44),
    ("Octobre2026", 2026, 10, 45),
]
OPENING_CENTS = 42000

OTHER_INCOMES = {
    "Novembre2025": [("Vente occasion", 4500)],
    "Decembre2025": [("Prime de fin d'année", 15000), ("Cadeau anniversaire", 5000)],
    "Janvier2026": [("Remboursement mutuelle", 2340), ("Vente occasion", 3000)],
    "Fevrier2026": [("Remboursement ami", 1550)],
    "Mars2026": [("Remboursement mutuelle", 1820), ("Job week-end", 9600)],
    "Avril2026": [("Remboursement ami", 2200), ("Vente occasion", 6000)],
    "Octobre2026": [("Remboursement mutuelle", 1280)],
}

CAFE_VARIANTS = [("Café", 70), ("café", 10), ("Cafe", 8), ("CAFÉ", 6), ("Café ", 6)]

# (label, category, min cents, max cents, weight)
DAILY = [
    ("Courses", "Alimentation", 1200, 6800, 18),
    ("Boulangerie", "Alimentation", 150, 680, 12),
    ("Marché", "Alimentation", 600, 2400, 3),
    ("Essence", "Transport", 2500, 5500, 7),
    ([("Ticket bus", 80), ("Ticket Bus", 12), ("ticket bus", 8)], "Transport", 170, 180, 7),
    ("Parking", "Transport", 200, 900, 4),
    ("Train", "Transport", 1200, 2800, 4),
    ("Cinéma", "Loisirs", 750, 1100, 5),
    ("Restaurant", "Loisirs", 1400, 3200, 6),
    ("Livre", "Loisirs", 800, 2200, 3),
    ("Escalade", "Loisirs", 900, 1500, 3),
]
CAFE_WEIGHT = 28


def pick(choices):
    total = sum(w for _, w in choices)
    x = R.uniform(0, total)
    for value, w in choices:
        x -= w
        if x <= 0:
            return value
    return choices[-1][0]


def prev_month(year, month):
    return (year - 1, 12) if month == 1 else (year, month - 1)


def rows_for(name, year, month, count):
    """Imported rows of one sheet (dicts), in sheet order."""
    rows = []
    py, pm = prev_month(year, month)
    # Fixed monthly lines
    rows.append(dict(date=None, cents=-39500, type="Logement", label="Loyer"))
    rows.append(dict(date=dt.date(py, pm, R.choice([26, 27, 28])), cents=R.randrange(104000, 112000, 50), type="Revenu", label="Salaire alternance"))
    rows.append(dict(date=dt.date(year, month, 5), cents=18200, type="Revenu", label="APL"))
    rows.append(dict(date=dt.date(year, month, 12), cents=-R.randrange(3200, 4600), type="Logement", label="Électricité"))
    rows.append(dict(date=dt.date(year, month, 8), cents=-2499, type="Logement", label="Internet box"))
    for label, cents in OTHER_INCOMES[name]:
        rows.append(dict(date=dt.date(year, month, R.randint(2, 27)), cents=cents, type="Revenu", label=label))
    if name in ("Decembre2025", "Janvier2026", "Fevrier2026"):
        rows.append(dict(date="sans date", cents=-1099, type="Loisirs", label="Abonnement musique"))
    if name == "Janvier2026":
        # Typed with the previous year: the importer must flag it.
        rows.append(dict(date=dt.date(2025, 1, 6), cents=-345, type="Alimentation", label="Boulangerie"))
    if name == "Fevrier2026":
        rows.append(dict(date=dt.date(year, month, 14), cents=-1980, type="Alimentation", label="Courses", formula="-12.5-7.3"))
        rows.append(dict(date="14/02/2026", cents=-2350, type="Loisirs", label="Restaurant"))
        rows.append(dict(date="21/02/2026", cents=-180, type="Transport", label="Ticket bus"))
    if name == "Mars2026":
        rows.append(dict(date=dt.date(year, month, 18), cents=-240, type="Alimentation", label="Café", text="-(1,2+1,2)"))
        rows.append(dict(date=dt.date(year, month, 20), cents=1800, type="Transport", label="Remboursement billet train"))
    if name == "Octobre2026":
        rows.append(dict(date=None, cents=-14500, type="Alimentation", label="Courses du mois", formula="-(250-80-25)"))

    seen = {(r["date"], r["cents"], r["label"].strip().lower()) for r in rows}
    while len(rows) < count:
        day = dt.date(year, month, R.randint(1, 28))
        if R.uniform(0, 100) < CAFE_WEIGHT:
            label, category, cents = pick(CAFE_VARIANTS), "Alimentation", -R.randrange(110, 281, 10)
        else:
            label, category, lo, hi, _ = pick([(d, d[4]) for d in DAILY])
            if isinstance(label, list):
                label = pick(label)
            cents = -R.randint(lo, hi)
        key = (day, cents, label.strip().lower())
        if key in seen:
            continue
        seen.add(key)
        rows.append(dict(date=day, cents=cents, type=category, label=label))

    def sort_key(r):
        d = r["date"]
        if d is None or d == "sans date":
            return (0, dt.date(1900, 1, 1))
        if isinstance(d, str):
            day, mon, yr = (int(x) for x in d.split("/"))
            return (1, dt.date(yr, mon, day))
        return (1, d)

    rows.sort(key=sort_key)
    return rows


def serial(d):
    return (d - dt.date(1899, 12, 30)).days


def money(cents):
    return f"{cents / 100:.2f}".rstrip("0").rstrip(".") if cents % 100 else str(cents // 100)


class Strings:
    def __init__(self):
        self.items, self.index = [], {}

    def __call__(self, text):
        if text not in self.index:
            self.index[text] = len(self.items)
            self.items.append(text)
        return self.index[text]


S = Strings()


def cell_xml(ref, kind, value=None, formula=None, style=0):
    s = f' s="{style}"' if style else ""
    if kind == "s":
        return f'<c r="{ref}" t="s"{s}><v>{S(value)}</v></c>'
    f = f"<f>{escape(formula)}</f>" if formula else ""
    v = f"<v>{value}</v>" if value is not None else ""
    return f'<c r="{ref}"{s}>{f}{v}</c>'


def col_index(ref):
    letters = "".join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def sheet_xml(cells):
    """cells: {row: [(ref, xml)]}"""
    out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
           '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
           'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
           '<cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="11" customWidth="1"/>'
           '<col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="28" customWidth="1"/>'
           '<col min="6" max="7" width="15" customWidth="1"/></cols>',
           "<sheetData>"]
    for r in sorted(cells):
        row = "".join(x for _, x in sorted(cells[r], key=lambda c: col_index(c[0])))
        out.append(f'<row r="{r}">{row}</row>')
    out.append("</sheetData></worksheet>")
    return "".join(out)


DATE, MONEY = 1, 2
sheets_xml = []
balance = OPENING_CENTS
previous_name = None
f2_values = []
for index, (name, year, month, count) in enumerate(SHEETS):
    rows = rows_for(name, year, month, count)
    cells = {}

    def put(r, ref, xml):
        cells.setdefault(r, []).append((ref, xml))

    variant = year == 2026 and month >= 3
    headers = ["Date", "Montant", "Type de Depense" if variant else "Type de dépense", "Libelle" if variant else "Libellé"]
    for col, text in zip("ABCD", headers):
        put(1, f"{col}1", cell_xml(f"{col}1", "s", text))
    put(1, "F1", cell_xml("F1", "s", "Budget restant"))
    put(1, "G1", cell_xml("G1", "s", "Budget initial"))

    data = list(rows)
    if name == "Avril2026":
        # Row 43: a line without amount (the importer rejects and reports it).
        neighbour = data[40]["date"]
        data.insert(41, dict(date=neighbour, cents=None, type="Loisirs", label="Cinéma"))
    total = 0
    cafe = 0  # what Excel's SUMIF(D:D;"Café";B:B) returns (case-insensitive, accents and spaces count)
    for i, r in enumerate(data):
        n = i + 2
        d = r["date"]
        if isinstance(d, dt.date):
            put(n, f"A{n}", cell_xml(f"A{n}", "n", serial(d), style=DATE))
        elif isinstance(d, str):
            put(n, f"A{n}", cell_xml(f"A{n}", "s", d))
        if r["cents"] is not None:
            if "text" in r:
                put(n, f"B{n}", cell_xml(f"B{n}", "s", r["text"]))
            else:
                put(n, f"B{n}", cell_xml(f"B{n}", "n", money(r["cents"]), r.get("formula"), MONEY))
            total += r["cents"]
            if r["label"].lower() == "café":
                cafe += r["cents"]
        put(n, f"C{n}", cell_xml(f"C{n}", "s", r["type"]))
        put(n, f"D{n}", cell_xml(f"D{n}", "s", r["label"]))

    opening = balance
    if index == 0:
        put(2, "G2", cell_xml("G2", "n", money(opening), style=MONEY))
    elif name == "Octobre2026":
        put(2, "G2", cell_xml("G2", "n", money(opening), style=MONEY))  # typed by hand
    else:
        put(2, "G2", cell_xml("G2", "n", money(opening), f"{previous_name}!F2", MONEY))
    balance = opening + total
    put(2, "F2", cell_xml("F2", "n", money(balance), "G2+SUM(B2:B200)", MONEY))
    if index == 0:
        put(16, "O16", cell_xml("O16", "s", "Prix café :"))
        put(16, "P16", cell_xml("P16", "n", money(-cafe), 'ABS(SUMIF(D2:D200,"Café",B2:B200))', MONEY))
    f2_values.append(balance)
    sheets_xml.append((name, sheet_xml(cells)))
    previous_name = name

# Non-monthly sheet, ignored by the importer.
summary = {1: [("A1", cell_xml("A1", "s", "Mois")), ("B1", cell_xml("B1", "s", "Budget restant"))]}
for i, (name, _, _, _) in enumerate(SHEETS):
    n = i + 2
    summary[n] = [("A" + str(n), cell_xml(f"A{n}", "s", name)),
                  ("B" + str(n), cell_xml(f"B{n}", "n", money(f2_values[i]), f"{name}!F2", MONEY))]
sheets_xml.append(("Synthèse", sheet_xml(summary)))

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
workbook = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<workbook {NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<workbookPr/><sheets>'
            + "".join(f'<sheet name="{escape(n)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, (n, _) in enumerate(sheets_xml))
            + "</sheets></workbook>")
k = len(sheets_xml)
rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(k))
        + f'<Relationship Id="rId{k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + f'<Relationship Id="rId{k + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        "</Relationships>")
styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          f'<styleSheet {NS}>'
          '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
          '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
          '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
          '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
          '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
          '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
          '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
          "</styleSheet>")
shared = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          f'<sst {NS} count="{len(S.items)}" uniqueCount="{len(S.items)}">'
          + "".join(f'<si><t xml:space="preserve">{escape(t)}</t></si>' for t in S.items)
          + "</sst>")
content_types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                 '<Default Extension="xml" ContentType="application/xml"/>'
                 '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                 + "".join(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(k))
                 + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                 '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
                 "</Types>")
root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
             '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
             "</Relationships>")


def add(z, path, text):
    info = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(info, text.encode("utf-8"))


with zipfile.ZipFile(OUT, "w") as z:
    add(z, "[Content_Types].xml", content_types)
    add(z, "_rels/.rels", root_rels)
    add(z, "xl/workbook.xml", workbook)
    add(z, "xl/_rels/workbook.xml.rels", rels)
    add(z, "xl/styles.xml", styles)
    for i, (_, xml) in enumerate(sheets_xml):
        add(z, f"xl/worksheets/sheet{i + 1}.xml", xml)
    add(z, "xl/sharedStrings.xml", shared)

print(f"{OUT}: {sum(c for *_, c in SHEETS)} rows, opening {OPENING_CENTS / 100:.2f}, "
      f"closings {[f / 100 for f in f2_values]}")
