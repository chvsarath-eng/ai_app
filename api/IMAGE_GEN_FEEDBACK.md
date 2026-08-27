# Image Generation Feedback Tracker

> Collect all feedback here before making any code changes.
> Development begins only after all feedback is gathered.

---

## 1. Character Sheets

**Status: PASS**

- Babu (father, Character 1): Matches reference face photo perfectly.
- Jeevan (son, Character 2): Matches reference face photo perfectly.

No issues. Character sheet generation is working as expected.

---

## 2. Cover Page

**Status: FAIL -- Face likeness lost** → **FIXED**

**What went wrong:** Both characters on the cover do not look like their reference photos. The faces are different people.

**Root cause:** The cover prompt template in `storygen_v2.py` (lines 286-304) was missing the **LAYER 1: IDENTITY** block that page prompts use. The cover prompt only said:

```
Create an epic cinematic book cover featuring ALL characters from the reference images.
Each character's facial features... must remain unchanged from their references.
```

It did NOT map which image corresponds to which character. By contrast, every page prompt explicitly states:

```
Character 1 (Babu, father) uses the face from Image 1 and costume from Image 2.
Character 2 (Jeevan, son) uses the face from Image 3 and costume from Image 4.
```

**Additional factors:**
- Title text rendering and decorative border compete for model attention, reducing face fidelity.
- The cover prompt skipped LAYER 1 (identity) and LAYER 2 (composition), jumping directly to LAYER 3.

**Fix applied:** Rewrote the cover prompt template to include the full 4-layer structure:
- LAYER 1: IDENTITY with per-character image mapping
- LAYER 2: CONTENT with character positioning
- LAYER 3: CINEMATIC REALISM
- LAYER 4: NEGATIVES

---

## 3. Story Pages

| Page | Status | Notes |
|------|--------|-------|
| 1    | FAIL   | Babu looks darker, kid lost facial features |
| 2    | PASS   | Both characters look like references |
| 3    | PASS   | Both characters look like references |
| 4    | FAIL   | **Totally wrong -- different people showed up** |
| 5    | PASS   | Fantastic job |
| 6    | FAIL   | Lost facial features |
| 7    | FAIL   | **Totally wrong -- different people showed up (both look like adult males)** |
| 8    | PASS   | Fantastic job |
| 9    | PASS   | Fantastic job |
| 10   | FAIL   | Lost facial features |

---

## 4. Root Cause Analysis: Why Some Pages Fail

All 10 pages use the **same LAYER 1: IDENTITY block** with per-character mapping. The identity instructions are identical. So the failure is NOT in the identity text itself -- it is in what LAYER 2 (content) and LAYER 3 (camera/environment) ask the model to do.

### Pattern: PASS pages vs FAIL pages

**PASS pages and their shot types:**

| Page | Shot Type | Camera | Key Trait |
|------|-----------|--------|-----------|
| 2    | MCU (medium close-up), eye-level | ARRI Alexa Mini LF, Cooke 50mm anamorphic | Close framing, faces large in frame |
| 3    | Full-body, eye-level | RED V-RAPTOR 8K, Panavision 40mm | Simple standing pose, clear separation |
| 5    | Close-up, eye-level | ARRI ALEXA 65, Hasselblad 80mm | Very close, maximum face detail |
| 8    | MCU, slightly high angle | ARRI ALEXA 65, Hasselblad 80mm | Close framing, faces large |
| 9    | Wide heroic, slightly high angle | RED V-RAPTOR 8K, Panavision 40mm | Clear forward-facing action, strong silhouettes |

**FAIL pages and their shot types:**

| Page | Shot Type | Camera | Key Trait |
|------|-----------|--------|-----------|
| 1    | Wide establishing, slightly high angle | Sony VENICE 2, Zeiss 35mm | Faces small in frame, wide context |
| 4    | Medium, high angle | ARRI ALEXA 65, Hasselblad 80mm | Babu KNEELING (complex mixed pose), high angle reduces face |
| 6    | Medium, eye-level | ARRI Alexa Mini LF, Cooke 50mm anamorphic | Dense waterfall mist, overwhelming background |
| 7    | Wide, eye-level | Sony VENICE 2, Zeiss 35mm | Shared object (fishing rod between both), wide shot |
| 10   | Medium, eye-level | ARRI Alexa Mini LF, Cooke 50mm anamorphic | Night campfire, dramatically different lighting |

