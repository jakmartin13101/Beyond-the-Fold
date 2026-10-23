// Papercraft prop models: explosive canisters, supply crates, barricades, fuel tanks,
// hazards, checkpoint beacons, pickups and collectibles, grenades and the Heron dropship.
import * as THREE from 'three';
import { Rng } from '../../core/math';
import { box, card, chamfer, edgeColor, foldedRockGeo, gem, glow, labelTexture, metalPaper, outline, paper, prism, stripes } from '../paper';
import { buildWeaponModel } from './weapons';

export function buildBarrel(): THREE.Group {
  const g = new THREE.Group();
  const body = prism(0.4, 0.4, 1.05, 8, paper(0x6a3f8a));
  body.position.y = 0.52;
  g.add(body);
  outline(body, 0x140c1c, 0.4, 20);
  for (const y of [0.22, 0.82]) {
    const ring = prism(0.43, 0.43, 0.08, 8, paper(0xc9a24a));
    ring.position.y = y;
    g.add(ring);
  }
  const band = prism(0.41, 0.41, 0.2, 8, glow(0x9dff4a, 1.8));
  band.name = 'glow';
  band.position.y = 0.52;
  g.add(band);
  const cap = prism(0.2, 0.3, 0.12, 8, paper(0x3a2054));
  cap.position.y = 1.1;
  g.add(cap);
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: labelTexture('⚠', '#ffde4a', 'rgba(0,0,0,0)', 128, 128, 'bold 96px sans-serif'), transparent: true }));
  warn.position.set(0, 0.75, 0.42);
  g.add(warn);
  return g;
}

export function buildCrate(small: boolean, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const w = small ? 1.0 : 1.5;
  const h = small ? 0.9 : 1.15;
  const d = small ? 1.0 : 1.3;
  const col = small ? 0x7d6b4a : 0x6a7458;
  const body = chamfer(w, h, d, col, 0.12);
  body.position.y = h / 2;
  g.add(body);
  outline(body, 0x1a1408, 0.45, 20);
  // Folded cardboard flaps and straps.
  const flap = card(
    [
      [-w / 2, 0],
      [w / 2, 0],
      [w / 2 - 0.08, 0.06],
      [-w / 2 + 0.08, 0.06],
    ],
    d * 0.98,
    edgeColor(col, 0.2),
  );
  flap.position.y = h;
  g.add(flap);
  for (const x of [-w * 0.3, w * 0.3]) {
    const strap = box(0.08, h + 0.02, d + 0.02, paper(0x2c2a24));
    strap.position.set(x, h / 2, 0);
    g.add(strap);
  }
  const r = new Rng(seed);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.45, h * 0.35),
    new THREE.MeshStandardMaterial({ map: labelTexture(r.pick(['CEF-07', 'HALDEN', 'AMMO', 'FRAGILE', 'SUPPLY']), '#1e1e1a', '#d8cfb0'), roughness: 0.9 }),
  );
  label.position.set(0, h * 0.5, d / 2 + 0.012);
  g.add(label);
  return g;
}

export function buildBarricade(): THREE.Group {
  const g = new THREE.Group();
  const body = card(
    [
      [-0.85, 0],
      [0.85, 0],
      [0.6, 0.3],
      [0.35, 1.1],
      [-0.35, 1.1],
      [-0.6, 0.3],
    ],
    1.2,
    0x8e8a80,
  );
  g.add(body);
  outline(body, 0x1a1a1a, 0.4);
  const st = box(1.0, 0.12, 1.22, stripes());
  st.position.y = 0.85;
  g.add(st);
  return g;
}

export function buildSandbags(): THREE.Group {
  const g = new THREE.Group();
  const r = new Rng(17);
  for (let row = 0; row < 3; row++) {
    const n = 4 - row;
    for (let i = 0; i < n; i++) {
      const bag = chamfer(0.55, 0.3, 0.9, 0x8a7d58, 0.4);
      bag.position.set(-0.75 + i * 0.5 + row * 0.25 + r.range(-0.03, 0.03), 0.15 + row * 0.28, r.range(-0.05, 0.05));
      bag.rotation.y = r.range(-0.1, 0.1);
      g.add(bag);
    }
  }
  return g;
}

