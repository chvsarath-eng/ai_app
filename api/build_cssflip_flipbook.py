#!/usr/bin/env python3
"""
3D Interactive Flipbook Generator
Fully responsive, white background with realistic shadows below the book.
"""

import argparse
import base64
import fitz  # PyMuPDF
from pathlib import Path


def pdf_to_base64_images(pdf_path, dpi=300, image_format='jpeg', jpeg_quality=95):
    """Convert PDF pages to base64-encoded images at specified DPI."""
    doc = fitz.open(pdf_path)
    images = []
    
    # PDF default is 72 DPI, so scale = target_dpi / 72
    scale = dpi / 72.0
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat)
        if image_format == 'png':
            img_data = pix.tobytes('png')
            mime = 'image/png'
        else:
            img_data = pix.tobytes('jpeg', jpg_quality=jpeg_quality)
            mime = 'image/jpeg'
        b64 = base64.b64encode(img_data).decode('utf-8')
        images.append(f"data:{mime};base64,{b64}")
    
    doc.close()
    return images


def generate_html(images, title="Flipbook"):
    """Generate the complete HTML for the flipbook."""
    total_pages = len(images)
    cover_image = images[0] if images else None
    ambient_bg_style = ""
    if isinstance(cover_image, str) and cover_image:
        ambient_bg_style = f"background-image: url('{cover_image}');"
    
    # Pad to even number
    if total_pages % 2 == 1:
        images.append(None)
        total_pages += 1
    
    num_sheets = total_pages // 2
    
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <title>{title}</title>
    <style>
* {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}}

html, body {{
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #f5f5f5;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
}}

body {{
    display: flex;
    align-items: center;
    justify-content: center;
    background:
        radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.9) 0%, rgba(245, 245, 245, 0.9) 45%, rgba(235, 235, 235, 0.95) 100%),
        radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.6) 0%, transparent 40%),
        radial-gradient(circle at 80% 30%, rgba(255, 255, 255, 0.5) 0%, transparent 45%);
    position: relative;
}}

.app {{
    position: relative;
    width: 100%;
    height: 100%;
}}

.app.is-loading .scene {{
    visibility: hidden;
}}

.loading-overlay {{
    position: fixed;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    background: rgba(245, 245, 245, 0.9);
    color: #333;
    z-index: 1500;
    text-align: center;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}}

.app.is-loading .loading-overlay {{
    display: flex;
}}

.loading-spinner {{
    width: 36px;
    height: 36px;
    border: 3px solid rgba(0, 0, 0, 0.15);
    border-top-color: rgba(0, 0, 0, 0.6);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}}

@keyframes spin {{
    to {{
        transform: rotate(360deg);
    }}
}}

/* Ambient background sourced from cover image */
.ambient-bg {{
    position: fixed;
    inset: 0;
    {ambient_bg_style}
    background-size: cover;
    background-position: center;
    filter: blur(32px) saturate(1.1);
    transform: scale(1.1);
    opacity: 0.85;
    z-index: 0;
}}

.ambient-bg::after {{
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.18) 70%, rgba(0, 0, 0, 0.28) 100%);
}}

/* Fullscreen container */
.scene {{
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    perspective: 3000px;
    perspective-origin: 50% 50%;
    position: relative;
    z-index: 1;
}}

/* UI controls */
.ui {{
    position: fixed;
    top: calc(12px + env(safe-area-inset-top, 0px));
    right: calc(12px + env(safe-area-inset-right, 0px));
    z-index: 2000;
    display: flex;
    gap: 8px;
}}

.ui button {{
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border: 0;
    border-radius: 10px;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}}

.ui button:active {{
    transform: translateY(1px);
}}

.ui .icon {{
    width: 20px;
    height: 20px;
    display: block;
}}

.ui .icon-exit {{
    display: none;
}}

.ui button.is-fullscreen .icon-enter {{
    display: none;
}}

.ui button.is-fullscreen .icon-exit {{
    display: block;
}}

.sr-only {{
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}}

/* Landscape hint */
.rotate-hint {{
    position: fixed;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    z-index: 1998;
    font-size: 16px;
    line-height: 1.4;
    flex-direction: column;
}}