### Identified Failure Causes

**Cause 1: Wide shots shrink faces (Pages 1, 7)**
When the shot is "wide establishing" or "wide, eye-level", faces occupy fewer pixels in the output image. The model allocates less detail to faces and more to the environment, causing identity drift.

**Cause 2: Complex/mixed poses reduce face attention (Pages 4, 7)**
When one character kneels and the other stands (page 4), or both share an object like a fishing rod (page 7), the model spends its capacity on body positioning and object interaction instead of face fidelity. Page 7 is the worst -- Jeevan (a 12-year-old) appears as an adult male because the model lost the character entirely.

**Cause 3: Overwhelming environments dominate (Pages 6, 10)**
Dense visual environments -- roaring waterfall with mist swirling (page 6), campfire at night with firelight (page 10) -- pull the model's attention toward rendering the spectacular background, leaving less for face accuracy.

**Cause 4: Dramatic lighting changes break skin tone (Pages 1, 10)**
Page 1 has "cool morning air with faint mist" making Babu look darker. Page 10 has campfire as key light with "cool moonlight fill" -- dramatically different from other pages, causing skin tone shifts.

**Cause 5: Complete identity replacement (Pages 4, 7) -- CRITICAL**
The most severe failure mode: the model ignores reference images entirely and generates completely different people. This is NOT just "drift" -- it's a total failure to use the reference at all. Root cause: no explicit prohibition against hallucinating new faces in the original prompts.

### Why This Happened in the Prompt Template (`storygen_v2.py`)

The original PAGE-BY-PAGE DEFAULT SHOT ARC prescribed failing shot types:

```
- Page 1: wide establishing, slightly high angle    <-- FAIL
- Page 4: medium, high angle                        <-- FAIL
- Page 7: wide, eye-level                           <-- FAIL
- Page 10: medium or wide, eye-level                <-- FAIL
```

The template also had a UNIQUENESS CHECK forcing "no two pages may share the same shot size + camera angle" which pushed the AI toward wide/complex shots that hurt face fidelity.

Additionally, the original template did NOT:
- Warn that wide shots and complex environments degrade face likeness
- Have guidance to compensate (e.g., "for wide shots, add extra face-priority instructions")
- Explicitly prohibit the model from inventing/hallucinating new faces
- Require identity verification that faces match references

---

## 5. General Observations

1. **Close-up and MCU shots consistently preserve identity.** The model has enough pixel budget and attention for faces.
2. **Wide shots and complex poses are the biggest risk factors.** The model loses characters when faces are small or body positions are unusual.
3. **Age drift on children is catastrophic.** Page 7 turned a 12-year-old into an adult male -- the worst type of failure.
4. **Costume is generally preserved well** even in failing pages. The blue hoodie and olive jacket are consistent. The issue is purely facial.
5. **The 4-layer prompt structure works** -- pages 2, 3, 5, 8, 9 prove it. The problem is the content/camera choices that conflict with the identity layer.
6. **Complete identity replacement is a distinct failure mode.** Pages 4 and 7 didn't just "drift" -- they showed completely different people, indicating the model ignored references entirely.

---

## 6. Fixes Applied to `storygen_v2.py`

All fixes have been implemented. Here's what changed:

### Change 1: Cover Prompt Template (Full 4-Layer Structure)
**Location:** Lines ~296-318
**Problem:** Missing LAYER 1: IDENTITY in cover prompt
**Fix:** Rewrote cover prompt to include all 4 layers with per-character identity mapping

### Change 2: Shot Arc (Eliminate Wide Shots)
**Location:** Lines ~335-350
**Problem:** Wide shots on pages 1, 7, 10 caused faces to be too small
**Fix:** Replaced all "wide" shot types with "medium" or "MCU". New arc:
- Page 1: medium establishing, eye-level
- Page 7: medium, eye-level
- Page 10: MCU, eye-level

### Change 3: UNIQUENESS CHECK (Relaxed)
**Location:** Lines ~346-350
**Problem:** Forcing unique shot+angle combos pushed AI toward wide shots
**Fix:** Relaxed to allow variety through camera angles and lighting instead of framing distance. Explicit ban on "wide" and "extreme wide" framing.

