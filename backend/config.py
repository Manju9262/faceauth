import os
from pathlib import Path

# Load dotenv manually to avoid external dependencies
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                # Strip potential quotes
                val = val.strip().strip("'").strip('"')
                os.environ[key.strip()] = val

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "supersecretjwtkeyforfacialauthsystem2026")
PORT = int(os.environ.get("PORT", 8000))
HOST = os.environ.get("HOST", "0.0.0.0")
DEFAULT_THRESHOLD = float(os.environ.get("SIMILARITY_THRESHOLD", 0.65))
MODEL_NAME = os.environ.get("MODEL_NAME", "buffalo_sc")

# Create local storage folders for fallback
UPLOAD_DIR = Path(__file__).parent / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
