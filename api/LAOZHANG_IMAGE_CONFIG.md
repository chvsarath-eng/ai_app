# LaoZhang API Image Configuration

## Overview

This document covers image generation configuration for the Story Generator API, including aspect ratio settings, resolution options, safety parameters, and identity preservation techniques.

---

## Issue History

### Issue 1: Rectangular Images Instead of Square
**Problem:** Images were being generated in rectangular shapes instead of the desired 1:1 aspect ratio.

**Root Cause:** The LaoZhang API request was not including the `generationConfig` with `imageConfig` parameters that control aspect ratio and image size.

**Solution:** Updated `imggen.py` to include proper Gemini API format configuration.

### Issue 2: IMAGE_SAFETY Errors for Children
**Problem:** Generating images with child characters triggered `IMAGE_SAFETY` errors.

**Root Cause:** The `personGeneration` parameter was set to `"ALLOW_ADULT"` which explicitly blocks images containing children.

**Solution:** Changed `personGeneration` to `"ALLOW_ALL"` to enable generation of adults and children. This is required for legitimate use cases like children's storybooks.

---

## API Configuration

### LaoZhang API Request Format

```python
payload = {
    "model": model_name,
    "stream": False,
    "messages": messages,
    "generationConfig": {
        "responseModalities": ["IMAGE"],
        "personGeneration": "ALLOW_ALL",  # Required for child images
        "imageConfig": {
            "aspectRatio": "1:1",      # Controls image shape
            "imageSize": "4K"           # Controls resolution
        }
    }
}
```

### Direct Gemini SDK Configuration

```python
config = types.GenerateContentConfig(
    response_modalities=["IMAGE"],
    person_generation="ALLOW_ALL",  # Required for child images
)
```

---

## Configuration Options

### Aspect Ratios
| Value | Description |
|-------|-------------|
| `"1:1"` | Square (default, recommended for storybooks) |
| `"16:9"` | Landscape (widescreen) |
| `"9:16"` | Portrait (vertical) |
| `"4:3"` | Standard landscape |
| `"3:4"` | Standard portrait |

### Image Sizes
| Value | Resolution | Use Case |
|-------|------------|----------|
| `"1K"` | 1024px | Fastest, cheapest, testing |
| `"2K"` | 2048px | Balanced quality/cost |
| `"4K"` | 4096px | Highest quality (default) |

### Person Generation
| Value | Description |
|-------|-------------|
| `"ALLOW_ADULT"` | Only adults allowed (blocks children) |
| `"ALLOW_ALL"` | Adults and children allowed (required for storybooks) |
| `"DONT_ALLOW"` | No human figures allowed |

**Important:** `"ALLOW_ALL"` may be restricted in certain regions. If you encounter persistent `IMAGE_SAFETY` errors, check the Google AI documentation for regional availability.

---

## Current Settings

Located in `imggen.py`:

```python
# Around line 276-280
IMAGE_RESOLUTION = "4K"  # Higher quality; increases cost and latency
ASPECT_RATIO = "1:1"     # Square images

# Line 191 (LaoZhang API)
"personGeneration": "ALLOW_ALL",

# Line 510 (Direct Gemini SDK)
person_generation="ALLOW_ALL",
```

---

## How to Change Settings

### Option 1: Edit Code (Permanent)
Edit `imggen.py` lines 276-280 to change defaults.

### Option 2: Environment Variables (Recommended)
Add to `.env` file:
```bash
IMAGE_RESOLUTION=4K
IMAGE_ASPECT_RATIO=1:1
```

Then update code to read from env:
```python
IMAGE_RESOLUTION = os.getenv("IMAGE_RESOLUTION", "4K")
ASPECT_RATIO = os.getenv("IMAGE_ASPECT_RATIO", "1:1")
```

---

## Identity Preservation for Storybooks

When generating storybook images with consistent characters across multiple pages, identity preservation is critical.

### Prompt Architecture v5 (Feb 2026)

Prompts have been restructured to match Google's Nano Banana Pro best practices and high-quality cinematic prompt patterns.

**Key principles:**
- Cover/page prompts: **single flowing comma-separated sentence** (no bullet lists, no headings)
- References are described naturally (avoid `Image 1:` / `Image 2:` labels)
- Faces: **mostly frontal**, **neutral expression**, **both eyes visible**
- Face fidelity: **faces unobstructed + sharpest area**, no motion blur on faces
- Avoid wide/establishing shots where faces become too small

**Why this works:** Long prompts dilute attention and increase identity drift. The v5 system prompt forces a compact, film-still composition where face constraints are always near the subject description.

