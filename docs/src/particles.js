// Background Particle System - Terminal Characters Floating in Space
export class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: 0, y: 0, radius: 150 };
    this.scrollY = 0;
    this.colors = ['#ff6b1a', '#ff8a3d', '#e65100', '#bf360c'];
    this.chars = ['$', '>', '|', '/', '\\', '0', '1', '#', '{', '}', '[', ']', '<', '>', '-', '_'];

    this.resize();
    this.init();

    // Event listeners
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('scroll', () => this.onScroll());
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.scale(dpr, dpr);

    // Reinit particles on resize
    if (this.particles.length > 0) {
      this.init();
    }
  }

  init() {
    this.particles = [];
    const particleCount = Math.min(250, Math.floor(window.innerWidth / 5));

    // Create 3 layers with different depths
    for (let i = 0; i < particleCount; i++) {
      const layer = Math.floor(Math.random() * 3); // 0, 1, or 2
      this.particles.push(new Particle(this, layer));
    }
  }

  onMouseMove(e) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  }

  onScroll() {
    this.scrollY = window.scrollY;
  }

  update() {
    this.particles.forEach(p => p.update());
  }

  draw() {
    // Clear with slight trail effect for phosphor persistence
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Sort by layer (back to front)
    const sorted = [...this.particles].sort((a, b) => a.layer - b.layer);
    sorted.forEach(p => p.draw());
  }

  animate() {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.animate());
  }
}

class Particle {
  constructor(system, layer) {
    this.system = system;
    this.layer = layer; // 0 = back, 2 = front
    this.reset();

    // Random initial position
    this.x = Math.random() * window.innerWidth;
    this.y = Math.random() * window.innerHeight;
  }

  reset() {
    const ctx = this.system.ctx;

    // Layer properties (depth) - bigger and blurrier
    const layerProps = [
      { size: 12, speed: 0.2, opacity: 0.2, glow: 8 },   // Far
      { size: 18, speed: 0.4, opacity: 0.35, glow: 12 }, // Mid
      { size: 24, speed: 0.6, opacity: 0.5, glow: 16 }   // Near
    ][this.layer];

    this.baseSize = layerProps.size;
    this.size = this.baseSize;
    this.baseSpeed = layerProps.speed;
    this.opacity = layerProps.opacity;
    this.glow = layerProps.glow;

    // Movement
    this.vx = (Math.random() - 0.5) * this.baseSpeed;
    this.vy = (Math.random() - 0.5) * this.baseSpeed;

    // Character
    this.char = this.system.chars[Math.floor(Math.random() * this.system.chars.length)];
    this.color = this.system.colors[Math.floor(Math.random() * this.system.colors.length)];

    // Animation
    this.phase = Math.random() * Math.PI * 2;
    this.pulseSpeed = 0.02 + Math.random() * 0.03;

    // Mouse interaction
    this.targetX = this.x;
    this.targetY = this.y;
  }

  update() {
    const { mouse, scrollY } = this.system;

    // Parallax scroll effect (slower for farther layers)
    const scrollFactor = (2 - this.layer) * 0.3;
    const scrollOffset = scrollY * scrollFactor;

    // Base movement
    this.x += this.vx;
    this.y += this.vy;

    // Mouse interaction (attract/repel)
    const dx = mouse.x - this.x;
    const dy = (mouse.y + scrollY) - (this.y + scrollOffset);
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < mouse.radius) {
      const force = (mouse.radius - distance) / mouse.radius;
      const angle = Math.atan2(dy, dx);

      // Repel from cursor
      this.vx -= Math.cos(angle) * force * 0.5;
      this.vy -= Math.sin(angle) * force * 0.5;

      // Glow brighter when near cursor
      this.size = this.baseSize * (1 + force * 0.5);
    } else {
      this.size += (this.baseSize - this.size) * 0.1;
    }

    // Damping
    this.vx *= 0.98;
    this.vy *= 0.98;

    // Keep speed in range
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed < this.baseSpeed * 0.5) {
      this.vx += (Math.random() - 0.5) * 0.1;
      this.vy += (Math.random() - 0.5) * 0.1;
    }

    // Pulse animation
    this.phase += this.pulseSpeed;
    const pulse = Math.sin(this.phase) * 0.2 + 1;

    // Wrap around screen
    if (this.x < -50) this.x = window.innerWidth + 50;
    if (this.x > window.innerWidth + 50) this.x = -50;
    if (this.y < -50) this.y = window.innerHeight + 50;
    if (this.y > window.innerHeight + 50) this.y = -50;
  }

  draw() {
    const ctx = this.system.ctx;
    const scrollOffset = this.system.scrollY * (2 - this.layer) * 0.3;
    const y = this.y - scrollOffset;

    // Skip if off screen
    if (y < -100 || y > window.innerHeight + 100) return;

    ctx.save();

    const pulsePhase = Date.now() * 0.002 + this.x * 0.05;
    const pulse = Math.sin(pulsePhase) * 0.3 + 0.7;
    const finalOpacity = this.opacity * (this.size / this.baseSize) * pulse;

    // Mix of phosphor dots and terminal characters for CRT feel
    if (Math.random() < 0.6) {
      // Draw as CRT phosphor dot cluster
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.glow * pulse * 1.5;
      ctx.fillStyle = this.color;
      ctx.globalAlpha = finalOpacity * 0.4;

      const dotSize = this.size * 0.4;

      // Main dot
      ctx.beginPath();
      ctx.arc(this.x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();

      // Phosphor glow (brighter center)
      ctx.globalAlpha = finalOpacity * 0.7;
      ctx.shadowBlur = this.glow * pulse * 2.5;
      ctx.beginPath();
      ctx.arc(this.x, y, dotSize * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Occasional bright flare
      if (Math.random() < 0.05) {
        ctx.globalAlpha = finalOpacity;
        ctx.shadowBlur = this.glow * 4;
        ctx.beginPath();
        ctx.arc(this.x, y, dotSize * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Draw terminal character with glow
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.glow * pulse;
      ctx.font = `${this.size}px "Monaco", "Menlo", "Courier New", monospace`;
      ctx.fillStyle = this.color;
      ctx.globalAlpha = finalOpacity;
      ctx.fillText(this.char, this.x, y);

      // Ghost trail for near particles
      if (this.layer === 2) {
        ctx.globalAlpha = finalOpacity * 0.2;
        ctx.shadowBlur = this.glow * 3;
        ctx.fillText(this.char, this.x + 1, y + 1);
      }
    }

    ctx.restore();
  }
}

// Initialize on page load
export function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) {
    console.error('Particles canvas not found');
    return null;
  }

  const system = new ParticleSystem(canvas);
  system.animate();
  return system;
}
