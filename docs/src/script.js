// Import modules
import { animateLogo } from './logo-animation.js';
import { animateStaticLogo } from './logo-static.js';
import { initTerminalSim } from './terminal-sim.js';
import { initHolographicCards } from './holographic-cards.js';

// Fetch and display current version
async function updateVersion() {
  try {
    const response = await fetch('/../../package.json');
    const pkg = await response.json();
    const versionEl = document.getElementById('dmux-version');
    if (versionEl && pkg.version) {
      versionEl.textContent = `v${pkg.version}`;
    }
  } catch (e) {
    console.error('Failed to fetch version:', e);
  }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Update version from package.json
  updateVersion();
  // Always start the static breathing logo
  animateStaticLogo();

  // Check if mobile
  const isMobile = window.innerWidth <= 768;

  // TEMP: Disable intro animation for testing
  const SKIP_INTRO = false;

  if (isMobile || SKIP_INTRO) {
    // On mobile, hide intro canvas and don't use intro mode
    const introCanvas = document.getElementById('logo-canvas');
    if (introCanvas) {
      introCanvas.classList.add('hidden');
    }
    // Don't add intro-mode class on mobile
    // Immediately dispatch intro complete event
    if (SKIP_INTRO) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('introComplete'));
      }, 100);
    }
  } else {
    // On desktop, start in intro mode and run animation
    document.body.classList.add('intro-mode');
    animateLogo();
  }

  // Start terminal simulation
  initTerminalSim();

  // Initialize holographic card effects
  initHolographicCards();
});

// Function to end intro and reveal page
export function endIntro() {
  document.body.classList.remove('intro-mode');
  // Dispatch event to signal intro is complete
  window.dispatchEvent(new CustomEvent('introComplete'));
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
const typedTerminalLine = document.querySelector('.terminal-line');
const typedCursor = document.querySelector('.terminal-line .cursor');
const typedTerminalWindow = document.querySelector('.terminal-window');
if (typedElement && typedTerminalWindow) {
  const text = 'dmux';
  let index = 0;
  let hasTyped = false;
  let introComplete = false;
  let isInView = false;

  typedElement.textContent = '';

  function checkAndStartTyping() {
    if (introComplete && isInView && !hasTyped) {
      hasTyped = true;
      // Wait 1.5 seconds before typing "dmux"
      setTimeout(type, 1500);
    }
  }

  function type() {
    if (index < text.length) {
      typedElement.textContent += text.charAt(index);
      index++;
      setTimeout(type, 150);
    } else {
      // Hide the cursor and terminal line after a delay
      setTimeout(() => {
        if (typedCursor) {
          typedCursor.style.display = 'none';
        }
        setTimeout(() => {
          if (typedTerminalLine) {
            typedTerminalLine.style.display = 'none';
          }
          // Dispatch event to signal typing is complete
          window.dispatchEvent(new CustomEvent('dmuxTypingComplete'));
        }, 500);
      }, 500);
    }
  }

  // Listen for intro completion
  window.addEventListener('introComplete', () => {
    introComplete = true;
    checkAndStartTyping();
  });

  // On mobile, intro completes immediately
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    introComplete = true;
  }

  // Use IntersectionObserver to detect when terminal window is in view
  const typedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        isInView = true;
        typedObserver.unobserve(entry.target);
        checkAndStartTyping();
      }
    });
  }, {
    threshold: 0.3
  });

  typedObserver.observe(typedTerminalWindow);
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
