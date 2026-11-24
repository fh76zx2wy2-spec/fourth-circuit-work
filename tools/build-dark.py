#!/usr/bin/env python3
"""يولّد dark.css من أوراق الأنماط الفاتحة: كل لون فاتح للأسطح يصبح داكنًا بنفس درجته،
وكل لون داكن للنصوص يصبح فاتحًا. الألوان المتوسطة (أزرار خضراء، شارات) تبقى كما هي.
التشغيل: python3 tools/build-dark.py  (أعد تشغيله بعد أي تعديل على الألوان)."""
import colorsys, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = ['styles.css', 'diwan/workspace.css', 'hearings/src/styles.css']
P = 'html[data-theme="dark"]'
G = P + ':not(.classic)'

COLOR_RE = re.compile(r'#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b')

def parse_color(tok):
    t = tok.lower()
    if t == 'white': return (255, 255, 255, 1.0)
    if t == 'black': return (0, 0, 0, 1.0)
    if t.startswith('#'):
        h = t[1:]
        if len(h) == 3: h = ''.join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
    nums = re.findall(r'[\d.]+%?', t)
    if len(nums) < 3: return None
    def ch(v): return float(v[:-1]) * 2.55 if v.endswith('%') else float(v)
    a = 1.0
    if len(nums) >= 4: a = float(nums[3][:-1]) / 100 if nums[3].endswith('%') else float(nums[3])
    return (ch(nums[0]), ch(nums[1]), ch(nums[2]), a)

def fmt(r, g, b, a):
    r, g, b = (max(0, min(255, round(x))) for x in (r, g, b))
    return f'#{r:02x}{g:02x}{b:02x}' if a >= 0.999 else f'rgba({r},{g},{b},{a:.3g})'

def remap(tok, kind):
    c = parse_color(tok)
    if not c: return tok
    r, g, b, a = c
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if kind == 'surface':
        if l < 0.8: return tok
        l2, s2 = 0.085 + (1 - l) * 0.9, min(s, 0.32)
    elif kind == 'border':
        if l < 0.75: return tok
        l2, s2 = 0.2 + (1 - l) * 0.5, min(s, 0.25)
    elif kind == 'text':
        if l > 0.5: return tok
        l2, s2 = 0.93 - l * 0.6, min(s, 0.45)
    else:
        return tok
    # الأسطح الداكنة بلمسة خضراء خفيفة تناسب هوية الموقع.
    if kind != 'text' and s2 < 0.06: h, s2 = 165 / 360, 0.12
    rr, gg, bb = colorsys.hls_to_rgb(h, l2, s2)
    return fmt(rr * 255, gg * 255, bb * 255, a)

def kind_of(prop, value):
    p = prop.strip().lower()
    if p in ('color', 'fill', 'caret-color', '-webkit-text-fill-color', 'text-decoration-color'): return 'text'
    if p.startswith('background') or p == 'stroke': return 'surface'
    if p.startswith('border') or p.startswith('outline'): return 'border'
    if p.startswith('--'):
        n = p
        if any(k in n for k in ('text', 'muted', 'ink')): return 'text'
        if any(k in n for k in ('border', 'edge', 'line')): return 'border'
        if any(k in n for k in ('bg', 'surface', 'panel', 'glass', 'light', 'card')): return 'surface'
        return None
    return None

def strip_comments(s): return re.sub(r'/\*.*?\*/', '', s, flags=re.S)

