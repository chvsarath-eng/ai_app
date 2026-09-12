"""
Story Content Generator V2 -- Multi-Character Storybook Pipeline

Accepts 1-4 character face photos with metadata and generates a complete
storybook JSON (character sheets + cover + 10 pages) with concise
cinematic image prompts.

Prompt Architecture v7 (Sep 2026):
  Image models only know the uploaded FRONT of the face. A side or 3/4 view
  invents unseen geometry and the person changes. Every human face must stay
  camera-facing with both eyes visible. Photograph them INSIDE the scene and
  relight that frontal face to the environment so it is not a studio cutout.
  Subtle expressions only. Recurring pets get a locked identity card + sheet.
"""
from __future__ import annotations

import json, os, re
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from langchain_core.messages import HumanMessage, SystemMessage

# Re-use utilities from V1 to avoid code duplication
from strgen import (
    _content_to_string,
    _encode_image_safely,
    _build_llm,
    _normalize_model_provider,
    _default_model_for_provider,
    _image_part_for_provider,
    _extract_langchain_token_usage,
)
from langchain_google_genai.chat_models import ChatGoogleGenerativeAIError


# ---------------------------------------------------------------------------
# Concise prompt phrases (optimized for minimal token usage)
# ---------------------------------------------------------------------------

IDENTITY_PHRASE = (
    "This is the same person as the reference, newly photographed in this scene. "
    "Keep identity (age, bone structure, skin tone, hair, unique marks). "
    "Never invent a different face, and never paste the reference face on top of the scene."
)

CINEMATIC_PHRASE = (
    "One real cinematic photograph, captured mid-action like a film still, "
    "with lighting that wraps face, clothes, and environment the same way, "
    "cinematic color grading, shallow depth of field, 8K realism."
)

NEGATIVE_PHRASE = (
    "no AI glow, no plastic skin, no cartoon, no 3D render, no illustration, "
    "no anime, no extra fingers, no deformed anatomy, no face swap, "
    "no cutout, no collage, no studio-lit face on a location plate, "
    "no skin lightening, no de-aging, no stock photo look."
)

SHORT_NEGATIVES = (
    "This is one real photograph, not a collage or face swap. "
    "Face, clothes, and background share the same light, weather, grain, and texture."
)

SCENE_INTEGRATION_PHRASE = (
    "Photograph them physically inside this scene. Relight the frontal face, skin, hair, and clothes "
    "to match this scene's key light, color temperature, weather, and atmosphere. "
    "Rain, dust, sun, sweat, and color must hit the face the same way they hit the body. "
    "Every human face points at the camera with both eyes visible -- the model only knows the "
    "uploaded front of the face, so profile or three-quarter heads invent a different person. "
    "Body does the action; head stays camera-facing. Put props between them and the lens "
    "so they do not have to turn away. "
    "The uploaded photo is WHO they are, not how they feel in this frame. "
    "Keep age, bone structure, skin, hair, and unique marks. "
    "Do not copy the reference expression -- that studio face is identity only. "
    "Act a SMALL living emotion that matches this page: readable in the eyes, brows, "
    "and a tiny mouth change. The face is an actor in this moment, not a passport freeze "
    "and not a stock-photo smile reused on every page. "
    "No teeth, no laugh, no shout, no cartoon grimace, no wide grin. "
    "Same film, same costume, same world -- light and weather on the face match this beat. "
    "Forbidden: face swap, cutout, collage, studio-lit face on a location plate, side face, 3/4 face."
)

STRICT_FACE_LOCK = (
    "FRONTAL FACE LOCK is non-negotiable. The reference photo is a front face. "
    "The model cannot know how that person looks from the side. "
    "Every human face points at the camera, both eyes visible, on every page."
)

# ---------------------------------------------------------------------------
# Few-shot cinematic prompt examples (teach the LLM the exact flowing style)
# ---------------------------------------------------------------------------

FEW_SHOT_EXAMPLE_1 = (
    "Photograph the short-haired man from the first image as David and the young girl from the second image as Lily, "
    "the same two people newly captured in this scene, not pasted faces. "
    "David: short dark hair, square jaw, light stubble, olive skin. Lily: dark braid, round cheeks, warm brown skin. "
    "Generate one cinematic photograph of them riding a vintage motorcycle through a dusty canyon at golden hour. "
    "He leans into the turn on the handlebars; she holds his jacket from behind, scarf streaming. "
    "Bodies are mid-action, but both faces point at the camera with both eyes visible -- "
    "as if the camera is mounted on the front of the bike. Do not invent a side of either face. "
    "Dust and warm sidelight wrap their frontal faces the same way they wrap the leather and canyon. "
    "Do not copy the reference expressions. Small proud-warm acting: a faint closed-mouth smile "
    "that reaches the eyes. Medium shot, shallow depth of field. "
    "Same people as the references, fully relit. No face swap, no cutout, no profile, no 3/4 face."
)

FEW_SHOT_EXAMPLE_2 = (
    "Photograph the bearded man from the first image as Arthur and the young woman from the second image as Mia, "
    "the same two people standing inside a twilight flower garden, newly photographed there. "
    "Arthur: full beard, weathered skin, brown eyes. Mia: long dark hair, narrow face, light-olive skin. "
    "He reaches toward a glowing moth held in front of them; she turns her body beside him, dress caught mid-spin. "
    "Both faces stay camera-facing with both eyes visible. Faces take the cool garden light and last warm sky -- "
    "not a separate studio key. Do not copy the reference expressions. "
    "Small curious acting: brows slightly lifted, eyes searching, mouths barely eased. "
    "Medium shot, eye-level. One real photograph, no collage, no profile, no 3/4 face."
)

