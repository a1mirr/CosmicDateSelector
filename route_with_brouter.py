#!/usr/bin/env python3
"""
Превращает GPX-скелет (via-точки) в трек, проложенный по реальным дорогам,
через публичный BRouter API. Зависимостей нет, только стандартная библиотека.

    python3 route_with_brouter.py pest-loop-variant-B.gpx
    python3 route_with_brouter.py pest-loop-variant-B.gpx --profile gravel
    python3 route_with_brouter.py pest-loop-variant-B.gpx --chunk 6 --out my-track.gpx

Профили brouter.de: trekking (по умолчанию), fastbike, shortest,
trekking-steep, trekking-nosteps, safety. Список может меняться —
если сервер ответит ошибкой профиля, проверь brouter.de/brouter-web.
"""

import argparse
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

GPX_NS = "http://www.topografix.com/GPX/1/1"
API = "https://brouter.de/brouter"
UA = "route_with_brouter/1.0"


def read_points(path):
    """Достаёт rtept (или trkpt, или wpt — что найдётся) в порядке следования."""
    ET.register_namespace("", GPX_NS)
    root = ET.parse(path).getroot()
    for tag in ("rtept", "trkpt", "wpt"):
        pts = root.findall(f".//{{{GPX_NS}}}{tag}")
        if len(pts) >= 2:
            out = []
            for p in pts:
                name_el = p.find(f"{{{GPX_NS}}}name")
                out.append((float(p.get("lat")), float(p.get("lon")),
                            name_el.text if name_el is not None else ""))
            print(f"  найдено {len(out)} точек в <{tag}>")
            return out
    sys.exit("Не нашёл маршрутных точек в файле.")


def dedupe(points):
    """Убирает подряд идущие дубликаты координат (стыки этапов)."""
    out = []
    for p in points:
        if out and abs(out[-1][0] - p[0]) < 1e-6 and abs(out[-1][1] - p[1]) < 1e-6:
            continue
        out.append(p)
    return out


def chunks(points, size):
    """Режет список на куски с перекрытием в одну точку, чтобы трек был непрерывным."""
    i = 0
    while i < len(points) - 1:
        yield points[i:i + size]
        i += size - 1


def fetch_segment(pts, profile, timeout=90):
    lonlats = "|".join(f"{lon:.6f},{lat:.6f}" for lat, lon, _ in pts)
    url = API + "?" + urllib.parse.urlencode({
        "lonlats": lonlats,
        "profile": profile,
        "alternativeidx": "0",
        "format": "gpx",
    })
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    if b"<gpx" not in data[:400]:
        raise RuntimeError(f"BRouter вернул не GPX: {data[:300]!r}")
    return data


def extract_trkpts(gpx_bytes):
    root = ET.fromstring(gpx_bytes)
    pts = []
    for tag in (f"{{{GPX_NS}}}trkpt", "trkpt"):
        found = root.findall(f".//{tag}")
        if found:
            for p in found:
                ele = p.find(f"{{{GPX_NS}}}ele")
                if ele is None:
                    ele = p.find("ele")
                pts.append((p.get("lat"), p.get("lon"),
                            ele.text if ele is not None else None))
            break
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gpx")
    ap.add_argument("--profile", default="trekking")
    ap.add_argument("--chunk", type=int, default=8,
                    help="точек на один запрос (меньше = надёжнее)")
    ap.add_argument("--out", default=None)
    ap.add_argument("--pause", type=float, default=1.5,
                    help="пауза между запросами, сек")
    args = ap.parse_args()

    out_path = args.out or args.gpx.replace(".gpx", f"-routed-{args.profile}.gpx")

    print(f"Читаю {args.gpx}")
    pts = dedupe(read_points(args.gpx))
    print(f"  после дедупликации: {len(pts)} точек")

    segments = list(chunks(pts, args.chunk))
    print(f"Запрашиваю {len(segments)} сегментов, профиль '{args.profile}'\n")

    all_pts = []
    for i, seg in enumerate(segments, 1):
        label = f"{seg[0][2] or '?'} -> {seg[-1][2] or '?'}"
        try:
            data = fetch_segment(seg, args.profile)
        except Exception as e:
            sys.exit(f"[{i}/{len(segments)}] ОШИБКА на {label}: {e}\n"
                     f"Попробуй --chunk 4 или другой профиль.")
        got = extract_trkpts(data)
        if all_pts and got:
            got = got[1:]          # не дублируем точку стыка
        all_pts.extend(got)
        print(f"[{i}/{len(segments)}] {label}: {len(got)} точек")
        if i < len(segments):
            time.sleep(args.pause)

    if not all_pts:
        sys.exit("Пусто — BRouter ничего не вернул.")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write(f'<gpx version="1.1" creator="brouter" xmlns="{GPX_NS}">\n')
        f.write(f'  <metadata><name>Pest loop variant B ({args.profile})</name></metadata>\n')
        f.write('  <trk>\n    <name>Pest loop variant B</name>\n    <trkseg>\n')
        for lat, lon, ele in all_pts:
            if ele:
                f.write(f'      <trkpt lat="{lat}" lon="{lon}"><ele>{ele}</ele></trkpt>\n')
            else:
                f.write(f'      <trkpt lat="{lat}" lon="{lon}"/>\n')
        f.write('    </trkseg>\n  </trk>\n</gpx>\n')

    print(f"\nГотово: {out_path} — {len(all_pts)} точек трека")


if __name__ == "__main__":
    main()
