"""Test LaoZhang API image generation with proper aspect ratio configuration."""
import os
import sys
from pathlib import Path

# Load .env
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

from imggen import image_generator, _resolve_image_provider

print("\n" + "="*60)
print("LAOZHANG IMAGE GENERATION TEST")
print("="*60)

# Check provider
provider = _resolve_image_provider(None)
print(f"\nProvider: {provider}")

if provider != "laozhang":
    print("\n❌ ERROR: Provider is not set to 'laozhang'")
    print("   Please ensure IMAGE_PROVIDER=laozhang in .env")
    print("   and restart the FastAPI server")
    sys.exit(1)

print("\n✅ Provider correctly set to LaoZhang")

# Check for test image
test_image = Path(__file__).parent / "input_images" / "adhi.JPG"
if not test_image.exists():
    test_image = Path(__file__).parent / "input_images" / "american_model.png"
if not test_image.exists():
    print("\n❌ ERROR: No test image found in input_images/")
    sys.exit(1)

print(f"\n📸 Using test image: {test_image.name}")

# Test configuration
print("\n" + "-"*60)
print("IMAGE CONFIGURATION")
print("-"*60)
print(f"Aspect Ratio: 1:1 (square)")
print(f"Resolution: 4K (4096px)")
print(f"Model: {os.getenv('LAOZHANG_IMAGE_MODEL', 'gemini-3-pro-image-preview')}")
print(f"API URL: {os.getenv('LAOZHANG_API_BASE', 'https://api.laozhang.ai')}/v1/chat/completions")

print("\n" + "-"*60)
print("GENERATING TEST IMAGE")
print("-"*60)
print("Prompt: A professional headshot photo in a modern office")
print(f"Reference: {test_image.name}")
print("\nThis will take ~30-60 seconds...")

try:
    result = image_generator(
        prompt="A professional headshot photo in a modern office setting, natural lighting, business casual attire",
        image_filenames=[str(test_image)],
        output_filename="test_laozhang_1x1.png",
        image_provider="laozhang"
    )
    
    print("\n" + "="*60)
    print("✅ SUCCESS!")
    print("="*60)
    print(f"\nGenerated images: {len(result['images'])}")
    for img_path in result['images']:
        print(f"  📁 {img_path}")
        
        # Check image dimensions
        from PIL import Image
        with Image.open(img_path) as img:
            width, height = img.size
            ratio = width / height if height > 0 else 0
            print(f"     Size: {width}x{height}px")
            print(f"     Aspect ratio: {ratio:.2f}:1")
            
            if abs(ratio - 1.0) < 0.01:
                print(f"     ✅ Perfect 1:1 square!")
            else:
                print(f"     ⚠️  Not square (expected 1:1)")
    
    if result.get('cost_usd'):
        print(f"\n💰 Cost: ${result['cost_usd']:.4f}")
    
    print("\n" + "="*60)
    print("Test completed successfully!")
    print("="*60)
    
except Exception as e:
    print("\n" + "="*60)
    print("❌ ERROR")
    print("="*60)
    print(f"\n{type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
