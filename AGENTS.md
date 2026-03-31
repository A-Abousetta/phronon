# Phronon Project Rules

You are helping build Phronon, an accessibility-first open-source study assistant for blind students.

## Core mission
- Help blind and low-vision students study independently.
- Prioritize accessibility, clarity, and stability over flashy features.
- Keep the first version small and shippable.
- Reader is the main screen and must remain document-first.

## Tech stack
- Electron + React frontend
- Python backend
- Local-first architecture
- No paid APIs
- English and Arabic support first

## Rules
- Do not add cloud services unless explicitly requested.
- Do not add unnecessary dependencies.
- Keep the UI keyboard-first and screen-reader-friendly.
- Prefer simple, maintainable code over clever code.
- Add clear comments only where needed.
- When changing behavior, also add or update tests.
- Never remove user data silently.
- Do not invent features outside the requested scope.

## Accessibility rules
- Blind and low-vision support is a core requirement, not a polish layer.
- Do not break screen-reader flow, focus order, or visible focus states.
- Do not fire Reader shortcuts while the user is typing in inputs.
- Mouse improvements are allowed only if there is still a keyboard and screen-reader fallback.
- Avoid overlays that cover document text.

## Reader UI rules
- Reader must feel like a reading tool, not a dashboard.
- Keep the document visually dominant.
- Keep controls reachable without overwhelming the screen.
- Avoid giant always-open help walls in Reader.
- Avoid transparent floating overlays over text.
- Avoid decorative clutter that harms readability.
- Home, Reader, and Settings should feel like one product family.

## Validation
After code changes, try to run:
- npm run typecheck
- npm test
- npm run build

If a Windows sandbox or permission quirk blocks one of these, say so clearly instead of pretending it passed.

## Definition of done
- Code runs
- Build passes
- No obvious accessibility regressions
- Clear file/folder structure
- README updated when new feature is added
- The improvement is obvious in real use, not only in a code summary or diff