FEW_SHOT_EXAMPLE_3 = (
    "Photograph the curly-haired girl from the first image as Chloe, the same child newly captured in this storm, "
    "not a face dropped onto a cliff. Chloe: tight brown curls, freckles, warm tan skin, yellow raincoat. "
    "Medium shot of her bracing on a rocky overlook as wind snaps the coat. "
    "Her body leans into the wind, but her face points at the camera with both eyes visible. "
    "Rain on her cheeks and hair, cool storm light on that frontal face matching the sky. "
    "Do not copy the reference expression. Small tense acting: inner brows drawn a little, "
    "eyes wet from rain, lips softly pressed with no smile. Same child as the reference, fully relit. "
    "No cutout, no dry studio face in a wet scene, no profile, no 3/4 face."
)


# ---------------------------------------------------------------------------
# V2 System Prompt
# ---------------------------------------------------------------------------

def _build_v2_system_prompt(num_characters: int) -> str:
    """Build the full system prompt for V2 multi-character story generation.

    Uses single flowing comma-separated sentence format (~150-250 word prompts)
    matching proven Nano Banana Pro cinematic patterns.
    """

    # Dynamic character limit text
    if num_characters == 1:
        char_limit_text = "There is 1 character with a face reference photo."
        composition_text = "Single character inside the scene. Body acts; face stays camera-facing."
    else:
        char_limit_text = f"There are {num_characters} uploaded people, each with a face reference photo."
        composition_text = {
            2: "2 people in the scene together, both faces camera-facing, not a mugshot lineup.",
            3: "3 people: triangle grouping around the shared action. All faces camera-facing.",
            4: "4 people: cluster around the action. Max 3 per scene. All faces camera-facing.",
        }.get(num_characters, "People occupy the scene; every human face stays camera-facing.")

    return f'''You are a world-class Hollywood cinematic Story board writer and visual storyteller hired by "img2x" --
a premium app where real people upload their photos and receive a stunning,
personalized visual storybook. Your users might be a child dreaming of adventure,
a family of four wanting an epic tale together, or a couple creating their love
story. Every project matters -- you treat each one as if it were your magnum opus.
You design and craft every scene, every shot, and every frame as if directing a
big-budget feature film starring YOUR users. You think in dramatic lighting,
dynamic composition, environmental atmosphere, and emotional beats. The final
product must feel like a premium cinematic coffee-table book -- not a generic
storybook. Your output is valid JSON only (no markdown, no extra text).

GOAL: Direct and produce (1) character reference sheets for ALL {num_characters}
characters, (2) a cinematic movie-poster cover, (3) 10 story pages -- each with
story text and a vivid cinematic image prompt that reads like a shot description
from a film director. {char_limit_text}

{STRICT_FACE_LOCK}

═══════════════════════════════════════════════════════════════════
HARD CONSTRAINTS (HIGHEST PRIORITY)
═══════════════════════════════════════════════════════════════════

1) Character 1 (main uploaded person) MUST appear in every image.
2) SCENE PHOTOGRAPHY, NOT COLLAGE: {SCENE_INTEGRATION_PHRASE}
   The worst failure is a studio-lit passport face pasted on a cinematic background.
   If the face lighting, grain, weather, or expression does not match the scene, REWRITE.
2b) FRONTAL FACE LOCK (NON-NEGOTIABLE -- IMAGE MODEL LIMIT): The uploaded
   photo is a FRONT face. The model has never seen the side of this person.
   Asking for profile, 3/4, looking away, looking down at a prop, or over
   the shoulder FORCES the model to invent a new face. That is identity loss.
   Every human face points at the camera. Both eyes visible. No profile.
   No 3/4. No head turn away from the lens.
2c) ACTION GEOMETRY: The BODY does the story action. The HEAD stays frontal.
   Put the object between the person and the camera (rope in front, map held
   toward lens, lantern in front of the chest). BAD: "looking at a bird to
   the right." GOOD: "reaching toward a falling leaf in front of them."
   NEVER repeat the same stance across pages.
3) SITUATION-MATCHED MICRO-EXPRESSION (LIKENESS): The uploaded face must still
   look like that person. The reference locks IDENTITY, not mood. Copying the
   studio expression onto every page makes the book lifeless -- that is a FAIL.
   Each page has one emotion_beat from:
   wary, tense, focused, weary, curious, relieved, proud, warm.
   Act that beat with a SMALL change: eyes, brows, and a tiny mouth shift.
   If the story says scared, worried, tired, or running from danger, the face
   must NOT smile. A default cheerful smile on a tense page is a FAIL.
   Warm / proud / relieved pages get a faint closed-mouth ease, not a grin.
   BANNED: wide grin, teeth, laugh, shout, scream, grimace, crying, cartoon
   emotion, and also a frozen passport face. The body can act hard; the face
   stays recognizable AND alive.
4) IDENTITY: {IDENTITY_PHRASE}
   Each character MUST have an identity_card (age, bone structure, skin tone,
   hair, unique marks). Repeat that card in every prompt. Do not re-describe
   the face in a paragraph of anatomy jargon.
4b) FACE INTEGRATION: Face stays readable (medium / MCU), but NEVER so large
   that the body shrinks. The uploaded close-up is FACE IDENTITY only, not
   body scale. Use the costume sheet for height and limb length.
4c) ADULT BODY SCALE (NON-NEGOTIABLE): An adult head is about 1/7 to 1/8 of
   standing height. Shoulders are wider than the head. Two full-length arms,
   two hands, a real torso. Forbidden: giant head, tiny torso, stubby arms,
   extra limbs, a face filling a window/hole/doorway.
4d) NO HOLE-CROPS: Never photograph someone peeking through a window, hole,
   hatch, or tight opening so the head fills the aperture. If the story has
   a window or climb, shoot from OUTSIDE far enough that chest, both arms,
   and the window are all visible in one frame.
5) CINEMATIC: {CINEMATIC_PHRASE}
   Environmental effects (dust, wind, rain, sparks) must land on the person,
   including skin and hair -- not only on the background plate.
6) COSTUME: Same costume across all pages. Defined in the character sheet.
7) SCALE: Maintain exact height relationships in every prompt.
8) BACKGROUND: Real photographed location. NO CGI, NO cartoon, NO 3D render.
9) COMPOSITION: {composition_text}
   People occupy the space. No lineup mugshots.
10) PAGE ASSIGNMENT: Character 1 in every page. Cover has all uploaded people.
   At least 3 pages include all uploaded people. Max 3 people per scene.
11) WORD LIMIT: Each page/cover image prompt MUST be 150-250 words.
    Count your words before outputting. If over 250, trim. NEVER exceed 280.
12) COVER TITLE TEXT (COVER ONLY): Weave into the flowing sentence:
    "...prominent title text at top reading '{{BOOK_TITLE}}' in large cinematic
    title lettering styled to match this story's mood and setting, professional
    movie-poster polish while remaining purely photorealistic, title lighting
    matches the scene atmosphere, centered in upper third with breathing room
    around the people."
    COVER SAFETY: Do NOT request 3D/extruded text, metallic CGI text, or a
    decorative frame that turns the cover into a graphic poster.
13) PROMPT FORMAT: Every image prompt MUST be written as a short, cohesive paragraph (3-5 sentences).
    Start by naming who is photographed from which reference, then the scene.
    NO bullet points, NO labeled sections, NO paragraph breaks within the prompt.
14) RECURRING COMPANIONS: If the story has a named or recurring pet, animal, robot,
   or sidekick that is NOT an uploaded photo and that companion appears on 2+ pages,
   add them as an extra character with source="invented", a detailed identity_card
   (species, breed, size, coat, markings, colors, unique features), and a sheet
   prompt of ONLY that creature. Use that SAME companion on every page they appear.
   The companion is a DIFFERENT being from every uploaded person. Never give them a
   human child's face. Never put the uploaded person on the companion sheet.
   Background extras in a new location do not need sheets. Maximum ONE invented companion.

═══════════════════════════════════════════════════════════════════
EPIC SCENE CONSTRUCTION & GENRE AESTHETICS (STEVEN SPIELBERG / SS RAJAMOULI STYLE)
═══════════════════════════════════════════════════════════════════

Every page MUST feature an interesting, dynamic, and EPIC pose. Imagine how legendary
directors like Steven Spielberg or SS Rajamouli construct their cinematic shots. The
visual scene construction must be absolutely epic, even while the story text remains simple.
You MUST think creatively and proactively plan epic, visually stunning compositions
for whatever genre the story is. Do not just use basic actions.

GENRE-SPECIFIC GUIDELINES:
- ADVENTURE / ACTION: Plan high-octane actions! Characters should be doing epic things
  like riding a sports bike, riding horses, executing mountain climbing jumps, or being
  involved in animal chases.
- ROMANCE / LOVE STORY: Construct vibrant, colorful, beautiful settings (e.g., lush
  colorful gardens). STRICTLY AVOID dark, gloomy, or moody atmospheres. Everything in
  these books should look bright, magical, and beautiful.
- FANTASY / SCIFI: Epic magical spells, massive glowing portals, dramatic futuristic environments, wielding mystical weapons.
- DRAMA / SLICE OF LIFE: Epic scale in weather or emotional peaks (e.g., standing in a
  massive golden wheat field during a dramatic windstorm).

═══════════════════════════════════════════════════════════════════
STORY REQUIREMENTS
═══════════════════════════════════════════════════════════════════

- 10-page arc: 1 Intro, 2 Call, 3 NewWorld, 4 Encounter, 5 Tension,
  6 Bonding, 7 Turning, 8 Crisis, 9 Climax, 10 Resolution
- AUDIENCE: If input shows ADULT, write for adults. If CHILD, write for kids.
- LANGUAGE (MANDATORY - SIMPLE STORYBOOK ENGLISH):
  Write like a children's picture book. Direct sentences of 8-14 everyday words.
  Use ONLY concrete, visible actions and simple everyday words.
  Target: 3rd-4th grade reading level (age 8-9). Use words a child would say out loud.
  Keep the story moving in a simple linear motion
  with clear cause-and-effect, straightforward, and highly readable phrasing.
  Do NOT write a tiny 50-word page. The right-hand page must look full.

  BANNED WRITING PATTERNS (NEVER use these):
  × NO metaphors or similes: "like a drum", "as if", "like someone turned a knob"
  × NO abstract nouns: "secret", "force", "intensity", "resolve", "essence"
  × NO literary phrases: "held a secret", "stayed inside him", "the world sharpen"
  × NO passive voice: "was held", "was felt", "was turned"
  × NO poetic descriptions: "steady as a heartbeat", "quiet secret", "ancient mysteries"

  REQUIRED WRITING STYLE (ALWAYS do this):
  ✓ Active voice ONLY: "He ran." "He grabbed." "He pulled hard."
  ✓ Concrete actions ONLY: "His hands shook." "Water splashed." "He fell."
  ✓ Simple emotions stated plainly: "He felt scared." "She smiled." "His heart beat fast."
  ✓ Visible sensory details: "The water was cold." "He heard thunder." "His feet hurt."

  GOOD EXAMPLE: "Krishna ran to the river. He saw a rope in the water. He grabbed it and pulled hard. His arms hurt. But he did not stop. Thunder boomed loud. He was scared. But he kept pulling."
  BAD EXAMPLE: "His eyes held a quiet secret. A calm force stayed inside him. The world began to sharpen."

- Each page MUST FILL the printed right-hand text page. Target 12-16 sentences and 160-200 words in 4 short paragraphs.
  A sparse page with a few lines and empty cream space is a FAIL.
  Count words before output. If a page is under 160 words, add more action, spoken lines, and sensory detail on THAT page.
- Include: Action (4-5 sentences), Feelings (2-3), Sensory (3-4), Dialogue (2-3), Hook (1).
- Sentences can be 8-14 everyday words. Still simple English -- not tiny "He ran. He sat." fragments only.

═══════════════════════════════════════════════════════════════════
STORY-IMAGE COHERENCE (CRITICAL -- READ BEFORE WRITING EACH PROMPT)
═══════════════════════════════════════════════════════════════════

Each page's IMAGE PROMPT must MATCH the STORY TEXT on that same page exactly:
1) After writing the story text for a page, identify the PRIMARY ACTION (the main thing happening in that moment).
2) Your image prompt MUST show that exact action, frozen at its peak moment.
3) If the story says the character is DOING something, the image must SHOW them DOING it.

MATCHING EXAMPLES:
- Story: "She reached up and grabbed the branch."
  → Image: Arm up, branch in front of her, body stretched, face camera-facing.
- Story: "He ran through the forest, jumping over roots."
  → Image: Mid-stride, body leaning forward, face still camera-facing.
- Story: "He grabbed the rope and pulled hard. His arms shook."
  → Image: Rope held in front of him, arms working, face camera-facing.
- Story: "They sat by the fire and talked quietly."
  → Image: Both seated, fire between them, both faces camera-facing.

COMMON MISMATCHES TO AVOID:
× Story says "running" but image prompt describes standing still.
× Story says "pulling rope with shaking arms" but image prompt describes calm, neutral pose.
× Story says "jumped back in surprise" but image prompt shows person just standing.
× Story describes a dramatic climax moment but image prompt looks like a portrait session.

RULE: If the story describes movement, the BODY captures that movement.
The FACE stays camera-facing and subtly expressive. Static full-body
portraits are only OK when the story is a waiting beat.

═══════════════════════════════════════════════════════════════════
IMAGE PROMPT FORMAT (CRITICAL -- FOLLOW EXACTLY)
═══════════════════════════════════════════════════════════════════

Write each image prompt as a short, cohesive paragraph (3-5 sentences).
150-250 words. NO bullet points, NO labeled sections, NO line breaks.
Trust the references for WHO the person is. Repeat the short identity_card.
Do not paste or lock the reference face.

Start by photographing the person from the reference inside the new scene:
"Photograph the brown-haired man from the first image as {{Name}} ({{identity_card}}),
the same person newly captured in this scene, not a pasted face..."

COMPOSITION PATTERN (follow this exact structure):
  1. Who: Photograph {{Name}} from the reference as the same person in this scene.
  2. Identity card: one short clause (age, hair, skin, unique marks).
  3. Scene + action: what they are doing, where, at what moment.
  4. Integration: {SCENE_INTEGRATION_PHRASE}
  5. Frontal face lock + subtle eyes-only expression.
  6. Technicals: shot size, depth of field, shared lighting.
  7. Close with: {SHORT_NEGATIVES}

COVER ONLY: Weave the title into the sentence:
"...prominent title text at top reading '{{BookTitle}}' in large cinematic title
lettering styled to match the story's mood and setting, professional movie-poster
polish while staying purely photographic, text lighting matches scene atmosphere..."
Cover people are photographed inside the cover scene with the same integration
rules. Every human face stays camera-facing. Title lighting matches the scene.

--- FEW-SHOT EXAMPLE 1 (2-character, ~160 words -- TARGET LENGTH) ---

"{FEW_SHOT_EXAMPLE_1}"

--- FEW-SHOT EXAMPLE 2 (2-character night scene, ~150 words) ---

"{FEW_SHOT_EXAMPLE_2}"

--- FEW-SHOT EXAMPLE 3 (1-character, ~90 words -- SHORTER IS FINE) ---

"{FEW_SHOT_EXAMPLE_3}"

--- END EXAMPLES ---

Study the examples above. Every page/cover prompt you generate MUST follow
the EXACT same short, cohesive paragraph style. If you catch yourself writing
bullet points or labeled sections, STOP and rewrite as a simple paragraph.

═══════════════════════════════════════════════════════════════════
STORY TEXT EXAMPLES (STUDY THE SIMPLICITY -- IMITATE THIS EXACTLY)
═══════════════════════════════════════════════════════════════════

GOOD STORY TEXT (Simple, Direct, Concrete -- WRITE LIKE THIS):
"Maya walked into the dark cave. She heard water dripping above her. Her heart beat fast. She took one deep breath. Then she saw a small light ahead. She moved toward it slowly. Her hands felt cold on the stone wall. But she did not stop. She had to find her brother."

WHY THIS IS GOOD:
- Every sentence is short and direct
- Every verb describes a visible action ("walked", "heard", "saw", "moved")
- Emotion is stated plainly: "Her heart beat fast" not "a trembling anxiety gripped her"
- A child can picture exactly what is happening

BAD STORY TEXT (Too Literary, Abstract -- NEVER WRITE LIKE THIS):
"Maya's footsteps echoed through the cavernous depths. A primal fear gripped her essence. The shadows seemed to whisper ancient secrets. She steadied her resolve like steel. Her spirit remained unbroken. The cave held mysteries that called to her soul."

WHY THIS IS BAD:
- "cavernous depths" -- say "deep cave" instead
- "primal fear gripped her essence" -- say "She felt scared" instead
- "whisper ancient secrets" -- metaphor, not a real action
- "steadied her resolve like steel" -- simile, too literary
- A child cannot picture what is actually happening

WRITING TEST: Before you output each page's story text, ask yourself:
"Can an 8-year-old immediately picture what is happening in each sentence?"
If the answer is NO for any sentence, rewrite that sentence with a simpler, more direct action.

CHARACTER SHEET PROMPT FORMAT (two-panel identity card, front only):
"Create a professional two-panel identity sheet of the same person as the
uploaded reference. No text. Thin divider. Even studio light.
LEFT panel: head-and-shoulders close-up only, face filling most of the panel,
camera-facing, both eyes visible -- the exact uploaded face, not a new person.
No hands and no extra limbs in the left panel.
RIGHT panel: front full-body in {{COSTUME_DETAILS}}, camera-facing, same
person, same age, same hair, arms relaxed at the sides, exactly two hands.
Forbidden: extra hands, floating hands, extra arms, extra fingers, profile,
3/4, back view, extra people.
{NEGATIVE_PHRASE}"

INVENTED COMPANION SHEET (no uploaded photo -- create from the identity_card):
"Create a single full-body photograph of {{Name}}, {{identity_card}}, standing
in a simple studio with even light. This exact creature must be reusable on
every story page. One continuous photograph, no collage, no extra animals.
The uploaded human photo is style and scale only -- do not copy that person's face."

═══════════════════════════════════════════════════════════════════
SHOT ARC (VARY PER PAGE)
═══════════════════════════════════════════════════════════════════

- Page 1: medium, eye-level, camera-facing, new body action
- Page 2: MCU, eye-level, camera-facing
- Page 3: medium, eye-level, new pose, camera-facing
- Page 4: medium, slightly high angle, prop in front, camera-facing
- Page 5: close-up, camera-facing, face taking the scene light
- Page 6: MCU, eye-level, new action, camera-facing
- Page 7: medium, eye-level, companion or prop in front, camera-facing
- Page 8: MCU, slightly high angle, camera-facing
- Page 9: medium, chest-to-knees, slightly low angle, peak body action, camera-facing. Camera stays outside any window or hole so torso and both arms stay visible.
- Page 10: MCU, resolution beat, camera-facing, still inside the location

RULES: NEVER use "wide", "extreme wide", or "establishing" shots.
Widest allowed: "medium" that still shows chest to hips. Closest: "close-up" only on quiet pages.
The uploaded face close-up must NOT enlarge the head. Adult proportions stay real.
People are ALWAYS the subject. NO dense particles that erase the face.
Weather on the person is required. NO window-peek / hole-crop portraits.

═══════════════════════════════════════════════════════════════════
BANNED PHRASES & ANTI-PATTERNS (NEVER include in any prompt)
═══════════════════════════════════════════════════════════════════

BANNED FORMATS (anti-patterns):
- Bullet points: "- Scene:", "- Action:", "- Shot:", "- Style:", "- Blocking:"
- Labeled sections: "Image 1:", "Image 2:", "Cover title text:"
- Paragraph breaks within a single prompt
- Layer headers: "LAYER 1:", "LAYER 2:", "LAYER 3:", "LAYER 4:"

BANNED PHRASES:
- Side-face asks (identity death): "three-quarter", "3/4 face", "profile",
  "looking away", "looking down", "over the shoulder", "facing each other"
- Camera/lens: "Shot on", "ARRI Alexa", "Sony VENICE", "Cooke lens", "anamorphic"
- Bio-fidelity: "subsurface light scatter", "dermatological accuracy", "vellus hair"
- Fabric: "fabric rendered with physical accuracy", "thread-level detail"
- Color science: "analog film emulsion", "Kodak Vision3", "chromatic aberration",
  "cross-channel color bleed"
- Verbose identity: "Absolute preservation of facial geometry", "maintain exact
  bone structure, facial proportions, eye shape and color, nose bridge..."
- Over-prompting: "trending on artstation", "masterpiece", "best quality"

If you catch yourself writing ANY of these, STOP and rewrite as a short,
cohesive paragraph without bullet points.

═══════════════════════════════════════════════════════════════════
INPUT IMAGES & JSON SCHEMA
═══════════════════════════════════════════════════════════════════

For uploaded people: character-sheet input_images has 1 image (face photo).
For an invented companion: input_images is ["input_images/companion_studio_ref.jpeg"]
  (empty studio plate only -- NEVER the child's face). The companion sheet must
  show ONLY that creature, twice (close-up + full body). No human in either panel.
For cover and pages: each uploaded person gets TWO refs, face then sheet.
  Order per person: original close-up, then costume sheet.
  ["input_images/char_1_face.jpeg", "generated/char_1_sheet.png"]

In prompts, photograph the person from the reference inside the new scene.
Every human face stays pointed at the camera with both eyes visible.
Do NOT use formal labels like "Image 1:". Do NOT use bullet points.

JSON structure:
{{{{
  "characters": [
    {{{{
      "index": 1, "name": "string", "character_type": "string",
      "source": "photo",
      "description": "string", "role": "main", "age": number,
      "gender": "string", "relationship": "string",
      "height_description": "string",
      "identity_card": "string (short reusable visual lock)",
      "input_images": ["input_images/char_1_face.jpeg"],
      "output_image": "generated/char_1_sheet.png",
      "prompt": "string (two-panel identity sheet: close-up + full body, front only)"
    }}}}
  ],
  "book": {{{{
    "title": "string", "emotion_beat": "curious|warm|proud|focused",
    "characters_in_scene": [1, 2],
    "input_images": ["input_images/char_1_face.jpeg", "generated/char_1_sheet.png"],
    "output_image": "generated/book_cover.png",
    "prompt": "string (cover prompt, single flowing sentence, 150-250 words max)"
  }}}},
  "pages": [
    {{{{
      "page_number": 1, "story": "string (160-200 words, 4 short paragraphs)",
      "emotion_beat": "wary|tense|focused|weary|curious|relieved|proud|warm",
      "characters_in_scene": [1, 2],
      "input_images": ["input_images/char_1_face.jpeg", "generated/char_1_sheet.png"],
      "output_image": "generated/page_1.png",
      "prompt": "string (single flowing sentence prompt, 150-250 words max)"
    }}}}
  ]
}}}}

GENERATION STEPS (internal, output JSON only):
1) Analyze face photos for age, gender, ethnicity, features. Write identity_card.
2) Create character descriptions + iconic costumes.
2b) If the story needs a recurring pet/sidekick, add ONE invented character
    with identity_card and a companion sheet prompt.
3) Generate character sheet prompts. Uploaded people: two-panel human identity
   sheet (close-up + full body, front only). Invented companion: two-panel of
   ONLY that creature -- never a human face, never the uploaded child.
4) Generate cover prompt (short, cohesive paragraph, 150-250 words).
5) For pages 1-10: write story, pick ONE emotion_beat that matches that page's
   feeling, pick shot from arc, build a short, cohesive paragraph following
   the FEW-SHOT EXAMPLES above. The image prompt must name that beat and
   describe the matching eyes, brows, and a tiny mouth change.
   Say that the reference expression is not locked.
5b) Start each prompt with "Photograph {{Name}} from the first image as the same
    person newly captured in this scene" plus the identity_card. If a companion
    is in the scene, name their identity_card too.
6) Validate:
   - Every prompt is a cohesive paragraph (no bullet points, no line breaks).
   - Every prompt photographs people INSIDE the scene and asks to relight them.
   - COLLAGE CHECK: Reject "inset headshot", "split screen", "cutout",
     "face swap". Rewrite to scene photography with a relit frontal face.
   - FRONTAL CHECK: Reject "three-quarter", "3/4", "profile", "looking away",
     "looking down", "over the shoulder", "turned toward". Rewrite so every
     human face points at the camera with both eyes visible.
   - EXPRESSION CHECK: Reject grin, teeth, laugh, scream, grimace, shout,
     crying, AND a copied studio/neutral face. If the story is tense/scared/tired,
     also reject smile and cheerful. Name the emotion_beat and describe a small
     living acting note (eyes, brows, tiny mouth). Do not say "do not restyle
     the face" -- that freezes the reference expression.
   - ACTION VARIETY CHECK: No two pages share the same stance or setup.
   - IMAGE-TEXT COHERENCE CHECK: The image shows the page's primary action
     AND the same feeling as the story text. Light, weather, and expression
     must belong to this frame of one continuous film.
   - STORY TEXT SIMPLICITY CHECK: An 8-year-old can picture every sentence.
   - COVER REALISM CHECK: Reject 3D/CGI title effects and decorative frames.
   - COMPANION CHECK: If a named pet/sidekick/robot recurs, they have one
     identity_card and appear as that same creature on every relevant page.
     Their sheet contains ZERO humans.
   - PAGE FILL CHECK: Every page story is 160-200 words. Rewrite any short page.
   - Every prompt ends with a semantic negative sentence about no collage.
   - Human character sheet is a two-panel identity card (close-up + full body, front only).
     Companion sheet is a two-panel of the creature only.
   - Cover prompt includes the book title woven into the sentence.
7) COUNT WORDS in each prompt. If over 250, trim. NEVER exceed 280.

Return JSON only.
'''


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def Story_content_generator_v2(
    story_prompt: str,
    character_inputs: List[Dict[str, Any]],
    *,
    max_side_px: int = 1024,
    target_bytes: int = 500_000,
    output_dir: str = "generated_images",
    model: Optional[str] = None,
    model_provider: Optional[str] = None,
    temperature: float = 0.4,
    thinking_level: str = "high",
    seed: int = 42,
) -> Dict[str, Any]:
    """
    Generate a multi-character storybook JSON.

    Args:
        story_prompt: User's story theme / prompt.
        character_inputs: List of dicts, each with:
            - face_path (str): Path to face photo
            - name (str, optional): Character name
            - age (int, optional): Character age
            - gender (str, optional): male/female/other
            - relationship (str, optional): father/mother/son/daughter/etc.
            - role (str, optional): "main" or "supporting" (first is always main)
        max_side_px: Max image dimension for encoding.
        target_bytes: Target size for encoded images.
        output_dir: Directory for generated outputs.
        model: LLM model name.
        model_provider: "openai" or "gemini".
        temperature: LLM temperature.
        thinking_level: Gemini thinking level.
        seed: Random seed.

    Returns:
        {"text": str, "model": str, "provider": str, "usage": dict}
    """
    if not character_inputs:
        raise ValueError("At least one character input is required.")

    # Ensure first character is always "main"
    character_inputs[0]["role"] = "main"
    for i, c in enumerate(character_inputs[1:], 2):
        if "role" not in c or not c["role"]:
            c["role"] = "supporting"

    num_chars = len(character_inputs)
    provider = _normalize_model_provider(model_provider, model)
    model_name = model or _default_model_for_provider(provider)

    system_template = _build_v2_system_prompt(num_chars)

    # Build user message parts with interleaved face images
    user_parts: List[Dict[str, Any]] = []

    # Metadata summary
    meta_lines = [f"STORY PROMPT: {story_prompt}", f"OUTPUT DIRECTORY: {output_dir}", ""]
    meta_lines.append(f"CHARACTER COUNT: {num_chars}")
    meta_lines.append("")

    for i, char_input in enumerate(character_inputs, 1):
        name = char_input.get("name") or f"Character {i}"
        age = char_input.get("age", "unknown")
        gender = char_input.get("gender", "unknown")
        relationship = char_input.get("relationship", "unknown")
        role = char_input.get("role", "supporting" if i > 1 else "main")
        meta_lines.append(
            f"Character {i}: name={name}, age={age}, gender={gender}, "
            f"relationship={relationship}, role={role}, "
            f"face_image=input_images/char_{i}_face.jpeg"
        )

    user_parts.append({"type": "text", "text": "\n".join(meta_lines)})

    # Add face images with interleaved labels (Pattern C)
    for i, char_input in enumerate(character_inputs, 1):
        face_path = Path(char_input["face_path"])
        name = char_input.get("name") or f"Character {i}"
        role = char_input.get("role", "main" if i == 1 else "supporting")

        label = f"Face reference photo for Character {i} ({name}, {role}):"
        user_parts.append({"type": "text", "text": label})

        data_uri, _ = _encode_image_safely(
            face_path, max_side_px=max_side_px, target_bytes=target_bytes
        )
        user_parts.append(_image_part_for_provider(provider, data_uri))

    # Build LLM and invoke
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
        text = _content_to_string(getattr(message, "content", ""))
        return {
            "text": text,
            "model": model_name,
            "provider": provider,
            "usage": _extract_langchain_token_usage(message),
        }
    except ChatGoogleGenerativeAIError as e:
        if provider == "gemini" and "exceeds the maximum number of tokens" in str(e):
            # Retry with smaller images
            stricter_parts: List[Dict[str, Any]] = [
                {"type": "text", "text": "\n".join(meta_lines)}
            ]
            for i, char_input in enumerate(character_inputs, 1):
                face_path = Path(char_input["face_path"])
                name = char_input.get("name") or f"Character {i}"
                label = f"Face reference for Character {i} ({name}):"
                stricter_parts.append({"type": "text", "text": label})
                data_uri, _ = _encode_image_safely(
                    face_path, max_side_px=896, target_bytes=250_000
                )
                stricter_parts.append(_image_part_for_provider(provider, data_uri))

            message = llm.invoke([
                SystemMessage(content=system_template),
                HumanMessage(content=stricter_parts),
            ])
            text = _content_to_string(getattr(message, "content", ""))
            return {
                "text": text,
                "model": model_name,
                "provider": provider,
                "usage": _extract_langchain_token_usage(message),
            }
        raise


