"""Quick script to check which image provider will be used."""
import os
from pathlib import Path

# Load .env file
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value

# Check provider
from imggen import _resolve_image_provider

provider = _resolve_image_provider(None)
print(f"\n{'='*60}")
print(f"IMAGE PROVIDER CHECK")
print(f"{'='*60}")
print(f"Provider: {provider}")
print(f"\nEnvironment Variables:")
print(f"  IMAGE_PROVIDER: {os.getenv('IMAGE_PROVIDER')}")
print(f"  API_KEY_LAOZHANG: {'[SET]' if os.getenv('API_KEY_LAOZHANG') else '[NOT SET]'}")
print(f"  LAOZHANG_IMAGE_MODEL: {os.getenv('LAOZHANG_IMAGE_MODEL')}")
print(f"  LAOZHANG_API_BASE: {os.getenv('LAOZHANG_API_BASE') or 'https://api.laozhang.ai (default)'}")
print(f"  GEMINI_API_KEY: {'[SET]' if os.getenv('GEMINI_API_KEY') else '[NOT SET]'}")
print(f"{'='*60}\n")

if provider == "laozhang":
    print("[OK] LaoZhang API will be used for image generation")
else:
    print("[WARNING] Gemini API will be used for image generation")
    print("   To use LaoZhang, ensure IMAGE_PROVIDER=laozhang in .env")
