#!/usr/bin/env python3
"""
================================================================================
 T H E   C O M P L I M E N T   D E L I V E R Y   E N G I N E   (v3.1.4)
================================================================================
A gloriously over-engineered, dependency-free script whose sole purpose in
life is to tell you a simple truth:

    "you're beautiful and an amazing person"

Features (none of which are strictly necessary, all of which are delightful):
  * An "encrypted" payload (Caesar cipher) that is ceremoniously decrypted.
  * A checksum "integrity verification" stage, for maximum drama.
  * A rainbow gradient ANSI renderer with graceful monochrome fallback.
  * A hand-rolled 5x5 block-letter banner generator (no figlet required).
  * A typewriter effect, a sparkle field, and a decorative sine-wave footer.
  * A --plain mode for pipes, CI logs, and the terminally unwhimsical.

Usage:
    python3 compliment.py            # full experience
    python3 compliment.py --plain    # no colors, no delays, just the truth
    python3 compliment.py --fast     # colors, but zero sleep time
================================================================================
"""

import math
import os
import random
import sys
import time

# ------------------------------------------------------------------------------
# Stage 0: The Payload
# ------------------------------------------------------------------------------
# The message is stored Caesar-shifted by +7 so that the script gets to
# perform a heroic "decryption" before delivering it. Security through
# adorability.

CIPHER_SHIFT = 7
ENCRYPTED_PAYLOAD = "fvb'yl ilhbapmbs huk hu hthgpun wlyzvu"


def caesar_decrypt(ciphertext: str, shift: int) -> str:
    """Rotate alphabetic characters backwards by `shift`, preserving case."""
    result = []
    for ch in ciphertext:
        if "a" <= ch <= "z":
            result.append(chr((ord(ch) - ord("a") - shift) % 26 + ord("a")))
        elif "A" <= ch <= "Z":
            result.append(chr((ord(ch) - ord("A") - shift) % 26 + ord("A")))
        else:
            result.append(ch)
    return "".join(result)


def checksum(text: str) -> int:
    """A tiny rolling checksum, used purely for theatrical verification."""
    value = 0
    for ch in text:
        value = (value * 31 + ord(ch)) % 1_000_000_007
    return value


EXPECTED_CHECKSUM = 590438983  # checksum of the decrypted truth


# ------------------------------------------------------------------------------
# Stage 1: Terminal capabilities and color rendering
# ------------------------------------------------------------------------------

def supports_color() -> bool:
    """Detect whether it is safe and sensible to emit ANSI color codes."""
    if "--plain" in sys.argv:
        return False
    if os.environ.get("NO_COLOR"):
        return False
    return sys.stdout.isatty()


RESET = "\033[0m"
BOLD = "\033[1m"


def rgb(r: int, g: int, b: int) -> str:
    """Build a 24-bit ANSI foreground color escape sequence."""
    return f"\033[38;2;{r};{g};{b}m"


def rainbow_color(position: float) -> str:
    """
    Map a position in [0, 1] onto a smooth rainbow using phase-shifted
    sine waves. Yes, this is the classic 'lolcat' trick.
    """
    freq = 2 * math.pi
    r = int(math.sin(freq * position + 0) * 110 + 145)
    g = int(math.sin(freq * position + 2 * math.pi / 3) * 110 + 145)
    b = int(math.sin(freq * position + 4 * math.pi / 3) * 110 + 145)
    return rgb(r, g, b)


class Renderer:
    """Central place that decides whether output gets color and delays."""

    def __init__(self, colorful: bool, fast: bool):
        self.colorful = colorful
        self.fast = fast

    def sleep(self, seconds: float) -> None:
        if not self.fast:
            time.sleep(seconds)

    def paint(self, text: str, position: float) -> str:
        if not self.colorful:
            return text
        return rainbow_color(position) + text + RESET

    def rainbow_line(self, text: str, offset: float = 0.0) -> str:
        """Color every character of a line along the rainbow."""
        if not self.colorful or not text.strip():
            return text
        width = max(len(text), 1)
        pieces = []
        for i, ch in enumerate(text):
            pieces.append(rainbow_color(offset + i / width) + ch)
        pieces.append(RESET)
        return "".join(pieces)

    def typewriter(self, text: str, delay: float = 0.02) -> None:
        """Print a line one character at a time, like a thoughtful robot."""
        for i, ch in enumerate(text):
            sys.stdout.write(self.paint(ch, i / max(len(text), 1)))
            sys.stdout.flush()
            self.sleep(delay)
        sys.stdout.write("\n")


# ------------------------------------------------------------------------------
# Stage 2: Block-letter banner generation (hand-rolled 5-row font)
# ------------------------------------------------------------------------------

