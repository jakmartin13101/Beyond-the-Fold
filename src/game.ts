// Application shell: owns the renderer, audio, UI and the active mission. Runs the
// fixed-timestep simulation with interpolated rendering, and the state machine
// title → briefing → intro → playing ⇄ paused → cutscenes → results.
import * as THREE from 'three';
import { AudioDirector } from './audio/director';
import { audio } from './audio/engine';
import { music } from './audio/music';
import { SFX } from './audio/sfx';
import { Cutscene } from './cinematics/cutscene';
import { CineHost, bossIntroCutscene, introCutscene, outroCutscene } from './cinematics/scripts';
import { Input } from './core/input';
import { clamp, damp, dist } from './core/math';
import { CheckpointSave, SaveData, loadSave, writeSave } from './core/save';
import { Settings, loadSettings, saveSettings } from './core/settings';
import { DIFFICULTIES } from './data/enemies';
import { MISSION_01 } from './data/levels/mission01';
import { CHALLENGES, RANKS, UPGRADES } from './data/progression';
import { INTEL } from './data/story';
import { PlayerControls, emptyControls } from './game/player';
import { LANE_Z } from './game/types';
import { World } from './game/world';
import { CameraController } from './render/camera';
import { LevelScene } from './render/environment/levelScene';
import { Renderer } from './render/renderer';
import { GameView } from './render/views';
import { Hud } from './ui/hud';
import { Menus, ResultsData } from './ui/menus';
import { Radio } from './ui/radio';

type State = 'boot' | 'title' | 'playing' | 'paused' | 'cutscene' | 'dead' | 'results' | 'intel';

const STEP = 1 / 60;

export class Game implements CineHost {
  settings: Settings;
  save: SaveData;
  input: Input;
  renderer: Renderer;
  camera: CameraController;
  level: LevelScene;
  hud: Hud;
  radio: Radio;
  menus: Menus;
  world!: World;
  view!: GameView;
  private audioDir: AudioDirector | null = null;
  state: State = 'boot';
  private acc = 0;
  private last = performance.now();
  private cutscene: Cutscene | null = null;
  private timeScale = 1;
  private slowmoT = 0;
  private deathT = 0;
  private difficulty = 'regular';
  private lastCheckpoint: CheckpointSave | null = null;
  private letterbox = 0;
  private letterboxTarget = 0;
  private fadeV = 0;
  private fadeTarget = 0;
  private fadeSpeed = 1;
  private flashV = 0;
  private damageV = 0;
  private shieldBreakV = 0;
  private lowHealthV = 0;
  private titleT = 0;
  private aim = { x: 0, y: 0 };
  private aimDir = { x: 1, y: 0 };
  private cineTitle: HTMLDivElement;
  private skipHint: HTMLDivElement;
  private overlayCanvas: HTMLCanvasElement;
  private app: HTMLElement;
  private missionStartStats = { intelBefore: 0 };
  private pendingIntel: string | null = null;
  private newlyCollected = new Set<string>();

  constructor(app: HTMLElement) {
    this.app = app;
    this.settings = loadSettings();
    this.save = loadSave();
    this.difficulty = this.settings.difficulty;
    const stage = document.createElement('div');
    stage.id = 'stage';
    app.appendChild(stage);
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.id = 'overlay';
    app.appendChild(this.overlayCanvas);
    this.renderer = new Renderer(stage, this.settings);
    this.camera = new CameraController(this.renderer.camera);
    this.camera.shakeScale = this.settings.screenShake;
    this.input = new Input(app, this.settings.bindings);
    this.hud = new Hud(app, this.overlayCanvas, this.input, this.renderer);
    this.hud.showFps = this.settings.showFps;
    this.hud.setVisible(false);
    this.radio = new Radio(app);
    this.radio.subtitles = this.settings.subtitles;
    this.menus = new Menus(app, this.input);
    this.cineTitle = document.createElement('div');
    this.cineTitle.className = 'cine-title';
    this.cineTitle.innerHTML = '<div class="a"></div><div class="b"></div><div class="c"></div>';
    app.appendChild(this.cineTitle);
    this.skipHint = document.createElement('div');
    this.skipHint.className = 'skip-hint';
    this.skipHint.style.display = 'none';
    app.appendChild(this.skipHint);
    this.level = new LevelScene(MISSION_01, this.renderer);
    this.level.setParticleScale(this.settings.particles);
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('keydown', (e) => this.onGlobalKey(e));
    (window as unknown as { __btf: Game }).__btf = this;
  }