### Change 4: FACE-PRIORITY SCALING (New Instruction)
**Location:** After LAYER 2 in 4-LAYER PROMPT TEMPLATE
**Problem:** No scaling of face-fidelity language based on scene complexity
**Fix:** Added new instruction block with rules for close-up (standard), medium (add focus phrase), wider than medium (add FACE PRIORITY phrase), and complex environments (add environmental protection phrase).

### Change 5: HEIGHT/BODY Guard (Expanded Child Identity)
**Location:** EDGE CASE GUARDS section
**Problem:** Page 7 aged Jeevan from 12 to adult
**Fix:** Expanded with:
- Age-specific head-to-body ratios (1:5 for 8-12, 1:4 for under 8)
- Require child age + proportions in LAYER 2, not just LAYER 1
- Prohibit adult physical descriptors for children
- Describe props relative to small hands

### Change 6: POSE SAFETY Guard (New)
**Location:** EDGE CASE GUARDS section
**Problem:** Mixed poses (one kneeling + one standing) broke identity
**Fix:** New guard requiring:
- Similar body positions for both characters
- No shared objects between characters
- Simple poses only (standing, walking, seated)
- Priority order: face accuracy > pose creativity > scene action

### Change 7: ENVIRONMENT DENSITY Guard (New)
**Location:** EDGE CASE GUARDS section
**Problem:** Dense environments (waterfall mist, campfire) overwhelmed faces
**Fix:** New guard requiring:
- Characters as primary visual subject
- Dense particle effects behind/around, not on characters
- Dramatic elements in background with clear foreground separation

### Change 8: LIGHTING AND SKIN TONE LOCK Guard (New)
**Location:** EDGE CASE GUARDS section
**Problem:** Dramatic lighting altered skin tones
**Fix:** New guard requiring:
- Skin tone identical to reference regardless of lighting
- Avoid extreme lighting (pure firelight, deep blue night)
- Neutral fill light in moody scenes
- Explicit skin tone matching phrase in every prompt

### Change 9: IDENTITY DRIFT Guard (Expanded to ZERO TOLERANCE)
**Location:** EDGE CASE GUARDS section
**Problem:** Pages 4 and 7 showed completely different people -- not drift, but total replacement
**Fix:** Expanded with:
- Explicit prohibition: NEVER generate, hallucinate, or invent a new face
- Reference photos as ONLY source of truth
- No artistic reinterpretation of faces
- Required phrase: "IDENTITY VERIFICATION: Each character's face must be a photorealistic reproduction of their reference photo. Zero tolerance for face substitution or identity invention."

### Change 10: MULTI-CHAR COMPOSITION Guard (Expanded)
**Location:** EDGE CASE GUARDS section
**Problem:** Model swapped faces or used wrong faces for characters
**Fix:** Expanded with:
- Never swap positions or faces between characters
- Each character's face from their specific reference image ONLY
- Both characters must be recognizable; one correct + one wrong = FAILED

### Change 11: ANTI_DRIFT_PHRASE Constant (Strengthened)
**Location:** Top of file, constant definition
**Problem:** Original phrase assumed correct person with drift; didn't cover hallucination
**Fix:** Added: "NEVER invent, hallucinate, or substitute a different face. The reference photo is the ONLY source of truth for this character's face."

---

## 7. API Configuration Applied to `imggen.py`

### personGeneration Parameter
**Problem:** `IMAGE_SAFETY` errors when generating images with children
**Root cause:** The `personGeneration` parameter was set to `"ALLOW_ADULT"` which explicitly blocks child images
**Fix:** Changed to `"ALLOW_ALL"` in both LaoZhang API path and direct Gemini SDK path

---

## 8. Research-Backed Prompt Restructuring (Jan 2026)

After applying v2 fixes (sections 6-7), identity issues **persisted** on some pages. A deep investigation revealed fundamental architectural problems with our prompting strategy, confirmed by academic research and Google's own documentation.

### 8.1 Research Findings

**Cross-Attention Dilution (confirmed by academic research):**
- Paper "Progressive Prompt Detailing" (2024) confirms text encoders compress varied-length descriptions into fixed representations, causing **information loss**.
- ADOR research (2024-2025) proves: *"with more tokens, average cross-attention intensity decreases, leading to semantic neglect"* -- formally called **cross-attention dilution**.
- Our page prompts were ~2,800 words. The model's identity instructions in Layer 1 were being forgotten by Layer 3-4.