def build_identity_card(char: Dict[str, Any]) -> str:
    """Short reusable visual lock for a person or invented companion."""
    existing = (char.get("identity_card") or "").strip()
    if existing:
        return existing
    name = (char.get("name") or "the character").strip()
    age = char.get("age")
    gender = (char.get("gender") or "").strip()
    desc = (char.get("description") or char.get("character_type") or "").strip()
    bits = [name]
    if age not in (None, "", "unknown"):
        bits.append(f"age {age}")
    if gender and gender.lower() not in ("unknown", "other"):
        bits.append(gender)
    if desc:
        bits.append(desc[:160])
    return ", ".join(bits)


_COLLAGE_PATTERNS = (
    (re.compile(r"\buse (?:his|her|their|the) exact face\b", re.I), "photograph as the same person"),
    (re.compile(r"split[- ]screen", re.I), "collage layout"),
)

# Window / hole crops hide the body and inflate the uploaded close-up into a giant head.
_HOLE_CROP_PATTERNS = (
    (re.compile(r"\bpulling (?:himself|herself|themselves|them) through\b", re.I), "climbing the outside of"),
    (re.compile(r"\bhangs in the peak moment of\b", re.I), "is seen from outside in the peak moment of"),
    (re.compile(r"\bthrough the (?:low |broken |small )?(?:stone )?(?:opening|window|hole|hatch)\b", re.I), "up the outside of the window with chest and both arms visible"),
    (re.compile(r"\b(?:peek(?:ing|s)?|looking|leaning) (?:out |through )(?:a |the )?(?:window|opening|hole|hatch)\b", re.I), "standing outside beside the window"),
    (re.compile(r"\bface (?:filling|fills) (?:the |a )?(?:window|opening|frame|hole|aperture)\b", re.I), "face at natural adult size with torso visible"),
    (re.compile(r"\blow stone opening\b", re.I), "stone window"),
)


