// Import modules
import { animateLogo } from './logo-animation.js';
import { animateStaticLogo } from './logo-static.js';
import { initTerminalSim } from './terminal-sim.js';
import { initHolographicCards } from './holographic-cards.js';

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Start in intro mode
  document.body.classList.add('intro-mode');

  // Always start the static breathing logo
  animateStaticLogo();

  // Only run intro animation on desktop
  if (window.innerWidth > 768) {
    animateLogo();
  } else {
    // On mobile, hide intro canvas immediately and exit intro mode
    const introCanvas = document.getElementById('logo-canvas');
    if (introCanvas) {
      introCanvas.classList.add('hidden');
    }
    document.body.classList.remove('intro-mode');
  }

  // Start terminal simulation
  initTerminalSim();

  // Initialize holographic card effects
  initHolographicCards();
});

// Function to end intro and reveal page
export function endIntro() {
  document.body.classList.remove('intro-mode');
}

// Copy to clipboard functionality
document.querySelectorAll('.copy-btn').forEach(button => {
  button.addEventListener('click', async () => {
    const textToCopy = button.getAttribute('data-copy');

    try {
      await navigator.clipboard.writeText(textToCopy);

      // Visual feedback
      const originalText = button.textContent;
      button.textContent = 'Copied!';
      button.classList.add('copied');

      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('copied');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      button.textContent = 'Failed';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 2000);
    }
  });
});

// Typing animation for hero demo
const typedElement = document.querySelector('.typed-text');
if (typedElement) {
  const text = 'dmux';
  let index = 0;

  typedElement.textContent = '';

  function type() {
    if (index < text.length) {
      typedElement.textContent += text.charAt(index);
      index++;
      setTimeout(type, 150);
    } else {
      // Remove blinking cursor effect after typing is complete
      setTimeout(() => {
        typedElement.style.animation = 'none';
      }, 1000);
    }
  }

  // Start typing after a brief delay
  setTimeout(type, 500);
}

// Animate elements on scroll
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Observe all sections
document.querySelectorAll('section').forEach(section => {
  section.style.opacity = '0';
  observer.observe(section);
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));

    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// Add keyboard shortcut visualization
const shortcutElements = document.querySelectorAll('.shortcut');
shortcutElements.forEach((element, index) => {
  element.style.animationDelay = `${index * 0.1}s`;
});

// Terminal simulation replaces the static demo

// Add subtle parallax effect to hero section
window.addEventListener('scroll', () => {
  const scrolled = window.pageYOffset;
  const hero = document.querySelector('.terminal-header');

  if (hero && scrolled < window.innerHeight) {
    hero.style.transform = `translateY(${scrolled * 0.3}px)`;
    hero.style.opacity = 1 - (scrolled / 600);
  }
});

// Animate feature cards on hover
document.querySelectorAll('.feature-card, .use-case').forEach(card => {
  card.addEventListener('mouseenter', function() {
    this.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
  });
});

// Add glow effect to terminal window
const terminalWindow = document.querySelector('.terminal-window');
if (terminalWindow) {
  terminalWindow.addEventListener('mouseenter', () => {
    terminalWindow.style.boxShadow = '0 10px 40px rgba(89, 194, 255, 0.3)';
  });

  terminalWindow.addEventListener('mouseleave', () => {
    terminalWindow.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.5)';
  });
}

// Easter egg: Konami code
let konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
  if (e.key === konamiCode[konamiIndex]) {
    konamiIndex++;
    if (konamiIndex === konamiCode.length) {
      activateEasterEgg();
      konamiIndex = 0;
    }
  } else {
    konamiIndex = 0;
  }
});

function activateEasterEgg() {
  const body = document.body;
  body.style.animation = 'rainbow 2s linear infinite';

  // Add rainbow keyframes if not already present
  if (!document.querySelector('#rainbow-keyframes')) {
    const style = document.createElement('style');
    style.id = 'rainbow-keyframes';
    style.textContent = `
      @keyframes rainbow {
        0% { filter: hue-rotate(0deg); }
        100% { filter: hue-rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  // Create notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg-tertiary);
    border: 2px solid var(--orange-primary);
    padding: 2rem;
    color: var(--orange-primary);
    font-size: 1.5rem;
    z-index: 9999;
    text-align: center;
    box-shadow: 0 0 40px var(--shadow);
  `;
  notification.textContent = 'You found the secret!';
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
    body.style.animation = '';
  }, 3000);
}

// Add loading animation for sections
window.addEventListener('load', () => {
  document.body.classList.add('loaded');
});

// Performance optimization: Lazy load images if any are added
if ('loading' in HTMLImageElement.prototype) {
  const images = document.querySelectorAll('img[loading="lazy"]');
  images.forEach(img => {
    img.src = img.dataset.src;
  });
} else {
  // Fallback for browsers that don't support lazy loading
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lazysizes/5.3.2/lazysizes.min.js';
  document.body.appendChild(script);
}