export function buildFuelTank(): THREE.Group {
  const g = new THREE.Group();
  const tank = prism(0.95, 0.95, 2.6, 10, metalPaper(0xb8402a, 0.5, 0.35));
  tank.position.y = 1.6;
  g.add(tank);
  outline(tank, 0x1a0a08, 0.4, 20);
  for (const y of [0.45, 2.75]) {
    const cap = prism(0.7, 0.95, 0.3, 10, metalPaper(0x4a4a4a, 0.5, 0.4));
    cap.position.y = y;
    if (y > 1) cap.rotation.x = Math.PI;
    g.add(cap);
  }
  const band = prism(0.97, 0.97, 0.35, 10, stripes());
  band.position.y = 1.9;
  g.add(band);
  const legs = box(1.8, 0.3, 0.3, paper(0x2a2a2a));
  legs.position.y = 0.15;
  g.add(legs);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.5),
    new THREE.MeshBasicMaterial({ map: labelTexture('FLAMMABLE', '#1a1a1a', '#f2b632', 256, 96, 'bold 44px "Chakra Petch", sans-serif') }),
  );
  sign.position.set(0, 1.3, 0.96);
  g.add(sign);
  const lamp = gem(0.1, glow(0xffb340, 3), 0, 'oct');
  lamp.name = 'glow';
  lamp.position.set(0, 3.1, 0);
  g.add(lamp);
  return g;
}

export function buildVent(): THREE.Group {
  const g = new THREE.Group();
  const r = new Rng(3);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rock = new THREE.Mesh(foldedRockGeo(0.35, 0.4, 0.35, 40 + i, 1, 0.3), paper(0x3b2d4f));
    rock.position.set(Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.45);
    rock.rotation.y = r.range(0, 3);
    rock.castShadow = true;
    g.add(rock);
  }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), glow(0x5ff2d0, 1.5));
  mouth.name = 'glow';
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = 0.04;
  g.add(mouth);
  return g;
}

export function buildCrumble(w: number, h: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(foldedRockGeo(w, h, 2.4, seed, 3, 0.14), [paper(0x7a6890)]);
  top.position.y = -h / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  const under = new THREE.Mesh(new THREE.ConeGeometry(w * 0.45, 1.6, 5, 1), paper(0x4a3b60));
  under.rotation.x = Math.PI;
  under.position.y = -h - 0.75;
  g.add(under);
  // Cracks glow faintly to signal instability.
  const crack = box(w * 0.7, 0.03, 0.02, glow(0xffb070, 1.5));
  crack.position.set(0, -h * 0.4, 1.21);
  crack.rotation.z = 0.15;
  g.add(crack);
  const grass = box(w * 1.02, 0.08, 2.42, paper(0x2f8f86));
  grass.position.y = -0.03;
  g.add(grass);
  return g;
}

export function buildBeacon(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const leg = prism(0.03, 0.04, 1.2, 4, paper(0x3b4650));
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.25);
    leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    g.add(leg);
  }
  const head = chamfer(0.3, 0.4, 0.3, 0x5d6f7c, 0.3);
  head.position.y = 1.2;
  g.add(head);
  const lamp = gem(0.12, glow(0xe8772e, 3), 0, 'oct');
  lamp.name = 'lamp';
  lamp.position.y = 1.55;
  g.add(lamp);
  const flag = card(
    [
      [0, 0],
      [0.4, -0.08],
      [0, -0.25],
    ],
    0.02,
    0xe8772e,
  );
  flag.name = 'flag';
  flag.position.set(0.02, 2.1, 0);
  g.add(flag);
  const mast = prism(0.015, 0.015, 0.7, 4, paper(0x222222));
  mast.position.y = 1.85;
  g.add(mast);
  return g;
}

