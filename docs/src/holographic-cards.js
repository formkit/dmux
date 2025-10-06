// 3D Holographic Card Effects with Mouse Tracking
export function initHolographicCards() {
  const cards = document.querySelectorAll('.feature-card');

  cards.forEach(card => {
    // Mouse move handler for 3D tilt
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Calculate rotation based on mouse position (-20 to 20 degrees)
      const rotateX = ((y - centerY) / centerY) * -15;
      const rotateY = ((x - centerX) / centerX) * 15;

      // Apply 3D transform
      card.style.transform = `
        translateY(-10px)
        translateZ(50px)
        rotateX(${rotateX}deg)
        rotateY(${rotateY}deg)
        scale3d(1.02, 1.02, 1.02)
      `;

      // Update shimmer position based on mouse
      const shimmer = card.querySelector('.holographic-shimmer');
      if (shimmer) {
        const angle = Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
        shimmer.style.transform = `rotate(${angle}deg)`;
      }
    });

    // Mouse leave handler - reset to default hover state
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      const shimmer = card.querySelector('.holographic-shimmer');
      if (shimmer) {
        shimmer.style.transform = '';
      }
    });

    // Add RGB chromatic aberration effect on hover
    const content = card.querySelector('h3, p, .code-example');
    if (content) {
      card.addEventListener('mouseenter', () => {
        content.style.textShadow = `
          2px 2px 0 rgba(255, 107, 26, 0.3),
          -2px -2px 0 rgba(100, 200, 255, 0.2)
        `;
      });

      card.addEventListener('mouseleave', () => {
        content.style.textShadow = '';
      });
    }
  });
}