.rotate-hint.show {{
    display: flex;
}}

.rotate-hint .phone {{
    height: 50px;
    width: 100px;
    border: 3px solid #fff;
    border-radius: 10px;
    animation: rotateHint 1.5s ease-in-out infinite alternate;
}}

.rotate-hint .message {{
    margin-top: 32px;
    font-size: 1em;
}}

@keyframes rotateHint {{
    0% {{
        transform: rotate(0deg);
    }}
    50% {{
        transform: rotate(-90deg);
    }}
    100% {{
        transform: rotate(-90deg);
    }}
}}

/* Ambient vignette for depth */
.scene::before {{
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.06) 70%, rgba(0, 0, 0, 0.12) 100%);
    pointer-events: none;
}}

/* Book wrapper for shadow positioning */
.book-wrapper {{
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}}

/* Shadow BELOW the book - separate element */
.book-shadow {{
    position: absolute;
    bottom: -30px;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    height: 40px;
    background: radial-gradient(ellipse at 50% 50%, 
        rgba(0,0,0,0.25) 0%, 
        rgba(0,0,0,0.12) 40%,
        transparent 70%);
    filter: blur(15px);
    pointer-events: none;
    z-index: -2;
    transition: width 0.6s ease-out;
}}

.book-wrapper.closed .book-shadow {{
    width: 48%;
}}


/* Elevated book with surrounding shadow */
.book {{
    position: relative;
    transform-style: preserve-3d;
    -webkit-transform-style: preserve-3d;
    transform: rotateX(2deg) translateX(-25%);
    transition: transform 0.6s ease-out;
    
    /* Use available space optimally */
    height: min(85vh, calc(46vw));
    width: min(calc(85vh * 2), 92vw);
}}

.book.opened {{
    transform: rotateX(2deg) translateX(0);
}}

.book.opened.tilt-left {{
    transform: rotateX(2deg) translateX(0) rotateY(4deg);
}}

.book.opened.tilt-right {{
    transform: rotateX(2deg) translateX(0) rotateY(-4deg);
}}

/* Spine - hidden when closed */
.spine {{
    position: absolute;
    left: 50%;
    top: 0;
    width: 2px;
    height: 100%;
    transform: translateX(-50%);
    background: linear-gradient(to right,
        rgba(0,0,0,0.1) 0%,
        rgba(0,0,0,0.02) 40%,
        rgba(0,0,0,0.02) 60%,
        rgba(0,0,0,0.1) 100%);
    z-index: 1000;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease-out;
}}

.book.opened .spine {{
    opacity: 1;
}}

/* Left page - hidden when closed */
.left-page {{
    position: absolute;
    width: 50%;
    height: 100%;
    left: 0;
    top: 0;
    overflow: hidden;
    background: #fff;
    box-shadow: inset -5px 0 12px rgba(0,0,0,0.03);
    border-radius: 1px 0 0 1px;
    opacity: 0;
    transition: opacity 0.3s ease-out;
}}

.book.opened .left-page {{
    opacity: 1;
}}

.left-page img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
}}

.left-page .blank {{
    width: 100%;
    height: 100%;
    background: #fff;
}}

/* Flippable sheets */
.sheet {{
    position: absolute;
    width: 50%;
    height: 100%;
    top: 0;
    left: 50%;
    transform-origin: left center;
    transform-style: preserve-3d;
    -webkit-transform-style: preserve-3d;
    /* Smooth, natural page flip timing */
    transition: transform 1.35s cubic-bezier(0.22, 0.9, 0.22, 1);
    cursor: pointer;
    will-change: transform;
}}

.sheet.flipped {{
    transform: rotateY(-180deg);
}}

.sheet:not(.flipped):hover {{
    transform: rotateY(-15deg);
    transition: transform 0.3s ease-out;
}}

.sheet.flipped:hover {{
    transform: rotateY(-180deg);
    transition: transform 0.3s ease-out;
}}

@media (hover: none) {{
    .sheet:not(.flipped):hover {{
        transform: rotateY(0deg);
    }}
    .sheet.flipped:hover {{
        transform: rotateY(-180deg);
    }}
}}

