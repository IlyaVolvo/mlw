#!/usr/bin/env python3
import argparse
import sys
import unicodedata
from pathlib import Path

# -----------------------------
# Supported languages
# -----------------------------
SUPPORTED_LANGS = {
    "en": set("abcdefghijklmnopqrstuvwxyz"),
    "de": set("abcdefghijklmnopqrstuvwxyzäöüß"),
    "fr": set("abcdefghijklmnopqrstuvwxyzàâæçéèêëîïôœùûüÿ"),
    "es": set("abcdefghijklmnopqrstuvwxyzáéíóúüñ"),
    "it": set("abcdefghijklmnopqrstuvwxyzàèéìíòóùú"),
    "pt": set("abcdefghijklmnopqrstuvwxyzàáâãçéêíóôõúü"),
    "ru": set("абвгдеёжзийклмнопрстуфхцчшщъыьэюя"),
    "he": set("אבגדהוזחטיכלמנסעפצקרשתךםןףץ"),
}

EXIT_OK = 0
EXIT_INVALID = 1
EXIT_ERROR = 2


def die(msg: str, code: int = EXIT_ERROR) -> None:
    print(msg)  # stdout only
    sys.exit(code)


def normalize(word: str) -> str:
    return unicodedata.normalize("NFC", word).casefold()

def extract_word(line: str) -> str:
    line = line.lstrip()
    if not line:
        return ""
    return line.split(None, 1)[0]   # <-- first token only

def validate_word(word: str, allowed: set, expected_len: int):
    reasons = []
    w = normalize(word)

    # length check
    if len(w) != expected_len:
        reasons.append(f"length={len(w)} expected={expected_len}")

    # alphabet check
    bad = [ch for ch in w if ch not in allowed]
    if bad:
        uniq = "".join(sorted(set(bad)))
        reasons.append(f"bad_chars={uniq!r}")

    return reasons


def get_input_stream(filename: str):
    if filename == "-":
        return sys.stdin
    path = Path(filename)
    if not path.exists():
        die(f"ERROR: file not found: {filename}")
    if not path.is_file():
        die(f"ERROR: not a file: {filename}")
    return path.open("r", encoding="utf-8", errors="replace")


def main():
    p = argparse.ArgumentParser(description="Validate words (one per line)")
    p.add_argument("filename", help="file or - for stdin")
    p.add_argument("-l", "--lang", required=True, help="language code")
    p.add_argument("-c", "--len", required=True, type=int, help="exact length")
    args = p.parse_args()

    lang = args.lang.lower()

    if lang not in SUPPORTED_LANGS:
        die(f"ERROR: unsupported language: {lang}")

    if args.len <= 0:
        die("ERROR: -c/--len must be > 0")

    allowed = SUPPORTED_LANGS[lang]

    any_invalid = False

    f = get_input_stream(args.filename)

    try:
        for lineno, line in enumerate(f, start=1):
            word = extract_word(line)
            if not word:
                continue
            reasons = validate_word(word, allowed, args.len)

            if not word:
                continue

            reasons = validate_word(word, allowed, args.len)

            if reasons:
                any_invalid = True
                print(f"{lineno}\t{word}\t{'; '.join(reasons)}")

    finally:
        if f is not sys.stdin:
            f.close()

    sys.exit(EXIT_INVALID if any_invalid else EXIT_OK)


if __name__ == "__main__":
    main()
