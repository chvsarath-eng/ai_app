"""
Neumorphism Storybook Generator
Creates a beautiful split-layout storybook with neumorphic design.
Single HTML file with all images embedded as base64.
Matches the style of story_book_neumorphism_ALL_IN_ONE.html
"""

import json
import base64
import sys
from pathlib import Path
from PIL import Image
from io import BytesIO

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass


def image_to_base64(image_path: str, max_dimension: int = 1400, quality: int = 85) -> str:
    """Converts image to optimized base64 data URI."""
    try:
        if not Path(image_path).exists():
            print(f"⚠️  Image not found: {image_path}")
            return ""
        
        with Image.open(image_path) as img:
            if img.mode in ('RGBA', 'P', 'LA'):
                img = img.convert('RGB')
            
            width, height = img.size
            if width > max_dimension or height > max_dimension:
                img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
            
            buffer = BytesIO()
            img.save(buffer, format='JPEG', quality=quality, optimize=True)
            buffer.seek(0)
            
            encoded = base64.b64encode(buffer.read()).decode('utf-8')
            return f"data:image/jpeg;base64,{encoded}"
    
    except Exception as e:
        print(f"❌ Error processing {image_path}: {e}")
        return ""


def create_placeholder_base64() -> str:
    """Creates a placeholder image."""
    img = Image.new('RGB', (800, 800), color='#e0e5ec')
    buffer = BytesIO()
    img.save(buffer, format='JPEG', quality=50)
    buffer.seek(0)
    encoded = base64.b64encode(buffer.read()).decode('utf-8')
    return f"data:image/jpeg;base64,{encoded}"