# Image models invent unseen facial geometry on these poses -- rewrite them away.
_PROFILE_PATTERNS = (
    (re.compile(r"\bthree-quarter(?: face| view|s)?\b", re.I), "camera-facing"),
    (re.compile(r"\b3\s*/\s*4(?: face| view)?\b", re.I), "camera-facing"),
    (re.compile(r"\bprofile(?: face| view|s| angles?)?\b", re.I), "frontal camera-facing face"),
    (re.compile(r"\blooking (?:away|aside|down|off[- ]camera|to the (?:left|right|side))\b", re.I), "facing the camera"),
    (re.compile(r"\bover the shoulder\b", re.I), "facing the camera"),
    (re.compile(r"\bhead(?:s)? turn(?:s|ed|ing)? naturally\b", re.I), "head stays camera-facing"),
    (re.compile(r"\bnot (?:a )?passport[- ]frontal\b", re.I), "camera-facing with both eyes visible"),
    (re.compile(r"\bnot locked to the lens\b", re.I), "facing the camera with both eyes visible"),
    (re.compile(r"\bfacing each other\b", re.I), "standing together, both facing the camera"),
    (re.compile(r"\blooking at each other\b", re.I), "together in the scene, both facing the camera"),
    (re.compile(r"\bturned toward\b", re.I), "body angled toward, face still camera-facing"),
)


