import fitz, sys

doc = fitz.open(sys.argv[1])
for i, page in enumerate(doc):
    print(f"\n=== Page {i+1} ===")
    blocks = page.get_text("dict")["blocks"]
    for b, block in enumerate(blocks):
        if "lines" in block:
            for l, line in enumerate(block["lines"]):
                for s, span in enumerate(line["spans"]):
                    color = span.get("color")
                    text = span.get("text", "").strip()
                    if text:
                        print(f"  [{s}] color={color} type={type(color).__name__} font={span.get('font')} size={span.get('size')} text={repr(text)}")
