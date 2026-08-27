from __future__ import annotations
import base64, io, json, mimetypes, os, re
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from PIL import Image, ImageOps

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_google_genai.chat_models import ChatGoogleGenerativeAIError
from langchain_openai import ChatOpenAI

DEFAULT_OPENAI_MODEL = "gpt-5.5-2026-04-23"

# #region agent log
def _log_langchain_callbacks():
    try:
        from langchain_core.callbacks.manager import _get_configure_hooks
        from langchain_core.tracers.context import get_callback_manager_for_config
        import langchain_core.globals as _g
        _hooks = list(_get_configure_hooks()) if hasattr(_get_configure_hooks, '__iter__') else str(_get_configure_hooks)
        open(r'f:\Users\sarat\Documents\ai_api\.cursor\debug.log','a').write(json.dumps({"location":"strgen.py:import","message":"MODULE_IMPORT_CALLBACKS","data":{"hooks_count":len(_hooks) if isinstance(_hooks,list) else _hooks},"hypothesisId":"E","timestamp":__import__('time').time()})+'\n')
    except Exception as e:
        open(r'f:\Users\sarat\Documents\ai_api\.cursor\debug.log','a').write(json.dumps({"location":"strgen.py:import","message":"MODULE_IMPORT_CALLBACKS_ERROR","data":{"error":str(e)},"hypothesisId":"E","timestamp":__import__('time').time()})+'\n')
_log_langchain_callbacks()
# #endregion

# ---------- Utilities ----------