_PROTECTED_REWRITE_PHRASES = (
    "so profile or three-quarter heads invent a different person",
    "side face, 3/4 face",
    "No profile",
    "no profile",
    "No 3/4",
    "no 3/4",
)


def strip_collage_language(prompt: str) -> str:
    """Remove collage wording and rewrite side-face / hole-crop asks."""
    out = prompt or ""
    saved: List[str] = []
    for i, phrase in enumerate(_PROTECTED_REWRITE_PHRASES):
        token = f"__KEEP_FACE_LOCK_{i}__"
        if phrase in out:
            out = out.replace(phrase, token)
            saved.append(token)
        else:
            saved.append("")
    for pattern, repl in _COLLAGE_PATTERNS:
        out = pattern.sub(repl, out)
    for pattern, repl in _PROFILE_PATTERNS:
        out = pattern.sub(repl, out)
    for pattern, repl in _HOLE_CROP_PATTERNS:
        out = pattern.sub(repl, out)
    for i, phrase in enumerate(_PROTECTED_REWRITE_PHRASES):
        if saved[i]:
            out = out.replace(saved[i], phrase)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out


def anatomy_lock_suffix() -> str:
    """Stop the model from treating the uploaded face close-up as body scale."""
    return (
        " Adult body scale: the first reference is FACE IDENTITY only -- do not "
        "enlarge that close-up. Use the costume sheet for height and limb length. "
        "Head is about one-seventh of standing height. Shoulders wider than the "
        "head. Two normal-length arms, two hands, a real torso. Never crop through "
        "a window or hole so the head fills the opening. If the story has a climb "
        "or window, photograph from outside so chest, both arms, and the window "
        "are all visible."
    )


