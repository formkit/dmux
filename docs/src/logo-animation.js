// dmux Logo Boot Sequence - TV Static to Materialization
import { endIntro } from './script.js';

export async function animateLogo() {
  const canvas = document.getElementById('logo-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const dpr = window.devicePixelRatio || 1;

  // Canvas is FULLSCREEN for intro
  const canvasWidth = window.innerWidth;
  const canvasHeight = window.innerHeight;

  canvas.width = canvasWidth * dpr;
  canvas.height = canvasHeight * dpr;
  ctx.scale(dpr, dpr);

  // But logo is rendered at constrained size (650px or calc(100% - 4em))
  const maxLogoWidth = Math.min(650, canvasWidth - (4 * 16)); // 4em assuming 16px base
  const targetWidth = maxLogoWidth;
  const targetHeight = 200; // Fixed height to match container

  // Colors
  const orange = '#ff6b1a';
  const orangeLight = '#ff8a3d';
  const orangeDark = '#e65100';
  const bgBlack = '#000000';

  // Load dmux SVG
  let logoImg = null;
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = '/dmux.svg';
    });
    logoImg = img;
  } catch (e) {
    console.error('Failed to load logo:', e);
    return;
  }

  // Animation phases
  const PHASES = {
    CURSOR_BLINK: 0,
    TYPING: 1,
    GLITCH: 2,
    LOGO_REVEAL: 3,
    BREATHING: 4,
  };

  let phase = PHASES.CURSOR_BLINK;
  let frame = 0;
  let cursorVisible = true;
  let cursorBlinkCounter = 0;
  let logoCharIndex = 0;
  let breathPhase = 0;

  // We'll draw the logo characters directly from the SVG
  // Logo is sized to fit within the constrained dimensions
  const logoScale = Math.min(targetWidth / logoImg.width, targetHeight / logoImg.height) * 0.8;
  const logoWidth = logoImg.width * logoScale;
  const logoHeight = logoImg.height * logoScale;

  // Center the logo on the fullscreen canvas
  const logoX = (canvasWidth - logoWidth) / 2;
  const logoY = (canvasHeight - logoHeight) / 2;

  console.log('Canvas:', canvasWidth, 'x', canvasHeight);
  console.log('Target:', targetWidth, 'x', targetHeight);
  console.log('Logo:', logoWidth, 'x', logoHeight);
  console.log('Position:', logoX, logoY);

  // Pre-render logo with glow to offscreen canvas for glitch performance
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = logoWidth;
  offscreenCanvas.height = logoHeight;
  const offCtx = offscreenCanvas.getContext('2d');
  offCtx.shadowColor = orange;
  offCtx.shadowBlur = 50;
  offCtx.drawImage(logoImg, 0, 0, logoWidth, logoHeight);
  offCtx.shadowBlur = 0;

  // CRT scanlines overlay (fullscreen)
  function drawScanlines(opacity = 0.3) {
    const scanlineSpacing = 3;
    for (let y = 0; y < canvasHeight; y += scanlineSpacing) {
      ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
      ctx.fillRect(0, y, canvasWidth, 1);
    }
  }

  function drawBlockCursor(x, y, width, height) {
    if (cursorVisible) {
      // Block cursor with glow
      ctx.fillStyle = orange;
      ctx.shadowColor = orange;
      ctx.shadowBlur = 20;
      ctx.fillRect(x, y, width, height);
      ctx.shadowBlur = 0;
    }
  }

  function drawTypingLogo() {
    // Draw only the portion of the logo that's been "typed"
    const progress = logoCharIndex / 4; // 4 characters in "dmux"

    ctx.save();

    // Create a clipping region for the typed portion
    ctx.beginPath();
    ctx.rect(logoX, logoY, logoWidth * progress, logoHeight);
    ctx.clip();

    // Draw the logo portion with interlacing and glow
    ctx.globalAlpha = 1;
    ctx.shadowColor = orange;
    ctx.shadowBlur = 30;
    ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);

    ctx.restore();

    // Draw scanlines over the typed portion
    drawScanlines(0.4);

    // Block cursor at the end of typed portion
    if (logoCharIndex < 4) {
      const cursorX = logoX + (logoWidth * progress);
      const cursorWidth = logoHeight * 0.3;
      const cursorHeight = logoHeight * 0.85;
      const cursorY = logoY + (logoHeight - cursorHeight) / 2;
      drawBlockCursor(cursorX, cursorY, cursorWidth, cursorHeight);
    }
  }

  // Pre-calculate random values for glitch to avoid repeated Math.random() calls
  let glitchRandom = null;
  function updateGlitchRandom() {
    glitchRandom = {
      showFlash: Math.random() < 0.4,
      flashColor: Math.random() < 0.5 ? 'rgb(255, 0, 0)' : 'rgb(0, 100, 255)',
      showScanlines: Math.random() < 0.5,
      displacements: Array.from({ length: 12 }, () => ({
        y: logoY + Math.random() * logoHeight,
        height: Math.max(2, Math.floor(Math.random() * 6)),
        offset: (Math.random() - 0.5) * 40
      })),
      scanlines: Array.from({ length: 3 }, () => ({
        y: Math.random() * canvasHeight,
        opacity: 0.2 + Math.random() * 0.3
      }))
    };
  }

  function drawGlitch() {
    // Use pre-rendered logo with glow from offscreen canvas
    ctx.drawImage(offscreenCanvas, logoX, logoY);

    // Update random values once per frame
    if (!glitchRandom || frame % 1 === 0) {
      updateGlitchRandom();
    }

    // Fullscreen RGB chromatic aberration flashes
    if (glitchRandom.showFlash) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = glitchRandom.flashColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.globalAlpha = 1;
    }

    // Horizontal displacement on the logo only - batch operations
    for (let i = 0; i < 12; i++) {
      const disp = glitchRandom.displacements[i];
      if (disp.y + disp.height <= logoY + logoHeight) {
        const imageData = ctx.getImageData(logoX, disp.y, logoWidth, disp.height);
        ctx.putImageData(imageData, logoX + disp.offset, disp.y);
      }
    }

    // Fullscreen scanline flashes
    if (glitchRandom.showScanlines) {
      for (let i = 0; i < 3; i++) {
        const scan = glitchRandom.scanlines[i];
        ctx.fillStyle = `rgba(255, 107, 26, ${scan.opacity})`;
        ctx.fillRect(0, scan.y, canvasWidth, 2);
      }
    }
  }


  function drawBreathingLogo() {
    breathPhase += 0.02;
    const pulse = Math.sin(breathPhase) * 0.3 + 0.7; // Oscillate between 0.4 and 1.0

    // Breathing glow
    ctx.shadowColor = orange;
    ctx.shadowBlur = 40 * pulse;
    ctx.globalAlpha = 0.9 + pulse * 0.1;
    ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);

    // Phosphor persistence - ghost trails
    ctx.globalAlpha = 0.15;
    ctx.shadowBlur = 60 * pulse;
    ctx.drawImage(logoImg, logoX - 2, logoY - 2, logoWidth, logoHeight);
    ctx.drawImage(logoImg, logoX + 2, logoY + 2, logoWidth, logoHeight);

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function animate() {
    // Clear with black background (fullscreen)
    ctx.fillStyle = bgBlack;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    switch (phase) {
      case PHASES.CURSOR_BLINK:
        // Just a blinking cursor on dark screen with scanlines
        cursorBlinkCounter++;
        if (cursorBlinkCounter % 20 === 0) {
          cursorVisible = !cursorVisible;
        }

        // Draw cursor at the start position
        const cursorWidth = logoHeight * 0.3;
        const cursorHeight = logoHeight * 0.85;
        const cursorY = logoY + (logoHeight - cursorHeight) / 2;
        drawBlockCursor(logoX, cursorY, cursorWidth, cursorHeight);

        // Draw scanlines
        drawScanlines(0.4);

        if (frame > 40) {
          phase = PHASES.TYPING;
          frame = 0;
        }
        break;

      case PHASES.TYPING:
        // Type the logo characters progressively (every 6 frames)
        if (frame % 6 === 0 && logoCharIndex < 4) {
          logoCharIndex++;
        }

        // Draw the typed portion of the logo
        drawTypingLogo();

        if (logoCharIndex >= 4 && frame > 50) {
          phase = PHASES.GLITCH;
          frame = 0;
        }
        break;

      case PHASES.GLITCH:
        // Glitch effect - faster and more intense
        drawGlitch();
        drawScanlines(0.3);

        if (frame > 15) {
          phase = PHASES.LOGO_REVEAL;
          frame = 0;
        }
        break;

      case PHASES.LOGO_REVEAL:
        // Fade from glitch to clean logo
        const revealProgress = Math.min(1, frame / 30);
        const eased = revealProgress * revealProgress * (3 - 2 * revealProgress);

        if (eased < 1) {
          // Still some glitch
          ctx.globalAlpha = 1 - eased;
          drawGlitch();
          ctx.globalAlpha = 1;
        }

        // Clean logo fading in
        ctx.globalAlpha = eased;
        ctx.shadowColor = orange;
        ctx.shadowBlur = 40;
        ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
        ctx.globalAlpha = 1;

        // Scanlines
        drawScanlines(0.3);

        if (frame > 40) {
          phase = PHASES.BREATHING;
          frame = 0;
        }
        break;

      case PHASES.BREATHING:
        // Continuous breathing glow
        drawBreathingLogo();
        drawScanlines(0.2);

        // After a few seconds of breathing, hide the intro canvas and reveal page
        if (frame > 60) {
          canvas.classList.add('hidden');
          endIntro();
          return; // Stop animation loop
        }
        break;
    }

    frame++;
    requestAnimationFrame(animate);
  }

  // Start animation
  setTimeout(() => {
    animate();
  }, 100);
}

// Reinitialize on resize
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    animateLogo();
  }, 500);
});