def parse_blocks(s):
    out, i, n = [], 0, len(s)
    while i < n:
        j = s.find('{', i)
        if j < 0: break
        semi = s.find(';', i)
        if 0 <= semi < j and s[i:semi].strip().startswith('@'):  # @import / @charset
            i = semi + 1; continue
        prelude = s[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if s[k] == '{': depth += 1
            elif s[k] == '}': depth -= 1
            k += 1
        out.append((prelude, s[j + 1:k - 1]))
        i = k
    return out

def split_decls(body):
    decls, buf, depth = [], '', 0
    for ch in body:
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        if ch == ';' and depth == 0:
            decls.append(buf); buf = ''
        else: buf += ch
    if buf.strip(): decls.append(buf)
    return [d for d in decls if ':' in d]

def prefix_selector(sel):
    sel = sel.strip()
    if sel.startswith(':root'): return P + sel[5:]
    if re.match(r'html\b', sel): return P + sel[4:]
    return f'{P} {sel}'

def convert_rules(blocks):
    out = []
    for prelude, body in blocks:
        if prelude.startswith('@'):
            name = prelude.split()[0].lower()
            if name == '@media' and 'print' in prelude.lower() and 'screen' not in prelude.lower(): continue
            if name in ('@media', '@supports', '@layer', '@container'):
                inner = convert_rules(parse_blocks(body))
                if inner: out.append(f'{prelude}{{\n' + '\n'.join(inner) + '\n}')
            continue
        new, changed = [], False
        for d in split_decls(body):
            prop, val = d.split(':', 1)
            k = kind_of(prop, val)
            if not k or prop.strip().lower().startswith('--') and 'var(' in val: continue
            v2 = COLOR_RE.sub(lambda m: remap(m.group(0), k), val)
            # تُعاد كتابة كل ألوان القاعدة (حتى غير المتغيرة) حتى لا تتغلب قاعدة أساسية داكنة على حالة أدق مثل .active.
            if v2 != val: changed = True
            if COLOR_RE.search(val) or 'var(' in val or 'gradient' in val: new.append(f'{prop.strip()}:{v2.strip()}')
        if new:
            sels = ','.join(prefix_selector(x) for x in prelude.split(','))
            out.append(f'{sels}{{' + ';'.join(new) + '}')
    return out

MANUAL = f'''{P}{{color-scheme:dark;
 --bg:#0d1514;--surface:#121c1a;--panel:#16211f;--border:#24332f;--text:#e3ece9;--muted:#91a6a0;
 --brown:#3fb79c;--brown-dark:#2f9d85;--brown-light:#16302a;--green:#3fb79c;--green-bg:#132b24;
 --amber:#e0a856;--amber-bg:#2c2214;--red:#e88a80;--red-bg:#2f1a18}}
{P} body{{background:#0d1514;color:var(--text)}}
{P} img:not([src$=".svg"]){{filter:brightness(.92)}}
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){{
{G} body:has(.circuit-app){{background:radial-gradient(42vw 42vw at 88% 6%,rgba(14,148,123,.20),transparent 62%),radial-gradient(38vw 38vw at 8% 30%,rgba(216,181,82,.08),transparent 60%),
 radial-gradient(46vw 46vw at 60% 96%,rgba(8,121,103,.16),transparent 62%),linear-gradient(180deg,#0e1716,#0a1211);background-attachment:fixed}}
{G} .circuit-app{{--glass-shadow:0 10px 34px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.25);--glass-hi:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -1px 0 rgba(255,255,255,.02)}}
{G} .circuit-app .card,{G} .circuit-app .stat,{G} .circuit-app .case-row,{G} .circuit-app .task-row,{G} .circuit-app .insight-section,{G} .circuit-app .day-summary,{G} .circuit-app .memory-card{{border-color:rgba(255,255,255,.07)!important}}
{G} .circuit-app .service-tile{{color:#7fd8c3!important;border-color:rgba(255,255,255,.09)!important;box-shadow:0 10px 30px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.07)!important}}
{G} .circuit-app .service-tile .tile-symbol,{G} .circuit-app .service-tile svg{{color:#5cc9ae}}
{G} .circuit-app .service-tile::after,{G} .circuit-app .btn::after{{opacity:.12}}
{G} .circuit-app .service-tile.active{{color:#fff!important}}
{G} .circuit-app .service-tile.active .tile-symbol,{G} .circuit-app .service-tile.active svg{{color:#fff}}
{G} .circuit-app .modal-backdrop{{background:rgba(0,0,0,.5)}}
}}
'''

def main():
    parts = ['/* مُولَّد تلقائيًا بواسطة tools/build-dark.py — لا تعدّله يدويًا. النمط الليلي. */']
    for src in SOURCES:
        text = strip_comments((ROOT / src).read_text(encoding='utf-8'))
        rules = convert_rules(parse_blocks(text))
        parts.append(f'/* {src} */\n' + '\n'.join(rules))
    parts.append('/* ضبط يدوي */\n' + MANUAL)
    (ROOT / 'dark.css').write_text('\n'.join(parts) + '\n', encoding='utf-8')
    print('dark.css', sum(len(p) for p in parts), 'bytes')

if __name__ == '__main__':
    main()