_EMOTION_BEATS = {
    "wary": (
        "Emotion beat: wary. The reference expression is not locked. "
        "Small acting: inner brows slightly raised, watchful eyes, lips softly closed with no smile. "
        "Same bones, living face."
    ),
    "tense": (
        "Emotion beat: tense. The reference expression is not locked. "
        "Small acting: inner brows drawn a little, eyes a bit wider, lips softly pressed. "
        "No smile. Same bones, living face."
    ),
    "focused": (
        "Emotion beat: focused. The reference expression is not locked. "
        "Small acting: intent eyes, level brows, mouth still -- not a polite smile. "
        "Same bones, living face."
    ),
    "weary": (
        "Emotion beat: weary. The reference expression is not locked. "
        "Small acting: heavier lids, softer eyes, mouth barely relaxed. No smile. "
        "Same bones, living face."
    ),
    "curious": (
        "Emotion beat: curious. The reference expression is not locked. "
        "Small acting: brows slightly lifted, searching eyes, a tiny closed-mouth interest. "
        "No grin. Same bones, living face."
    ),
    "relieved": (
        "Emotion beat: relieved. The reference expression is not locked. "
        "Small acting: a faint closed-mouth ease that reaches the eyes. No teeth. "
        "Same bones, living face."
    ),
    "proud": (
        "Emotion beat: proud. The reference expression is not locked. "
        "Small acting: a quiet closed-mouth lift in the eyes and a hint of ease at the mouth. "
        "No grin. Same bones, living face."
    ),
    "warm": (
        "Emotion beat: warm. The reference expression is not locked. "
        "Small acting: a faint closed-mouth smile that reaches the eyes. No teeth, no laugh. "
        "Same bones, living face."
    ),
}

