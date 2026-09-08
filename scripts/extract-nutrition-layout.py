"""Extract presentation-only assets from a BMI app report (no learner data).

Usage: python scripts/extract-nutrition-layout.py path/to/reference.xlsx
"""
import base64
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(sys.argv[1]) as source:
    sheet_path = next(n for n in source.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+.xml", n))
    sheet = ET.fromstring(source.read(sheet_path))
    strings = ["".join(e.itertext()) for e in ET.fromstring(source.read("xl/sharedStrings.xml"))]
    rows = []
    for row in sheet.find("s:sheetData", NS):
        number = int(row.get("r"))
        if 10 <= number <= 33:
            continue
        cells = []
        for cell in row:
            address = cell.get("r")
            col = re.sub(r"\d", "", address)
            value = None
            v = cell.find("s:v", NS)
            # Only whitelist fixed report labels; all measurements, names,
            # reporting metadata and summary counts are supplied at download.
            static = (number <= 3 or number in (7, 8, 35) or
                      (36 <= number <= 41 and col in ("A", "G")) or
                      address in ("A6", "G43", "G47"))
            if static and v is not None and cell.get("t") == "s":
                value = strings[int(v.text)].replace("\ufffd", "²")
            cells.append([col, int(cell.get("s", "0")), value])
        rows.append({"number": number, "height": float(row.get("ht", "15")), "cells": cells})
    assets = {}
    for name in ("xl/styles.xml", "xl/theme/theme1.xml", "xl/media/image4.png", "xl/media/image5.svg",
                 "xl/drawings/_rels/drawing1.xml.rels"):
        data = source.read(name)
        if name.endswith(".svg"):
            data = data.decode().replace("\ufffd", "²").encode()
        assets[name] = base64.b64encode(data).decode()
    layout = {
        "rows": rows,
        "merges": [m.get("ref") for m in sheet.findall("s:mergeCells/s:mergeCell", NS)
                   if not 10 <= int(re.search(r"\d+", m.get("ref"))[0]) <= 33],
        "columns": [{k: c.get(k) for k in ("min", "max", "width")} for c in sheet.findall("s:cols/s:col", NS) if int(c.get("min")) <= 14],
        "drawing": source.read("xl/drawings/drawing1.xml").decode(),
        "assets": assets,
    }
target = Path(__file__).resolve().parents[1] / "src/lib/nutritionReportLayout.json"
target.write_text(json.dumps(layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Extracted report formatting and two illustrations; excluded source records and document metadata.")