  start(): void {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.opacity = '0';
      window.setTimeout(() => loading.remove(), 700);
    }
    this.state = 'title';
    this.menus.pressStart(() => {
      audio.unlock();
      this.applyAudioSettings();
      music.start(0);
      SFX.uiSelect();
      this.showTitle();
    });
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------------------
  // Menus & flow
  // ---------------------------------------------------------------------------

  private showTitle(): void {
    this.state = 'title';
    this.app.classList.remove('hide-cursor');
    this.hud.setVisible(false);
    this.menus.title({
      canContinue: !!this.save.checkpoint,
      onContinue: () => this.continueMission(),
      onNew: () =>
        this.menus.difficulty(this.difficulty, (d) => {
          this.difficulty = d;
          this.settings.difficulty = d as Settings['difficulty'];
          saveSettings(this.settings);
          this.startMission(null);
        }),
      onArmory: () => this.menus.armory(this.save, () => writeSave(this.save)),
      onIntel: () => this.menus.intelArchive(this.save.intel),
      onSettings: () => this.menus.settings(this.settings, (s) => this.onSettingsChanged(s)),
      onControls: () => this.menus.controls(this.settings, (s) => this.onSettingsChanged(s)),
      onCredits: () => this.menus.credits(),
    });
  }

  private onSettingsChanged(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.input.bindings = s.bindings;
    this.renderer.applySettings(s);
    this.camera.shakeScale = s.screenShake;
    this.hud.showFps = s.showFps;
    this.radio.subtitles = s.subtitles;
    this.level.setParticleScale(s.particles);
    if (this.view) {
      this.view.fx.particleScale = s.particles;
      this.view.shadows = s.shadows;
    }
    this.applyAudioSettings();
  }