def create_storybook_html(
    json_path: str = "story_data.json",
    output_path: str = "storybook.html",
    images_dir: str = "generated_images"
) -> None:
    """Generates a neumorphism-style storybook HTML."""
    
    if not output_path.lower().endswith('.html'):
        output_path = output_path + ".html"
    
    base_dir = Path(json_path).resolve().parent

    print(f"📖 Loading story data...")
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            story = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load story data: {e}")
        return

    print(f"🎨 Embedding images...")
    
    placeholder = create_placeholder_base64()
    
    def resolve_and_encode(original_path_str: str) -> str:
        import os
        clean_path = original_path_str.replace('generated/', '').replace('/', os.sep)
        
        paths_to_try = [
            # 1) Relative to the JSON's folder (production-safe)
            str(base_dir / clean_path),
            str(base_dir / images_dir / os.path.basename(clean_path)),
            str(base_dir / original_path_str),

            # 2) Back-compat with notebook-style relative execution
            clean_path,
            os.path.join(images_dir, os.path.basename(clean_path)),
            original_path_str,
        ]
        
        for path in paths_to_try:
            if Path(path).exists():
                result = image_to_base64(path)
                if result:
                    return result
        
        print(f"⚠️  Could not find: {original_path_str}")
        return placeholder

    # Process images
    cover_b64 = resolve_and_encode(story['book']['output_image'])
    
    page_data = []
    for page in story['pages']:
        print(f"   Page {page['page_number']}...")
        page_b64 = resolve_and_encode(page['output_image'])
        page_data.append({
            'number': page['page_number'],
            'story': page['story'],
            'image': page_b64
        })

    book_title = story['book']['title']
    total_pages = len(page_data)
    
    # Build pages JavaScript array
    pages_js = json.dumps(page_data, ensure_ascii=False)
    
    print(f"⚡ Generating neumorphism HTML...")
    
    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="StoryBook">
    <title>{book_title}</title>
    <style>
        /* ============================================
           TRUE NEUMORPHISM + GLASSMORPHISM BLEND
           ============================================ */
        
        :root {{
            --bg-color: #e0e5ec;
            --bg-lighter: #ecf0f3;
            --bg-darker: #d1d9e6;
            --shadow-light: #ffffff;
            --shadow-dark: #a3b1c6;
            --shadow-darker: #8b9bb4;
            --text-primary: #31344b;
            --text-secondary: #6c7486;
            --text-muted: #9aa0b0;
            --accent: #6c63ff;
            --accent-light: #8b85ff;
            --accent-dark: #5046e5;
            --accent-glow: rgba(108, 99, 255, 0.5);
            --gradient-primary: linear-gradient(145deg, #7c74ff, #5b52e0);
            --gradient-glass: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.1) 100%);
            --neu-raised: 8px 8px 16px var(--shadow-dark), -8px -8px 16px var(--shadow-light);
            --neu-raised-lg: 12px 12px 24px var(--shadow-dark), -12px -12px 24px var(--shadow-light);
            --neu-inset: inset 8px 8px 16px var(--shadow-dark), inset -8px -8px 16px var(--shadow-light);
            --neu-inset-deep: inset 10px 10px 20px var(--shadow-dark), inset -10px -10px 20px var(--shadow-light);
            --radius-xl: 32px;
            --radius-lg: 24px;
            --radius-md: 16px;
            --radius-sm: 12px;
            --font-main: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-font-smoothing: antialiased;
            -webkit-tap-highlight-color: transparent;
        }}

        html, body {{
            height: 100%;
            overflow: hidden;
        }}

        body {{
            font-family: var(--font-main);
            background: var(--bg-color);
            min-height: 100vh;
            min-height: 100dvh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }}

        /* ============================================
           MAIN CONTAINER
           ============================================ */
        .neu-container {{
            position: relative;
            z-index: 1;
            width: min(96vw, 1400px);
            height: min(92vh, 900px);
            background: var(--bg-color);
            border-radius: 40px;
            box-shadow: var(--neu-inset);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            padding: 24px;
        }}

        /* ============================================
           VIEW SYSTEM
           ============================================ */
        .view-stack {{
            position: relative;
            width: 100%;
            height: 100%;
            flex: 1;
        }}

        .view {{
            position: absolute;
            inset: 0;
            display: flex;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 0.5s ease, visibility 0.5s;
        }}

        .view.active {{
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
        }}

        /* ============================================
           SPLIT LAYOUT
           ============================================ */
        .split-layout {{
            flex: 1;
            display: flex;
            flex-direction: row;
            padding: 0;
            gap: 16px;
        }}

        /* IMAGE PANEL */
        .image-panel {{
            flex: 1.6;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        }}

        .story-image {{
            width: auto;
            height: auto;
            max-width: calc(100% - 24px);
            max-height: calc(100% - 24px);
            object-fit: contain;
            border-radius: 20px;
            padding: 12px;
            background: var(--bg-color);
            box-shadow: 
                8px 8px 16px #a3b1c6,
                -8px -8px 16px #ffffff,
                inset 2px 2px 4px rgba(255, 255, 255, 0.5),
                inset -2px -2px 4px rgba(0, 0, 0, 0.06);
            transition: all 0.3s ease, opacity 0.3s ease, transform 0.3s ease;
            cursor: zoom-in;
        }}

        .story-image:hover {{
            transform: translateY(-3px);
            box-shadow: 
                10px 10px 20px #a3b1c6,
                -10px -10px 20px #ffffff,
                inset 2px 2px 4px rgba(255, 255, 255, 0.6),
                inset -2px -2px 4px rgba(0, 0, 0, 0.08);
        }}

        .story-image:active {{
            transform: translateY(0);
            box-shadow: 
                inset 4px 4px 8px #a3b1c6,
                inset -4px -4px 8px #ffffff;
        }}

        /* CONTENT PANEL */
        .content-panel {{
            flex: 0.8;
            min-width: 300px;
            max-width: 380px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 36px 28px;
            margin: 8px;
            background: var(--bg-color);
            border-radius: 28px;
            box-shadow: 
                8px 8px 16px #a3b1c6,
                -8px -8px 16px #ffffff,
                inset 2px 2px 4px rgba(255, 255, 255, 0.3),
                inset -2px -2px 4px rgba(0, 0, 0, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.4);
        }}

        /* ============================================
           COVER PAGE - ANIMATED TITLE
           ============================================ */
        .cover-title {{
            font-size: clamp(1.8rem, 3vw, 2.5rem);
            font-weight: 800;
            line-height: 1.2;
            margin-bottom: 8px;
            letter-spacing: -0.03em;
            background: linear-gradient(
                135deg,
                var(--text-primary) 0%,
                var(--accent) 25%,
                var(--accent-light) 50%,
                var(--accent) 75%,
                var(--text-primary) 100%
            );
            background-size: 200% auto;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: shimmer 4s ease-in-out infinite;
        }}

        @keyframes shimmer {{
            0%, 100% {{ background-position: 0% center; }}
            50% {{ background-position: 200% center; }}
        }}

        .cover-title::after {{
            content: '';
            display: block;
            width: 60px;
            height: 4px;
            background: var(--gradient-primary);
            border-radius: 2px;
            margin: 16px auto 0;
            box-shadow: 0 2px 10px var(--accent-glow);
        }}

        .cover-subtitle {{
            font-size: clamp(0.9rem, 1.3vw, 1.1rem);
            color: var(--text-muted);
            font-weight: 500;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            margin-top: 24px;
            margin-bottom: 28px;
            opacity: 0;
            animation: fadeInUp 0.8s ease 0.5s forwards;
        }}

        @keyframes fadeInUp {{
            from {{
                opacity: 0;
                transform: translateY(10px);
            }}
            to {{
                opacity: 1;
                transform: translateY(0);
            }}
        }}

        /* ============================================
           BUTTONS
           ============================================ */
        .neu-btn {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px 32px;
            font-family: var(--font-main);
            font-size: 0.95rem;
            font-weight: 600;
            color: var(--text-secondary);
            background: var(--bg-color);
            border: none;
            border-radius: 50px;
            cursor: pointer;
            box-shadow: 6px 6px 12px var(--shadow-dark), -6px -6px 12px var(--shadow-light);
            transition: all 0.2s ease;
        }}

        .neu-btn:hover {{
            color: var(--accent);
        }}

        .neu-btn:active {{
            box-shadow: inset 4px 4px 8px var(--shadow-dark), inset -4px -4px 8px var(--shadow-light);
        }}

        .neu-btn-primary {{
            background: var(--gradient-primary);
            color: white;
            font-weight: 600;
            letter-spacing: 0.02em;
            box-shadow: 
                6px 6px 12px var(--shadow-dark),
                -6px -6px 12px var(--shadow-light),
                0 4px 20px var(--accent-glow);
            opacity: 0;
            animation: fadeInUp 0.8s ease 0.8s forwards;
        }}

        .neu-btn-primary:hover {{
            transform: translateY(-2px);
            box-shadow: 
                8px 8px 16px var(--shadow-dark),
                -8px -8px 16px var(--shadow-light),
                0 8px 28px var(--accent-glow);
        }}

        .neu-btn-primary:active {{
            transform: translateY(0);
            box-shadow: 
                inset 4px 4px 8px rgba(0,0,0,0.2),
                inset -4px -4px 8px rgba(255,255,255,0.1),
                0 2px 10px var(--accent-glow);
        }}

        /* ============================================
           STORY PAGE
           ============================================ */
        .page-indicator {{
            display: flex;
            align-items: center;
            justify-content: center;
            width: 44px;
            height: 44px;
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--accent);
            background: var(--bg-color);
            border-radius: 50%;
            margin-bottom: auto;
            box-shadow: inset 4px 4px 8px var(--shadow-dark), inset -4px -4px 8px var(--shadow-light);
        }}

        .story-text {{
            font-size: clamp(1.1rem, 1.6vw, 1.3rem);
            font-weight: 500;
            line-height: 1.65;
            color: var(--text-primary);
            margin: auto 0;
            max-width: 100%;
            position: relative;
            z-index: 1;
        }}

        .story-text strong {{
            font-weight: 700;
            color: var(--accent);
        }}

        /* ============================================
           NAVIGATION - WITH AUTO-HIDE
           ============================================ */
        .nav-controls {{
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            margin-top: auto;
            padding-top: 20px;
            transition: opacity 0.5s ease, transform 0.5s ease;
            opacity: 1;
            transform: translateY(0);
        }}

        .nav-controls.hidden {{
            opacity: 0;
            transform: translateY(10px);
            pointer-events: none;
        }}

        .nav-btn {{
            display: flex;
            align-items: center;
            justify-content: center;
            width: 50px;
            height: 50px;
            background: var(--bg-color);
            border: none;
            border-radius: 50%;
            cursor: pointer;
            color: var(--text-secondary);
            box-shadow: 5px 5px 10px var(--shadow-dark), -5px -5px 10px var(--shadow-light);
            transition: all 0.2s ease;
        }}

        .nav-btn svg {{
            width: 18px;
            height: 18px;
            transition: all 0.2s ease;
        }}

        .nav-btn:hover:not(:disabled) {{
            color: var(--accent);
        }}

        .nav-btn:hover:not(:disabled) svg {{
            transform: scale(1.15);
        }}

        .nav-btn:active:not(:disabled) {{
            box-shadow: inset 4px 4px 8px var(--shadow-dark), inset -4px -4px 8px var(--shadow-light);
        }}

        .nav-btn.next-btn:not(:disabled) {{
            background: var(--gradient-primary);
            color: white;
            box-shadow: 
                5px 5px 10px var(--shadow-dark),
                -5px -5px 10px var(--shadow-light),
                0 4px 15px var(--accent-glow);
        }}

        .nav-btn.next-btn:hover:not(:disabled) {{
            box-shadow: 
                6px 6px 12px var(--shadow-dark),
                -6px -6px 12px var(--shadow-light),
                0 6px 20px var(--accent-glow);
        }}

        .nav-btn:disabled {{
            opacity: 0;
            cursor: default;
            pointer-events: none;
        }}

        .progress-track {{
            width: 80px;
            height: 8px;
            background: var(--bg-color);
            border-radius: 4px;
            box-shadow: inset 3px 3px 6px var(--shadow-dark), inset -3px -3px 6px var(--shadow-light);
            overflow: hidden;
            position: relative;
        }}

        .progress-fill {{
            height: 100%;
            background: var(--gradient-primary);
            border-radius: 4px;
            transition: width 0.4s ease;
            box-shadow: 0 0 8px var(--accent-glow), inset 0 -2px 4px rgba(0,0,0,0.1);
        }}

        /* ============================================
           LIGHTBOX
           ============================================ */
        .lightbox {{
            position: fixed;
            inset: 0;
            background: rgba(232, 238, 243, 0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            transition: all 0.4s ease;
        }}

        .lightbox.active {{
            opacity: 1;
            visibility: visible;
        }}

        .lightbox-image {{
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
            border-radius: var(--radius-md);
            box-shadow: var(--neu-raised-lg);
            transform: scale(0.9);
            transition: transform 0.4s ease;
        }}

        .lightbox.active .lightbox-image {{
            transform: scale(1);
        }}

        .lightbox-close {{
            position: absolute;
            top: 24px;
            right: 24px;
            width: 48px;
            height: 48px;
            background: var(--bg-color);
            border: none;
            border-radius: 50%;
            color: var(--text-secondary);
            font-size: 24px;
            cursor: pointer;
            box-shadow: var(--neu-raised);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }}

        .lightbox-close:hover {{
            color: var(--accent);
        }}

        .lightbox-close:active {{
            box-shadow: var(--neu-inset);
        }}

        /* ============================================
           MOBILE RESPONSIVE
           ============================================ */
        @media (max-width: 900px) {{
            body {{
                padding: 10px;
            }}
            
            .neu-container {{
                padding: 16px;
                border-radius: 28px;
            }}

            .split-layout {{
                flex-direction: column;
            }}

            .image-panel {{
                flex: 1;
                padding: 8px;
            }}

            .content-panel {{
                flex: none;
                max-width: none;
                min-width: auto;
                padding: 24px 20px;
                margin: 0 4px 4px 4px;
                border-radius: 20px;
            }}

            .story-text {{
                font-size: clamp(1rem, 4vw, 1.2rem);
            }}

            .page-indicator {{
                width: 38px;
                height: 38px;
                font-size: 0.85rem;
            }}

            .nav-btn {{
                width: 46px;
                height: 46px;
            }}

            .nav-btn svg {{
                width: 18px;
                height: 18px;
            }}

            .progress-track {{
                width: 60px;
            }}

            .story-image {{
                max-height: 45vh;
                padding: 8px;
            }}
        }}

        @media (max-width: 600px) {{
            .neu-container {{
                padding: 12px;
                border-radius: 20px;
            }}

            .content-panel {{
                padding: 20px 16px;
                border-radius: 16px;
            }}

            .cover-title {{
                font-size: 1.6rem;
            }}

            .nav-btn {{
                width: 42px;
                height: 42px;
            }}

            .nav-btn svg {{
                width: 16px;
                height: 16px;
            }}
        }}
    </style>
</head>
<body>

    <div class="neu-container">
        <div class="view-stack">

            <!-- COVER VIEW -->
            <div class="view split-layout active" id="viewCover">
                <div class="image-panel">
                    <img 
                        src="{cover_b64}" 
                        class="story-image" 
                        alt="Cover" 
                        id="coverImg"
                        onclick="openLightbox(this)"
                    >
                </div>
                <div class="content-panel">
                    <h1 class="cover-title">{book_title}</h1>
                    <p class="cover-subtitle">Your adventure awaits</p>
                    <button class="neu-btn neu-btn-primary" onclick="startBook()">
                        Start Reading
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                </div>
            </div>

            <!-- STORY VIEW (Single view, dynamically updated) -->
            <div class="view split-layout" id="viewStory">
                <div class="image-panel">
                    <img 
                        src="" 
                        alt="Story Scene" 
                        class="story-image" 
                        id="storyImg"
                        loading="lazy"
                        onclick="openLightbox(this)"
                    >
                </div>
                <div class="content-panel" id="storyContentPanel">
                    <div class="page-indicator" id="pageNum">1</div>
                    <p class="story-text" id="storyText">Loading...</p>
                    <div class="nav-controls" id="navControls">
                        <!-- Home Button -->
                        <button class="nav-btn" onclick="returnToCover()" aria-label="Back to cover">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                                <polyline points="9 22 9 12 15 12 15 22"/>
                            </svg>
                        </button>
                        <!-- Prev Button -->
                        <button class="nav-btn" id="btnPrev" onclick="prevPage()" aria-label="Previous page">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                        </button>
                        <!-- Progress -->
                        <div class="progress-track">
                            <div class="progress-fill" id="progressFill" style="width: 10%"></div>
                        </div>
                        <!-- Next Button -->
                        <button class="nav-btn next-btn" id="btnNext" onclick="nextPage()" aria-label="Next page">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- LIGHTBOX -->
    <div class="lightbox" id="lightbox" onclick="closeLightbox()">
        <img src="" class="lightbox-image" id="lightboxImg" alt="Enlarged view">
        <button class="lightbox-close" onclick="closeLightbox()">×</button>
    </div>

    <script>
        // Story Data
        const storyData = {{
            pages: {pages_js}
        }};

        // DOM Elements
        const viewCover = document.getElementById('viewCover');
        const viewStory = document.getElementById('viewStory');
        const storyImg = document.getElementById('storyImg');
        const storyText = document.getElementById('storyText');
        const pageNum = document.getElementById('pageNum');
        const btnPrev = document.getElementById('btnPrev');
        const btnNext = document.getElementById('btnNext');
        const progressFill = document.getElementById('progressFill');
        const coverImg = document.getElementById('coverImg');
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightboxImg');
        const navControls = document.getElementById('navControls');
        const storyContentPanel = document.getElementById('storyContentPanel');

        let currentIndex = 0;
        const totalPages = storyData.pages.length;

        function startBook() {{
            // Try fullscreen
            const docEl = document.documentElement;
            if (docEl.requestFullscreen) {{
                docEl.requestFullscreen().catch(() => {{}});
            }}

            viewCover.classList.remove('active');
            setTimeout(() => {{
                viewStory.classList.add('active');
                loadPage(0);
            }}, 300);
        }}

        function loadPage(index) {{
            currentIndex = index;
            const page = storyData.pages[index];

            // Fade out
            storyImg.style.opacity = '0';
            storyImg.style.transform = 'scale(0.98)';

            setTimeout(() => {{
                storyImg.src = page.image;
                storyText.textContent = page.story;
                pageNum.textContent = page.number;

                // Update progress
                const progress = ((index + 1) / totalPages) * 100;
                progressFill.style.width = progress + '%';

                // Update button states
                btnPrev.disabled = index === 0;

                // Fade in
                storyImg.style.opacity = '1';
                storyImg.style.transform = 'scale(1)';
            }}, 200);

            // Show nav and reset timer
            showNav();
        }}

        function nextPage() {{
            if (currentIndex < totalPages - 1) {{
                loadPage(currentIndex + 1);
            }} else {{
                // End of story - return to cover
                returnToCover();
            }}
        }}

        function prevPage() {{
            if (currentIndex > 0) {{
                loadPage(currentIndex - 1);
            }}
        }}

        function returnToCover() {{
            viewStory.classList.remove('active');
            setTimeout(() => {{
                viewCover.classList.add('active');
                currentIndex = 0;
            }}, 300);
        }}

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {{
            if (e.key === 'ArrowRight' || e.key === ' ') {{
                e.preventDefault();
                if (viewStory.classList.contains('active')) nextPage();
                else startBook();
            }}
            if (e.key === 'ArrowLeft') prevPage();
            if (e.key === 'Escape') closeLightbox();
        }});

        // Touch swipe
        let touchStartX = 0;
        document.addEventListener('touchstart', (e) => {{
            touchStartX = e.changedTouches[0].screenX;
        }}, {{ passive: true }});

        document.addEventListener('touchend', (e) => {{
            const diff = touchStartX - e.changedTouches[0].screenX;
            if (!viewStory.classList.contains('active')) return;
            if (diff > 50) nextPage();
            else if (diff < -50) prevPage();
        }}, {{ passive: true }});

        // Lightbox
        function openLightbox(imgEl) {{
            if (!imgEl) return;
            lightboxImg.src = imgEl.src;
            lightbox.classList.add('active');
        }}

        function closeLightbox() {{
            lightbox.classList.remove('active');
        }}

        lightbox.addEventListener('click', (e) => {{
            if (e.target === lightbox) closeLightbox();
        }});

        // ============================================
        // AUTO-HIDE NAVIGATION
        // ============================================
        let navTimer;
        let isHoveringNav = false;

        function showNav() {{
            navControls.classList.remove('hidden');
            if (!isHoveringNav) {{
                resetNavTimer();
            }}
        }}

        function resetNavTimer() {{
            clearTimeout(navTimer);
            navTimer = setTimeout(() => {{
                if (!isHoveringNav) {{
                    navControls.classList.add('hidden');
                }}
            }}, 4000);
        }}

        // Keep visible when interacting with controls
        navControls.addEventListener('mouseenter', () => {{
            isHoveringNav = true;
            clearTimeout(navTimer);
            navControls.classList.remove('hidden');
        }});

        navControls.addEventListener('mouseleave', () => {{
            isHoveringNav = false;
            resetNavTimer();
        }});

        // Show on general interaction with STORY content panel
        storyContentPanel.addEventListener('mousemove', showNav);
        storyContentPanel.addEventListener('touchstart', showNav);
        storyContentPanel.addEventListener('click', showNav);

        // Start timer initially
        resetNavTimer();

        // Cursor hints
        coverImg.style.cursor = 'zoom-in';
        storyImg.style.cursor = 'zoom-in';
    </script>
</body>
</html>'''
    
    output_file = Path(output_path)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    file_size_mb = output_file.stat().st_size / (1024 * 1024)
    
    print(f"\n✅ Neumorphism storybook created!")
    print(f"📄 File: {output_path}")
    print(f"📦 Size: {file_size_mb:.2f} MB")
    print(f"\n🎯 Features:")
    print(f"   ✓ Beautiful neumorphic design")
    print(f"   ✓ Split-layout (image + text)")
    print(f"   ✓ Animated shimmer title")
    print(f"   ✓ Image lightbox on click")
    print(f"   ✓ Auto-hide navigation (4s timeout)")
    print(f"   ✓ Home button to return to cover")
    print(f"   ✓ Smooth page fade transitions")
    print(f"   ✓ Progress indicator")
    print(f"   ✓ Fullscreen mode on start")
    print(f"   ✓ Keyboard navigation (← → Space Esc)")
    print(f"   ✓ Touch swipe support")
    print(f"   ✓ Mobile responsive")
    print(f"   ✓ Single file - easy to share!")


if __name__ == "__main__":
    create_storybook_html()
