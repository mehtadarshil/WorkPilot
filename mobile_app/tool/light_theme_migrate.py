import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "lib"

# Dark surfaces → web light cards
SURFACE_REPLACEMENTS = [
    (r"Color\.lerp\(\s*const Color\(0xFF131C2E\),\s*t\.accent,\s*0\.05,\s*\)!", "Colors.white"),
    (r"const Color\(0xFF131C2E\)", "Colors.white"),
    (r"const Color\(0xB30F172A\)", "Colors.white"),
    (r"Color\(0xFF0B0F19\)", "Colors.white"),
    (r"Color\(0xFF0F172A\)", "AppColors.slate50"),
    (r"Color\(0xFF0f172a\)", "Colors.white"),
    (r"const Color\(0xF21E293B\)", "Colors.white"),
    (r"backgroundColor: const Color\(0xFF0f172a\)", "backgroundColor: Colors.white"),
    (r"scaffoldBackgroundColor: AppColors\.slate900", "scaffoldBackgroundColor: AppColors.slate50"),
    (r"backgroundColor: AppColors\.gradientStart", "backgroundColor: AppColors.slate50"),
]

TEXT_ON_LIGHT = [
    (r"color: AppColors\.whiteOverlay\(0\.8[0-9]\)", "color: AppColors.slate700"),
    (r"color: AppColors\.whiteOverlay\(0\.7[0-9]\)", "color: AppColors.slate600"),
    (r"color: AppColors\.whiteOverlay\(0\.6[0-9]\)", "color: AppColors.slate500"),
    (r"color: AppColors\.whiteOverlay\(0\.5[0-9]\)", "color: AppColors.slate500"),
    (r"color: AppColors\.whiteOverlay\(0\.4[0-9]\)", "color: AppColors.slate400"),
    (r"color: AppColors\.whiteOverlay\(0\.3[0-9]\)", "color: AppColors.slate400"),
    (r"color: AppColors\.whiteOverlay\(0\.2\)", "color: AppColors.slate300"),
    (r"GoogleFonts\.inter\([^)]*color: AppColors\.whiteOverlay\(0\.8[0-9]\)", lambda m: m.group(0).replace("AppColors.whiteOverlay(0.85)", "AppColors.slate700").replace("AppColors.whiteOverlay(0.78)", "AppColors.slate600")),
]

BORDER_FILL = [
    (r"Border\.all\(color: AppColors\.whiteOverlay\(0\.0[5-9]\)\)", "Border.all(color: AppColors.slate200)"),
    (r"Border\.all\(color: AppColors\.whiteOverlay\(0\.1[0-5]\)\)", "Border.all(color: AppColors.slate200)"),
    (r"Border\.all\(color: AppColors\.whiteOverlay\(0\.2\)\)", "Border.all(color: AppColors.slate200)"),
    (r"borderSide: BorderSide\(color: AppColors\.whiteOverlay\(0\.1[0-5]\)\)", "borderSide: const BorderSide(color: AppColors.slate200)"),
    (r"color: AppColors\.whiteOverlay\(0\.0[5-9]\),\s*//", "color: AppColors.slate100, //"),
]

OVERLAY = [
    (r"SystemUiOverlayStyle\.light", "SystemUiOverlayStyle.dark"),
    (r"foregroundColor: Colors\.white,", "foregroundColor: AppColors.slate900,"),
    (r"iconTheme: const IconThemeData\(color: Colors\.white\)", "iconTheme: const IconThemeData(color: AppColors.slate700)"),
]

VALUE_TEXT = [
    (r"color: Colors\.white, fontWeight: FontWeight\.w500", "color: AppColors.slate900, fontWeight: FontWeight.w500"),
    (r"color: Colors\.white\)", "color: AppColors.slate900)"),
]


def apply_replacements(content: str) -> str:
    for pattern, repl in SURFACE_REPLACEMENTS + BORDER_FILL + OVERLAY + VALUE_TEXT:
        content = re.sub(pattern, repl, content)
    for pattern, repl in TEXT_ON_LIGHT:
        if callable(repl):
            content = re.sub(pattern, repl, content)
        else:
            content = re.sub(pattern, repl, content)
    return content


def main():
    changed = 0
    for path in ROOT.rglob("*.dart"):
        if path.name.endswith(".g.dart"):
            continue
        original = path.read_text(encoding="utf-8")
        updated = apply_replacements(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
            print(path.relative_to(ROOT.parent))
    print(f"\nUpdated {changed} files")


if __name__ == "__main__":
    main()
