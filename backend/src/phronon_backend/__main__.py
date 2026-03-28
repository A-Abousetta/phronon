from pathlib import Path


def main() -> None:
    project_root = Path(__file__).resolve().parents[3]
    print("Phronon backend scaffold is ready.")
    print(f"Project root: {project_root}")
    print("Next step: add document import and text extraction services.")


if __name__ == "__main__":
    main()
