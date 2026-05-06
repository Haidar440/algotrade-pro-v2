from __future__ import annotations

from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, PageBreak, HRFlowable, Image


ROOT = Path(__file__).resolve().parent
SOURCE_MD = ROOT / "Project_Report_Content.md"
OUTPUT_PDF = ROOT / "Project_Report_Submission.pdf"
SCREENSHOT_DIR = ROOT / "Screenshot"


def _md_to_inline_html(text: str) -> str:
    """Convert a small markdown subset (bold + escaped chars) to ReportLab-friendly HTML."""
    escaped = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)


def _add_page_number(canvas_obj, doc):
    canvas_obj.saveState()
    canvas_obj.setFont("Times-Roman", 9)
    canvas_obj.setFillColor(colors.grey)
    page_num = canvas_obj.getPageNumber()
    canvas_obj.drawRightString(19.5 * cm, 1.2 * cm, f"Page {page_num}")
    canvas_obj.restoreState()


def _iter_screenshots() -> list[Path]:
    """Return screenshot files in a stable presentation order."""
    if not SCREENSHOT_DIR.exists():
        return []

    preferred_order = [
        "image copy 3.png",  # Dashboard
        "image copy 2.png",  # Market Scanner
        "image copy.png",    # Auto-Bot
        "image.png",         # Paper Trading
    ]

    existing = {p.name.lower(): p for p in SCREENSHOT_DIR.iterdir() if p.is_file()}
    ordered: list[Path] = []

    for name in preferred_order:
        candidate = existing.get(name.lower())
        if candidate:
            ordered.append(candidate)

    # Include any additional images not in preferred list.
    leftovers = [
        p for p in SCREENSHOT_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} and p not in ordered
    ]
    ordered.extend(sorted(leftovers, key=lambda p: p.name.lower()))
    return ordered


def build_pdf(source_path: Path, output_path: Path) -> None:
    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontName="Times-Bold",
        fontSize=18,
        leading=24,
        alignment=1,
        spaceAfter=12,
    )
    h1_style = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontName="Times-Bold",
        fontSize=14,
        leading=18,
        spaceBefore=10,
        spaceAfter=8,
    )
    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Times-Bold",
        fontSize=12,
        leading=16,
        spaceBefore=8,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=11,
        leading=16,
        alignment=4,
        spaceAfter=5,
    )
    list_style = ParagraphStyle(
        "List",
        parent=body_style,
        leftIndent=16,
        firstLineIndent=-10,
        spaceAfter=3,
    )
    figure_caption_style = ParagraphStyle(
        "FigureCaption",
        parent=styles["Normal"],
        fontName="Times-Italic",
        fontSize=10,
        leading=13,
        alignment=1,
        spaceBefore=4,
        spaceAfter=12,
    )

    lines = source_path.read_text(encoding="utf-8").splitlines()
    story = []

    for raw_line in lines:
        line = raw_line.rstrip()
        stripped = line.strip()

        if not stripped:
            story.append(Spacer(1, 0.16 * cm))
            continue

        if stripped == "---":
            story.append(Spacer(1, 0.15 * cm))
            story.append(HRFlowable(width="100%", thickness=0.6, color=colors.grey))
            story.append(Spacer(1, 0.2 * cm))
            continue

        if stripped.startswith("# "):
            text = _md_to_inline_html(stripped[2:].strip())
            story.append(Paragraph(text, title_style))
            continue

        if stripped.startswith("## "):
            text = stripped[3:].strip()
            if text.upper().startswith("CHAPTER"):
                if story:
                    story.append(PageBreak())
            story.append(Paragraph(_md_to_inline_html(text), h1_style))
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(_md_to_inline_html(stripped[4:].strip()), h2_style))
            continue

        # Numbered lists: 1. text
        num_match = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if num_match:
            n, content = num_match.groups()
            story.append(Paragraph(_md_to_inline_html(f"{n}. {content}"), list_style))
            continue

        # Bulleted lists: * text
        bullet_match = re.match(r"^\*\s+(.*)$", stripped)
        if bullet_match:
            content = bullet_match.group(1)
            story.append(Paragraph(_md_to_inline_html(f"• {content}"), list_style))
            continue

        story.append(Paragraph(_md_to_inline_html(stripped), body_style))

    screenshots = _iter_screenshots()
    if screenshots:
        captions = {
            "image copy 3.png": "Dashboard Overview",
            "image copy 2.png": "Market Scanner with Algorithm Verdict and Execution Plan",
            "image copy.png": "Algorithmic Trading Engine (Auto-Bot) Configuration and Active Positions",
            "image.png": "Paper Trading Simulator with Portfolio Metrics and Open Positions",
        }

        story.append(PageBreak())
        story.append(Paragraph("APPENDIX A: IMPLEMENTATION SCREENSHOTS", h1_style))
        story.append(Spacer(1, 0.25 * cm))

        max_width = A4[0] - (2.2 * cm * 2)
        max_height = 11.5 * cm

        for idx, img_path in enumerate(screenshots, start=1):
            reader = ImageReader(str(img_path))
            img_w, img_h = reader.getSize()
            scale = min(max_width / img_w, max_height / img_h)

            figure = Image(
                str(img_path),
                width=img_w * scale,
                height=img_h * scale,
            )
            figure.hAlign = "CENTER"
            story.append(figure)

            caption = captions.get(img_path.name, img_path.stem.replace("_", " ").title())
            story.append(Paragraph(f"Figure A.{idx}: {caption}", figure_caption_style))

            if idx != len(screenshots):
                story.append(PageBreak())

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=2.2 * cm,
        rightMargin=2.2 * cm,
        topMargin=2.3 * cm,
        bottomMargin=1.9 * cm,
        title="AlgoTrade Pro Capstone Report",
        author="Sunasara Haidarali",
    )

    doc.build(story, onFirstPage=_add_page_number, onLaterPages=_add_page_number)


if __name__ == "__main__":
    build_pdf(SOURCE_MD, OUTPUT_PDF)
    print(f"Generated PDF: {OUTPUT_PDF}")
