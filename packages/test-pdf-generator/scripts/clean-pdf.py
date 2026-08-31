import fitz
import sys
import os

PLACEHOLDER_FONTS = {"Arial-BoldItalicMT", "TimesNewRomanPS-BoldMT"}

def is_placeholder(span):
    color = span.get("color")
    font = span.get("font", "")
    text = span.get("text", "").strip()
    if not text:
        return False
    # Gray integer color (0-255 scale, >120 is ~50% gray)
    if isinstance(color, int) and color > 50:
        return True
    # zipForm pre-filled data in these fonts
    if font in PLACEHOLDER_FONTS:
        return True
    # Blue RGB tuple
    if isinstance(color, (tuple, list)) and len(color) >= 3:
        if color[0] < 0.15 and color[1] < 0.15 and color[2] > 0.3:
            return True
    return False

def clean_pdf(source: str, output: str | None = None):
    if output is None:
        base, ext = os.path.splitext(source)
        if base.endswith("-zipform-source"):
            base = base.replace("-zipform-source", "")
        output = f"{base}.pdf"

    doc = fitz.open(source)
    removed = 0
    for page in doc:
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    if is_placeholder(span):
                        page.add_redact_annot(span["bbox"], fill=None)
                        removed += 1
        page.apply_redactions()
    doc.save(output)
    print(f"Cleaned: {source} -> {output} ({doc.page_count} pages, {removed} spans removed)")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python clean-pdf.py <source.pdf> [output.pdf]")
        sys.exit(1)
    clean_pdf(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