.sheet.dragging {{
    transition: none !important;
}}

/* Smooth flip animation keyframes for extra polish */
@keyframes pageFlip {{
    0% {{ transform: rotateY(0deg); }}
    40% {{ transform: rotateY(-100deg); }}
    100% {{ transform: rotateY(-180deg); }}
}}

@keyframes pageUnflip {{
    0% {{ transform: rotateY(-180deg); }}
    40% {{ transform: rotateY(-80deg); }}
    100% {{ transform: rotateY(0deg); }}
}}

.front, .back {{
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    overflow: hidden;
    background: #fff;
    will-change: transform;
}}

.front {{
    transform: translateZ(1px) rotateY(0deg);
    box-shadow: 
        inset 4px 0 15px rgba(0,0,0,0.03),
        -2px 0 8px rgba(0,0,0,0.05);
    border-radius: 0 2px 2px 0;
}}

.back {{
    transform: translateZ(1px) rotateY(180deg);
    box-shadow: 
        inset -4px 0 15px rgba(0,0,0,0.03),
        2px 0 8px rgba(0,0,0,0.05);
    border-radius: 0 2px 2px 0;
}}

.back.back-cover img {{
    filter: blur(10px);
    transform: scale(1.6);
}}

/* Dynamic shadow during flip */
.sheet:not(.flipped) .front {{
    transition: box-shadow 0.8s ease;
}}

.sheet.flipped .back {{
    transition: box-shadow 0.8s ease;
}}

/* Subtle page edge shadow */
.front::before {{
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    width: 20px;
    height: 100%;
    background: linear-gradient(to left, 
        rgba(0,0,0,0.04) 0%, 
        transparent 100%);
    pointer-events: none;
}}

.back::before {{
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 20px;
    height: 100%;
    background: linear-gradient(to right, 
        rgba(0,0,0,0.05) 0%, 
        transparent 100%);
    pointer-events: none;
}}

/* Images fill completely */
.front img, .back img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    -webkit-user-drag: none;
    user-select: none;
    pointer-events: none;
    image-rendering: auto;
}}

.blank {{
    width: 100%;
    height: 100%;
    background: #fff;
}}

/* Z-index for sheets */
"""
    
    for i in range(num_sheets):
        html += f".sheet:nth-of-type({i + 1}) {{ z-index: {num_sheets - i}; }}\n"
    
    html += """
    </style>
</head>
<body>
    <div class="app is-loading" id="app">
        <div class="ambient-bg" id="ambientBg"></div>
        <div class="scene" id="scene">
            <div class="book-wrapper closed" id="bookWrapper">
                <div class="book-shadow"></div>
                <div class="book" id="book">
                    <div class="spine"></div>
                    
                    <div class="left-page" id="leftPage">
                        <div class="blank"></div>
                    </div>
"""
    
    # Generate sheets
    for i in range(num_sheets):
        front_page_num = i * 2
        back_page_num = i * 2 + 1
        
        front_img = images[front_page_num] if front_page_num < len(images) and images[front_page_num] else None
        back_img = images[back_page_num] if back_page_num < len(images) and images[back_page_num] else None
        
        front_content = f'<img src="{front_img}" alt="Page {front_page_num + 1}" draggable="false">' if front_img else '<div class="blank"></div>'
        is_back_cover = back_img is None and back_page_num == total_pages - 1 and cover_image
        back_content = (
            f'<img src="{back_img}" alt="Page {back_page_num + 1}" draggable="false">'
            if back_img
            else (
                f'<img src="{cover_image}" alt="Back cover" draggable="false">'
                if is_back_cover
                else '<div class="blank"></div>'
            )
        )
        back_class = 'back back-cover' if is_back_cover else 'back'
        
        html += f"""
                <div class="sheet" data-sheet="{i}">
                    <div class="front">{front_content}</div>
                    <div class="{back_class}">{back_content}</div>
                </div>
