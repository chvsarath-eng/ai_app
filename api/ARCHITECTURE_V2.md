# Story Generator V2 -- Architecture & Research Document

> **Last updated:** 2026-01-28
> **Status:** Design phase -- not yet implemented

---

## Table of Contents

1. [Current Architecture (V1)](#1-current-architecture-v1)
2. [Prompt Engineering Research](#2-prompt-engineering-research)
3. [Official Gemini API Insights](#3-official-gemini-api-insights)
4. [Identity Preservation Rules (Codified)](#4-identity-preservation-rules-codified)
5. [Proposed Architecture (V2 -- Multi-Character)](#5-proposed-architecture-v2----multi-character)
6. [API Contract Changes](#6-api-contract-changes)
7. [Reference Image Flow](#7-reference-image-flow)
8. [Prompt Strategy (V2)](#8-prompt-strategy-v2)
9. [Implementation Plan](#9-implementation-plan)

---

## 1. Current Architecture (V1)

### Pipeline Overview

```
User uploads 1 face photo + story prompt
        |
        v
  [story_fastapi.py]  -- /generate-ebook-async (accepts 1 image)
        |
        v
  [strgen.py]          -- Story_content_generator (GPT/Gemini text generation)
        |                  Outputs JSON: characters, cover, 10 pages
        v
  [story_api.py]       -- generate_ebook_html_bundle
        |                  Phase 1: character sheet images (parallel)
        |                  Phase 2: cover + page images (parallel)
        v
  [imggen.py]          -- image_generator (LaoZhang or Gemini direct)
        |                  Sends reference images + prompt to model
        v
  [lulu_digi_book_maker.py] -- PDF + HTML flipbook generation
        |
        v
  GCS upload -> signed URLs -> email delivery
```

### Current Limitations

| Area | Limitation |
|------|-----------|
| Input images | 1 face photo only |
| Characters | 1 main + max 1 supporting (AI-generated, no face ref) |
| Identity lock | Only main character has face identity from photo |
| Supporting character | AI invents appearance (no face reference) |
| API endpoint | `image: UploadFile` -- single file field |

### Key Files and Responsibilities

| File | Role | Lines (approx) |
|------|------|----------------|
| `story_fastapi.py` | FastAPI server, job management, GCS upload, email | ~1300 |
| `strgen.py` | LLM prompt + story JSON generation | ~1140 |
| `story_api.py` | Orchestration: story -> images -> PDF pipeline | ~800 |
| `imggen.py` | Image generation (LaoZhang API + Gemini direct) | ~650 |
| `lulu_digi_book_maker.py` | PDF rendering + HTML flipbook | ~600 |

### Current JSON Output Schema (from strgen.py)

```json
{
  "characters": {
    "main_character": {
      "name": "string",
      "character_type": "string",
      "description": "string",
      "input_images": ["input_images/original_face.jpeg"],
      "output_image": "generated/main.png",
      "prompt": "string"
    },
    "supporting_characters": [
      {
        "name": "string",
        "character_type": "string",
        "description": "string",
        "output_image": "generated/support_slug.png",
        "prompt": "string"
      }
    ]
  },
  "book": {
    "title": "string",
    "input_images": [
      "input_images/original_face.jpeg",
      "generated/main.png"
    ],
    "output_image": "generated/book_cover.png",
    "prompt": "string"
  },
  "pages": [
    {
      "page_number": 1,
      "story": "string",
      "input_images": [
        "input_images/original_face.jpeg",
        "generated/main.png"
      ],
      "output_image": "generated/page_1.png",
      "prompt": "string"
    }
  ]
}
```

### Current Reference Image Flow (per image generation call)

```
input_images[0] = original face photo (always first)
input_images[1] = main character costume sheet (generated)
input_images[2] = supporting character sheet (if present in scene)
```

---

## 2. Prompt Engineering Research

### Sources Analyzed

1. **YouMind Nano Banana Pro Prompt Library** -- 6000+ curated prompts from GitHub
   (github.com/YouMind-OpenLab/nano-banana-pro-prompts-recommend-skill)
2. **PromptGather Excel** -- 496 prompts from promptgather.io
3. **Google official documentation** -- Gemini image generation best practices

### Prompt Length Benchmarks (from 496 Excel prompts)

| Metric | Value |
|--------|-------|
| Minimum | 8 chars |
| Maximum | 7030 chars (~1400 words) |
| Average | 977 chars (~200 words) |
| Median | 763 chars (~150 words) |
| **Our current prompts** | **~200 words (below median)** |
| **Target for V2** | **400-700 words per scene prompt** |

### Prompt Type Distribution

| Type | Count | Percentage |
|------|-------|-----------|
| Text (narrative) | 284 | 57% |
| JSON (structured) | 212 | 43% |

### Keyword Frequency Analysis (across 496 prompts)

| Keyword | Hits | % of Prompts | Our Status |
|---------|------|-------------|------------|
| `texture` | 318 | 64% | Partially used |
| `cinematic` | 241 | 49% | Used |
| `reference` | 199 | 40% | Used |
| `8k` | 98 | 20% | Used |
| `photorealistic` | 87 | 18% | Used |
| `fabric` | 80 | 16% | **Missing** |
| `bokeh` | 71 | 14% | Partially used |
| `skin texture` | 44 | 9% | **Missing** |
| `shallow depth` | 39 | 8% | Partially used |
| `85mm` | 36 | 7% | Partially used |
| `pores` | 21 | 4% | **Missing** |
| `f/1.8` | 21 | 4% | **Missing** |
| `iphone` | 24 | 5% | **Missing** |
| `freckles` | 16 | 3% | **Missing** |
| `negative` (prompts) | 37 | 7% | **Missing** |

### Top Techniques from High-Performing Prompts

#### A. Bio-Fidelity Language (skin realism)

What top prompts use that we don't:

```
"visible micro-pores on nose and cheeks"
"fine vellus hair along the jawline"
"natural skin texture with imperfections"
"realistic epidermal physics"
"subtle pores and a healthy sunlit sheen"
"natural freckles visible across face and shoulders"
"skin rendering: real texture, no retouch"
```

**Why it matters:** Generic "realistic skin" produces AI-smooth faces. Explicit bio-fidelity
keywords force the model to add real human texture details.

#### B. Camera Device Simulation

What top prompts use:

```
"shot on iPhone 16 Pro, 24mm wide-angle lens, f/1.8 aperture"
"iPhone 15 Pro simulation, 24mm wide focal length, f/2.4 aperture"
"full-frame DSLR, 85mm lens, f/1.8, shallow depth"
"wide-angle smartphone lens simulation (approx 24mm or 28mm)"
"subtle sensor grain, slight edge softness"
```

What we currently use:

```
"professional DSLR look"  (too generic)
"85mm portrait lens"      (no aperture, no device)
```

#### C. Identity Lock Phrasing (from top prompts)

What top prompts use:

```
"Absolute inheritance of facial geometry coordinates from reference image"
"face_similarity_priority: MAX"
"preserve_moles_freckles_scars: true"
"preserve_eye_shape, preserve_nose_shape, preserve_lip_shape, preserve_jawline"
"no_identity_blending: true, no_beautify: true, no_age_shift: true"
"Strict adherence to the provided reference photo"
```

What we currently use:

```
"Keep the person exactly as shown in the reference image with 100% identical
 facial features, bone structure, skin tone, and appearance."
```

**Gap:** Our phrasing is good but lacks the granular preserve/no-alter directives that
top prompts use to prevent subtle identity drift.

#### D. Textile Architecture

What top prompts use:

```
"fabric-to-skin compression physics"
"visible elasticized horizontal banding and micro-pleats"
"high-tensile fabric-to-skin tension"
"realistic compression folds on duvet"
"natural draping behavior, weight and movement"
```

What we currently use:

```
"realistic fabric behavior"  (too generic)
```

#### E. Negative Prompts

What top prompts use (explicitly at the end):

```
"Negatives: AI glow, plastic skin, beauty filter look, skincare-ad look,
 over-smoothed texture, CGI, cartoon, 3D render, illustration, distorted
 hands, extra fingers, flat lighting, pastel faded colors, logos, text,
 watermarks"
```

What we currently use:

```
"NOT CGI, NOT illustration, NOT cartoon"  (too brief)
```

#### F. Environmental Micro-Details

What top prompts use:

```
"condensation on glass, dust particles in light beams"
"compression folds on fabric, floor reflections"
"wet strands sticking to forehead, flyaways framing face"
"small beauty mark on cheek, subtle sheen on collarbones"
```

What we currently use:

```
"fog/rain/embers/dust"  (generic atmospheric list)
```

#### G. Structured Reference Image Roles (from top JSON prompts)

```json
{
  "reference_images": [
    {
      "url": "image_a.jpg",
      "role": "identity_and_face_reference",
      "priority": "highest",
      "strict_lock": true
    },
    {
      "url": "image_b.jpg",
      "role": "pose_reference",
      "priority": "high"
    }
  ]
}
```

**Takeaway:** Top prompts explicitly label each reference image with a role and priority.
This is critical for multi-character scenes where the model needs to know which face
belongs to which character.

### Google Official Guidance

> "Describe the scene, don't just list keywords."
> The model's core strength is its deep language understanding. A narrative,
> descriptive paragraph will always produce a better, more coherent image
> than a list of disconnected words.

**Official template:**

```
A photorealistic [shot type] of [subject], [action or expression],
set in [environment]. The scene is illuminated by [lighting description],
creating a [mood] atmosphere. Captured with a [camera/lens details],
emphasizing [key textures and details].
```

**Multi-image reference handling:**

- Use the phrase: "featuring the same character shown in the reference image"
- Add: "Keep all core design elements consistent"
- State: "ensuring proportions, face structure, markings, outfit layers remain unchanged"

---

## 3. Official Gemini API Insights

> Source: https://ai.google.dev/gemini-api/docs/image-generation
> Source: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/design-multimodal-prompts

### Model Capabilities (Gemini 3 Pro Image Preview)

| Feature | Detail |
|---------|--------|
| Max reference images | **14 total** (up to 5 humans + up to 6 objects) |
| Resolution options | 1K, 2K, 4K (uppercase K required) |
| Aspect ratios | 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 |
| Thinking mode | Enabled by default, cannot be disabled |
| Thought images | Up to 2 interim images for composition testing (free) |
| Multi-turn editing | Supported via chat/conversation API |

### Content Parts Ordering (CRITICAL for V2)

The official docs show **two distinct patterns** for content part ordering:

**Pattern A -- Text first, images after (for generation/group photos):**
```python
contents = [
    "An office group photo of these people, they are making funny faces.",
    Image.open('person1.png'),
    Image.open('person2.png'),
    Image.open('person3.png'),
]
```
Used when: creating new scenes FROM reference faces.

**Pattern B -- Images first, text after (for editing/composition):**
```python
contents = [
    dress_image,     # What to use
    model_image,     # Who to apply it to
    text_instruction # How to combine
]
```
Used when: combining elements from multiple images.

**Pattern C -- Interleaved text + image (for labeled references):**
```python
contents = [
    "Reference Face Photo for Character 1:",
    face_image_1,
    "Costume Reference for Character 1:",
    costume_image_1,
    "Reference Face Photo for Character 2:",
    face_image_2,
    "Scene instruction text..."
]
```
Used when: each image needs a specific role/label.

### Which Pattern is Best for Our Storybook?

**Decision: Use Pattern C (interleaved) for multi-character scenes.**

Rationale:
- We have multiple images with DIFFERENT roles (face vs costume)
- Each image belongs to a SPECIFIC character
- The model needs to know WHICH face goes with WHICH costume
- Pattern A (all images after text) gives the model no way to know which
  image is face vs costume vs character 1 vs character 2
- Pattern C explicitly labels each image so the model can't confuse them

**For LaoZhang API (v1beta REST):**
LaoZhang sends all content as `parts` in a single `contents` array.
Interleaving is achieved by ordering parts as:
```json
{
  "contents": [{
    "parts": [
      {"text": "This is Character 1's face reference:"},
      {"inlineData": {"mimeType": "image/jpeg", "data": "...face1..."}},
      {"text": "This is Character 1's costume reference:"},
      {"inlineData": {"mimeType": "image/jpeg", "data": "...costume1..."}},
      {"text": "This is Character 2's face reference:"},
      {"inlineData": {"mimeType": "image/jpeg", "data": "...face2..."}},
      {"text": "Now create this scene: [full prompt]"}
    ]
  }]
}
```

**For Gemini Direct API (Python SDK):**
The SDK natively supports interleaved content:
```python
contents = [
    "This is Character 1's face reference:",
    pil_image_face1,
    "This is Character 1's costume reference:",
    pil_image_costume1,
    "This is Character 2's face reference:",
    pil_image_face2,
    "Now create this scene: ...",
]
```

### Official Prompt Strategy (from Google docs)

> "Describe the scene, don't just list keywords."
> The model's core strength is its deep language understanding.

**Official photorealistic template:**
```
A photorealistic [shot type] of [subject], [action or expression],
set in [environment]. The scene is illuminated by [lighting description],
creating a [mood] atmosphere. Captured with a [camera/lens details],
emphasizing [key textures and details].
```

### Multimodal Prompt Best Practices (from Google docs)

1. **Use specific instructions** -- don't say "describe this"; say exactly
   what you need extracted or generated
2. **Add few-shot examples** -- include image+response pairs to demonstrate
   the desired pattern
3. **Split complex tasks** -- break multi-step reasoning into explicit steps
4. **Specify output format** -- tell the model exactly what format you want
5. **Ask model to describe images first** -- improves reasoning accuracy
6. **Temperature 0.4** as starting point; lower for identity accuracy,
   higher for creative variety

### Parameter Recommendations for Identity-Preserving Storybooks

Based on official docs + our testing:

| Parameter | Value | Reason |
|-----------|-------|--------|
| `temperature` | 0.2-0.4 | Lower = more faithful to reference faces |
| `topP` | 0.7-0.9 | Moderate diversity in scene composition |
| `imageSize` | "4K" | Maximum quality for print-ready output |
| `aspectRatio` | "1:1" | Square format for storybook pages |
| `responseModalities` | ["IMAGE"] | Image-only output (no interleaved text) |

### What We Were Doing Wrong (V1)

| Issue | V1 Approach | Correct Approach (from docs) |
|-------|------------|------------------------------|
| Image ordering | All images after text | Interleave labels with images (Pattern C) |
| Image labeling | No labels on LaoZhang path | Add text parts between images as labels |
| Prompt style | Keyword lists with uppercase headers | Narrative paragraphs describing scenes |
| Reference handling | Generic "use this face" | Specific: "Character 1's face reference:" before each image |
| Scene description | "SCENE: hero in forest" | "A photorealistic medium shot of the hero standing in..." |

---

## 4. Identity Preservation Rules (Codified)

These are the non-negotiable rules from V1 that carry forward to V2.

### Rule 1: Frontal Face Lock (ABSOLUTE)

```
- Face must point directly at camera (0 degrees)
- BOTH eyes fully visible in every image
- NO profile, NO 3/4 view, NO looking away, NO looking down
- Body can move freely, but HEAD stays facing camera
- This rule OVERRIDES all other scene/pose instructions
```

**Why:** Side/profile views cause the model to hallucinate facial features,
breaking identity. Frontal face is the only reliable angle for face preservation.

### Rule 2: Identity Lock (per character)

```
- Preserve: facial features, bone structure, skin tone, age appearance
- Hair COLOR must not change (length/style can adapt to costume)
- NEVER invent facial features not visible in the input face photo
- Allowed to change ONLY: costume/outfit and props
```

### Rule 3: Expression Lock

```
- Micro-expressions only (emotion through eyes/eyebrows)
- Mouth closed or slightly parted (NO teeth, NO wide-open mouth)
- NO squinting, NO screaming, NO laughing
- Subtle and neutral across all images
```

**Why:** Large expression changes distort the face geometry and break identity
recognition. Eyes-only acting preserves the face shape best.

### Rule 4: Costume Consistency

```
- Each character wears the EXACT same costume across all pages
- Costume defined once in character sheet, then referenced
- No costume changes mid-story
```

### Rule 5: Scale Consistency

```
- Character sizes stay consistent across all pages
- Fixed relative height ratios between characters
- Explicit size relationships described in prompts
  (e.g., "parent is 1.5x taller than child")
```

### Rule 6: Multi-Character Positioning

```
- Characters stand SIDE-BY-SIDE facing camera
- Interaction through gestures and props (NOT by facing each other)
- "Characters meeting" = BOTH face camera, standing beside each other
- "Talking to someone" = BOTH face camera, one gesturing
- "Handshake" = BOTH face camera, arms extended to side
```

### Rule 7: Photoreal Background

```
- Background must look like a real photographed location
- FORBIDDEN: CGI, digital art, illustration, painting, anime, cartoon,
  3D render, video-game look, neon graphics
```

---

## 5. Edge Cases and Failure Handling

These are the known failure modes of AI image generation for multi-character
storybooks, discovered through research and testing. Each edge case includes
what goes wrong, the prompt-level fix, and the negative prompt clause to add.

### 5.1 Height and Body Proportions

| Edge Case | What Goes Wrong | Prompt Fix | Negative Clause |
|-----------|----------------|-----------|-----------------|
| Child same height as adult | Model defaults all characters to similar height | "Child stands waist-high to the father. Daughter's head reaches mother's elbow." | "no uniform heights, no same-size characters" |
| Toddler with adult proportions | Model produces small adults instead of child anatomy | "3-year-old child proportions: large head relative to body (1:4 head-to-body ratio), short limbs, round belly, small hands" | "no adult proportions on children" |
| All characters same build | Model homogenizes body types across characters | Per-character body spec: "father has broad shoulders and stocky build" vs "mother is slim with narrow waist" vs "son is small-framed and wiry" | "no identical body types" |
| Scale shifts across pages | Character heights inconsistent page to page | Include in EVERY prompt: "Scale lock: Father 5'10, Mother 5'4, Son reaches Father's chest, Daughter reaches Mother's hip" | "no scale inconsistency" |

**Mandatory scale-lock phrase for V2 (include in every scene prompt):**
```
"Maintain exact height relationships from the character sheets across
all pages. [Char1] is the tallest at [X]. [Char2] reaches [Char1]'s
[shoulder/chest/waist]. [Char3] stands [knee-high/waist-high] to [Char1].
These proportions must remain unchanged in every scene."
```

### 5.2 Identity Drift (Deglamourization / Beautification)

AI models have a documented bias toward beauty norms (86.5% of generated
faces are lighter-skinned, 74% appear younger). These biases cause:

| Edge Case | What Goes Wrong | Prompt Fix | Negative Clause |
|-----------|----------------|-----------|-----------------|
| Skin tone lightening | Model shifts darker skin toward lighter tones | "Maintain exact skin tone from reference photo: [warm brown / dark brown / deep ebony / olive]. Do NOT lighten or alter undertone under any lighting condition" | "no skin lightening, no skin tone shift, no whitewashing" |
| Age shift (younger) | Model makes older adults look 10-20 years younger | "Preserve exact age appearance from reference: visible wrinkles, grey hair, age spots, crow's feet. Do NOT de-age or smooth age markers" | "no de-aging, no age reduction, no youth filter" |
| Age shift (older) | Model makes children look older than they are | "Preserve child's exact age appearance from reference: baby fat, round cheeks, small features. Do NOT age up" | "no aging up children" |
| Feature beautification | Model smooths unique features (wide nose, asymmetry, scars, birthmarks) | "Preserve ALL natural facial features including: nose width, facial asymmetry, scars, birthmarks, moles, dimples, acne marks. No beautification" | "no beauty filter, no feature smoothing, no facial symmetry correction" |
| Hair texture change | Curly/coily hair rendered as straight or wavy | "Hair texture must match reference exactly: [tight coils / loose curls / 4C texture / straight / wavy]. Do NOT alter hair texture, volume, or pattern" | "no hair straightening, no texture change" |
| Eye color change | Model shifts eye color | "Eye color locked from reference: [dark brown / hazel / green]. Do NOT change iris color" | "no eye color change" |

**Mandatory anti-drift phrase for V2 (include in every character identity lock):**
```
"This is a real person. Preserve their EXACT appearance from the reference
photo without any beautification, smoothing, lightening, de-aging, or
feature correction. Every mole, wrinkle, scar, asymmetry, and skin texture
detail must be faithfully reproduced. The generated person must be
immediately recognizable as the same individual in the reference."
```

### 5.3 Anatomy Failures

| Edge Case | What Goes Wrong | Prompt Fix | Negative Clause |
|-----------|----------------|-----------|-----------------|
| Extra/missing fingers | 6th finger appears or fingers missing | "Anatomically correct hands: exactly five fingers per hand, natural joint positions, realistic knuckle creases" | "no extra fingers, no missing fingers, no fused fingers, no mutated hands" |
| Distorted hands | Hands look melted, twisted, or boneless | "Hands with clear bone structure under skin, natural finger spacing, visible tendons on back of hand" | "no distorted hands, no melted hands, no boneless hands" |
| Body merged with environment | Limbs blend into background objects or other characters | "Clear spatial separation between each character's body and all background elements. No body parts merging with objects" | "no body-environment merging, no clipping" |
| Neck/torso distortion | Unnaturally long neck, twisted torso, impossible posture | "Natural human skeletal alignment: proportional neck length, natural spine curvature, anatomically possible pose" | "no elongated neck, no twisted torso, no impossible anatomy" |
| Floating or disconnected limbs | Arms/legs appear detached from body | "All limbs naturally connected to torso at correct joint positions" | "no floating limbs, no disconnected body parts" |

### 5.4 Multi-Character Composition

| Edge Case | What Goes Wrong | Prompt Fix | Negative Clause |
|-----------|----------------|-----------|-----------------|
| Face swap between characters | Father gets son's face or vice versa | Use interleaved labeling (Pattern C from Section 3): label each face reference with character name BEFORE the image | "no face swapping between characters" |
| Characters overlapping | Bodies clip through each other | "Clear spatial separation between all characters: minimum arm's-length distance. No overlapping limbs, torsos, or props" | "no overlapping characters, no body clipping" |
| One character visually dominates | One character rendered much larger or more detailed | "Equal visual prominence and detail level for all characters present. Balanced composition, equal sharpness" | "no single-character dominance" |
| Background character becomes generic | 3rd or 4th character loses identity | Limit any single scene to max 3 characters. Spread 4th character to other pages where they appear with fewer others | N/A (architectural fix, not prompt fix) |
| Characters face each other (profile) | Model turns faces to create "natural" interaction | "ALL characters face directly at camera with both eyes visible. Interaction expressed through body language, hand gestures, and shared props -- NEVER by turning faces toward each other" | "no profile views, no characters facing each other, no side angles" |
| Inconsistent positioning across pages | Characters swap left/right positions | "Character positioning locked: [Char1] always on left, [Char2] always on right. Do not swap positions" | "no position swapping" |

### 5.5 Costume and Prop Issues

| Edge Case | What Goes Wrong | Prompt Fix | Negative Clause |
|-----------|----------------|-----------|-----------------|
| Costume bleeding between characters | Father's armor appears on son | "Costume strictly locked per character: [Char1] wears [outfit A]. [Char2] wears [outfit B]. Do NOT transfer any clothing elements between characters" | "no costume swapping, no outfit bleeding" |
| Costume changes mid-story | Model invents a new outfit on later pages | "Costume locked from character sheet generated in Phase 1. Same outfit details on every page with no modifications" | "no costume changes, no outfit variation" |
| Props appearing/disappearing | Sword visible on page 3 but gone on page 5 | "Character always carries [prop name] -- must be visible in every scene they appear in" | "no disappearing props" |
| Fantasy creatures look cartoonish | Unicorn looks like a toy, dragon like a cartoon | "ALL creatures rendered as photorealistic animals with real anatomy: real bone structure, real muscle definition, real fur/scale/skin texture, real eyes with moisture and light reflections. Think nature documentary, not animation" | "no cartoon animals, no toy-like creatures, no plush animals, no stylized animals" |

### 5.6 Environmental and Lighting

| Edge Case | What Goes Wrong | Prompt Fix | Negative Clause |
|-----------|----------------|-----------|-----------------|
| Time-of-day inconsistency | Daylight scene with nighttime shadows | "Consistent [golden hour / bright midday / overcast / twilight] lighting across entire scene. All shadows, reflections, and color temperature must match the specified time of day" | "no mixed lighting, no conflicting light sources" |
| CGI-looking background | Photorealistic characters on an obviously fake background | "Background rendered as real-location photography: practical set, on-location feel, photographed environment with natural imperfections (uneven ground, weathered surfaces, natural debris)" | "no CGI background, no clean CG environment, no digital matte painting" |
| Different lighting on different skin tones | Light renders differently across characters' skin in the same scene | "Same light source illuminates all characters equally. Each character's skin responds naturally to the [warm/cool/neutral] light based on their actual skin tone from reference" | "no selective lighting, no uneven illumination" |
| Flat, even studio lighting | Scene looks like a product photo instead of a movie | "Motivated practical lighting from story-context sources (campfire, window, streetlight, sunset). Visible light falloff, natural shadow gradients, atmospheric light scatter" | "no flat lighting, no even studio lighting, no shadowless illumination" |

---

## 6. Proposed Architecture (V2 -- Multi-Character)

### Design Goals

1. Accept 1-4 face photos with metadata (name, age, relationship)
2. Preserve identity of ALL uploaded characters from their reference photos
3. Main character (first photo) appears in every page; others as story needs
4. Maintain all V1 rules (frontal face, expression lock, etc.)
5. Improve image quality using prompt research findings

### Pipeline Overview

```
User uploads 1-4 face photos + metadata JSON + story prompt
        |
        v
  [story_fastapi.py]  -- /generate-ebook-async (accepts multiple images)
        |                  Saves as char_1_face.jpeg, char_2_face.jpeg, ...
        v
  [strgen.py]          -- Story_content_generator_v2
        |                  All face photos sent to LLM
        |                  Metadata included in prompt
        |                  Outputs JSON: characters[], cover, 10 pages
        v
  [story_api.py]       -- generate_ebook_html_bundle_v2
        |                  Phase 1: character sheet images for ALL inputs (parallel)
        |                  Phase 2: cover + page images with multi-ref (parallel)
        v
  [imggen.py]          -- image_generator (LaoZhang or Gemini)
        |                  Sends labeled reference images per character
        v
  [lulu_digi_book_maker.py] -- PDF + HTML flipbook (unchanged)
        |
        v
  GCS upload -> signed URLs -> email delivery (unchanged)
```

### Character Metadata Schema

```json
{
  "characters": [
    {
      "name": "Rahul",
      "age": 35,
      "gender": "male",
      "relationship": "father",
      "role": "main"
    },
    {
      "name": "Priya",
      "age": 32,
      "gender": "female",
      "relationship": "mother",
      "role": "supporting"
    },
    {
      "name": "Aryan",
      "age": 8,
      "gender": "male",
      "relationship": "son",
      "role": "supporting"
    },
    {
      "name": "Ananya",
      "age": 5,
      "gender": "female",
      "relationship": "daughter",
      "role": "supporting"
    }
  ]
}
```

### V2 JSON Output Schema

```json
{
  "characters": [
    {
      "index": 1,
      "name": "Rahul",
      "character_type": "Adventure Hero Father",
      "description": "...",
      "role": "main",
      "input_images": ["input_images/char_1_face.jpeg"],
      "output_image": "generated/char_1_sheet.png",
      "prompt": "..."
    },
    {
      "index": 2,
      "name": "Priya",
      "character_type": "Brave Mother",
      "description": "...",
      "role": "supporting",
      "input_images": ["input_images/char_2_face.jpeg"],
      "output_image": "generated/char_2_sheet.png",
      "prompt": "..."
    }
  ],
  "book": {
    "title": "string",
    "characters_in_scene": [1, 2, 3, 4],
    "input_images": [
      "input_images/char_1_face.jpeg",
      "generated/char_1_sheet.png",
      "input_images/char_2_face.jpeg",
      "generated/char_2_sheet.png"
    ],
    "output_image": "generated/book_cover.png",
    "prompt": "..."
  },
  "pages": [
    {
      "page_number": 1,
      "story": "...",
      "characters_in_scene": [1, 2],
      "input_images": [
        "input_images/char_1_face.jpeg",
        "generated/char_1_sheet.png",
        "input_images/char_2_face.jpeg",
        "generated/char_2_sheet.png"
      ],
      "output_image": "generated/page_1.png",
      "prompt": "..."
    }
  ]
}
```

**Key changes from V1:**
- `characters` is now an array (not main_character + supporting_characters)
- Each character has an `index` (1-based) and `role` (main/supporting)
- Each character has its own `input_images` pointing to its own face photo
- `characters_in_scene` array specifies which characters appear on each page
- `input_images` for scenes includes face+sheet pairs for each character present

### Scene Composition Rules (V2)

| Characters in Scene | Composition |
|---------------------|-------------|
| 1 | Single character, full cinematic freedom |
| 2 | Side by side, equal prominence, slight angle offset |
| 3 | Triangle: 1 front-center, 2 flanking slightly behind |
| 4 | Shoulder-to-shoulder line or 2x2 grouping |

All characters face camera. Interaction through gestures, props, shared gaze direction
(looking at same object while facing camera), or physical proximity.

### Identity Lock Strategy (V2)

Each character's prompt section includes:

```
"Character 1 (Rahul) -- use the face from Image A (char_1_face.jpeg)
 and costume from Image B (char_1_sheet.png).
 Absolute preservation of facial geometry: bone structure, eye shape,
 nose shape, lip shape, jawline, skin tone, moles, scars.
 No beautification, no age shift, no identity blending.
 Rahul stands on the LEFT side of the frame."

"Character 2 (Priya) -- use the face from Image C (char_2_face.jpeg)
 and costume from Image D (char_2_sheet.png).
 Absolute preservation of facial geometry: [same rules].
 Priya stands on the RIGHT side of the frame."
```

### Page Assignment Rules (V2)

- Main character (index 1) appears in EVERY page
- Story LLM decides which other characters appear per page
- Cover includes ALL characters
- At least 3 pages must include all characters together
- No page should have more than 3 characters (for quality)

---

## 7. API Contract Changes

### Current Endpoint

```
POST /generate-ebook-async
  image: UploadFile (single file)
  story_prompt: str
  email: str (optional)
  output_type: str
  model_provider: str (optional)
  model: str (optional)
```

### Proposed V2 Endpoint

```
POST /generate-ebook-async
  images: List[UploadFile] (1-4 files)
  character_metadata: str (JSON string, optional)
  story_prompt: str
  email: str (optional)
  output_type: str
  model_provider: str (optional)
  model: str (optional)
```

**character_metadata format:**

```json
[
  {"name": "Rahul", "age": 35, "gender": "male", "relationship": "father"},
  {"name": "Priya", "age": 32, "gender": "female", "relationship": "mother"}
]
```

Order matches the uploaded images order. If metadata is not provided,
the LLM will analyze the photos and infer age/gender.

### Backward Compatibility

- Single image upload still works (treated as 1-character story)
- `character_metadata` is optional
- Existing notebook tests continue to work

---

## 8. Reference Image Flow

### V1 Flow (current)

```
Per image generation call:
  [0] original_face.jpeg     (identity source)
  [1] generated/main.png     (costume reference)
  [2] generated/support.png  (if supporting char in scene)
```

### V2 Flow (proposed -- INTERLEAVED PATTERN)

Based on official Gemini API docs (Section 3), we use **Pattern C: interleaved
text+image** to label each reference image with its role and character.

```
Per image generation call for a scene with characters 1 and 3:

  content_parts = [
    TEXT:  "Face reference for Rahul (Character 1) -- preserve this identity exactly:"
    IMAGE: input_images/char_1_face.jpeg
    TEXT:  "Costume reference for Rahul -- use this exact outfit:"
    IMAGE: generated/char_1_sheet.png
    TEXT:  "Face reference for Aryan (Character 3) -- preserve this identity exactly:"
    IMAGE: input_images/char_3_face.jpeg
    TEXT:  "Costume reference for Aryan -- use this exact outfit:"
    IMAGE: generated/char_3_sheet.png
    TEXT:  [full scene prompt with identity locks and narrative description]
  ]
```

This is superior to our V1 approach (all images at end) because:
- The model knows WHICH image is a face vs a costume
- The model knows WHICH character each image belongs to
- No ambiguity in multi-character scenes

### Image Label Strategy for LaoZhang API (v1beta REST)

LaoZhang supports interleaved `text` and `inlineData` parts in the same
`contents[0].parts` array:

```json
{
  "contents": [{
    "parts": [
      {"text": "Face reference for Rahul (Character 1):"},
      {"inlineData": {"mimeType": "image/jpeg", "data": "<<base64_face1>>"}},
      {"text": "Costume reference for Rahul:"},
      {"inlineData": {"mimeType": "image/jpeg", "data": "<<base64_costume1>>"}},
      {"text": "Face reference for Aryan (Character 3):"},
      {"inlineData": {"mimeType": "image/jpeg", "data": "<<base64_face3>>"}},
      {"text": "Costume reference for Aryan:"},
      {"inlineData": {"mimeType": "image/jpeg", "data": "<<base64_costume3>>"}},
      {"text": "[full scene prompt]"}
    ]
  }]
}
```

### Image Label Strategy for Gemini Direct API (Python SDK)

Gemini SDK natively supports interleaved content:

```python
contents = [
    "Face reference for Rahul (Character 1) -- preserve this identity exactly:",
    pil_image_char1_face,
    "Costume reference for Rahul -- use this exact outfit:",
    pil_image_char1_sheet,
    "Face reference for Aryan (Character 3) -- preserve this identity exactly:",
    pil_image_char3_face,
    "Costume reference for Aryan -- use this exact outfit:",
    pil_image_char3_sheet,
    prompt_text
]
```

### Why Interleaved is Better Than All-Images-At-End

| Approach | How model sees it | Identity accuracy |
|----------|------------------|-------------------|
| V1: `[prompt, face1, costume1, face2]` | "Some images after instructions" | Low -- model may confuse face1 with face2 |
| V2: `[label, face1, label, costume1, label, face2, ...]` | "Labeled references for each character" | High -- each image has explicit role |

---

## 9. Prompt Strategy (V2)

### Upgraded Reusable Blocks

#### IDENTITY_LOCK_PHRASE_V2 (per character)

```
"Absolute preservation of Character N's facial geometry from their reference
photo. Maintain exact: bone structure, facial proportions, eye shape and color,
nose bridge and tip shape, lip fullness and shape, jawline contour, skin tone
and undertone, all moles and marks, hairline shape. No beautification, no age
shift, no identity blending between characters, no smoothing of natural skin
imperfections. The generated face must be immediately recognizable as the
same person in the reference photo."
```

#### BIO_FIDELITY_PHRASE (new)

```
"Render skin with dermatological accuracy: visible micro-pores on nose and
cheeks in sharp-focus areas, fine vellus hair along jawline and temples,
natural skin imperfections preserved (moles, subtle discoloration, texture
variation). Skin reacts to environment: slight flush from cold/exertion,
natural oil sheen on forehead T-zone in warm scenes, goosebumps in cold.
No AI-smooth porcelain skin, no beauty filter effect."
```

#### CAMERA_SIMULATION_PHRASE (new)

```
"Captured as if shot on [iPhone 16 Pro / full-frame DSLR], [focal length]mm
lens at f/[aperture]. [Shallow/deep] depth of field with natural focus
fall-off. Subtle sensor grain consistent with [device]. Realistic lens
characteristics: natural edge softness, authentic color rendition,
[warm/neutral/cool] white balance."
```

#### NEGATIVE_PROMPT_PHRASE (new)

```
"Absolute negatives: AI glow, plastic skin, beauty-filter smoothing,
poreless skin, over-saturated colors, CGI background, cartoon style,
3D render, illustration, anime, digital art, video game graphics,
toy-like figures, doll-like features, distorted hands, extra fingers,
missing fingers, deformed anatomy, logos, text overlays, watermarks,
flat lighting, stock photography look."
```

#### TEXTILE_ARCHITECTURE_PHRASE (new)

```
"Fabric rendered with physical accuracy: visible weave pattern and thread
texture, realistic compression folds at joints and contact points,
natural draping behavior reflecting fabric weight (heavy wool vs light
silk vs stiff leather), fabric-to-skin tension where clothing is fitted,
wrinkle patterns consistent with body pose and movement."
```

### Cinematic Photorealism Style Guide

The goal is to achieve "Avatar-level" realism: images that look like frames
from a high-budget film shot on-location with real actors, real light, and
real cameras -- NOT like CGI renders, video game cutscenes, or digital art.

#### Why It Matters

The difference between "photorealistic" and "truly cinematic" is the
difference between a clean 3D render and an actual movie still. CG images
are too perfect: uniform skin, perfectly even lighting, no atmospheric
imperfections, mathematically smooth surfaces. Real cinematography has
beautiful imperfections that the human eye instantly recognizes.

#### A. Subsurface Scattering (SSS) for Skin

Real skin is translucent. Light penetrates the surface, bounces around
inside, and exits at a different point -- this is subsurface scattering.
It's what makes ears glow red when backlit and gives skin its warmth.

**Prompt language to inject:**
```
"Skin rendered with visible subsurface light scatter: warm translucency
in thinner areas (ears, nose bridge, fingertips), subtle blood-flow
redness at cheekbones and nose tip. Light passes THROUGH skin, not just
bouncing off the surface. Visible vascular detail under thin skin areas
(inner wrists, temples). Skin has depth -- it is not a painted surface."
```

#### B. Film Camera Simulation

Real films are shot on specific cameras that produce specific looks.
Referencing actual cameras anchors the model to real-world optical physics.

**Camera references by mood:**

| Scene Mood | Camera Reference | Look |
|-----------|-----------------|------|
| Intimate / warm | "Shot on ARRI Alexa Mini LF with Cooke S7/i 50mm anamorphic, T2.0" | Creamy bokeh, gentle barrel distortion, warm skin tones |
| Epic / grand | "Shot on RED V-RAPTOR 8K with Panavision Ultra Vista 40mm, T2.8" | Sharp foreground, massive depth compression, filmic grain |
| Natural / documentary | "Shot on Sony VENICE 2 with Zeiss Supreme Prime 35mm, T1.5" | Natural color, clean bokeh, subtle lens character |
| Moody / thriller | "Shot on ARRI ALEXA 65 with Hasselblad HC 80mm, f/2.8" | Medium-format feel, ultra-shallow DOF, dark atmosphere |

**Prompt language to inject:**
```
"Captured on [camera + lens combo from table above]. Subtle film grain
consistent with [ISO 800/1600/3200] sensitivity. Natural optical effects:
slight chromatic aberration at frame edges, gentle vignetting, authentic
lens flare behavior from practical light sources. The image has the
weight and texture of physical film, not the clinical perfection of
digital rendering."
```

#### C. Material Physics

Every surface in a real photograph obeys physics. Fabric has weight,
metal reflects light at specific angles (Fresnel effect), wood has
grain direction, leather develops patina with use.

**Prompt language to inject:**
```
"All materials rendered with physical accuracy:
- Fabric: visible weave pattern, realistic weight behavior (heavy wool
  sags differently than light cotton), natural compression creases at
  joints, thread count visible in close focus
- Metal: Fresnel reflectance (more reflective at glancing angles),
  micro-scratches and wear on touched surfaces, accurate specular
  highlights matching the light source shape
- Leather: visible pore texture, natural patina and aging at wear
  points (elbows, edges, folds), subtle color variation from use
- Wood: directional grain, natural finish (not uniformly glossy),
  tool marks and weathering appropriate to age
- Glass/water: realistic refraction, caustic light patterns,
  surface tension meniscus at contact points"
```

#### D. Atmospheric Realism

Real environments are never perfectly clear. Air contains particles,
moisture, and temperature variations that affect how light travels.

**Prompt language to inject:**
```
"Atmosphere rendered as a physical medium: visible volumetric light
where beams pass through dust or moisture (god rays through trees,
light shafts through windows), subtle atmospheric haze that naturally
desaturates and lightens distant objects (aerial perspective), humidity
effects on surfaces (slight moisture sheen on cold objects, steam
from warm surfaces in cold air), visible breath in cold scenes.
The air has SUBSTANCE -- it is not empty space."
```

#### E. Contact Shadows and Light Wrap

The most telltale sign of CGI is perfect, uniform lighting. Real
light wraps around edges, creates soft-edged contact shadows, and
interacts with the environment in complex ways.

**Prompt language to inject:**
```
"Physically accurate light interaction: soft contact shadows where
objects meet surfaces (feet on ground, hands on table, characters
standing on floor), light wrap around character edges creating a
subtle halo against brighter backgrounds, realistic shadow color
(not pure black -- shadows pick up bounce light and reflected color
from nearby surfaces). Primary light source creates dominant shadow,
secondary fill light softens but never eliminates shadow detail.
Light fall-off follows inverse-square law -- intensity drops with
distance from source."
```

#### F. Color Science (Analog Film Emulation)

Digital perfection looks fake. The "Avatar look" comes from applying
analog film color science to digital footage.

**Prompt language to inject:**
```
"Color graded in the style of analog film emulsion: slightly lifted
blacks (never pure black), organic color roll-off in highlights
(highlight detail preserved, not clipped white), subtle color
cross-contamination between channels (skin highlights have faint
warm bleed, shadows have subtle cool/teal undertone). Color palette
has restraint -- no hyper-saturated primaries, no HDR glow, no
neon edge lighting. The tonal range feels physical and organic,
like Kodak Vision3 500T or ARRI LogC-to-Rec709 conversion."
```

#### G. Anti-CGI Negative Prompts

These negative prompts specifically target the "CGI look" artifacts:

```
"Absolutely avoid: plastic-looking skin, uniform skin texture,
poreless skin, beauty-filter smoothing, uniform lighting with no
shadow variation, mathematically perfect symmetry in anything
(face, clothing, environment), unnaturally clean surfaces, hyper-
saturated colors, HDR glow, neon rim lights, clean CG backgrounds,
video game aesthetic, Unreal Engine look, 3D render look, digital
matte painting backgrounds, stock photography evenness, flatly lit
product photography style, anime/cartoon/illustration influence.
The image must look like it was captured by a camera in a real
place with real light -- never like it was generated by a computer."
```

#### Compositing the Style Guide

For every scene prompt in V2, inject the style guide as a cohesive block
at the end, AFTER the scene description and character positioning but
BEFORE the negative prompts:

```
[Scene description + character positioning]
[Identity lock phrases]

Cinematic realism mandate: {SSS phrase}. {Camera reference from table}.
{Material physics for materials present in THIS scene}.
{Atmospheric phrase tuned to THIS scene's environment}.
{Contact shadows phrase}. {Color science phrase}.

Absolute negatives: {Combined negative prompts from Edge Cases +
Anti-CGI negatives above}
```

This creates a layered prompt architecture where:
1. **Content layer** = what is happening (story narrative)
2. **Identity layer** = who is in the scene (character locks)
3. **Realism layer** = how it should look (this style guide)
4. **Negative layer** = what to avoid (combined negatives)

---

### V2 Page Scene Prompt Template

```
"Create a cinematic scene featuring the characters from the reference images.

--- LAYER 1: IDENTITY ---

Character 1 ({name1}, {relationship1}) uses the face from Image A and
costume from Image B. {IDENTITY_LOCK for char 1}.
{ANTI_DRIFT_PHRASE for char 1: skin tone, age, features from reference}.

Character 2 ({name2}, {relationship2}) uses the face from Image C and
costume from Image D. {IDENTITY_LOCK for char 2}.
{ANTI_DRIFT_PHRASE for char 2: skin tone, age, features from reference}.

Scale lock: {char1} is {height1}. {char2} reaches {char1}'s {body part}.
These proportions must remain unchanged in every scene.

--- LAYER 2: CONTENT ---

{SCENE_NARRATIVE -- 3-4 sentences describing what is happening, written
as a frozen moment from a Hollywood film. Describe the emotional beat,
the physical action, and the environment as interconnected elements.}

{name1} is positioned on the {left/center/right} of the frame,
{dynamic pose description}. {name2} stands {spatial relationship},
{their action}. Both characters face directly at camera with both eyes
fully visible. Clear spatial separation between characters. Expressions
are subtle -- emotion conveyed through focused eyes and set jaw, mouths
closed. Interaction through body language, not face turning.

--- LAYER 3: CINEMATIC REALISM ---

Skin rendered with visible subsurface light scatter: warm translucency
in thinner areas (ears, nose bridge, fingertips), subtle blood-flow
redness at cheekbones and nose tip. Skin has depth, not a painted surface.

{CAMERA_REFERENCE from Cinematic Style Guide table, chosen per scene mood}.
Subtle film grain consistent with {ISO}. Natural optical effects: slight
chromatic aberration at edges, gentle vignetting, authentic lens flare
from practical sources.

{MATERIAL_PHYSICS -- select only materials present in THIS scene from
the Style Guide material list}.

Atmosphere rendered as physical medium: {ATMOSPHERIC_PHRASE tuned to
THIS scene -- volumetric light, haze, humidity, breath if cold}.

Physically accurate light interaction: soft contact shadows where
characters meet ground, light wrap around character edges, realistic
shadow color from bounce light. {Lighting source} illuminates from
{direction}, casting {shadow description}. Rim light separates
characters from background along hair and shoulder edges.

Color graded as analog film emulsion: slightly lifted blacks, organic
highlight roll-off, subtle cross-channel color bleed. Warm-toned
like Kodak Vision3 500T.

{BIO_FIDELITY_PHRASE}
{TEXTILE_ARCHITECTURE_PHRASE}
{ENVIRONMENTAL_MICRO_DETAILS -- specific to this scene}

--- LAYER 4: NEGATIVES ---

Absolute negatives: AI glow, plastic skin, beauty-filter smoothing,
poreless skin, over-saturated colors, CGI background, cartoon style,
3D render, illustration, anime, digital art, video game graphics,
toy-like figures, distorted hands, extra fingers, missing fingers,
deformed anatomy, logos, text overlays, watermarks, flat lighting,
stock photography look, Unreal Engine look, clean CG environment,
neon rim lights, HDR glow, uniform skin texture, no face swapping,
no costume bleeding, no scale inconsistency, no profile views,
no characters facing each other, no skin lightening, no de-aging,
no beautification, no hair texture change."
```

---

## 10. Implementation Plan

### Files to Modify

| File | Change | Scope | Priority |
|------|--------|-------|----------|
| `story_fastapi.py` | Accept 1-4 images + metadata JSON | Medium | P0 |
| `strgen.py` | Multi-character prompts, templates, schema | Large | P0 |
| `story_api.py` | Multi-character phase orchestration | Medium | P0 |
| `imggen.py` | Label multiple reference images properly | Small | P1 |
| `api_notebook.ipynb` | Update test cells for multi-char | Small | P2 |

### Implementation Order

1. **strgen.py** -- New system prompt, multi-character JSON schema, upgraded
   prompt templates with bio-fidelity/camera/negative blocks
2. **story_fastapi.py** -- Multi-image upload endpoint, metadata parsing,
   save multiple face photos to job directory
3. **story_api.py** -- Multi-character phase orchestration, reference image
   assembly per scene based on `characters_in_scene`
4. **imggen.py** -- Proper image labeling for multi-character reference sets
5. **api_notebook.ipynb** -- Test cells for 1-char, 2-char, 4-char scenarios

### Risk Areas

| Risk | Mitigation |
|------|-----------|
| Model can't preserve 4 faces simultaneously | Limit scenes to max 3 characters; spread appearances across pages |
| Prompt too long with 4 identity locks | Use concise identity blocks; test token limits |
| Reference image count exceeds API limits | Compress images more aggressively; test with LaoZhang payload limits |
| Backward compatibility breaks | Keep single-image path working; auto-detect 1-char vs multi-char |
| Image generation cost increases | More reference images = larger payloads = higher cost per call |

### Testing Strategy

| Test Case | Characters | Expected |
|-----------|-----------|----------|
| Single character (backward compat) | 1 face | Same as V1 |
| Couple story | 2 faces (M+F) | Both recognizable in scenes |
| Family story | 4 faces | Main in all pages, others rotating |
| No metadata provided | 2 faces, no JSON | AI infers from photos |
| Max characters per scene | 3 in one scene | All 3 recognizable |
