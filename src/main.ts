import './styles.css';
import { Game } from './game';

function boot(): void {
  const app = document.getElementById('app');
  if (!app) return;
  try {
    const game = new Game(app);
    // Fonts are used in canvas-drawn labels; wait for them before showing the title.
    const ready = document.fonts ? document.fonts.ready : Promise.resolve();
    void ready.then(() => game.start());
  } catch (err) {
    const loading = document.getElementById('loading');
    if (loading) loading.innerHTML = `<div>UNABLE TO START</div><div style="font-size:14px;letter-spacing:.1em;opacity:.7;max-width:520px;text-align:center">${String(err)}<br/>Beyond the Fold needs a browser with WebGL2 support.</div>`;
    throw err;
  }
}

boot();