"""
    
    html += f"""
                </div>
            </div>
        </div>
        <div class="loading-overlay" id="loadingOverlay">
            <div class="loading-spinner" aria-hidden="true"></div>
            <div class="loading-text">Loading pages...</div>
        </div>
        <div class="ui">
            <button id="fullscreenBtn" type="button" aria-label="Toggle fullscreen">
                <svg class="icon icon-enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="4 9 4 4 9 4"></polyline>
                    <polyline points="15 4 20 4 20 9"></polyline>
                    <polyline points="20 15 20 20 15 20"></polyline>
                    <polyline points="9 20 4 20 4 15"></polyline>
                </svg>
                <svg class="icon icon-exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="9 4 9 9 4 9"></polyline>
                    <polyline points="15 4 15 9 20 9"></polyline>
                    <polyline points="20 15 15 15 15 20"></polyline>
                    <polyline points="4 15 9 15 9 20"></polyline>
                </svg>
                <span class="sr-only">Toggle fullscreen</span>
            </button>
        </div>
        <div class="rotate-hint" id="rotateHint">
            <div class="phone" aria-hidden="true"></div>
            <div class="message">Please rotate your device</div>
        </div>
    </div>
    
    <script>
        (function() {{
            const app = document.getElementById('app');
            const book = document.getElementById('book');
            const bookWrapper = document.getElementById('bookWrapper');
            const scene = document.getElementById('scene');
            const ambientBg = document.getElementById('ambientBg');
            const fullscreenBtn = document.getElementById('fullscreenBtn');
            const rotateHint = document.getElementById('rotateHint');
            const loadingOverlay = document.getElementById('loadingOverlay');
            const sheets = document.querySelectorAll('.sheet');
            const leftPage = document.getElementById('leftPage');
            const totalSheets = sheets.length;
            const maxSheetIndex = Math.max(0, totalSheets - 1);
            
            const frontImages = [];
            const backImages = [];
            sheets.forEach((sheet, idx) => {{
                const frontImg = sheet.querySelector('.front img');
                const backImg = sheet.querySelector('.back img');
                frontImages[idx] = frontImg ? frontImg.src : null;
                backImages[idx] = backImg ? backImg.src : null;
            }});

            // Preload first left-page image to avoid blank flash on open
            if (backImages[0]) {{
                const preloadLeft = new Image();
                preloadLeft.src = backImages[0];
            }}

            let coverAmbientSrc = '';
            if (ambientBg) {{
                const computed = window.getComputedStyle(ambientBg).backgroundImage;
                coverAmbientSrc = (ambientBg.style.backgroundImage || computed || '').trim();
                if (coverAmbientSrc === 'none') coverAmbientSrc = '';
            }}
            
            let currentSheet = 0;
            let isBookOpen = false;
            let isDragging = false;
            let dragStartX = 0;
            let dragSheet = null;

            function _whenImageReady(img) {{
                if (!img) return Promise.resolve();
                if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                if (img.decode) {{
                    return img.decode().catch(() => {{}});
                }}
                return new Promise((resolve) => {{
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                }});
            }}

            function _initLoading() {{
                if (!app) return;
                app.classList.add('is-loading');
                const firstSheet = sheets[0];
                const secondSheet = sheets[1];
                const imgs = [];
                if (firstSheet) {{
                    imgs.push(firstSheet.querySelector('.front img'));
                    imgs.push(firstSheet.querySelector('.back img'));
                }}
                if (secondSheet) {{
                    imgs.push(secondSheet.querySelector('.front img'));
                }}
                Promise.all(imgs.map(_whenImageReady)).then(() => {{
                    app.classList.remove('is-loading');
                }});
                setTimeout(() => {{
                    app.classList.remove('is-loading');
                }}, 5000);
            }}
            
            function openBook() {{
                if (isBookOpen) return;
                isBookOpen = true;
                bookWrapper.classList.remove('closed');
                book.classList.add('opened');
            }}
            
            function closeBook() {{
                if (!isBookOpen) return;
                isBookOpen = false;
                bookWrapper.classList.add('closed');
                book.classList.remove('opened');
            }}
            
            function updateLeftPage() {{
                if (currentSheet > 0) {{
                    const imgSrc = backImages[currentSheet - 1];
                    if (imgSrc) {{
                        leftPage.innerHTML = '<img src="' + imgSrc + '" draggable="false">';
                    }} else {{
                        leftPage.innerHTML = '<div class="blank"></div>';
                    }}
                }} else {{
                    leftPage.innerHTML = '<div class="blank"></div>';
                }}
            }}
            
            function updateZ() {{
                sheets.forEach((sheet, idx) => {{
                    if (sheet.classList.contains('flipped')) {{
                        sheet.style.zIndex = 1000 + idx;
                    }} else {{
                        sheet.style.zIndex = totalSheets - idx;
                    }}
                }});
            }}

            function updateAmbientBg() {{
                if (!ambientBg) return;
                if (currentSheet <= 0) {{
                    if (coverAmbientSrc) {{
                        ambientBg.style.backgroundImage = coverAmbientSrc;
                    }}
                    return;
                }}

                let src = null;
                if (currentSheet >= totalSheets) {{
                    src = backImages[totalSheets - 1] || frontImages[totalSheets - 1];
                }} else {{
                    src = backImages[currentSheet - 1] || frontImages[currentSheet];
                }}

                if (src) {{
                    ambientBg.style.backgroundImage = 'url(\"' + src + '\")';
                }}
            }}

            function updateFullscreenButton() {{
                if (!fullscreenBtn) return;
                const isFs = !!document.fullscreenElement;
                fullscreenBtn.classList.toggle('is-fullscreen', isFs);
                fullscreenBtn.setAttribute('aria-label', isFs ? 'Exit fullscreen' : 'Enter fullscreen');
            }}

            function tryLockLandscape() {{
                if (!document.fullscreenElement) return;
                if (screen.orientation && screen.orientation.lock) {{
                    screen.orientation.lock('landscape').catch(() => {{}});
                }}
            }}

            function updateRotateHint() {{
                if (!rotateHint) return;
                const isPortrait = window.matchMedia('(orientation: portrait)').matches;
                const isSmall = window.matchMedia('(max-width: 900px)').matches;
                rotateHint.classList.toggle('show', isSmall && isPortrait);
            }}

            if (fullscreenBtn) {{
                fullscreenBtn.addEventListener('click', async () => {{
                    if (!document.fullscreenElement) {{
                        if (app && app.requestFullscreen) {{
                            try {{
                                await app.requestFullscreen();
                            }} catch (e) {{}}
                        }} else if (scene && scene.requestFullscreen) {{
                            try {{
                                await scene.requestFullscreen();
                            }} catch (e) {{}}
                        }} else if (document.documentElement.requestFullscreen) {{
                            try {{
                                await document.documentElement.requestFullscreen();
                            }} catch (e) {{}}
                        }}
                        tryLockLandscape();
                    }} else if (document.exitFullscreen) {{
                        document.exitFullscreen();
                    }}
                }});
            }}

            document.addEventListener('fullscreenchange', () => {{
                updateFullscreenButton();
                tryLockLandscape();
                updateRotateHint();
            }});
            window.addEventListener('resize', updateRotateHint);
            window.addEventListener('orientationchange', updateRotateHint);
            
            function flipTo(targetSheet) {{
                targetSheet = Math.max(0, Math.min(maxSheetIndex, targetSheet));
                
                // Open book when flipping first page
                if (targetSheet > 0 && !isBookOpen) {{
                    openBook();
                }}
                
                // Close book when returning to cover
                if (targetSheet === 0 && isBookOpen) {{
                    closeBook();
                }}
                
                sheets.forEach((sheet, idx) => {{
                    if (idx < targetSheet) {{
                        sheet.classList.add('flipped');
                    }} else {{
                        sheet.classList.remove('flipped');
                    }}
                }});
                
                currentSheet = targetSheet;
                updateAmbientBg();
                
                setTimeout(() => {{
                    updateLeftPage();
                    updateZ();
                }}, 300);
            }}
            
            sheets.forEach((sheet, idx) => {{
                sheet.addEventListener('click', (e) => {{
                    if (isDragging) return;

                    if (!isBookOpen && idx === 0 && !sheet.classList.contains('flipped')) {{
                        if (leftPage) {{
                            const leftSrc = backImages[0];
                            if (leftSrc) {{
                                leftPage.innerHTML = '<img src="' + leftSrc + '" draggable="false">';
                            }} else {{
                                leftPage.innerHTML = '<div class="blank"></div>';
                            }}
                        }}
                        openBook();
                        setTimeout(() => flipTo(1), 180);
                        return;
                    }}

                    if (sheet.classList.contains('flipped')) {{
                        flipTo(idx);
                    }} else {{
                        flipTo(idx + 1);
                    }}
                }});
                
                sheet.addEventListener('mousedown', (e) => {{
                    isDragging = true;
                    dragSheet = sheet;
                    dragStartX = e.clientX;
                    sheet.classList.add('dragging');
                    e.preventDefault();
                }});
            }});
            
            document.addEventListener('mousemove', (e) => {{
                if (!isDragging || !dragSheet) return;
                
                const isFlipped = dragSheet.classList.contains('flipped');
                const deltaX = e.clientX - dragStartX;
                const maxDelta = window.innerWidth / 3;
                const startAngle = isFlipped ? -180 : 0;
                
                let angle = startAngle + (deltaX / maxDelta) * -180;
                angle = Math.max(-180, Math.min(0, angle));
                
                dragSheet.style.transform = `rotateY(${{angle}}deg)`;
            }});
            
            document.addEventListener('mouseup', (e) => {{
                if (!isDragging || !dragSheet) return;
                
                dragSheet.classList.remove('dragging');
                
                const deltaX = e.clientX - dragStartX;
                const threshold = 60;
                const idx = parseInt(dragSheet.dataset.sheet);
                const wasFlipped = dragSheet.classList.contains('flipped');
                
                dragSheet.style.transform = '';
                
                if (!wasFlipped && deltaX < -threshold) {{
                    flipTo(idx + 1);
                }} else if (wasFlipped && deltaX > threshold) {{
                    flipTo(idx);
                }}
                
                isDragging = false;
                dragSheet = null;
            }});
            
            // Subtle 3D tilt on mouse move (only when book is open)
            scene.addEventListener('mousemove', (e) => {{
                if (isDragging || !isBookOpen) return;
                
                const rect = scene.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                
                book.classList.remove('tilt-left', 'tilt-right');
                if (x < 0.25) {{
                    book.classList.add('tilt-left');
                }} else if (x > 0.75) {{
                    book.classList.add('tilt-right');
                }}
            }});
            
            scene.addEventListener('mouseleave', () => {{
                book.classList.remove('tilt-left', 'tilt-right');
            }});
            
            // Keyboard
            document.addEventListener('keydown', (e) => {{
                if (e.key === 'ArrowRight' || e.key === ' ') {{
                    e.preventDefault();
                    if (currentSheet === 0 && !isBookOpen) {{
                        openBook();
                        setTimeout(() => flipTo(1), 180);
                    }} else {{
                        flipTo(currentSheet + 1);
                    }}
                }} else if (e.key === 'ArrowLeft') {{
                    e.preventDefault();
                    flipTo(currentSheet - 1);
                }} else if (e.key === 'Home') {{
                    flipTo(0);
                }} else if (e.key === 'End') {{
                    flipTo(totalSheets);
                }}
            }});
            
            // Touch support
            let touchStartX = 0;
            let touchSheet = null;
            
            sheets.forEach((sheet) => {{
                sheet.addEventListener('touchstart', (e) => {{
                    touchStartX = e.touches[0].clientX;
                    touchSheet = sheet;
                    sheet.classList.add('dragging');
                }}, {{ passive: true }});
            }});
            
            document.addEventListener('touchmove', (e) => {{
                if (!touchSheet) return;
                
                const isFlipped = touchSheet.classList.contains('flipped');
                const deltaX = e.touches[0].clientX - touchStartX;
                const maxDelta = window.innerWidth / 3;
                const startAngle = isFlipped ? -180 : 0;
                
                let angle = startAngle + (deltaX / maxDelta) * -180;
                angle = Math.max(-180, Math.min(0, angle));
                
                touchSheet.style.transform = `rotateY(${{angle}}deg)`;
            }}, {{ passive: true }});
            
            document.addEventListener('touchend', (e) => {{
                if (!touchSheet) return;
                
                touchSheet.classList.remove('dragging');
                touchSheet.style.transform = '';
                
                const deltaX = e.changedTouches[0].clientX - touchStartX;
                const threshold = 40;
                const idx = parseInt(touchSheet.dataset.sheet);
                const wasFlipped = touchSheet.classList.contains('flipped');
                
                if (!wasFlipped && deltaX < -threshold) {{
                    flipTo(idx + 1);
                }} else if (wasFlipped && deltaX > threshold) {{
                    flipTo(idx);
                }}
                
                touchSheet = null;
            }});
            
            updateLeftPage();
            updateZ();
            updateAmbientBg();
            updateFullscreenButton();
            updateRotateHint();
            _initLoading();
        }})();
    </script>