def _content_to_string(content) -> str:
    """
    Coerce LangChain message.content to a string.
    
    Gemini can return content as:
      - str (normal case)
      - list of dicts like [{"type": "text", "text": "..."}]
      - dict like {"type": "text", "text": "..."}
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        if isinstance(content.get("text"), str):
            return content["text"]
        for key in ("content", "message", "data"):
            if isinstance(content.get(key), str):
                return content[key]
        return json.dumps(content, ensure_ascii=False)
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if isinstance(item.get("text"), str):
                    parts.append(item["text"])
                elif isinstance(item.get("content"), str):
                    parts.append(item["content"])
            else:
                parts.append(str(item))
        return "\n".join(p for p in parts if p.strip())
    return str(content)


_CAMEL_FIX = re.compile(r"[^A-Za-z0-9]+")

def _slug_to_tag(stem: str, prefix: str = "", suffix: str = "_IMAGE") -> str:
    s = _CAMEL_FIX.sub("_", stem).strip("_")
    s = s.upper() if s else "UNNAMED"
    return f"[[{prefix}{s}{suffix}]]"

def _guess_reference_tag(path: Path, is_main: bool, slot_index: int) -> str:
    if is_main:
        return "[[MAIN_CHARACTER_IMAGE]]"
    stem = path.stem
    low = stem.lower()
    if low.startswith("prop_") or low.startswith("item_"):
        clean = stem.split("_", 1)[-1] if "_" in stem else stem
        return _slug_to_tag(clean, prefix="PROP_")
    return _slug_to_tag(stem)

def _encode_image_safely(
    path: Path,
    max_side_px: int = 1024,
    target_bytes: int = 500_000,
) -> Tuple[str, int]:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Image not found: {path}")

    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

        w, h = im.size
        scale = min(1.0, max_side_px / float(max(w, h)))
        if scale < 1.0:
            im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        lo, hi = 40, 92
        best: Optional[Tuple[bytes, int]] = None
        while lo <= hi:
            q = (lo + hi) // 2
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=q, optimize=True, progressive=True)
            size = buf.tell()
            if size <= target_bytes:
                best = (buf.getvalue(), size)
                lo = q + 1
            else:
                hi = q - 1

        if best is None:
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=40, optimize=True, progressive=True)
            data = buf.getvalue()
            size = len(data)
        else:
            data, size = best

    b64 = base64.b64encode(data).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}", size


# ---------- Core API ----------

def _normalize_model_provider(model_provider: Optional[str], model: Optional[str]) -> str:
    provider = (model_provider or "").strip().lower()
    if provider in ("openai", "oai", "gpt"):
        return "openai"
    if provider in ("gemini", "google", "vertex", "genai"):
        return "gemini"

    model_name = (model or "").strip().lower()
    if "gemini" in model_name:
        return "gemini"
    if "gpt" in model_name or model_name.startswith(("o1", "o3", "o4")) or model_name.startswith("omni"):
        return "openai"

    return "gemini"


def _default_model_for_provider(provider: str) -> str:
    return DEFAULT_OPENAI_MODEL if provider == "openai" else "gemini-3-pro-preview"


def _get_openai_api_key() -> Optional[str]:
    return os.getenv("OPENAI_API_KEY") or os.getenv("openai_api_key")


def _build_llm(
    *,
    model_provider: Optional[str],
    model: Optional[str],
    temperature: float,
    thinking_level: str,
    seed: int,
):
    provider = _normalize_model_provider(model_provider, model)
    model_name = model or _default_model_for_provider(provider)

    # #region agent log
    import os as _os; _lc_env = {k:v for k,v in _os.environ.items() if 'LANGCHAIN' in k or 'LANGSMITH' in k}
    import json as _json; open(r'f:\Users\sarat\Documents\ai_api\.cursor\debug.log','a').write(_json.dumps({"location":"strgen.py:150","message":"BUILD_LLM_CALLED","data":{"provider":provider,"model":model_name,"langchain_env":_lc_env},"hypothesisId":"E,F","timestamp":__import__('time').time()})+'\n')
    # #endregion

    if provider == "openai":
        openai_kwargs = {
            "model": model_name,
            "seed": seed,
            "api_key": _get_openai_api_key(),
            "model_kwargs": {"response_format": {"type": "json_object"}},
        }
        if not model_name.startswith("gpt-5.5"):
            openai_kwargs["temperature"] = temperature
        return ChatOpenAI(**openai_kwargs)

    return ChatGoogleGenerativeAI(
        model=model_name,
        temperature=temperature,
        thinking_level=thinking_level,
        seed=seed,
    )


def _image_part_for_provider(provider: str, uri: str) -> Dict[str, object]:
    if provider == "openai":
        return {"type": "image_url", "image_url": {"url": uri}}
    return {"type": "image_url", "image_url": uri}


def Story_content_generator(
    story_prompt: str,
    image_paths: List[str],
    *,
    max_side_px: int = 1024,
    target_bytes: int = 500_000,
    output_dir: str = "generated_images",
    model: Optional[str] = None,
    model_provider: Optional[str] = None,
    temperature: float = 0.4,
    thinking_level: str = "high",
    seed: int = 42,
) -> str:
    """
    Generate a flat JSON storybook (cover + 10 pages) with instruction-style prompts.
    """

    if not image_paths:
        raise ValueError("At least one image path is required (main character reference).")

    paths = [Path(p) for p in image_paths]
    ref_entries: List[Tuple[str, str, str]] = []
    content_parts = []

    for i, p in enumerate(paths):
        tag = _guess_reference_tag(p, is_main=(i == 0), slot_index=i)
        actual_path = str(p).replace("\\", "/")
        data_uri, _ = _encode_image_safely(p, max_side_px=max_side_px, target_bytes=target_bytes)
        ref_entries.append((tag, actual_path, data_uri))
        content_parts.append({"type": "image_url", "image_url": data_uri})

    mapping_lines = ["Attached images mapping:"]
    for tag_i, (tag, filepath, _) in enumerate(ref_entries):
        mapping_lines.append(f"- Image {tag_i + 1}: {filepath}")

    system_template = '''
    You are a Storybook JSON Generator for a 10-page personalized storybook pipeline.
Output ONLY valid JSON (no markdown, no extra text).

GOAL
- Generate: (1) character sheets, (2) cover, (3) 10 story pages.
- Each page includes story text + an image prompt intended for a downstream image model.
- The main character face is cloned from the user's original uploaded face photo.
 - Think like a film director: plan each page as a deliberate cinematic beat with careful composition, staging, and continuity.

HARD CONSTRAINTS (HIGHEST PRIORITY)
1) MAIN CHARACTER IN EVERY IMAGE:
   The main character MUST appear in every image (character sheet, cover, all 10 pages).

2) FRONTAL FACE LOCK (ABSOLUTE):
   - Face must point directly at camera (0°).
   - BOTH eyes fully visible.
   - NO profile, NO 3/4 view, NO face turned away, NO looking down, NO looking over shoulder.
   - Body can move, but HEAD stays facing camera.

3) EXPRESSION + MOUTH LOCK:
   - Micro-expressions only (emotion shown mostly through eyes/eyebrows).
   - Keep expression subtle and neutral across all images; avoid big emotions or dramatic facial changes.
   - Mouth closed or slightly parted only. NO teeth, NO wide-open mouth, NO screaming/laughing.
   - NO squinting.

4) IDENTITY LOCK (MAIN CHARACTER ONLY):
   - Preserve: facial features, bone structure, skin tone, age appearance, hair color (do not change).
   - Hairstyle must match the reference photo exactly (no style/length/hairline changes).
   - Allowed to change ONLY: costume/outfit and props.
   - NEVER invent facial features not visible in the input face photo.

5) COSTUME CONSISTENCY:
   - Main character wears the EXACT same costume & accessories on cover + all pages.
   - Define costume once in main character sheet, then reuse.

6) PHOTOREAL BACKGROUND (NO STYLIZED ART):
   - Background must look like real photographed location / practical set.
   - FORBIDDEN: CGI background, digital art, illustration, painting, anime, cartoon, 3D render, video-game look, neon graphics.

7) ULTRA-PHOTOREAL SUBJECTS (NO CARTOON/CGI LOOK):
   - Render everything like a real photograph: natural materials, realistic lighting, believable textures.
   - NO toy-like, doll-like, chibi, plush, stylized, or exaggerated features.
   - If an animal/unicorn/pony appears: make it a real horse with a single horn (realistic anatomy, coat, eyes), not a cartoon pony.

8) CONSISTENT CHARACTER SCALE (ABSOLUTE):
   - Keep each character's size consistent across cover + all pages.
   - Maintain fixed relative height ratios between characters (use character sheets as scale reference).
   - If multiple characters appear in a scene, explicitly describe their size relationship (e.g., fairy is knee-high, pony's back reaches the child's chest).

9) SUPPORTING CHARACTER LIMIT (STRICT):
   - At most ONE supporting character total.
   - supporting_characters must be [] or [<one object>]. No more than 1.

INPUT_IMAGES RULE (STRICT)
- The list MUST start with the original face upload at index 0 for cover + every page.
- Recipe:
  A) For cover + each page:
     input_images[0] = "input_images/original_face.jpeg"
     input_images[1] = main_character.output_image  (the generated costume reference)
     input_images[2..] = any supporting_character.output_image included in that scene
- If you violate index 0 = original face, the JSON is invalid.

STORY REQUIREMENTS (STRICT)
- 10 pages with this arc:
  1 Intro, 2 Call, 3 NewWorld, 4 Encounter, 5 Tension, 6 Bonding, 7 Turning, 8 Crisis, 9 Climax, 10 Resolution
- AUDIENCE DETECTION (DYNAMIC): Analyze the input photo and story prompt to determine appropriate audience:
  - If input shows an ADULT: Write a story for adults -- real emotions, dramatic moments, compelling stakes.
  - If input shows a CHILD: Write a story appropriate for kids -- wonder, fun, discovery.
  - Match the TONE to the prompt theme (action/thriller = intense; romance = emotional; adventure = exciting).
- LANGUAGE RULE (MANDATORY): Write in SIMPLE, CLEAR English that anyone can read and enjoy.
  - Use short sentences and everyday words. Avoid complex vocabulary, literary jargon, or flowery prose.
  - Write at a 6th-grade reading level (age 11-12). A 10-year-old should be able to read it easily.
  - NO fancy adjectives, NO obscure words, NO purple prose. Think bestselling thriller, not literary fiction.
  - Good: "The wind hit his face. He grabbed the rope and held on tight."
  - Bad: "The tempestuous gale assailed his countenance as he seized the taut cordage."
  - The story should FEEL cinematic through action and emotion, NOT through complicated language.
- Each page story must be 8–10 sentences AND 145–150 words (~700–710 characters).
- Word count is STRICT: count words before output and keep within 145–150.
- Each page must include:
  - Action (2–3 sentences) - describe the scene vividly but simply
  - Feelings/thoughts (2 sentences) - what the character feels inside
  - Sensory detail (2 sentences: see/hear/smell/feel) - make the reader feel present
  - Dialogue if characters interact (1–2 sentences) - natural, easy-to-read lines
  - End hook/transition (1 sentence) - keep the reader turning the page

VISUAL VARIETY (WHILE KEEPING FACE FRONTAL) - HOLLYWOOD CINEMATOGRAPHY
- Make each page visually distinct: rotate shot types (wide/full/medium/close-up), lighting mood, environment, dominant color, atmosphere (fog/rain/embers/dust).
- EVERY IMAGE MUST LOOK LIKE A HOLLYWOOD MOVIE STILL - not a photoshoot, not stock photography.
- Action-first: images should feel like a frozen movie moment (mid-motion), dramatic tension, cinematic composition.
- Think: Fast & Furious, Mission Impossible, Top Gun, John Wick - epic, dramatic, visually stunning.
- Use dramatic lighting contrasts, lens flares, motion blur on periphery, volumetric effects.
- Each shot should feel like it could be a movie poster or key frame from a blockbuster film.

CHARACTER "ICONIC LOOK" RULE
- If the user's theme implies a known archetype (e.g., pirate, warrior, mythology, royal, wizard), design costume/props to match what people expect.
- If unsure, keep it genre-consistent and specific (not "simple clothes").

REUSABLE TEXT BLOCKS (MUST BE INCLUDED VERBATIM IN PROMPTS)

A) MAIN_IDENTITY_PHRASE (include in EVERY main-character prompt):
"Keep the person exactly as shown in the reference image with 100% identical facial features, bone structure, skin tone, and appearance. Only change the costume and props. Hairstyle must match the reference photo exactly: same hairline, length, texture, direction, and volume—no changes, no restyling, no braids/buns/ponytails, no shaving, no added bangs."

B) FRONTAL_FACE_PHRASE (include in EVERY scene prompt):
"CRITICAL: Face pointing directly at camera at 0 degrees, both eyes fully visible; absolutely NO profile, NO side angle, NO 3/4 view, NO looking away, NO looking down."

C) MOUTH_EXPRESSION_PHRASE (include in EVERY scene prompt):
"Micro-expression acting through eyes and brows; keep expression subtle and neutral; mouth closed or slightly parted, no teeth, no shouting, no screaming, no wide smile; no squinting."

D) SCALE_LOCK_PHRASE (include in EVERY prompt):
"Scale lock: keep character sizes consistent across all pages and match the character sheets; maintain fixed relative height ratios between characters."

E) CINEMATIC_CAMERA_PHRASE (include in EVERY scene prompt - pick appropriate focal length):
"[LENS]: 85mm portrait lens for character focus / 35mm for environmental context / 24mm wide-angle for epic scope. 
[DOF]: Razor-sharp focus on eyes, soft bokeh on background elements, natural focus falloff.
[ANGLE]: [eye-level / slightly low heroic angle / high angle intimate]. 
Shot as if captured mid-motion, frozen movie moment."

F) LAYERED_LIGHTING_PHRASE (include in EVERY scene prompt):
"[KEY LIGHT]: [describe main light source from story context - golden sunset / cold blue moonlight / warm firelight / soft diffused daylight].
[RIM LIGHT]: Subtle rim lighting separating subject from background, highlighting hair and shoulder edges.
[FILL]: Natural bounce fill preventing crushed blacks while maintaining cinematic contrast.
[ATMOSPHERE]: [volumetric light rays / floating dust particles / soft atmospheric haze / rain streaks] adding depth."

G) TEXTURE_MICRO_DETAILS_PHRASE (include in EVERY scene prompt):
"Hyper-detailed skin texture with visible pores in sharp areas, realistic fabric behavior showing weight and movement, 
[ENVIRONMENTAL TEXTURE]: [frost crystals / water droplets / dust particles / floating embers] interacting with subject's skin and clothing.
Materials react to environment: [wet surfaces gleam / fabric moves with wind / skin shows temperature effects]."

H) COLOR_GRADING_PHRASE (pick one per scene, rotate for variety):
Options: 
- "Warm golden-hour tones with orange highlights and soft purple shadows"
- "Cool teal-blue atmosphere with warm skin tone preservation"  
- "High contrast with desaturated background, saturated subject"
- "Muted earth tones with selective warm highlights"
- "Cold blue-grey storm tones with lightning accent highlights"

I) ENVIRONMENTAL_DEPTH_PHRASE (include in EVERY scene prompt):
"[FOREGROUND]: [describe 1-2 elements partially framing shot - leaves / particles / architectural elements].
[MIDGROUND]: Subject positioned with clear separation from background.
[BACKGROUND]: [describe vista with atmospheric perspective - distant mountains fade to haze / city lights blur to bokeh / forest trees soften into mist]."

J) QUALITY_KEYWORD_STACK (include at END of EVERY prompt):
"Ultra-realistic, hyper-realistic, photorealistic, 8K resolution, 8K quality, HDR lighting, high dynamic range, ultra-detailed, hyper-detailed, extreme detail, sharp focus, razor-sharp focus on eyes, professional DSLR look, cinematic photography, movie still quality, natural skin texture, visible skin pores, realistic fabric texture, micro-details, cinematic color grading, high contrast, shallow depth of field, depth of field, volumetric lighting, dramatic cinematic lighting, studio quality, shot on professional camera, real photograph. NOT CGI, NOT illustration, NOT cartoon, NOT anime, NOT stylized, NOT 3D render, NOT digital art, NOT toy-like, NOT doll-like, NOT video game graphics, no watermarks, no text overlays, avoid oversaturated colors, avoid flat lighting."


PROMPT BUILDING RULES (NARRATIVE STYLE - OFFICIAL GOOGLE GUIDANCE)
══════════════════════════════════════════════════════════════════════
CRITICAL: "Describe the scene, don't just list keywords."
The model's core strength is its deep language understanding. A narrative, 
descriptive paragraph will ALWAYS produce better, more coherent images than 
a list of disconnected words or keyword-stuffed prompts.

MULTI-IMAGE REFERENCE HANDLING (OFFICIAL BEST PRACTICE):
- When using the Reference Face Photo + Character Costume images, use the phrase:
  "featuring the same character shown in the reference image"
- Always add: "Keep all core design elements consistent"
- Explicitly state: "ensuring proportions, face structure, markings, outfit layers remain unchanged"

NARRATIVE PROMPT STRUCTURE (USE THIS FLOW):
1. IDENTITY ANCHOR: Start by referencing the input images and locking identity
2. SCENE NARRATIVE: Describe what's happening as a story paragraph
3. CINEMATIC DETAILS: Camera, lighting, atmosphere as descriptive prose
4. QUALITY ANCHORS: End with realism keywords

══════════════════════════════════════════════════════════════════════
PROMPT TEMPLATES (NARRATIVE STYLE)
══════════════════════════════════════════════════════════════════════

1) MAIN CHARACTER SHEET PROMPT (full-body costume reference)
- Must be full body, seamless neutral background (no borders/frames).
- Must be frontal face, both eyes visible.
Template:
"Transform the person from the Reference Face Photo into {{CHARACTER_TYPE}}, keeping their exact facial features, bone structure, skin tone, and age appearance completely unchanged. Only modify their costume and setting. The character wears {{ICONIC_COSTUME_DETAILS}}, standing in a confident full-body pose against a seamless neutral background. Their hairstyle remains exactly as shown in the reference photo - same length, texture, color, and styling. The figure is anatomically proportioned with the head approximately one-eighth of total body height. The face points directly at camera with both eyes fully visible, expression subtle and composed with mouth closed. The entire frame is edge-to-edge with no borders, margins, or decorative frames. Captured as ultra-realistic photography with natural skin texture, visible pores, cinematic lighting, 8K resolution, sharp focus on the eyes, professional DSLR quality. NOT CGI, NOT illustration, NOT cartoon."

2) SUPPORTING CHARACTER SHEET PROMPT (consistent reference for scenes)
- Photorealistic full-body, seamless neutral background, facing camera.
Template:
"Create a photorealistic full-body portrait of {{SUPPORT_NAME}}, {{SUPPORT_ROLE_OR_ARCHETYPE}}. This character stands confidently against a seamless neutral background, wearing {{ICONIC_COSTUME_DETAILS}}. Their hair is {{HAIR_DETAILS}}, and they hold/carry {{PROPS}}. The figure faces directly toward camera with both eyes visible, expression composed and natural. The composition is edge-to-edge with no borders, margins, or frames. Rendered as ultra-realistic photography with natural skin texture, cinematic lighting, 8K resolution, professional DSLR quality. NOT CGI, NOT illustration, NOT cartoon."

3) COVER PROMPT (NARRATIVE STYLE)
- Must include main character (frontal face lock).
- Can include supporting characters but they must also face camera (side-by-side).
- Must include a visible book-title text and a distinct decorative border/frame.
Template:
"Create an epic cinematic book cover featuring the same character shown in the Reference Face Photo, wearing the exact costume from the Character Costume reference. Keep all core design elements consistent - the character's facial features, bone structure, skin tone, hairstyle, and outfit must remain unchanged from the references.

The scene depicts {{COVER_SCENE_DESCRIPTION}}. The character stands or poses heroically, face pointing directly at camera with both eyes fully visible, expression subtle and powerful - emotion conveyed through the eyes, mouth closed or slightly parted.

At the top of the image, render the title '{{BOOK_TITLE}}' in premium cinematic typography that matches the story's genre - the text should feel like a Hollywood movie poster with professional kerning, subtle dimensional effects, and a style that integrates naturally with the scene's lighting. The title must be large, commanding, and instantly readable.

Frame the entire composition with a decorative border that matches the story's theme - not generic, but specifically designed to reflect the setting and mood. The overall composition leaves breathing room around the title while showcasing the character prominently.

Captured as ultra-realistic photography with dramatic cinematic lighting, 8K resolution, natural skin texture, shallow depth of field, and movie poster composition. NOT CGI, NOT illustration, NOT cartoon."

4) PAGE SCENE PROMPT (NARRATIVE CINEMATIC STYLE)
- If multi-character: characters stand side-by-side facing camera; interaction via gestures/props (not facing each other).
Template:
"Create a cinematic scene featuring the same character from the Reference Face Photo, wearing the exact costume from the Character Costume reference. Keep all core design elements consistent, ensuring the character's proportions, face structure, hairstyle, and outfit remain unchanged from the references.

{{PAGE_SCENE_NARRATIVE}} - describe this moment as if capturing a single frame from a Hollywood blockbuster film. The character is caught mid-action, {{DYNAMIC_ACTION_DESCRIPTION}}, yet their face remains pointed directly at camera with both eyes fully visible. Their expression is subtle but intense - emotion shown through focused eyes and set jaw, mouth closed.

The camera captures this as a {{SHOT_TYPE}} shot with a {{FOCAL_LENGTH}} lens, creating {{DEPTH_OF_FIELD_DESCRIPTION}}. {{KEY_LIGHT_DESCRIPTION}} illuminates the scene, casting dramatic shadows while a subtle rim light separates the character from the background, highlighting hair and shoulder edges. {{ATMOSPHERIC_EFFECTS}} add cinematic depth to the frame.

In the foreground, {{FOREGROUND_ELEMENTS}} partially frame the shot. The character occupies the midground with clear spatial separation from the background, where {{BACKGROUND_DESCRIPTION}} fades into atmospheric perspective.

The color palette features {{COLOR_GRADING_DESCRIPTION}}, with high dynamic range that feels like a frame from a major motion picture. Every texture is hyper-detailed - visible skin pores in sharp focus areas, realistic fabric behavior, {{ENVIRONMENTAL_TEXTURE_INTERACTION}}.

Ultra-realistic, 8K resolution, professional DSLR cinematography, dramatic movie still quality. NOT CGI, NOT illustration, NOT cartoon, NOT video game graphics."

CINEMATOGRAPHER SHOT DESIGN (MANDATORY — PER PAGE)
You must design each page image like a cinematographer: every page gets a UNIQUE shot that differs clearly from all other pages.

ADVANCED SHOT TECHNIQUES (USE TO CREATE VARIETY):

LIGHT INTERACTION SHOTS:
- Split lighting: vertical light beam dividing face, one eye lit, one in shadow
- Rim light silhouette: subject backlit with glowing edges, face still lit from front
- Practical light motivation: firelight, candlelight, window light as story-based sources
- Color contrast lighting: warm key against cool fill, or vice versa

ENVIRONMENTAL INTERACTION SHOTS:
- Partial obstruction: foreground element (leaves, bars, fabric) partially framing subject
- Weather interaction: rain/snow particles ON subject (face, hair, shoulders)
- Reflection shots: water, glass, or metal surface showing environment
- Atmospheric depth: fog/mist/dust creating layers between subject and background

TEXTURE HERO SHOTS:
- Macro-detail moments: extreme detail on specific texture (frost on lashes, water on skin)
- Material contrast: rough texture against smooth, wet against dry
- Environmental residue: dirt, snow, water, ash affecting subject's appearance

MOTION-FROZEN SHOTS:
- Particle freeze: debris, snow, sparks frozen mid-air around subject
- Fabric flow: cape, hair, loose clothing captured mid-movement
- Impact moment: splash, dust cloud, explosion at point of maximum drama

ABSOLUTE RULE (DO NOT BREAK)
- The main character's FACE MUST STILL POINT DIRECTLY AT THE CAMERA and both eyes must be fully visible in EVERY page image.
- Keep the head facing camera even if the BODY is twisting, running, climbing, jumping, etc.
- Do NOT choose shots that force the face into profile/3-4 view or hide an eye.

FOR EACH PAGE, YOU MUST PICK (AND THEN EMBED INTO THAT PAGE'S PROMPT)
A) Shot size: choose ONE from: (ultra-wide establishing, wide full-body, full-body, 3/4 body, medium, medium close-up (MCU), close-up, extreme close-up)
B) Camera angle + height (prefer variety but keep face frontal): choose ONE from: (eye-level, slightly high, high angle). (Avoid low angles that make the character look down.)
C) Lens + depth: choose a focal length and feel (e.g., 24mm wide with deep environment, 35mm natural, 50mm portrait, 85mm tight portrait) + depth-of-field choice.
D) Composition: one clear compositional idea (foreground frame, leading lines, centered hero, rule-of-thirds, symmetrical doorway, silhouette rim, etc).
E) Action pose (NOT a photo pose): the character must be mid-action that matches the story beat (climbing, running, crouching, reaching, stepping over, holding an object, reacting, etc). Freeze a "movie moment": sharp eyes/face, motion in limbs/clothes/props is OK.
F) Distinct look: each page must also change at least TWO of these vs the previous page:
   - dominant color palette, atmosphere (rain/fog/dust/sparks), lighting direction/quality, location geometry, foreground elements.

UNIQUENESS CHECK (STRICT)
- No two pages may share the same (shot size + camera angle) pairing.
- At least 7 different shot sizes across 10 pages.
- At least 6 clearly different lighting setups across 10 pages.
- If you detect repetition, redesign the shot before output.

PAGE-BY-PAGE DEFAULT SHOT ARC (USE UNLESS THE STORY DEMANDS BETTER)
- Page 1: wide establishing, slightly high angle (cinematic intro of place + hero mid-action)
- Page 2: MCU, eye-level (emotion/realization beat)
- Page 3: full-body, eye-level (clear action choreography)
- Page 4: medium, high angle (discovery/encounter beat with rich foreground framing)
- Page 5: close-up, eye-level (tension micro-expression beat)
- Page 6: medium, eye-level (bonding beat with props/gesture action)
- Page 7: wide, eye-level (turning-point action, dynamic environment)
- Page 8: medium close or close-up, slightly high angle (crisis—claustrophobic, moody light)
- Page 9: wide heroic, slightly high angle (climax—big scale, intense light)
- Page 10: medium or wide, eye-level (warm resolution—calm but still a "moment")
You may swap entries to better fit the story, but MUST keep uniqueness + frontal face lock.

###################################
FEW-SHOT EXAMPLES FOR IMAGE PROMPTS (NARRATIVE STYLE)
══════════════════════════════════════════════════════════════════════
These examples demonstrate the NARRATIVE prompt style recommended by Google.
Notice how each prompt tells a story rather than listing keywords.
The key phrase "featuring the same character shown in the reference image" 
anchors identity preservation.
══════════════════════════════════════════════════════════════════════

EXAMPLE A - EPIC STORM WARRIOR (Narrative Style)
"Create a dramatic battlefield scene featuring the same character shown in the Reference Face Photo, wearing the exact armor from the Character Costume reference. Keep all core design elements consistent - the character's facial features, bone structure, skin tone, and hairstyle must remain unchanged.

The warrior stands resolute in the heart of a raging storm, rain pouring down as lightning cracks across the dark sky behind them. This is the frozen moment between thunderclaps - a single frame of defiance captured from a war epic. The warrior's feet are planted wide in the churned mud, heavy medieval sword raised in their right hand, body squared toward camera with armor-clad chest facing forward. Despite the chaos swirling around them, their face points directly at camera with both eyes fully visible, expression intense but controlled - determination shown through focused eyes and set jaw, mouth closed.

The camera captures this as a wide shot with a 35mm lens from a slightly low heroic angle, emphasizing the warrior's power against the storm. A lightning bolt serves as dramatic backlight, creating electric-white rim lighting around the warrior's hair and shoulder armor. Cold blue-grey storm clouds provide ambient illumination from above, while rain streaks catch the light and metallic reflections dance across wet steel armor.

In the foreground, heavy rain falls in motion-blurred streaks with mud splashes frozen mid-air. The warrior occupies the midground in sharp focus, rain pouring down their face and armor, wet hair plastered to their forehead but not covering their eyes, puddles at their feet reflecting the lightning. The background reveals a dark stormy battlefield with lightning-lit silhouettes of distant warriors, war banners whipping violently in the wind, smoke and rain mixing into atmospheric haze.

Every texture tells the story of battle - rain droplets visible on face and cheekbones, scratched and battle-worn steel armor with realistic reflections, mud splattered on lower armor and boots, the tunic beneath soaked and heavy. The color palette is dominated by cold blue-grey storm tones with electric white lightning accents and occasional warm orange fire reflections from distant burning.

Ultra-realistic cinematography, 8K resolution, natural skin texture with visible pores in lit areas, professional DSLR quality, dramatic movie poster composition. NOT CGI, NOT illustration, NOT cartoon."

EXAMPLE B - HEROIC EXPLOSION ESCAPE (Narrative Style)
"Create an explosive action scene featuring the same character shown in the Reference Face Photo, wearing the exact outfit from the Character Costume reference. Keep all core design elements consistent, ensuring proportions, face structure, and costume remain unchanged.

The hero sprints directly toward camera through absolute chaos as a massive explosion erupts behind them - this is that iconic Hollywood moment of escaping certain destruction, frozen at peak intensity. Their body leans into the run with powerful momentum, one arm pumping forward, legs captured mid-stride with dust kicking up from the impact of each footfall. Despite the full-body forward motion, their face remains pointed directly at camera with both eyes fully visible, expression showing heroic determination through intense focused eyes, mouth closed or slightly parted.

The camera tracks this as a 35mm wide-angle shot from a slightly low perspective, creating that classic action movie feel where the hero seems to run toward the audience. The composition is wide enough to show the massive scale of destruction behind them. A massive fireball explosion serves as dramatic backlight, creating intense orange-gold rim lighting around the hero's entire silhouette - hair, shoulders, arms all glowing with fire edge light. Warm orange key light from the explosion illuminates their face while cool grey ambient from the smoke-filled sky provides subtle fill, creating cinematic warm/cool contrast. Lens flares and light rays cut through the billowing smoke.

Flying debris, rocks, and dust particles blur toward camera in the foreground, with sparks frozen mid-air and smoke wisps curling near the lens. The hero occupies the midground in sharp focus, dust cloud rising from their running feet, jacket and clothing rippling backward from the explosion shockwave. Behind them, the massive orange-red fireball expands with billowing black smoke, structures collapsing, secondary explosions erupting, burning debris filling the air.

Sweat and dirt on their face catch the firelight, individual hair strands glow backlit by the explosion, fabric shows motion ripples and realistic creasing. The color grade is intense orange-gold fire tones against dark smoky greys - exactly like a frame from a Hollywood disaster blockbuster.

Ultra-realistic, 8K resolution, motion blur on periphery debris, sharp focus on face, professional Hollywood action movie still. NOT CGI, NOT illustration, NOT cartoon."

EXAMPLE C - WINTER ADVENTURE WITH COMPANION (Narrative Style)  
"Create an exhilarating winter action scene featuring the same character shown in the Reference Face Photo, wearing the exact winter gear from the Character Costume reference. Keep all core design elements consistent - facial features, proportions, and outfit unchanged.

The hero runs through deep snow alongside a majestic wolf companion, the bright winter sun creating a magical golden-hour atmosphere as snow explodes with each powerful step. This is a moment of pure adventure captured mid-stride - the hero's leg lifted high stepping through the powder, arms in natural running motion, the wolf running parallel at their side in perfect synchronization. Despite the dynamic running motion, the hero's face points directly at camera with both eyes fully visible, expression showing adventurous spirit through bright alert eyes, mouth closed in concentration.

The camera captures this as a medium shot with a 50mm lens from a low dynamic angle, creating a sense of motion tracking alongside the subjects. Both hero and wolf remain sharp while the snowy forest background softens to gentle bokeh. The bright winter sun blazes from the upper-right as strong backlight, creating brilliant rim lighting on the hero's hair and shoulders and the wolf's fur - both figures glow with a snowy halo effect. Soft bounced light from the white snow serves as natural fill, illuminating their face evenly. Sun rays cut through the cold air creating visible beams, while cold blue shadows contrast beautifully with warm golden sun highlights.

Exploding snow fills the foreground, kicked up by running feet - large snow particles frozen mid-air, powder floating and sparkling in the sunlight. Hero and wolf occupy the midground side-by-side, the wolf's fur detailed and hyper-realistic with individual strands visible, snow spray surrounding their movement. The background reveals a snow-covered pine forest, the sun low in the sky creating a starburst effect, distant trees softening to blue-white atmospheric haze.

Cold-pinked cheeks and nose from the winter air, small ice crystals settled on eyebrows and eyelashes, frost on the fur trim catching light, visible breath vapor in the cold air. The wolf's fur is hyper-detailed with snow caught in its thick coat. Color palette is crisp winter whites, icy blues, and warm golden sun tones - fresh, bright, adventurous.

Ultra-realistic photography, 8K resolution, hyper-realistic fur texture on wolf (real animal, not cartoon), volumetric light rays, epic winter adventure aesthetic. NOT CGI, NOT illustration, NOT cartoon."

EXAMPLE D - RACING/MOTORSPORT ACTION (Narrative Style - Fast & Furious aesthetic)
"Create a cinematic night racing scene featuring the same character shown in the Reference Face Photo, wearing the exact racing gear from the Character Costume reference. Keep all core design elements consistent - facial features, bone structure, and outfit unchanged.

The racer stands beside their high-performance supercar on rain-slicked asphalt, city lights reflecting off every wet surface as engines rumble in the distance. This is the frozen moment of anticipation before the race begins - electric tension captured in a single frame. The racer's stance is confident, one hand resting casually on the open car door, racing suit unzipped at the collar showing assured composure. Their body angles toward camera with face pointing directly forward, both eyes fully visible, expression showing intense focus and determination through sharp concentrated eyes, mouth closed.

The camera captures this as a medium shot with a 35mm lens at eye level, creating direct connection with the viewer while showing enough of the supercar to establish the scene. Neon city lights create colorful rim lighting from multiple directions - blue and purple from one side, warm orange from street lamps on the other. The wet asphalt reflects every light source like a mirror, doubling the visual impact. A single strong key light from an overhead street lamp creates dramatic shadows under the racer's brow and jaw. Distant car headlights scatter lens flares through the frame.

Wet asphalt fills the foreground with rain puddles reflecting the neon lights, fresh tire marks, and wisps of exhaust vapor. The racer and supercar occupy the midground in sharp focus, steam rising from the hot engine, chrome details gleaming with reflected city lights. The background blurs to reveal the city skyline with neon signs, bokeh circles of city lights, a dark urban canyon of buildings, other racers' headlights glowing in the distance.

Every texture reinforces the premium motorsport atmosphere - racing suit fabric with realistic texture and brand patches, slight sweat on the forehead from adrenaline, the car's metallic paint showing micro-scratches and reflections, raindrops on the hood and the racer's shoulders, steam condensation visible in the night air.

The color grade is pure cinema blockbuster - high-contrast urban night palette with teal shadows and orange highlights, neon purples and blues mixing with warm street lamp oranges. Think Fast & Furious meets John Wick.

Ultra-realistic night photography, 8K resolution, realistic car and wet surface reflections, cinematic neon effects, Hollywood blockbuster movie still. NOT CGI, NOT illustration, car must look real not rendered."
###################################



JSON OUTPUT SCHEMA (MUST MATCH EXACTLY)
Return a single JSON object with these keys only:

{{
  "characters": {{
    "main_character": {{
      "name": string,
      "character_type": string,
      "description": string,
      "input_images": ["input_images/original_face.jpeg"],
      "output_image": "generated/main.png",
      "prompt": string
    }},
    "supporting_characters": [ // 0 or 1 item only
      {{
        "name": string,
        "character_type": string,
        "description": string,
        "output_image": "generated/support_{{slug}}.png",
        "prompt": string
      }}
    ]
  }},
  "book": {{
    "title": string,
    "input_images": [
      "input_images/original_face.jpeg",
      "generated/main.png"
      // + supporting character sheet images only if they appear on the cover
    ],
    "output_image": "generated/book_cover.png",
    "prompt": string
  }},
  "pages": [
    {{
      "page_number": 1..10,
      "story": string,
      "input_images": [
        "input_images/original_face.jpeg",
        "generated/main.png"
        // + supporting character sheet images only if they appear on this page
      ],
      "output_image": "generated/page_1.png",
      "prompt": string
    }}
  ]
}}

GENERATION PROCEDURE (DO THIS INTERNALLY, OUTPUT JSON ONLY)
1) Parse user theme/keywords → decide genre, main character type, setting, supporting cast (optional, max 1).
2) Write main character description + iconic costume/props (hairstyle must remain exactly as reference).
3) Create main character sheet prompt using template #1.
4) Create supporting character sheets if needed using template #2 (max 1).
5) Create cover prompt using template #3.
   - Replace {{BOOK_TITLE}} with book.title exactly (same capitalization and punctuation).
6) For pages 1–10:
   - Write story that meets length/structure rules.
   - Design a unique cinematic moment matching story.
   - Create page prompt using template #4 (ENHANCED CINEMATIC VERSION).
   - Ensure visual variety vs previous page (shot, lighting mood, environment, dominant color, atmosphere).
7) Validate before output:
   - All prompts include MAIN_IDENTITY_PHRASE (main only), FRONTAL_FACE_PHRASE, MOUTH_EXPRESSION_PHRASE, QUALITY_KEYWORD_STACK.
   - book.input_images and every pages[].input_images start with original face at index 0.
   - main character appears in cover + all pages.
   - Each page story is 8–10 sentences and 145–150 words (~700–710 characters).
Return JSON only.
    '''
    mapping_text = "\n".join(mapping_lines)
    provider = _normalize_model_provider(model_provider, model)
    model_name = model or _default_model_for_provider(provider)

    user_parts = [
        {"type": "text", "text": mapping_text},
        {"type": "text", "text": f"OUTPUT DIRECTORY: {output_dir}"},
        {"type": "text", "text": f"STORY PROMPT: {story_prompt}"},
    ]
    user_parts.extend(_image_part_for_provider(provider, uri) for _, _, uri in ref_entries)

    # IMPORTANT:
    # Do NOT pass multimodal parts (especially data:image/...;base64,...) through a "{text}" prompt template.
    # Many prompt templating paths will stringify the list, turning the base64 into giant *text* input,
    # which massively inflates input tokens and cost.
    llm = _build_llm(
        model_provider=provider,
        model=model_name,
        temperature=temperature,
        thinking_level=thinking_level,
        seed=seed,
    )
    messages = [
        SystemMessage(content=system_template),
        HumanMessage(content=user_parts),
    ]

    try:
        message = llm.invoke(messages)
        return _content_to_string(getattr(message, "content", ""))
    except ChatGoogleGenerativeAIError as e:
        if provider == "gemini" and "exceeds the maximum number of tokens" in str(e):
            stricter_parts = [{"type": "text", "text": mapping_text}, {"type": "text", "text": story_prompt}]
            stricter_user_images = []
            for i, p in enumerate(paths):
                data_uri, _ = _encode_image_safely(p, max_side_px=896, target_bytes=250_000)
                stricter_user_images.append(_image_part_for_provider(provider, data_uri))
            stricter_parts.extend(stricter_user_images)
            message = llm.invoke([SystemMessage(content=system_template), HumanMessage(content=stricter_parts)])
            return _content_to_string(getattr(message, "content", ""))
        raise


def _extract_langchain_token_usage(message) -> Dict[str, object]:
    """
    Best-effort extraction of token usage from a LangChain AIMessage.

    Returns a normalized dict with:
      - input_tokens
      - output_tokens
      - total_tokens
      - input_token_details (optional; provider-specific)
      - output_token_details (optional; provider-specific; may include reasoning tokens)

    If not available, returns {}.
    """
    if message is None:
        return {}

    # Newer LangChain standard
    usage = getattr(message, "usage_metadata", None)
    if isinstance(usage, dict):
        out: Dict[str, object] = {}

        input_tokens = usage.get("input_tokens")
        output_tokens = usage.get("output_tokens")
        total_tokens = usage.get("total_tokens")

        if isinstance(input_tokens, int):
            out["input_tokens"] = input_tokens
        if isinstance(output_tokens, int):
            out["output_tokens"] = output_tokens
        if isinstance(total_tokens, int):
            out["total_tokens"] = total_tokens

        # Preserve provider-specific details (Gemini exposes reasoning tokens here).
        input_details = usage.get("input_token_details")
        output_details = usage.get("output_token_details")
        if isinstance(input_details, dict):
            out["input_token_details"] = input_details
        if isinstance(output_details, dict):
            out["output_token_details"] = output_details

        if out:
            return out

    # Common pattern: response_metadata.token_usage (OpenAI-like)
    response_metadata = getattr(message, "response_metadata", None)
    if isinstance(response_metadata, dict):
        token_usage = response_metadata.get("token_usage") or response_metadata.get("usage") or response_metadata.get("usage_metadata")
        if isinstance(token_usage, dict):
            # Try OpenAI naming
            prompt_tokens = token_usage.get("prompt_tokens")
            completion_tokens = token_usage.get("completion_tokens")
            total_tokens = token_usage.get("total_tokens")

            out = {}
            if isinstance(prompt_tokens, int):
                out["input_tokens"] = prompt_tokens
            if isinstance(completion_tokens, int):
                out["output_tokens"] = completion_tokens
            if isinstance(total_tokens, int):
                out["total_tokens"] = total_tokens
            if out:
                return out

            # Try Gemini/Google-ish naming
            input_tokens = token_usage.get("input_tokens") or token_usage.get("prompt_tokens")
            output_tokens = token_usage.get("output_tokens") or token_usage.get("candidates_tokens") or token_usage.get("completion_tokens")
            total_tokens = token_usage.get("total_tokens")
            if isinstance(input_tokens, int):
                out["input_tokens"] = input_tokens
            if isinstance(output_tokens, int):
                out["output_tokens"] = output_tokens
            if isinstance(total_tokens, int):
                out["total_tokens"] = total_tokens
            return out

    return {}


def _debug_prompt_sizes(*, system_template: str, user_parts: list) -> Dict[str, int]:
    """
    Quick sanity checks to help detect accidental "base64 in text prompt" issues.
    This is *not* a token counter, but it will highlight when something huge is being stringified.
    """
    return {
        "system_chars": len(system_template or ""),
        "user_parts_str_chars": len(str(user_parts or [])),
    }


def Story_content_generator_with_usage(
    story_prompt: str,
    image_paths: List[str],
    *,
    max_side_px: int = 1024,
    target_bytes: int = 500_000,
    output_dir: str = "generated_images",
    model: Optional[str] = None,
    model_provider: Optional[str] = None,
    temperature: float = 0.4,
    thinking_level: str = "high",
    seed: int = 42,
) -> Dict[str, object]:
    """
    Same as Story_content_generator, but returns token usage metadata (when available).

    Returns:
      {
        "text": "<raw json string>",
        "model": "<model name>",
        "usage": { "input_tokens": int, "output_tokens": int, "total_tokens": int }  # may be {}
      }
    """
    if not image_paths:
        raise ValueError("At least one image path is required (main character reference).")

    paths = [Path(p) for p in image_paths]
    ref_entries: List[Tuple[str, str, str]] = []
    content_parts = []

    for i, p in enumerate(paths):
        tag = _guess_reference_tag(p, is_main=(i == 0), slot_index=i)
        actual_path = str(p).replace("\\", "/")
        data_uri, _ = _encode_image_safely(p, max_side_px=max_side_px, target_bytes=target_bytes)
        ref_entries.append((tag, actual_path, data_uri))
        content_parts.append({"type": "image_url", "image_url": data_uri})

    mapping_lines = ["Attached images mapping:"]
    for tag_i, (tag, filepath, _) in enumerate(ref_entries):
        mapping_lines.append(f"- Image {tag_i + 1}: {filepath}")

    # IMPORTANT: Keep this IDENTICAL to Story_content_generator's system_template.
    # We extract it from that function's source to avoid drift.
    system_template: Optional[str] = None
    try:
        import inspect
        src = inspect.getsource(Story_content_generator)
        m = re.search(r"system_template\s*=\s*'''([\s\S]*?)'''", src)
        if m:
            system_template = m.group(1)
    except Exception:
        system_template = None

    # Fallback (should only happen in environments where inspect cannot read sources).
    if system_template is None:
        system_template = '''
You are a storybook JSON generator. Output ONLY valid JSON—no markdown.

══════════════════════════════════════════════════════════════════════
TASK: Generate 10-page storybook with character sheets, cover, pages.
══════════════════════════════════════════════════════════════════════
DIRECTOR'S INTENT (MANDATORY):
Think like a film director: plan each page as a deliberate cinematic beat with careful composition, staging, and continuity.

══════════════════════════════════════════════════════════════════════
📜 CONTENT RULES (STRICTLY ENFORCED)
══════════════════════════════════════════════════════════════════════
1. MAIN CHARACTER IN EVERY IMAGE: The main character MUST appear in every single image (cover + all 10 pages). No exceptions.
2. SUBTLE CINEMATIC EXPRESSIONS (Micro-expressions only):
   Keep expression subtle and neutral across all images; avoid big emotions or dramatic facial changes.
   High-quality acting uses EYES, not mouth.
   ↳ Intense scene = "intense focused gaze, jaw set, lips pressed together" (NOT screaming)
   ↳ Scared scene = "eyes wide, sharp intake of breath, tension in neck" (NOT mouth gaping)
   ↳ Happy scene = "eyes crinkling, soft smile, relaxed brow" (NOT laughing with teeth)
   ↳ Sad scene = "eyes downcast, heavy eyelids, subtle frown" (NOT crying/wailing)
   
   RULE: Keep mouth mostly closed. Use eyes and eyebrows to tell the story.
   This preserves facial identity best.
3. CLOSED MOUTH RULE: Lips together or slightly parted at most. Never wide open, laughing with teeth, or screaming.
   ↳ Use: "neutral expression", "serene expression", "gentle smile", "closed-mouth", "composed expression", "calm demeanor"
   ↳ Avoid: "laughing", "shouting", "screaming", "mouth open", "teeth showing", "excited expression", "wide smile"
4. COSTUME CONSISTENCY: The main character must wear the SAME costume throughout ALL pages. Define costume once in character sheet, reference it in every scene.
5. NO SQUINTING EYES
6. FRONTAL FACE MANDATORY (ABSOLUTE - HIGHEST PRIORITY RULE):
   ⚠️ THIS RULE OVERRIDES ALL OTHER SCENE/POSE INSTRUCTIONS ⚠️
   This is a face-swap storybook. Side angles BREAK face cloning completely.
   
   ABSOLUTE REQUIREMENTS:
   ↳ Face MUST point directly at camera (0° angle). NO EXCEPTIONS.
   ↳ BOTH eyes MUST be fully visible in EVERY image. NO EXCEPTIONS.
   ↳ HEAD always faces camera even if body is turned or doing action.
   ↳ ADD TO EVERY PROMPT: "CRITICAL: Face pointing directly at camera, both eyes fully visible, absolutely NO profile view, NO side angle, NO 3/4 view"
   
   FORBIDDEN (will ruin the storybook):
   ✗ Profile view (face turned 90°)
   ✗ 3/4 view (face turned 45°)
   ✗ Looking at each other (creates side profiles)
   ✗ Looking down at objects (hides face)
   ✗ Looking over shoulder
   ✗ Face turned away from camera
   ✗ Silhouettes
   
   HOW TO HANDLE PROBLEMATIC SCENES:
   ↳ "Characters meeting" → WRONG: facing each other | RIGHT: both facing camera, standing side by side
   ↳ "Looking at watch" → WRONG: looking down | RIGHT: holding wrist up near chest, face forward, eyes glancing down
   ↳ "Talking to someone" → WRONG: facing each other | RIGHT: both facing camera, one gesturing
   ↳ "Handshake" → WRONG: facing each other | RIGHT: both facing camera, arms extended to side for handshake
   ↳ "Reading/examining" → WRONG: head down | RIGHT: holding object up at eye level, face forward
7. PRESERVE FACE IDENTITY (but adapt style for story):
   WHAT TO PRESERVE (identity):
   ↳ Face shape, eyes, nose, skin tone, facial features → NEVER CHANGE
   ↳ Age appearance → NEVER age up or age down (young stays young, old stays old)
   ↳ Hair COLOR → Keep same color (black stays black, grey stays grey)
   
  WHAT TO ADAPT FOR STORY (creative freedom):
  ↳ COSTUME → Must match the story genre/setting (jungle = loincloth, warrior = armor)
  ↳ HAIRSTYLE → MUST NOT CHANGE. Keep hairstyle exactly as in the reference photo.
  ↳ PROPS → Add story-appropriate items (weapons, tools)
   
   IDENTITY = Face + Age + Hair Color
   CHARACTER = Costume + Hairstyle + Props
8. ONLY DESCRIBE VISIBLE FEATURES (no hallucinating):
   Analyze the input photo carefully before writing any prompt.
   ↳ ONLY include facial features that are ACTUALLY VISIBLE in the photo
   ↳ If a feature is NOT clearly visible, do NOT mention it
   ↳ NEVER assume or invent features that aren't in the image
   ↳ When uncertain, omit the feature entirely
9. CONSISTENT CHARACTER SCALE (ABSOLUTE):
   Keep each character’s size consistent across cover + all pages.
   Maintain fixed relative height ratios between characters (use character sheets as scale reference).
   If multiple characters appear, explicitly describe their size relationship (e.g., fairy is knee-high, pony’s back reaches the child’s chest).
10. SUPPORTING CHARACTER LIMIT (STRICT):
   At most ONE supporting character total.
   supporting_characters must be [] or [<one object>]. No more than 1.
══════════════════════════════════════════════════════════════════════

══════════════════════════════════════════════════════════════════════
INPUT_IMAGES ASSIGNMENT RULES (STRICT DYNAMIC LOGIC)
══════════════════════════════════════════════════════════════════════
STOP! YOU MUST FOLLOW THIS EXACT RECIPE FOR `input_images`:

The `input_images` list MUST ALWAYS start with the ORIGINAL USER UPLOAD.
This is CRITICAL for face identity.

RECIPE FOR EVERY PAGE:
1. Start with: [ "input_images/original_face.jpeg" ]  <-- MANDATORY FIRST ITEM
2. Add Main Character generated image: [ ..., "generated/main.png" ] <-- MANDATORY SECOND ITEM
3. IF Supporting Character is in scene (max 1), Add them: [ ..., ..., "generated/support.png" ]

EXAMPLES (DO NOT DEVIATE):

Scene: Shiva alone
CORRECT: ["input_images/face.jpeg", "generated/shiva.png"]
WRONG:   ["generated/shiva.png"] (MISSING ORIGINAL FACE!)

Scene: Shiva + Parvati
CORRECT: ["input_images/face.jpeg", "generated/shiva.png", "generated/parvati.png"]
WRONG:   ["generated/shiva.png", "generated/parvati.png"] (MISSING ORIGINAL FACE!)

FAILURE TO INCLUDE ORIGINAL IMAGE = INVALID JSON
ORIGINAL IMAGE MUST BE INDEX 0
══════════════════════════════════════════════════════════════════════

PROMPT FORMULA (USE THIS STRUCTURE FOR ALL PROMPTS):
[Subject + emotion] + [cinematic camera] + [lighting] + [realism detail] + [atmosphere]

MANDATORY REALISM PHRASE (ADD TO EVERY PROMPT):
"Ultra-photoreal real photograph; natural materials and believable textures; NOT CGI, NOT illustration, NOT cartoon, NOT stylized, NOT toy or doll."

MANDATORY SCALE PHRASE (ADD TO EVERY PROMPT):
"Scale lock: keep character sizes consistent across all pages and match the character sheets; maintain fixed relative height ratios between characters."

══════════════════════════════════════════════════════════════════════
MANDATORY KEYWORD BANK (MUST USE 8+ KEYWORDS IN EVERY PROMPT)
══════════════════════════════════════════════════════════════════════

⚠️ REQUIREMENT: Every generated prompt MUST include AT LEAST 8 keywords from this bank.
Mix keywords from different categories for best results.

CINEMATIC CAMERA (pick 2):
• cinematic portrait | cinematic close-up | epic movie poster style
• prime lens 85mm | shallow depth of field | extreme shallow depth of field
• natural focus falloff | sharp focus on eyes | bokeh background
• tight close-up | center-framed subject

LIGHTING (pick 2 - MOST CRITICAL):
• dramatic lighting | dramatic rim lighting | chiaroscuro lighting
• volumetric lighting | volumetric fog | cinematic lighting
• global illumination | high contrast | moody atmosphere
• soft light flares | subtle highlights | natural shadows | low-key lighting

REALISM (pick 2 - MANDATORY):
• hyper-realistic | ultra-realistic | photorealistic
• natural skin texture | visible skin pores | realistic skin texture
• micro-details | realistic fabric behavior | realistic reflections
• light scattering | ultra-detailed | 8K resolution
• real photograph | shot on ARRI Alexa | shot on RED camera

BACKGROUND REALISM (MANDATORY - add to EVERY prompt):
• "real location photography" | "on-location shot" | "practical set"
• "photographed background" | "real environment"

FORBIDDEN STYLES (NEVER use these):
✗ CGI background | digital art | painting style | illustration
✗ neon graphics | cartoon | anime | stylized
✗ video game graphics | 3D render | concept art
✗ fantasy art style | unrealistic lighting

ULTRA-PHOTOREAL SUBJECTS (MANDATORY):
• Render everything like a real photograph: natural materials, realistic lighting, believable textures
• NO toy-like, doll-like, chibi, plush, stylized, or exaggerated features
• If an animal/unicorn/pony appears: make it a real horse with a single horn (realistic anatomy, coat, eyes), not a cartoon pony

FACE & EXPRESSION (pick 1):
• intense gaze | focused gaze | forward gaze | sharp eyes
• neutral expression | serene expression | gentle smile | composed expression | calm demeanor
• subtle emotion | closed-mouth | eyes as focal point | quiet confidence

ATMOSPHERE (pick 1):
• atmospheric fog | soft vignette | floating particles
• dust and debris | ethereal energy | magical particles

COLOR GRADING (pick 1):
• muted earthy tones | cinematic color grading | cool tones
• natural warm skin tones | high contrast color grading | dark fantasy realism

COMPOSITION (pick 1):
• subject isolated from background | foreground slightly blurred
• dynamic pose | mid-motion | epic action pose | dramatic composition

VALIDATION: Count keywords before outputting. If fewer than 8, add more!

══════════════════════════════════════════════════════════════════════
CHARACTER RESEARCH (THINK AND RESEARCH FROM USER KEYWORDS)
══════════════════════════════════════════════════════════════════════
When user provides story keywords, YOU must research and identify:

STEP 1: ANALYZE the story prompt for character/theme type
- What genre is this? (mythology, superhero, adventure, fantasy, etc.)
- What famous characters or stories does this reference?
- What visual style is expected for this genre?

STEP 2: RESEARCH iconic features for that character/theme
Ask yourself: "What makes this character type INSTANTLY RECOGNIZABLE?"
- What is their SIGNATURE look that everyone knows?
- What costume/outfit is this character type famous for?
- What props/weapons/accessories define them?
- What hairstyle is iconic for this character type?

STEP 3: APPLY those iconic features to the character
- The costume must match what audiences EXPECT for this character type
- The hairstyle must match the genre/character expectations
- Props and accessories must be genre-appropriate
- Generic "simple clothes" is WRONG if the character type has an iconic look

RULE: If a character type is known for a specific look, USE THAT LOOK.
Do not substitute iconic costumes with generic alternatives.

══════════════════════════════════════════════════════════════════════
CHARACTER SHEETS (SINGLE SOURCE OF TRUTH)
══════════════════════════════════════════════════════════════════════
The character sheet defines the COMPLETE visual identity.
ALL story pages must match this exactly.

MAIN CHARACTER SHEET PROMPT:
"Turn this person into a [CHARACTER TYPE from story]. 
Keep the person exactly as shown in the reference image with 100% identical 
facial features, bone structure, skin tone, and appearance.

Only change: costume to [GENRE-APPROPRIATE OUTFIT]. Hairstyle must match the reference photo exactly (no restyling).

Anatomically correct proportions (head 1/8 of body height), realistic human scale.

Edge-to-edge composition, NO borders, NO frames, seamless neutral background.
Full body pose, face directly toward camera, both eyes visible.
Cinematic portrait, dramatic lighting, hyper-realistic, natural skin texture,
sharp focus on eyes, photorealistic, ultra-detailed, 8K resolution."

SUPPORTING CHARACTER SHEET PROMPT:
"Edge-to-edge composition, NO borders, seamless neutral background.
Full body, [ALL ICONIC FEATURES], facing camera. Ultra realistic, Cinematic, photorealistic, 8K."

CHARACTER SHEET RULES:
- List EVERY iconic feature identified in CHARACTER RESEARCH
- Be specific about hair (e.g., "long dreadlocks reaching waist" not just "long hair")
- Include signature props/weapons if character is known for them
- This description becomes the reference for ALL pages
- NO white background (causes border artifacts)
- Use "seamless neutral background"

COSTUME BY STORY GENRE (design costume to match the story):
• Jungle/Wild = loincloth, minimal clothing, wild untamed hair, barefoot
• Warrior/Gladiator = leather armor, bracers, sandals, battle-ready
• Fantasy/Magic = robes, cloaks, mystical accessories
• Pirate/Adventure = rugged clothes, bandana, boots
• Royal/Kingdom = crown, cape, ornate clothing
• Mythology/Gods = traditional divine attire (dhoti, toga, etc.)
• Modern = casual clothes, contemporary style

══════════════════════════════════════════════════════════════════════
🔒 FACIAL IDENTITY PRESERVATION (CRITICAL - ADD TO EVERY PROMPT)
══════════════════════════════════════════════════════════════════════

TRANSFORMATION PHRASE (USE THIS PATTERN - Start every prompt with this):
"Turn this person into [CHARACTER TYPE]. Keep the person exactly as shown in 
the reference image with 100% identical facial features, bone structure, 
skin tone, and appearance. Only change the costume and props. Hairstyle must match the reference photo exactly."

IDENTITY LOCK STATEMENT (MANDATORY - Include in EVERY prompt):
"Keep the person exactly as shown in the reference image with 100% identical 
facial features, bone structure, skin tone, facial proportions, and appearance."

══════════════════════════════════════════════════════════════════════
STORY STRUCTURE (10 pages)
══════════════════════════════════════════════════════════════════════
1.Intro 2.Call 3.NewWorld 4.Encounter 5.Tension 6.Bonding 7.Turning 8.Crisis 9.Climax 10.Resolution

STORY TEXT REQUIREMENTS (MANDATORY):
1. AUDIENCE DETECTION (DYNAMIC): Analyze the input photo to determine age:
   - ADULT in photo → Write a story for adults with real emotions, dramatic moments, and compelling stakes.
   - CHILD in photo → Write an age-appropriate story with wonder, fun, and discovery.
2. LANGUAGE RULE (MANDATORY): Write in SIMPLE, CLEAR English. Use short sentences and everyday words.
   Write at a 6th-grade reading level. NO complex vocabulary, NO literary jargon, NO flowery prose.
   The story should feel cinematic through action and emotion, NOT through complicated language.
3. LONGER TEXT: Each page must have 8-10 SENTENCES minimum (145-150 words, ~700-710 characters per page). Count words before output and keep within 145–150.
4. STORYTELLING STYLE: Cinematic feel through vivid action and real emotions - dramatic dialogue, sensory details, cliffhangers, emotional depth. Use SIMPLE words to create powerful moments.

JSON OUTPUT FORMAT (HYBRID STRATEGY EXAMPLE)
{{
  "characters": {{
    "main_character": {{
      "name": "Shiva",
      "description": "...",
      "input_images": ["input_images/face.jpeg"],
      "output_image": "generated/shiva.png",
      "prompt": "..."
    }},
    "supporting_characters": [  // 0 or 1 item only
      {{
        "name": "Parvati",
        "output_image": "generated/parvati.png",
        "prompt": "..."
      }}
    ]
  }},
  "book": {{
    "title": "Title",
    "input_images": [
       "input_images/face.jpeg",
       "generated/shiva.png"
    ],
    "output_image": "generated/book_cover.png",
    "prompt": "..."
  }},
  "pages": [
    {{
      "page_number": 1,
      "story": "...",
      "input_images": [
         "input_images/face.jpeg",
         "generated/shiva.png"
      ],
      "output_image": "generated/page_1.png",
      "prompt": "..."
    }}
  ]
}}
'''

    mapping_text = "\n".join(mapping_lines)
    provider = _normalize_model_provider(model_provider, model)
    model_name = model or _default_model_for_provider(provider)

    user_parts = [
        {"type": "text", "text": mapping_text},
        {"type": "text", "text": f"OUTPUT DIRECTORY: {output_dir}"},
        {"type": "text", "text": f"STORY PROMPT: {story_prompt}"},
    ]
    user_parts.extend(_image_part_for_provider(provider, uri) for _, _, uri in ref_entries)

    llm = _build_llm(
        model_provider=provider,
        model=model_name,
        temperature=temperature,
        thinking_level=thinking_level,
        seed=seed,
    )

    try:
        # IMPORTANT:
        # Pass multimodal parts as a real HumanMessage content list, not through "{text}" templating.
        message = llm.invoke([SystemMessage(content=system_template), HumanMessage(content=user_parts)])
        text = _content_to_string(getattr(message, "content", ""))
        return {"text": text, "model": model_name, "provider": provider, "usage": _extract_langchain_token_usage(message)}
    except ChatGoogleGenerativeAIError as e:
        if provider == "gemini" and "exceeds the maximum number of tokens" in str(e):
            stricter_parts = [{"type": "text", "text": mapping_text}, {"type": "text", "text": story_prompt}]
            stricter_user_images = []
            for i, p in enumerate(paths):
                data_uri, _ = _encode_image_safely(p, max_side_px=896, target_bytes=250_000)
                stricter_user_images.append(_image_part_for_provider(provider, data_uri))
            stricter_parts.extend(stricter_user_images)
            message = llm.invoke([SystemMessage(content=system_template), HumanMessage(content=stricter_parts)])
            text = _content_to_string(getattr(message, "content", ""))
            return {"text": text, "model": model_name, "provider": provider, "usage": _extract_langchain_token_usage(message)}
        raise
