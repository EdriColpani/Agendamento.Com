from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


def wrap_text(text: str, font_name: str, font_size: int, max_width: float):
    words = text.split(" ")
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        width = pdfmetrics.stringWidth(candidate, font_name, font_size)
        if width <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines if lines else [""]


def build_pdf(md_path: Path, pdf_path: Path):
    try:
        pdfmetrics.registerFont(TTFont("DejaVu", "C:/Windows/Fonts/DejaVuSans.ttf"))
        font_name = "DejaVu"
    except Exception:
        font_name = "Helvetica"

    text = md_path.read_text(encoding="utf-8")
    lines = text.splitlines()

    c = canvas.Canvas(str(pdf_path), pagesize=A4)
    width, height = A4
    margin_x = 40
    margin_top = 40
    margin_bottom = 40
    usable_width = width - (margin_x * 2)

    y = height - margin_top
    base_size = 10
    title_size = 14
    line_height = 14

    def ensure_space(required=line_height):
        nonlocal y
        if y - required < margin_bottom:
            c.showPage()
            y = height - margin_top
            c.setFont(font_name, base_size)

    c.setTitle("WHATSAPP_RUNBOOK_E_BLINDAGEM")

    for raw in lines:
        line = raw.rstrip()
        if line.startswith("# "):
            ensure_space(22)
            c.setFont(font_name, title_size)
            for chunk in wrap_text(line[2:], font_name, title_size, usable_width):
                ensure_space(18)
                c.drawString(margin_x, y, chunk)
                y -= 18
            y -= 4
            c.setFont(font_name, base_size)
            continue

        if line.startswith("## "):
            ensure_space(18)
            c.setFont(font_name, 12)
            for chunk in wrap_text(line[3:], font_name, 12, usable_width):
                ensure_space(16)
                c.drawString(margin_x, y, chunk)
                y -= 16
            y -= 2
            c.setFont(font_name, base_size)
            continue

        if line.startswith("- "):
            wrapped = wrap_text(line[2:], font_name, base_size, usable_width - 14)
            ensure_space()
            c.drawString(margin_x, y, "-")
            c.drawString(margin_x + 12, y, wrapped[0])
            y -= line_height
            for extra in wrapped[1:]:
                ensure_space()
                c.drawString(margin_x + 12, y, extra)
                y -= line_height
            continue

        if line.strip() == "":
            y -= 8
            continue

        for chunk in wrap_text(line, font_name, base_size, usable_width):
            ensure_space()
            c.drawString(margin_x, y, chunk)
            y -= line_height

    c.save()


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    md = root / "docs" / "WHATSAPP_RUNBOOK_E_BLINDAGEM.md"
    pdf = root / "docs" / "WHATSAPP_RUNBOOK_E_BLINDAGEM.pdf"
    build_pdf(md, pdf)
    print(f"PDF gerado em: {pdf}")
