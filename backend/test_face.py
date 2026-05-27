import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

from backend.face_utils import get_face_app

if __name__ == "__main__":
    print("Testing InsightFace/ArcFace initialization and caching models...")
    try:
        app = get_face_app()
        print("\nSUCCESS: InsightFace loaded and models cached successfully!")
    except Exception as e:
        print(f"\nERROR: Failed to load InsightFace. Details: {e}")
        sys.exit(1)
