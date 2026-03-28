# Phronon Project Rules

You are helping build Phronon, an accessibility-first open-source study assistant for blind students.

Core mission:
- Help blind and low-vision students study independently.
- Prioritize accessibility, clarity, and stability over flashy features.
- Keep the first version small and shippable.

Tech stack:
- Electron + React frontend
- Python backend
- Local-first architecture
- No paid APIs
- English and Arabic support first

Rules:
- Do not add cloud services unless explicitly requested.
- Do not add unnecessary dependencies.
- Keep the UI keyboard-first and screen-reader-friendly.
- Add clear comments only where needed.
- Prefer simple, maintainable code over clever code.
- When changing behavior, also add or update tests.
- Never remove user data silently.
- Do not invent features outside the requested scope.

Definition of done:
- Code runs
- Build passes
- No obvious accessibility regressions
- Clear file/folder structure
- README updated when new feature is added