FONT = {
    "a": ["  #  ", " # # ", "#####", "#   #", "#   #"],
    "b": ["#### ", "#   #", "#### ", "#   #", "#### "],
    "d": ["#### ", "#   #", "#   #", "#   #", "#### "],
    "e": ["#####", "#    ", "#### ", "#    ", "#####"],
    "f": ["#####", "#    ", "#### ", "#    ", "#    "],
    "g": [" ####", "#    ", "#  ##", "#   #", " ####"],
    "i": ["#####", "  #  ", "  #  ", "  #  ", "#####"],
    "l": ["#    ", "#    ", "#    ", "#    ", "#####"],
    "m": ["#   #", "## ##", "# # #", "#   #", "#   #"],
    "n": ["#   #", "##  #", "# # #", "#  ##", "#   #"],
    "o": [" ### ", "#   #", "#   #", "#   #", " ### "],
    "p": ["#### ", "#   #", "#### ", "#    ", "#    "],
    "r": ["#### ", "#   #", "#### ", "#  # ", "#   #"],
    "s": [" ####", "#    ", " ### ", "    #", "#### "],
    "t": ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
    "u": ["#   #", "#   #", "#   #", "#   #", " ### "],
    "y": ["#   #", " # # ", "  #  ", "  #  ", "  #  "],
    "z": ["#####", "   # ", "  #  ", " #   ", "#####"],
    "'": ["  #  ", "  #  ", "     ", "     ", "     "],
    " ": ["   ", "   ", "   ", "   ", "   "],
}


def banner_lines(text: str) -> list:
    """Assemble a word into 5 rows of chunky block letters."""
    rows = ["", "", "", "", ""]
    for ch in text.lower():
        glyph = FONT.get(ch, FONT[" "])
        for row_index in range(5):
            rows[row_index] += glyph[row_index] + " "
    return [row.rstrip() for row in rows]


def print_banner(renderer: Renderer, text: str, offset: float) -> None:
    for row in banner_lines(text):
        print(renderer.rainbow_line(row, offset))
        renderer.sleep(0.05)


# ------------------------------------------------------------------------------
# Stage 3: Decorative flourishes
# ------------------------------------------------------------------------------

SPARKLES = ["*", "+", ".", "o", "'"]


def sparkle_field(renderer: Renderer, width: int = 64, rows: int = 3) -> None:
    """Print a field of randomly scattered sparkles. Purely gratuitous."""
    rng = random.Random(20260720)  # deterministic sparkles: today's seed
    for _ in range(rows):
        line = []
        for col in range(width):
            if rng.random() < 0.12:
                line.append(rng.choice(SPARKLES))
            else:
                line.append(" ")
        print(renderer.rainbow_line("".join(line), rng.random()))
        renderer.sleep(0.05)


def sine_wave_footer(renderer: Renderer, width: int = 64, height: int = 5) -> None:
    """Draw a gentle sine wave, because every engine needs a cool footer."""
    grid = [[" "] * width for _ in range(height)]
    for x in range(width):
        y = int((math.sin(x / 6.0) + 1) / 2 * (height - 1))
        grid[height - 1 - y][x] = "~"
    for row_index, row in enumerate(grid):
        print(renderer.rainbow_line("".join(row), row_index / height))
        renderer.sleep(0.04)


def divider(renderer: Renderer, width: int = 64) -> None:
    print(renderer.rainbow_line("=" * width))


# ------------------------------------------------------------------------------
# Stage 4: The dramatic startup sequence
# ------------------------------------------------------------------------------

BOOT_STEPS = [
    "Initializing kindness core",
    "Calibrating sincerity matrix",
    "Loading appreciation modules",
    "Warming up the warm fuzzies",
    "Decrypting classified payload",
    "Verifying message integrity",
]


def boot_sequence(renderer: Renderer) -> str:
    """Run the fake boot sequence and return the decrypted message."""
    message = ""
    for step_number, step in enumerate(BOOT_STEPS, start=1):
        label = f"[{step_number}/{len(BOOT_STEPS)}] {step}..."
        sys.stdout.write(renderer.paint(label.ljust(48), step_number / 7))
        sys.stdout.flush()
        renderer.sleep(0.25)

        if step.startswith("Decrypting"):
            message = caesar_decrypt(ENCRYPTED_PAYLOAD, CIPHER_SHIFT)
        if step.startswith("Verifying"):
            if checksum(message) != EXPECTED_CHECKSUM:
                print(" FAILED")
                print("Integrity error: the universe disagrees. (Impossible.)")
                sys.exit(1)

        print(renderer.paint(" OK", 0.33))
        renderer.sleep(0.1)
    return message


# ------------------------------------------------------------------------------
# Stage 5: Main
# ------------------------------------------------------------------------------

def main() -> None:
    fast = "--fast" in sys.argv or "--plain" in sys.argv
    renderer = Renderer(colorful=supports_color(), fast=fast)

    divider(renderer)
    renderer.typewriter("  THE COMPLIMENT DELIVERY ENGINE  --  booting up", 0.01)
    divider(renderer)
    print()

    message = boot_sequence(renderer)
    print()

    sparkle_field(renderer)
    print()

    # The headline, in glorious chunky block letters, one word per banner.
    for word_index, word in enumerate(message.split(" ")):
        print_banner(renderer, word, offset=word_index * 0.17)
        print()

    # And the message itself, stated plainly, because it deserves to be.
    divider(renderer)
    if renderer.colorful:
        sys.stdout.write(BOLD)
    renderer.typewriter("  >>> " + message + " <<<", 0.03)
    if renderer.colorful:
        sys.stdout.write(RESET)
    divider(renderer)
    print()

    sine_wave_footer(renderer)
    print()
    renderer.typewriter("(engine shutting down -- the message remains true)", 0.01)


if __name__ == "__main__":
    main()
