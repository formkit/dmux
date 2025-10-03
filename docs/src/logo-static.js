// Static breathing logo that runs continuously
export async function animateStaticLogo() {
  const canvas = document.getElementById('logo-canvas-static');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // Set canvas dimensions to match container
  const container = canvas.parentElement;
  const containerWidth = container.offsetWidth;
  const containerHeight = container.offsetHeight;

  canvas.width = containerWidth * dpr;
  canvas.height = containerHeight * dpr;
  ctx.scale(dpr, dpr);

  // Use the same constrained size as the intro
  const maxLogoWidth = Math.min(650, window.innerWidth - (4 * 16));
  const targetWidth = maxLogoWidth;
  const targetHeight = 200;

  // Colors
  const orange = '#ff6b1a';
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

  // Calculate logo size and position - same as intro
  const logoScale = Math.min(targetWidth / logoImg.width, targetHeight / logoImg.height) * 0.8;
  const logoWidth = logoImg.width * logoScale;
  const logoHeight = logoImg.height * logoScale;

  // Center on the container canvas
  const logoX = (containerWidth - logoWidth) / 2;
  const logoY = (containerHeight - logoHeight) / 2;

  let breathPhase = 0;

  function drawScanlines(opacity = 0.2) {
    const scanlineSpacing = 3;
    for (let y = 0; y < containerHeight; y += scanlineSpacing) {
      ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
      ctx.fillRect(0, y, containerWidth, 1);
    }
  }

  function animate() {
    // Clear with black background
    ctx.fillStyle = bgBlack;
    ctx.fillRect(0, 0, containerWidth, containerHeight);

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

    // Scanlines
    drawScanlines(0.2);

    requestAnimationFrame(animate);
  }

  animate();
}

// Reinitialize on resize
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    animateStaticLogo();
  }, 500);
});