**Google's Official Guidance (Aug 2025 blog):**
> "Describe the scene, don't just list keywords. A narrative, descriptive paragraph will almost always produce a better, more coherent image than a simple list of disconnected words."

**Google's Consistent Imagery Notebook** (`GoogleCloudPlatform/generative-ai` repo) uses prompts that are:
- **50-150 words each** (not 2,800)
- Structured as **short bullet-point composition instructions**, not layered keyword blocks
- Image references labeled simply: `"Image 1: Robot character sheet."` -- not paragraphs

**Google explicitly confirms attention dilution** in their notebook:
> "we're accumulating many different transformations at once (and **diluting the model's attention**). For full control and more deterministic results, we can focus on significant changes over iterative steps"

### 8.2 The Two-Stage Problem

Our architecture had attention dilution at **two stages**:

```
storygen_v2.py system prompt (~4,000 words)
  → LLM suffers attention dilution, ignores rules like "no establishing shots"
  → LLM outputs ~2,800 word page prompts
    → Image model suffers attention dilution, ignores identity instructions
    → Wrong faces generated
```

Both stages compounded the problem.

### 8.3 Specific Issues Found

1. **"Medium establishing" shot type** still implied wide context (Page 1 used it despite our ban on "wide").
2. **4 images per scene** (face + costume per character) caused image-index confusion. Google's notebook warns: *"Without them [labels], 'the robot' could refer to any of the 3 robots"*.
3. **Verbose technical phrases** (SSS_PHRASE, BIO_FIDELITY_PHRASE, CAMERA_TABLE specs, COLOR_SCIENCE_PHRASE) consumed tokens without improving identity.
4. **Redundant edge case guards** (~800 words) repeated concepts already in the prompt template.
5. **Few-shot example** (~60 lines) the LLM partially followed, partially ignored.

### 8.4 V3 Changes Applied (Jan 2026)

| Change | Before | After | Impact |
|--------|--------|-------|--------|
| Prompt template | 4-layer verbose (~2,800 words output) | Google bullet-point format (~300-400 words) | 85% token reduction |
| System prompt | ~4,000 words | ~2,000 words | 50% token reduction |
| Images per scene | 4 (face + costume per char) | 2 (costume sheet only) | 50% fewer images |
| Shot arc Page 1 | "medium establishing, eye-level" | "medium, eye-level" | No "establishing" language |
| Identity phrases | IDENTITY_LOCK_PHRASE_V2 + ANTI_DRIFT_PHRASE (~200 words) | IDENTITY_PHRASE (~50 words) | Concise, stronger signal |
| Technical phrases | SSS, BIO_FIDELITY, TEXTILE, COLOR_SCIENCE, CAMERA_TABLE | Removed | Zero wasted tokens |
| Edge case guards | ~800 words (separate section) | Folded into prompt template rules | Less duplication |
| Few-shot example | 60-line verbose example | Removed | Less confusion for LLM |
| Face lock | None | `STRICT_FACE_LOCK` phrase (Google-recommended) | New identity anchor |
| Image references | "Image 1-4" (confusing pairs) | "Image 1", "Image 2" (one per character) | Clear mapping |

### 8.5 Before vs After Prompt Comparison

**BEFORE (v2 -- ~2,800 words per page prompt):**
```
--- LAYER 1: IDENTITY ---
Character 1 (Babu, father) uses the face from Image 1 and costume from Image 2.
Absolute preservation of this character's facial geometry from their reference
photo. Maintain exact: bone structure, facial proportions, eye shape and color,
nose bridge and tip shape, lip fullness and shape, jawline contour, skin tone
and undertone, all moles and marks, hairline shape. No beautification, no age
shift, no identity blending...
[...300+ more words of identity per character...]

--- LAYER 2: CONTENT ---
[...300+ words of scene description...]

--- LAYER 3: CINEMATIC REALISM ---
Skin rendered with visible subsurface light scatter: warm translucency...
Shot on ARRI Alexa Mini LF with Cooke S7/i 50mm anamorphic, T2.0...
Color graded as analog film emulsion: slightly lifted blacks...
Render skin with dermatological accuracy: visible micro-pores...
[...400+ words of technical rendering instructions...]

--- LAYER 4: NEGATIVES ---
Absolute negatives: AI glow, plastic skin, beauty-filter smoothing...
[...250+ words of negatives...]
```