  private applyAudioSettings(): void {
    const s = this.settings;
    audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, voice: s.voiceVolume });
  }

  private upgradeValue = (id: string): number => {
    const u = UPGRADES.find((x) => x.id === id);
    const lvl = this.save.upgrades[id] ?? 0;
    return u && lvl > 0 ? u.values[Math.min(lvl, u.values.length) - 1] : 1;
  };

  private buildWorld(cp: CheckpointSave | null): void {
    this.disposeWorld();
    this.world = new World(MISSION_01, {
      difficulty: this.difficulty,
      checkpoint: cp,
      secondaryWeapon: this.save.loadoutSecondary,
      upgrades: this.save.upgrades,
      upgradeValues: this.upgradeValue,
    });
    this.view = new GameView(this.world, this.renderer, { armor: this.save.armor, visor: this.save.visor }, this.settings.particles);
    this.view.shadows = this.settings.shadows;
    this.audioDir = new AudioDirector(this.world);
    this.hud.attach(this.world);
    this.radio.clear();
    this.bindWorld();
    this.camera.snap(this.world);
    this.acc = 0;
    this.timeScale = 1;
  }

  private disposeWorld(): void {
    if (this.view) this.view.dispose();
    this.audioDir?.dispose();
    this.audioDir = null;
    this.hud.detach();
    this.cutscene = null;
    this.camera.cinematic = null;
  }

  private bindWorld(): void {
    const w = this.world;
    const ev = w.events;
    ev.on('radio', (r) => this.radio.push(r.lineId));
    ev.on('cameraShake', (s) => this.camera.shake(s.amount));
    ev.on('cameraKick', (k) => this.camera.kick(k.x, k.y));
    ev.on('slowmo', (s) => {
      this.timeScale = s.scale;
      this.slowmoT = s.duration;
    });
    ev.on('flash', (f) => (this.flashV = Math.max(this.flashV, f.strength)));
    ev.on('playerHurt', (h) => (this.damageV = Math.min(1, this.damageV + h.amount / 40)));
    ev.on('shieldBroken', (s) => {
      if (s.isPlayer) this.shieldBreakV = 1;
    });
    ev.on('explosion', (x) => {
      const d = dist(x.x, x.y, w.player.x, w.player.y);
      if (d < x.radius * 2) this.flashV = Math.max(this.flashV, 0.15 * (1 - d / (x.radius * 2)));
    });
    ev.on('playerDied', () => {
      this.deathT = 0;
      this.timeScale = 0.4;
      this.slowmoT = 1.2;
      this.world.stats.deaths++;
    });
    ev.on('intel', (i) => {
      this.pendingIntel = i.id;
    });
    w.onCheckpoint = (id) => {
      this.lastCheckpoint = w.snapshot(id, MISSION_01.id, this.difficulty);
      this.save.checkpoint = this.lastCheckpoint;
      writeSave(this.save);
    };
    w.onWeaponUnlocked = (id) => {
      if (!this.save.unlockedWeapons.includes(id)) {
        this.save.unlockedWeapons.push(id);
        writeSave(this.save);
      }
    };
    w.onIntel = (id) => {
      this.newlyCollected.add(id);
      if (!this.save.intel.includes(id)) {
        this.save.intel.push(id);
        writeSave(this.save);
      }
    };
    w.onCache = (id) => {
      if (id && !this.save.caches.includes(id)) {
        this.save.caches.push(id);
        writeSave(this.save);
      }
    };
  }

  private startMission(cp: CheckpointSave | null): void {
    this.menus.closeAll();
    this.lastCheckpoint = cp;
    this.missionStartStats.intelBefore = this.save.intel.length;
    this.newlyCollected.clear();
    if (!cp) {
      this.save.checkpoint = null;
      writeSave(this.save);
    }
    this.buildWorld(cp);
    this.app.classList.add('hide-cursor');
    this.input.resetAll();
    if (!cp) {
      this.state = 'cutscene';
      this.hud.setVisible(false);
      this.beginCutscene(introCutscene(this));
      this.world.runAction({ type: 'objective', text: 'Head east to Halden Station', markerX: 300, markerY: 1 });
    } else {
      this.state = 'playing';
      this.hud.setVisible(true);
      this.fade(1, 0);
      this.fade(0, 1.2);
      music.setIntensity(1);
      this.hud.banner('CHECKPOINT', 'MISSION 01 · LANDFALL', 'RESUMING OPERATION', 3);
    }
  }

  private continueMission(): void {
    const cp = this.save.checkpoint;
    if (!cp) return;
    this.difficulty = cp.difficulty;
    this.startMission(cp);
  }

  private restartFromCheckpoint(): void {
    this.menus.closeAll();
    const cp = this.lastCheckpoint;
    const deaths = this.world.stats.deaths;
    this.buildWorld(cp);
    this.world.stats.deaths = deaths;
    if (!cp) {
      // Restart from the beginning without replaying the intro.
      this.world.runAction({ type: 'objective', text: 'Head east to Halden Station', markerX: 300, markerY: 1 });
    }
    this.state = 'playing';
    this.hud.setVisible(true);
    this.app.classList.add('hide-cursor');
    this.input.resetAll();
    audio.duck(false);
    this.fade(1, 0);
    this.fade(0, 1);
    music.setIntensity(1);
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    audio.duck(true);
    this.app.classList.remove('hide-cursor');
    const w = this.world;
    this.menus.pause({
      objective: w.objective?.text ?? '',
      intel: `INTEL ${this.save.intel.length} / ${Object.keys(INTEL).length} · ${DIFFICULTIES[this.difficulty].name.toUpperCase()}`,
      onResume: () => this.resume(),
      onRestart: () => this.restartFromCheckpoint(),
      onSettings: () => this.menus.settings(this.settings, (s) => this.onSettingsChanged(s)),
      onControls: () => this.menus.controls(this.settings, (s) => this.onSettingsChanged(s)),
      onQuit: () => this.quitToTitle(),
    });
  }

  private resume(): void {
    this.menus.closeAll();
    this.state = 'playing';
    audio.duck(false);
    this.app.classList.add('hide-cursor');
    this.input.resetAll();
    this.last = performance.now();
  }

  private quitToTitle(): void {
    audio.duck(false);
    this.disposeWorld();
    this.radio.clear();
    this.setLetterbox(false);
    this.fade(0, 0.3);
    music.setIntensity(0);
    this.showTitle();
  }

  private onGlobalKey(e: KeyboardEvent): void {
    if (this.input.captureNext) return;
    if (this.state === 'cutscene' && this.cutscene && (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space')) {
      if (this.cutscene.t > 0.5) this.cutscene.skip();
    }
  }

  // ---------------------------------------------------------------------------
  // Cutscenes (CineHost)
  // ---------------------------------------------------------------------------

  private beginCutscene(cs: Cutscene): void {
    this.cutscene = cs;
    this.state = 'cutscene';
    this.hud.setVisible(false);
    this.radio.setCinematic(true);
    this.skipHint.style.display = '';
    this.skipHint.textContent = this.input.device === 'pad' ? 'A · SKIP' : 'ENTER · SKIP';
  }

  private endCutscene(): void {
    this.cutscene = null;
    this.camera.cinematic = null;
    this.radio.setCinematic(false);
    this.skipHint.style.display = 'none';
    if (this.state === 'cutscene') {
      this.state = 'playing';
      this.hud.setVisible(true);
      this.input.resetAll();
    }
  }

  setLetterbox(on: boolean): void {
    this.letterboxTarget = on ? 1 : 0;
  }

  fade(to: number, time: number): void {
    this.fadeTarget = to;
    if (time <= 0) this.fadeV = to;
    this.fadeSpeed = time > 0 ? 1 / time : 999;
  }

  flash(strength: number): void {
    this.flashV = Math.max(this.flashV, strength);
  }

  titleCard(a: string, b: string, c: string, duration: number): void {
    const el = this.cineTitle;
    (el.querySelector('.a') as HTMLElement).textContent = a;
    (el.querySelector('.b') as HTMLElement).textContent = b;
    (el.querySelector('.c') as HTMLElement).textContent = c;
    el.classList.add('show');
    this.titleT = duration;
  }

  shake(amount: number): void {
    this.camera.shake(amount);
  }

  music(intensity: number): void {
    music.setIntensity(intensity);
  }

  sting(kind: 'victory' | 'death' | 'boss' | 'reveal'): void {
    SFX.sting(kind);
  }

  sound(name: string, x?: number): void {
    if (!audio.ready) return;
    const p = { x: x ?? this.camera.x };
    switch (name) {
      case 'crash':
        SFX.explosion({ ...p, size: 8, volume: 1.4 });
        SFX.rumble(p);
        break;
      case 'flak':
        SFX.explosion({ ...p, size: 1.5, volume: 0.5, kind: 'plasma' });
        break;
      case 'rumble':
        SFX.rumble({ ...p, volume: 1.4 });
        break;
      case 'alarm':
        SFX.alarm(p);
        break;
      case 'horn':
        SFX.bossHorn(p);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const frameDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.input.pollGamepad();
    this.menus.pollGamepad();

    const simActive = this.state === 'playing' || this.state === 'cutscene' || this.state === 'dead';
    let alpha = 1;
    if (simActive && this.world) {
      if (this.slowmoT > 0) {
        this.slowmoT -= frameDt;
        if (this.slowmoT <= 0) this.timeScale = 1;
      }
      this.acc += frameDt * this.timeScale;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.step();
        this.acc -= STEP;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      alpha = this.acc / STEP;
    }
    this.renderFrame(frameDt, alpha);
  }

  private step(): void {
    const w = this.world;
    this.input.beginStep(STEP);
    // Gamepad cutscene skip.
    if (this.state === 'cutscene' && this.cutscene && this.input.pressed('jump') && this.input.device === 'pad' && this.cutscene.t > 0.5) this.cutscene.skip();
    if (this.state === 'playing' && this.input.pressed('pause')) {
      this.input.endStep();
      this.pause();
      return;
    }
    w.player.controls = this.state === 'playing' ? this.buildControls() : emptyControls(w.player.x + w.player.facing * 5, w.player.shoulderY());
    w.update(STEP);
    if (this.cutscene) {
      this.cutscene.update(STEP);
      if (this.cutscene.hasCamera) this.camera.cinematic = this.cutscene.shot;
      if (this.cutscene.done) this.endCutscene();
    }
    this.input.endStep();

    // Flow checks.
    if (w.pendingCutscene && this.state === 'playing') {
      const id = w.pendingCutscene;
      w.pendingCutscene = null;
      if (id === 'boss_intro') this.beginCutscene(bossIntroCutscene(this));
      else if (id === 'outro') this.beginCutscene(outroCutscene(this, () => this.finishMission()));
    }
    if (this.pendingIntel && this.state === 'playing') {
      const id = this.pendingIntel;
      this.pendingIntel = null;
      this.state = 'intel';
      this.app.classList.remove('hide-cursor');
      audio.duck(true);
      this.menus.intelReader(id, () => {
        this.menus.closeAll();
        this.resume();
      });
    }
    if (w.player.dead && this.state === 'playing') {
      this.state = 'dead';
      this.deathT = 0;
    }
    if (this.state === 'dead') {
      this.deathT += STEP;
      if (this.deathT > 2.4 && !this.menus.open) {
        this.app.classList.remove('hide-cursor');
        this.radio.push('death_1');
        this.menus.death(
          () => this.restartFromCheckpoint(),
          () => this.quitToTitle(),
        );
      }
    }
  }

  /** Map raw input to player controls, including mouse/stick aiming and aim assist. */
  private buildControls(): PlayerControls {
    const inp = this.input;
    const p = this.world.player;
    const c = emptyControls();
    c.moveX = inp.axisX();
    c.jumpPressed = inp.pressed('jump');
    c.jumpHeld = inp.down('jump');
    c.crouchHeld = inp.down('crouch');
    c.crouchPressed = inp.pressed('crouch');
    c.sprintHeld = inp.down('sprint');
    c.fire = { pressed: inp.pressed('fire'), held: inp.down('fire'), released: inp.released('fire') };
    c.grenadePressed = inp.pressed('grenade');
    c.meleePressed = inp.pressed('melee');
    c.reloadPressed = inp.pressed('reload');
    c.interactPressed = inp.pressed('interact');
    c.switchPressed = inp.pressed('switchWeapon');
    c.cycleGrenadePressed = inp.pressed('cycleGrenade');
    c.laneIn = inp.pressed('laneIn');
    c.laneOut = inp.pressed('laneOut');
    // Gamepad: the shared X button reloads on tap and interacts when a prompt is shown.
    if (inp.device === 'pad' && p.interactPrompt && c.reloadPressed) {
      c.reloadPressed = false;
      c.interactPressed = true;
    }
    const sy = p.shoulderY();
    if (inp.device === 'pad') {
      let ax = inp.aimX;
      let ay = inp.aimY;
      if (ax === 0 && ay === 0) {
        ax = Math.abs(inp.moveX) > 0.3 ? Math.sign(inp.moveX) : p.facing;
        ay = 0;
      }
      let ang = Math.atan2(ay, ax);
      if (this.settings.aimAssist) ang = this.aimAssist(ang);
      this.aim.x = p.x + Math.cos(ang) * 7;
      this.aim.y = sy + Math.sin(ang) * 7;
    } else {
      this.renderer.unproject(inp.mouseX, inp.mouseY, LANE_Z[p.lane], this.aim);
    }
    c.aimX = this.aim.x;
    c.aimY = this.aim.y;
    return c;
  }

  private aimAssist(ang: number): number {
    const p = this.world.player;
    const sy = p.shoulderY();
    let best = ang;
    let bestD = 0.32;
    for (const e of this.world.enemies) {
      if (e.dead || e.entering || e.lane !== p.lane) continue;
      const dx = e.x - p.x;
      const dy = e.centerY() - sy;
      const d = Math.hypot(dx, dy);
      if (d > 18) continue;
      let da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < bestD) {
        bestD = Math.abs(da);
        best = ang + da * 0.75;
      }
    }
    return best;
  }

  private renderFrame(dt: number, alpha: number): void {
    const w = this.world && (this.state !== 'title' && this.state !== 'boot') ? this.world : null;
    if (w) {
      const p = w.player;
      const dx = this.aim.x - p.x;
      const dy = this.aim.y - p.shoulderY();
      const len = Math.hypot(dx, dy) || 1;
      const k = clamp(len / 9, 0, 1);
      this.aimDir.x = (dx / len) * k;
      this.aimDir.y = (dy / len) * k;
      if (this.state === 'cutscene' || p.dead) this.aimDir.x = this.aimDir.y = 0;
      this.camera.update(dt, w, alpha, this.aimDir);
      this.renderer.shadowFocus.set(this.camera.x, this.camera.y, 0);
      this.view.update(alpha, dt);
      this.audioDir?.update(dt, this.camera.x, this.camera.y);
      this.level.update(dt, this.camera.x, this.camera.y, p.x, p.y, this.camera.halfWidth());
    } else {
      // Title: slow cinematic drift over the crash site and the alien vista.
      this.titleDrift(dt);
    }
    this.renderer.additive.update(this.timeScale * dt);
    this.renderer.alpha.update(this.timeScale * dt);
    this.renderer.debris.update(this.timeScale * dt);
    this.renderer.shards.update(this.timeScale * dt);

    // Screen-space grade.
    const g = this.renderer.grade.uniforms;
    this.letterbox = damp(this.letterbox, this.letterboxTarget, 4, dt);
    g.letterbox.value = this.letterbox;
    if (this.fadeV !== this.fadeTarget) {
      const d = this.fadeTarget - this.fadeV;
      const stepV = this.fadeSpeed * dt;
      this.fadeV = Math.abs(d) <= stepV ? this.fadeTarget : this.fadeV + Math.sign(d) * stepV;
    }
    g.fade.value = this.fadeV;
    this.flashV = Math.max(0, this.flashV - dt * 2.5);
    g.flash.value = this.flashV;
    this.damageV = Math.max(0, this.damageV - dt * 1.6);
    g.damage.value = this.damageV;
    this.shieldBreakV = Math.max(0, this.shieldBreakV - dt * 2);
    g.shieldBreak.value = this.shieldBreakV;
    g.chroma.value = this.damageV * 0.8 + this.shieldBreakV;
    const low = w && !w.player.dead && w.player.health < 35 ? 1 : 0;
    this.lowHealthV = damp(this.lowHealthV, low, 3, dt);
    g.lowHealth.value = this.lowHealthV;
    g.vignette.value = this.state === 'cutscene' ? 0.45 : 0.32;

    this.renderer.render(dt, performance.now() / 1000);

    // UI.
    if (this.titleT > 0) {
      this.titleT -= dt;
      if (this.titleT <= 0) this.cineTitle.classList.remove('show');
    }
    this.radio.update(this.state === 'paused' || this.state === 'intel' ? 0 : dt);
    this.hud.update(this.state === 'paused' ? 0 : dt, dt);
    this.hud.drawOverlay(dt, this.input.device === 'kbm', this.input.mouseX, this.input.mouseY, this.state !== 'playing');
  }

  private titleAngle = 0;
  private titleDrift(dt: number): void {
    this.titleAngle += dt * 0.025;
    const t = this.titleAngle;
    const x = -6 + Math.sin(t) * 10;
    this.camera.cinematic = {
      pos: tmpPos(x, 3.2 + Math.sin(t * 1.7) * 0.6, 24),
      target: tmpTarget(x + 6, 6.5, -20),
      fov: 40,
    };
    this.camera.cineBlend = 1;
    this.camera.update(dt, null, 1, { x: 0, y: 0 });
    this.renderer.shadowFocus.set(x + 6, 2, 0);
    this.level.update(dt, x + 6, 3, -1000, -1000, 20);
  }

  // ---------------------------------------------------------------------------
  // Mission results & progression
  // ---------------------------------------------------------------------------

  private finishMission(): void {
    const w = this.world;
    const s = w.stats;
    const diff = DIFFICULTIES[this.difficulty];
    const accuracy = s.shotsFired > 0 ? Math.min(1, s.shotsHit / s.shotsFired) : 0;
    const timeBonus = Math.max(0, 900 - s.time) * 4;
    const raw = s.score + timeBonus + accuracy * 2000 - s.deaths * 400;
    const score = Math.max(0, Math.round(raw * diff.scoreMult));
    const rank = RANKS.find((r) => score >= r.min)?.rank ?? 'D';
    const intelTotal = Object.keys(INTEL).length;
    const intelThisRun = [...w.collected].filter((c) => c.startsWith('intel_')).length;
    const challengeState: Record<string, boolean> = {
      m01_marksman: s.headshots >= 12,
      m01_demolition: s.explosiveKills >= 6,
      m01_archivist: intelThisRun >= intelTotal,
      m01_untouchable: s.deaths === 0,
      m01_engineer: s.tankHits > 0,
    };
    let rp = { S: 300, A: 220, B: 160, C: 110, D: 80 }[rank] ?? 80;
    rp += s.requisition;
    const challenges = CHALLENGES.map((c) => {
      const done = !!challengeState[c.id];
      const newly = done && !this.save.challenges.includes(c.id);
      if (newly) {
        this.save.challenges.push(c.id);
        rp += c.reward;
      }
      return { id: c.id, done, newly };
    });
    this.save.requisition += rp;
    const unlocks: string[] = [];
    const unlock = (id: string, label: string) => {
      if (!this.save.unlockedCosmetics.includes(id)) {
        this.save.unlockedCosmetics.push(id);
        unlocks.push(label);
      }
    };
    unlock('nightops', 'Armor: Night Operations');
    unlock('violet', 'Visor: Violet');
    if (rank === 'S' || rank === 'A') unlock('ember', 'Armor: Ember Guard');
    if (this.difficulty === 'veteran' || this.difficulty === 'ironclad') unlock('crimson', 'Armor: Crimson Vanguard');
    if (this.save.intel.length >= intelTotal) unlock('origami', 'Armor: Origami Gold');
    if (CHALLENGES.every((c) => this.save.challenges.includes(c.id))) unlock('jade', 'Visor: Jade');
    const rec = this.save.missions[MISSION_01.id] ?? { bestRank: 'D', bestScore: 0, bestTime: 0, completed: [] };
    if (score > rec.bestScore) {
      rec.bestScore = score;
      rec.bestRank = rank;
    }
    if (!rec.bestTime || s.time < rec.bestTime) rec.bestTime = s.time;
    if (!rec.completed.includes(this.difficulty)) rec.completed.push(this.difficulty);
    this.save.missions[MISSION_01.id] = rec;
    this.save.checkpoint = null;
    writeSave(this.save);

    const data: ResultsData = {
      rank,
      score,
      time: s.time,
      kills: s.kills,
      headshots: s.headshots,
      accuracy,
      deaths: s.deaths,
      intel: intelThisRun,
      intelTotal,
      caches: s.caches,
      rpEarned: rp,
      challenges,
      unlocks,
      difficulty: this.difficulty,
    };
    this.state = 'results';
    this.setLetterbox(false);
    this.hud.setVisible(false);
    this.app.classList.remove('hide-cursor');
    this.fade(0.55, 1);
    music.setIntensity(0);
    this.menus.results(
      data,
      () => {
        this.fade(0, 0.5);
        this.quitToTitle();
      },
      () => {
        this.fade(0, 0.5);
        this.startMission(null);
      },
    );
  }
}

const tp = new THREE.Vector3();
const tt = new THREE.Vector3();
const tmpPos = (x: number, y: number, z: number): THREE.Vector3 => tp.set(x, y, z);
const tmpTarget = (x: number, y: number, z: number): THREE.Vector3 => tt.set(x, y, z);
