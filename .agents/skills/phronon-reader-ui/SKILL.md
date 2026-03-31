---
name: phronon-reader-ui
description: Use this skill when refining Phronon's Reader UI, accessibility, visual hierarchy, keyboard-first interactions, and document-first reading experience.
---

# Phronon Reader UI Rules

## Product truth
Phronon is a reading-first desktop app for blind, low-vision, and sighted students.
The Reader is the main screen and must feel like a reading tool, not a dashboard.

## Non-negotiables
- Keep the document visually dominant.
- Keep controls reachable without overwhelming the screen.
- Never cover document text with overlays.
- Avoid giant boxed dashboard panels.
- Do not break keyboard-first behavior.
- Do not break screen-reader flow.
- Do not fire shortcuts while typing in inputs.
- Preserve current feature behavior unless the task explicitly changes it.

## Visual direction
- Calm, dark, focused.
- Fewer heavy borders.
- Compact control surfaces.
- Clear hierarchy.
- Home, Reader, and Settings must feel like one product family.
- Reader paragraphs should be easy to scan and never feel cramped or chaotic.

## Accessibility direction
- Blind users must be able to navigate the Reader and tools confidently.
- Low-vision users need clear focus states, readable spacing, and stable contrast.
- Mouse improvements are allowed only if there is still a keyboard/screen-reader fallback.

## Anti-patterns
- No transparent floating overlays on top of text.
- No giant help walls always visible in Reader.
- No fake UI states or fake counters.
- No decorative visual clutter.
- No hidden critical actions behind vague labels.

## Done when
- The improvement is obvious from a screenshot.
- The document still feels primary.
- The new interaction feels easier in real use, not only in code.
- Existing tests/build pass.