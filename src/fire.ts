// Easter egg: what the undocumented HCF (halt and catch fire) instruction looks like.
import './fire.css';

const BURN_MS = 8000;
const FADE_MS = 1600;

let overlay: HTMLElement | null = null;
let timers: number[] = [];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function div(className: string, vars: Record<string, string> = {}): HTMLElement {
  const node = document.createElement('div');
  node.className = className;
  for (const [k, v] of Object.entries(vars)) node.style.setProperty(k, v);
  return node;
}

function flame(back: boolean, x: number): HTMLElement {
  const w = back ? rand(100, 210) : rand(55, 140);
  const h = Math.min(w * (back ? rand(2.2, 3.6) : rand(1.6, 2.8)), window.innerHeight * 0.75);
  const node = div(`flame ${back ? 'back' : 'front'}`, {
    '--x': `${x}%`,
    '--w': `${w}px`,
    '--h': `${h}px`,
    '--d': `${rand(0, 1.4).toFixed(2)}s`,
    '--t': `${rand(0.35, 0.85).toFixed(2)}s`,
  });
  node.append(document.createElement('i'));
  return node;
}

function build(): HTMLElement {
  const root = div('fire-overlay');

  // Everything decorative is hidden from assistive technology; the status bar announces the event.
  const fx = div('fire-fx');
  fx.setAttribute('aria-hidden', 'true');
  fx.append(div('fire-glow'));

  const smoke = div('fire-layer');
  for (let i = 0; i < 7; i++) {
    smoke.append(div('smoke', { '--x': `${rand(5, 95)}%`, '--s': `${rand(140, 300)}px`, '--d': `${rand(0, 3).toFixed(2)}s`, '--t': `${rand(4, 7).toFixed(2)}s` }));
  }
  fx.append(smoke);

  const flames = div('fire-layer');
  const BACK = 16;
  const FRONT = 22;
  for (let i = 0; i < BACK; i++) flames.append(flame(true, (i / (BACK - 1)) * 110 - 5 + rand(-2, 2)));
  for (let i = 0; i < FRONT; i++) flames.append(flame(false, (i / (FRONT - 1)) * 110 - 5 + rand(-2, 2)));
  fx.append(flames);

  const embers = div('fire-layer');
  for (let i = 0; i < 36; i++) {
    embers.append(
      div('ember', {
        '--x': `${rand(0, 100)}%`,
        '--s': `${rand(3, 8).toFixed(1)}px`,
        '--dx': `${rand(-120, 120).toFixed(0)}px`,
        '--d': `${rand(0, 4).toFixed(2)}s`,
        '--t': `${rand(2.2, 5).toFixed(2)}s`,
      }),
    );
  }
  fx.append(embers);
  root.append(fx);

  const banner = div('fire-banner');
  const title = document.createElement('h2');
  title.textContent = 'HALT AND CATCH FIRE';
  title.setAttribute('aria-hidden', 'true');
  const sub = document.createElement('p');
  sub.textContent = 'HCF: the CPU has stopped, and it is on fire.';
  sub.setAttribute('aria-hidden', 'true');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Extinguish';
  button.addEventListener('click', () => extinguishFire(true));
  banner.append(title, sub, button);
  root.append(banner);
  return root;
}

/** Play the animation. Restarts it if it is already burning. */
export function igniteFire() {
  extinguishFire();
  overlay = build();
  document.body.append(overlay);
  document.body.classList.add('fire-shake');
  timers.push(window.setTimeout(() => document.body.classList.remove('fire-shake'), 900));
  timers.push(window.setTimeout(() => extinguishFire(true), BURN_MS));
}

/** Stop the animation. `fade` lets the flames die down instead of vanishing. */
export function extinguishFire(fade = false) {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
  document.body.classList.remove('fire-shake');
  const node = overlay;
  overlay = null;
  if (!node) return;
  if (!fade) {
    node.remove();
    return;
  }
  node.classList.add('out');
  window.setTimeout(() => node.remove(), FADE_MS);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay) extinguishFire(true);
});