**AFTER (v3 -- ~300 words per page prompt):**
```
- Image 1: Babu's character reference (face + costume). Preserve this
  EXACT face -- same bone structure, skin tone, every mole and mark.
- Image 2: Jeevan's character reference (face + costume). Preserve this
  EXACT face -- same bone structure, skin tone, every mole and mark.
- Scale: Babu is 5'10". Jeevan reaches Babu's waist.
- Scene: In a sunlit forest clearing, Babu kneels beside Jeevan as they
  discover a glowing crystal hidden under a mossy rock. Morning light
  filters through the canopy above them.
- Babu is on the left, kneeling with one hand on the crystal. Jeevan is
  on the right, leaning forward with wide eyes. Both face camera with
  both eyes visible.
- Faces are the sharpest, most detailed area. Skin tone matches reference
  exactly regardless of lighting.
- Shot: medium, eye-level, warm morning light. Subtle film grain.
- Style: Ultra-realistic photography. Natural skin with pores and texture.
- No AI glow, no plastic skin, no cartoon, no 3D render, no illustration,
  no anime, no extra fingers, no face swapping, no skin lightening, no
  de-aging, no profile views.
```

---

## 9. Testing Checklist

After v3 changes, regenerate the storybook and verify:

| Page | Expected Result |
|------|-----------------|
| Cover | Both Babu and Jeevan match their reference photos |
| Page 1 | Babu's skin tone matches reference (medium shot, no "establishing") |
| Page 4 | Both characters are Babu and Jeevan (not different people) |
| Page 6 | Faces clear despite environment |
| Page 7 | Jeevan is still a child, both characters correct |
| Page 10 | Skin tones match references despite scene lighting |
| ALL | Prompts are 200-400 words max (check JSON output) |
| ALL | Only 2 input images per scene (costume sheets only) |

---

## 10. Summary of All Changes (Cumulative)

### Phase 1: API Configuration (v1)

| File | Change | Description |
|------|--------|-------------|
| `imggen.py` | `personGeneration` | `"ALLOW_ADULT"` → `"ALLOW_ALL"` for child images |

### Phase 2: Prompt Guards (v2)

| File | Change | Description |
|------|--------|-------------|
| `storygen_v2.py` | Cover prompt | Added full 4-layer structure with LAYER 1: IDENTITY |
| `storygen_v2.py` | Shot arc | Eliminated all "wide" shots |
| `storygen_v2.py` | Edge case guards | Added POSE SAFETY, ENVIRONMENT DENSITY, LIGHTING LOCK |
| `storygen_v2.py` | Identity drift | Zero tolerance, anti-hallucination language |
| `storygen_v2.py` | ANTI_DRIFT_PHRASE | Strengthened with anti-hallucination |

### Phase 3: Research-Backed Restructuring (v3)

| File | Change | Description |
|------|--------|-------------|
| `storygen_v2.py` | Prompt template | Replaced 4-layer verbose with Google bullet-point format |
| `storygen_v2.py` | System prompt | Trimmed from ~4,000 to ~2,000 words |
| `storygen_v2.py` | Phrase constants | Removed SSS, BIO_FIDELITY, TEXTILE, COLOR_SCIENCE, CAMERA_TABLE |
| `storygen_v2.py` | Shot arc | Changed "medium establishing" to "medium" |
| `storygen_v2.py` | STRICT_FACE_LOCK | Added Google-recommended face consistency phrase |
| `story_api.py` | Image inputs | Reduced from 4 (face+costume) to 2 (costume sheets only) |
| `story_api.py` | Image labels | Changed to "Image N: Name's character reference" format |

---

## 11. References

- [ADOR: Cross-Attention Dilution Research](https://arxiv.org/abs/2404.01757) (2024)
- [SCoPE: Prompt Efficiency for Diffusion Models](https://arxiv.org/abs/2502.14844) (2025)
- [Google Blog: Gemini Image Generation Best Practices](https://blog.google/technology/ai/gemini-imagen-image-generation/) (Aug 2025)
- [Google Consistent Imagery Notebook](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/use-cases/image_generation/consistent_character_image_generation.ipynb)
- [Google Support: Strict Facial Consistency Mode](https://support.google.com/gemini/)