export function buildPickup(type: string, weaponId: string | null, grenade: string): THREE.Group {
  const g = new THREE.Group();
  switch (type) {
    case 'weapon': {
      const w = buildWeaponModel(weaponId ?? 'ar');
      w.name = 'spin';
      w.position.y = 0.55;
      g.add(w);
      break;
    }
    case 'ammo': {
      const b = chamfer(0.55, 0.32, 0.4, 0x4f5a3c, 0.2);
      b.position.y = 0.16;
      g.add(b);
      const lid = box(0.57, 0.06, 0.42, paper(0x343c28));
      lid.position.y = 0.34;
      g.add(lid);
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.16), new THREE.MeshBasicMaterial({ map: labelTexture('AMMO', '#f2e6c0', 'rgba(0,0,0,0)') , transparent: true }));
      l.position.set(0, 0.18, 0.205);
      g.add(l);
      break;
    }
    case 'grenades': {
      const plasma = grenade === 'plasma';
      for (let i = 0; i < 2; i++) {
        const gr = gem(0.14, plasma ? glow(0x9dff4a, 2) : paper(0x5a6a48), 0, plasma ? 'oct' : 'ico');
        gr.position.set(-0.14 + i * 0.28, 0.16, 0);
        g.add(gr);
      }
      break;
    }
    case 'health': {
      const b = chamfer(0.5, 0.36, 0.3, 0xe8e2d0, 0.25);
      b.position.y = 0.18;
      g.add(b);
      const c1 = box(0.26, 0.08, 0.31, paper(0xd03a3a));
      c1.position.y = 0.2;
      const c2 = box(0.08, 0.26, 0.31, paper(0xd03a3a));
      c2.position.y = 0.2;
      g.add(c1, c2);
      break;
    }
    case 'intel': {
      const pad = chamfer(0.36, 0.5, 0.05, 0x2a3038, 0.2);
      pad.name = 'spin';
      pad.position.y = 0.8;
      g.add(pad);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.4), glow(0x7fe8ff, 1.6));
      screen.position.z = 0.03;
      pad.add(screen);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 4, 16), glow(0x7fe8ff, 2.2));
      ring.name = 'ring';
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      g.add(ring);
      break;
    }
    case 'cache': {
      const body = chamfer(1.2, 0.8, 0.8, metalPaper(0x4a5a40, 0.6, 0.3), 0.15);
      body.position.y = 0.4;
      g.add(body);
      outline(body, 0x0e100e, 0.5);
      const lid = new THREE.Group();
      lid.name = 'lid';
      lid.position.set(-0.6, 0.82, 0);
      g.add(lid);
      const lm = chamfer(1.22, 0.14, 0.82, metalPaper(0x3a4a32, 0.6, 0.3), 0.3);
      lm.position.x = 0.6;
      lid.add(lm);
      const stripe = box(1.22, 0.12, 0.82, stripes());
      stripe.position.y = 0.6;
      g.add(stripe);
      const lamp = gem(0.07, glow(0x5dff9a, 3), 0, 'oct');
      lamp.name = 'lamp';
      lamp.position.set(0.45, 0.95, 0.3);
      g.add(lamp);
      break;
    }
    case 'ordnance': {
      const body = chamfer(1.4, 2.0, 0.9, metalPaper(0x5a5040, 0.6, 0.35), 0.12);
      body.position.y = 1.0;
      g.add(body);
      outline(body, 0x0e100e, 0.5);
      const door = box(1.2, 1.7, 0.05, metalPaper(0x3a3428, 0.6, 0.3));
      door.position.set(0, 1.0, 0.46);
      g.add(door);
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.35),
        new THREE.MeshBasicMaterial({ map: labelTexture('ORDNANCE', '#1a1a1a', '#f2b632', 256, 96, 'bold 48px "Chakra Petch", sans-serif') }),
      );
      s.position.set(0, 1.55, 0.49);
      g.add(s);
      const lamp = gem(0.09, glow(0x5dff9a, 3), 0, 'oct');
      lamp.name = 'lamp';
      lamp.position.set(0, 2.15, 0.3);
      g.add(lamp);
      const rocket = buildWeaponModel('rocket');
      rocket.scale.setScalar(0.7);
      rocket.position.set(-0.35, 0.8, 0.5);
      rocket.rotation.z = 1.3;
      g.add(rocket);
      break;
    }
  }
  return g;
}