</body>
</html>
"""
    
    return html


def pdf_to_html_flipbook(pdf_path, output_html_path=None, title="Flipbook", dpi=300, image_format='jpeg', jpeg_quality=95):
    """
    Convert a PDF to a standalone interactive HTML flipbook.
    
    Args:
        pdf_path: Path to the PDF file (can be file:// URL or regular path)
        output_html_path: Output HTML file path (optional, defaults to same name as PDF)
        title: Title for the flipbook
        dpi: Output image DPI (default 300)
        image_format: 'jpeg' or 'png' (jpeg is smoother)
        jpeg_quality: JPEG quality (1-100, default 95)
    
    Returns:
        Path to the generated HTML file
    """
    # Handle file:// URLs
    pdf_path_str = str(pdf_path)
    if pdf_path_str.startswith('file:///'):
        pdf_path_str = pdf_path_str[8:]  # Remove file:///
    
    pdf_path = Path(pdf_path_str)
    
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    
    # Default output path
    if output_html_path is None:
        output_html_path = pdf_path.with_suffix('.html')
    else:
        output_html_path = Path(output_html_path)
    
    print(f"Converting: {pdf_path.name}")
    print(f"Output: {output_html_path}")
    
    print(f"Converting PDF pages to images at {dpi} DPI...")
    images = pdf_to_base64_images(
        str(pdf_path),
        dpi=dpi,
        image_format=image_format,
        jpeg_quality=jpeg_quality
    )
    print(f"Converted {len(images)} pages")
    
    print(f"Generating flipbook HTML...")
    html = generate_html(images, title)
    
    output_html_path.write_text(html, encoding='utf-8')
    print(f"HTML flipbook created: {output_html_path}")
    
    return output_html_path


def main():
    parser = argparse.ArgumentParser(description="Generate a 3D interactive flipbook from a PDF")
    parser.add_argument("pdf_path", help="Path to the input PDF file")
    parser.add_argument("output_path", help="Path for the output HTML file")
    parser.add_argument("--title", default="Flipbook", help="Title for the flipbook")
    parser.add_argument("--dpi", type=int, default=300, help="Output image DPI (default: 300)")
    parser.add_argument("--format", default="jpeg", choices=["jpeg", "png"], help="Image format (default: jpeg)")
    parser.add_argument("--jpeg-quality", type=int, default=95, help="JPEG quality 1-100 (default: 95)")
    
    args = parser.parse_args()
    
    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"Error: PDF file not found: {pdf_path}")
        return 1
    
    print(f"Converting PDF pages to images at {args.dpi} DPI...")
    images = pdf_to_base64_images(
        str(pdf_path),
        dpi=args.dpi,
        image_format=args.format,
        jpeg_quality=args.jpeg_quality
    )
    print(f"Converted {len(images)} pages")
    
    print(f"Generating flipbook HTML...")
    html = generate_html(images, args.title)
    
    output_path = Path(args.output_path)
    output_path.write_text(html, encoding='utf-8')
    print(f"Flipbook saved to: {output_path}")
    
    return 0


if __name__ == "__main__":
    exit(main())