### Prompt Template Format

```
Create an ultra-realistic cinematic shot of [scene/action], the first image is [Name1]'s character reference (use exact face/build/outfit), the second image is [Name2]'s character reference (use exact face/build/outfit), [blocking + positions], both face the camera with neutral expressions and both eyes visible, faces unobstructed and sharpest in frame, [shot + lens feel + lighting], cinematic color grading, subtle film grain, [short negatives]
```

### Key Identity Phrases

```python
IDENTITY_PHRASE = (
    "Preserve this EXACT face from the reference -- same bone structure, "
    "skin tone, every mole and mark. No beautification, no smoothing, "
    "no age shift. NEVER invent or substitute a different face."
)

STRICT_FACE_LOCK = (
    "Enable strict facial consistency mode. "
    "Preserve the EXACT face from each character's reference image."
)
```

### Shot Type Guidelines

| Shot Type | Face Fidelity | Recommendation |
|-----------|---------------|----------------|
| Close-up | Excellent | Best for identity |
| MCU (Medium Close-Up) | Very Good | Recommended |
| Medium | Good | Acceptable with face-priority |
| Wide / Establishing | Poor | **BANNED** - causes identity loss |

### Image Input Strategy

| Phase | Images Per Character | Content |
|-------|---------------------|---------|
| Character Sheet | 1 | Face photo only |
| Cover & Pages | 1 | Costume sheet (contains face + costume) |

Previously, cover/pages used 2 images per character (separate face + costume sheet). This caused image-index confusion and wasted the model's attention budget.

---

## Reference image encoding knobs (LaoZhang path)

When using LaoZhang with inline reference images, encoding quality can strongly impact facial feature retention.

`imggen.py` supports these environment variables:

| Env var | Default | Meaning |
|---|---:|---|
| `IMAGE_REF_MAX_SIDE_PX` | `1536` | Maximum dimension for a reference image before encoding |
| `IMAGE_REF_TARGET_BYTES` | `900000` | Target size for the encoded reference image |
| `IMAGE_REF_MAX_TOTAL_B64_CHARS` | `14000000` | Safety threshold; if exceeded, references are re-encoded smaller automatically |

Tip: If requests fail due to payload size, lower `IMAGE_REF_MAX_SIDE_PX` / `IMAGE_REF_TARGET_BYTES`. If identity drift is the bigger issue, raise them (within your infra limits).

---

## Troubleshooting

### IMAGE_SAFETY Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Child content blocked | `personGeneration: "ALLOW_ADULT"` | Change to `"ALLOW_ALL"` |
| General safety block | Prompt contains flagged terms | Use prompt sanitization |
| Regional restriction | `ALLOW_ALL` not available | Check Google AI regional docs |

### Identity Loss in Generated Images

| Symptom | Cause | Solution |
|---------|-------|----------|
| Faces look different | Wide shots, faces too small | Use MCU/close-up shots |
| Wrong people appear | Model ignored references | Add IDENTITY VERIFICATION phrase |
| Skin tone changed | Extreme lighting in prompt | Add LIGHTING/SKIN TONE LOCK |
| Child aged to adult | Missing child proportion rules | Add age in LAYER 2, not just LAYER 1 |
| Faces swapped | Multi-character confusion | Use interleaved labeling (Pattern C) |

---

## Testing

After restarting the FastAPI server, you should see in logs:
```
INFO:imggen:🎨 Using image provider: laozhang
INFO:imggen:🚀 LaoZhang API - Model: gemini-3-pro-image-preview-4k, URL: https://api-cf.laozhang.ai/v1/chat/completions
INFO:imggen:📐 Image config - Aspect Ratio: 1:1, Resolution: 4K
INFO:imggen:👤 Person generation: ALLOW_ALL
```

---

## Pricing (LaoZhang)

| Resolution | Price per Image | Savings vs Official |
|------------|-----------------|---------------------|
| 4K | $0.05 | 80% off |
| 2K | ~$0.02 | ~80% off |
| 1K | ~$0.01 | ~80% off |

---

## References

- LaoZhang API Docs: https://docs.laozhang.ai/
- Gemini Image Generation: https://ai.google.dev/gemini-api/docs/imagen
- Gemini Safety Settings: https://ai.google.dev/gemini-api/docs/safety-settings
- Person Generation Parameter: https://ai.google.dev/gemini-api/docs/image-generation#person-generation

---

## Related Documentation

- `IMAGE_GEN_FEEDBACK.md` - Detailed feedback analysis and fixes applied
- `storygen_v2.py` - System prompt templates for story generation
- `imggen.py` - Image generation implementation