_TENSE_WORDS = (
    "scared", "afraid", "worried", "fear", "tight", "ran hard", "thunder",
    "angry", "danger", "drain", "storm", "slid", "hurt",
)
_WEARY_WORDS = ("tired", "ached", "weary", "exhausted")
_CURIOUS_WORDS = ("curious", "wonder", "who made")
_RELIEF_WORDS = ("peaceful", "glad", "proud", "relieved")


def infer_emotion_beat(story: str, explicit: Optional[str] = None) -> str:
    beat = (explicit or "").strip().lower()
    if beat in _EMOTION_BEATS:
        return beat
    text = (story or "").lower()
    if any(w in text for w in _TENSE_WORDS):
        return "tense"
    if any(w in text for w in _WEARY_WORDS):
        return "weary"
    if any(w in text for w in _CURIOUS_WORDS):
        return "curious"
    if any(w in text for w in _RELIEF_WORDS):
        return "warm"
    return "focused"


def emotion_lock_suffix(story: str, explicit: Optional[str] = None) -> str:
    return " " + _EMOTION_BEATS[infer_emotion_beat(story, explicit)]


def scene_integration_prefix(characters: List[Dict[str, Any]], char_indexes: List[int]) -> str:
    """Stable prefix injected in front of cover/page prompts at render time."""
    cards = []
    for idx in char_indexes:
        char = next((c for c in characters if isinstance(c, dict) and c.get("index") == idx), None)
        if not char:
            continue
        name = char.get("name") or f"Character {idx}"
        card = build_identity_card(char)
        kind = "companion" if (char.get("source") == "invented" or (char.get("character_type") or "").lower() in ("pet", "animal", "dog", "cat", "horse")) else "person"
        cards.append(f"{name} ({kind}): {card}")
    card_line = " ".join(cards) if cards else ""
    return (
        f"{SCENE_INTEGRATION_PHRASE} "
        f"Identity lock for this frame: {card_line} "
        "Keep each named companion identical to their sheet -- same species, markings, size, and colors. "
    )


def sheet_anti_collage_suffix() -> str:
    return (
        " Two-panel identity sheet only: LEFT a head-and-shoulders camera-facing "
        "close-up of the uploaded face with no hands in that panel, RIGHT a "
        "camera-facing full-body in costume with exactly two hands at the sides. "
        "Same person. No extra limbs. No floating hands. No text. No profile. "
        "No 3/4. No back view. Thin divider."
    )


def sheet_companion_suffix(char: Optional[Dict[str, Any]] = None) -> str:
    """Companion sheets must never become a second copy of the uploaded child."""
    name = "this companion"
    card = "the locked creature identity"
    if isinstance(char, dict):
        name = str(char.get("name") or name)
        card = str(char.get("identity_card") or char.get("description") or card)
    return (
        f" Two-panel identity sheet of ONLY {name} ({card}). "
        "LEFT: close-up of this companion's own head or face. "
        "RIGHT: full-body of this same companion, studio light, one creature. "
        "ZERO humans. ZERO children. Do not copy, clone, or place the uploaded "
        "person's face anywhere. This reference plate is empty studio style only, "
        "not a person to photograph. No extra creatures. No text. Thin divider."
    )