export function buildGrenade(kind: string): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'plasma') {
    const core = gem(0.13, glow(0x9dff4a, 2.6), 0, 'oct');
    g.add(core);
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), new THREE.MeshBasicMaterial({ color: 0x4a2a6e, wireframe: true }));
    g.add(shell);
  } else {
    const body = gem(0.13, paper(0x5a6a48), 0, 'ico');
    g.add(body);
    const pin = box(0.06, 0.08, 0.06, paper(0x9a9a9a));
    pin.position.y = 0.14;
    g.add(pin);
    const lamp = gem(0.035, glow(0xff4020, 3), 0, 'oct');
    lamp.name = 'lamp';
    lamp.position.set(0, 0.06, 0.12);
    g.add(lamp);
  }
  return g;
}

/** Concord "Heron" dropship: used in the intro flight and as the crash wreck. */
export function buildDropship(wrecked: boolean): THREE.Group {
  const g = new THREE.Group();
  const hullC = 0x5d6f7c;
  const darkC = 0x343c44;
  const hull = card(
    [
      [-4.2, -0.6],
      [2.8, -0.9],
      [4.6, -0.2],
      [4.2, 0.6],
      [1.4, 1.3],
      [-3.2, 1.2],
      [-4.4, 0.4],
    ],
    2.6,
    hullC,
    { metal: true },
  );
  g.add(hull);
  outline(hull, 0x0e1014, 0.5);
  const cockpit = card(
    [
      [2.6, 0.4],
      [4.2, 0.1],
      [3.8, 0.7],
      [2.4, 1.05],
    ],
    1.6,
    0x1a2a38,
  );
  cockpit.position.z = 0.0;
  g.add(cockpit);
  const glass = card(
    [
      [2.8, 0.5],
      [3.9, 0.25],
      [3.6, 0.65],
      [2.65, 0.95],
    ],
    1.65,
    0x7fd0ff,
    { mat: glow(0x7fd0ff, wrecked ? 0.4 : 1.2) },
  );
  g.add(glass);
  const tail = card(
    [
      [-4.0, 0.9],
      [-2.6, 1.1],
      [-3.6, 2.8],
      [-4.6, 2.9],
    ],
    0.3,
    darkC,
  );
  g.add(tail);
  for (const side of [1, -1]) {
    const wing = card(
      [
        [-1.6, 0],
        [1.4, 0],
        [0.6, 0.3],
        [-1.8, 0.3],
      ],
      2.2,
      darkC,
      { metal: true },
    );
    wing.position.set(-0.3, 0.2, side * 2.4);
    g.add(wing);
    const nacelle = prism(0.55, 0.65, 2.2, 8, metalPaper(hullC, 0.5, 0.4));
    nacelle.rotation.z = Math.PI / 2;
    nacelle.position.set(-0.4, 0.4, side * 3.5);
    nacelle.name = 'nacelle';
    g.add(nacelle);
    const ex = gem(0.45, glow(wrecked ? 0x3a1a10 : 0x7fd0ff, wrecked ? 1 : 3), 0, 'oct');
    ex.name = 'engine';
    ex.scale.set(0.5, 1, 1);
    ex.position.set(-1.6, 0.4, side * 3.5);
    g.add(ex);
    const stripe = box(2.2, 0.18, 0.05, paper(0xe8772e));
    stripe.position.set(0.2, 0.0, side * 1.32);
    g.add(stripe);
  }
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.5),
    new THREE.MeshBasicMaterial({ map: labelTexture('HERON-2', '#e8e2d0', 'rgba(0,0,0,0)', 256, 80, 'bold 52px "Chakra Petch", sans-serif'), transparent: true }),
  );
  label.position.set(-1.6, 0.4, 1.32);
  g.add(label);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  if (wrecked) {
    // Torn panels and a broken wing.
    const r = new Rng(9);
    for (let i = 0; i < 7; i++) {
      const shard = card(
        [
          [0, 0],
          [r.range(0.4, 1.0), r.range(-0.2, 0.2)],
          [r.range(0.2, 0.6), r.range(0.4, 0.9)],
        ],
        0.06,
        r.chance(0.5) ? hullC : darkC,
        { metal: true },
      );
      shard.position.set(r.range(-4, 3), r.range(-0.6, 1.4), r.range(-1.4, 1.4));
      shard.rotation.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1));
      g.add(shard);
    }
  }
  return g;
}
