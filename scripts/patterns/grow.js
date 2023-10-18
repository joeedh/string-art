import {Pattern} from './pattern.js';
import {
  nstructjs, util, math,
  Vector2, Vector3, Vector4
} from '../path.ux/pathux.js';
import {hsv_to_rgb} from '../util/color.js';
import {applyImageFilter} from '../core/imagefilter.js';
import {GrowPresets} from '../presets/grow_presets.js';

const GFILL = 0, GPOINT = 1, GTOT = 2;
let rasterLineTemps = util.cachering.fromConstructor(Vector2, 512);

let point_idgen = 0;

class Point {
  id = 0;
  co = new Vector2();
  oldco = new Vector2();
  vel = new Vector2();
  mass = 1.0;
  age = 0.0;
  angvel = 0.0;
  dead = false;
  parent = undefined;
  depth = 0;
  totchildren = 0;
  angVel = 1.0;
  noDieTimer = 0;

  constructor() {
    this.id = point_idgen++;
  }

  spawn(pat, th) {
    let p2 = new Point();
    p2.co.load(this.co);
    p2.vel.load(this.vel);

    p2.vel.rot2d(th)

    p2.angvel = (pat.rand.random() - 0.5)*Math.PI*pat.angVel*0.001;
    p2.mass = this.mass;
    p2.parent = this;
    p2.depth = this.depth + 1;

    this.totchildren++;

    pat.points.push(p2);
  }
}

export class GrowPattern extends Pattern {
  static patternDef = {
    version   : 0.0,
    typeName  : "grow",
    uiName    : "Grow",
    presets   : GrowPresets,
    properties: {
      start          : {
        type  : "panel",
        dimen : {
          type: "int", value: 500, min: 5, max: 4096, slideSpeed: 20
        },
        points: {type: "int", value: 5, min: 1, max: 512, slideSpeed: 2},
        seed  : {type: "int", value: 500, min: 5, max: 4096, slideSpeed: 20},
      },
      spawn          : {
        type      : "panel",
        spawnRate : {type: "int", value: 50, min: 5, max: 10000, slideSpeed: 150},
        spawnCount: {type: "int", value: 2, min: 1, max: 100, slideSpeed: 2},
        angleRange: {type: "float", value: 1.0, min: 0.0001, max: 3.0},
        angleRand : {type: "float", value: 0.0, min: 0.0, max: 1.0},

        spawnRand: {type: "float", value: 0.0, min: 0.0, max: 1.0},

        /* Speeds up spawn rate. */
        spawnDecay   : {type: "float", value: 1.0, min: 0.001, max: 2.0},
        dieAfterSpawn: {
          type: "int", value: 1000, min: 1, max: 1000, slideSpeed: 20
        },
      },
      color          : {
        type       : "panel",
        colorRate  : {type: "float", value: -1.0, min: 0.0, max: 10.0},
        colorOff   : {type: "float", value: 1.75, min: -10.0, max: 10.0},
        colorAlpha : {type: "float", value: 1.0, min: 0.0, max: 1.0},
        colorDecay : {type: "float", value: 1.0, min: 0.0, max: 1.0},
        colorBright: {type: "float", value: 1.0, min: 0.001, max: 10.0},
      },
      line           : {
        type     : "panel",
        lineWidth: {type: "float", value: 2.0, min: 0.01, max: 100.0, step: 0.25},
        lineDecay: {type: "float", value: 1.0, min: 0.0, max: 2.0, step: 0.01},
      },
      angularVelocity: {
        type    : "panel",
        angVel  : {type: "float", value: 0.0, min: 0.0, max: 10.0, step: 0.25},
        angDecay: {type: "float", value: 0.0, min: 0.0, max: 10.0, step: 0.01},
      }
    }
  }
  static STRUCT = nstructjs.inherit(GrowPattern, Pattern) + `
  }`;

  canvas = undefined;
  g = undefined;
  points = [];
  rand = new util.MersenneRandom();
  grid = undefined;

  constructor() {
    super();

    this.reset();
  }

  rasterLineSimple(l, cb) {
    const dimen = this.dimen;

    let l1 = rasterLineTemps.next().load(l[0]).mulScalar(dimen);
    let l2 = rasterLineTemps.next().load(l[1]).mulScalar(dimen);

    let n = new Vector2();

    n.load(l2).sub(l1);
    n.normalize();

    let axis = Math.abs(n[1]) > Math.abs(n[0]) ? 1 : 0;
    n.mulScalar(1.0/n[axis]);

    let [dx, dy] = n;

    let a, b, x, y;
    if (l1[axis] < l2[axis]) {
      a = Math.floor(l1[axis]);
      b = Math.ceil(l2[axis]);

      [x, y] = l1;
    } else {
      a = Math.floor(l2[axis]);
      b = Math.ceil(l1[axis]);

      [x, y] = l2;
    }

    x = ~~(x + 0.5);
    y = ~~(y + 0.5);

    const p = rasterLineTemps.next();
    const ip = rasterLineTemps.next();
    let idimen = 1.0/this.dimen;

    ip.loadXY(x, y);
    for (let i = a; i < b; i++) {
      let ix = ~~(ip[0]);
      let iy = ~~(ip[1]);

      let idx = iy*dimen + ix;

      p[0] = ip[0]*idimen;
      p[1] = ip[1]*idimen;

      cb(p, idx);

      ip[0] += dx;
      ip[1] += dy;
    }
  }

  reset() {
    let dimen = this.dimen = this.properties.dimen;

    this.canvas = document.createElement("canvas");
    this.canvas.width = dimen;
    this.canvas.height = dimen;

    this.g = this.canvas.getContext("2d");
    this.g.scale(dimen, dimen);

    this.points = [];
    this.rand.seed(this.properties.seed);

    this.g.beginPath();
    this.g.rect(0, 0, dimen, dimen);
    this.g.fillStyle = "black";
    this.g.fill();

    this.grid = new Int32Array(dimen*dimen*GTOT);
    this.grid.fill(0, 0, this.grid.length);

    const angvel = this.angVel = this.properties.angVel*0.1;

    let totpoint = this.properties.points;
    for (let i = 0; i < totpoint; i++) {
      let x = this.rand.random(), y = this.rand.random();

      let p = new Point();
      p.co.loadXY(x, y);

      let th = this.rand.random()*Math.PI*2.0;
      p.vel[0] = Math.cos(th)*0.1;
      p.vel[1] = Math.sin(th)*0.1;

      p.angvel = this.rand.random()*angvel;

      this.points.push(p);
    }
  }

  step() {
    let t = util.time_ms();
    while (util.time_ms() - t < 50) {
      this.step_intern();
    }

    window.redraw_all()
    this.points = this.points.filter(p => !p.dead);
  }

  step_intern() {
    const g = this.g;
    const sz = this.dimen;

    /* Minimum of 50. */
    const minRate = 50;
    const spawnRate = this.properties.spawnRate + minRate;
    const angleRand = this.properties.angleRand;
    const angleRange = this.properties.angleRange;
    const spawnCount = this.properties.spawnCount;
    const spawnRand = this.properties.spawnRand;
    const spawnDecay = this.properties.spawnDecay**0.2;
    const dieAfterSpawn = this.properties.dieAfterSpawn;
    const colorRate = this.properties.colorRate;
    const colorOff = this.properties.colorOff;
    const colorAlpha = this.properties.colorAlpha;
    const colorDecay = this.properties.colorDecay**0.1;
    const angDecay = this.properties.angDecay;
    const colorBright = this.properties.colorBright;
    const lineDecay = this.properties.lineDecay;

    this.angVel = this.properties.angVel;

    let lwid = g.lineWidth = this.properties.lineWidth/this.dimen;

    const ps = this.points;
    const dt = 1.0/this.dimen;
    const dimen = this.dimen;
    const grid = this.grid;

    //spawnRate = ~~(spawnRate*0.5);

    let clr = new Vector3();

    function checkGrid(gi, p) {
      if (grid[gi + GFILL] && grid[gi + GPOINT] !== p.id) {
        let ok = p.parent && grid[gi + GPOINT].id === p.parent.id;
        ok = ok || p.noDieTimer < 10;

        if (!ok) {
          p.dead = true;
          return false;
        }
      }

      return true;
    }

    for (let p of ps) {
      if (p.dead) {
        continue;
      }

      if (p.co[0] < 0 || p.co[1] < 0 || p.co[0] >= 1.0 || p.co[1] >= 1.0) {
        p.dead = true;
        continue;
      }

      p.oldco.load(p.co);

      //p.angvel += -Math.sign(p.angvel) * angDecay * 0.01;
      p.angvel *= angDecay;

      p.vel.rot2d(p.angvel, dt);
      p.co.addFac(p.vel, dt);
      p.age++;
      p.noDieTimer++;

      let ix = ~~(p.co[0]*dimen);
      let iy = ~~(p.co[1]*dimen);

      let gi = (iy*dimen + ix)*GTOT;
      if (!checkGrid(gi, p)) {
        continue;
      }

      if (0) {
        let line = [p.oldco, p.co];
        this.rasterLineSimple(line, (p, idx) => {
          let gi = idx*GTOT;
          this.grid[gi + GFILL] = 1;
          this.grid[gi + GPOINT] = p.id;
        });
      } else {
        this.grid[gi + GFILL] = 1;
        this.grid[gi + GPOINT] = p.id;

        let steps = 5;
        let t = 0.0, dt = 1.0/(steps - 1);
        for (let k = 0; k < steps; k++, t += dt) {
          let ix2 = p.oldco[0]*(1.0 - t) + p.co[0]*t;
          let iy2 = p.oldco[1]*(1.0 - t) + p.co[1]*t;
          ix2 = ~~(ix2*dimen);
          iy2 = ~~(iy2*dimen);

          let gi2 = (iy2*dimen + ix2)*GTOT;

          if (!checkGrid(gi2, p)) {
            continue;
          }
          this.grid[gi2 + GFILL] = 1;
          this.grid[gi2 + GPOINT] = p.id;
        }
      }

      const off = colorOff;
      const mul = 100.0*(colorRate**2)/spawnRate;
      let r1, g1, b1;
      let decay = Math.pow(colorDecay, p.depth);

      if (1) {
        let h = Math.cos(p.depth*0.1*mul + off)*0.5 + 0.5;
        let v = decay*colorBright;
        let s = v > 1.0 ? 2.0 - v**0.5 : 1.0;

        h = Math.min(Math.max(h, 0.0), 1.0);
        v = Math.min(Math.max(v, 0.0), 1.0);
        s = Math.min(Math.max(s, 0.0), 1.0);

        [r1, g1, b1] = hsv_to_rgb(h, s, v);

      } else {
        r1 = Math.cos(p.depth*0.1*mul + 0.8 + off)*0.5 + 0.5;
        g1 = Math.sin(p.depth*0.05*mul - 0.5 + off)*0.5 + 0.5;
        b1 = Math.cos(p.depth*0.06*mul - 0.5 + off)*0.5 + 0.5;

        clr.loadXYZ(r1, g1, b1);
        clr.normalize();
        clr.mulScalar(colorBright).minScalar(1.0);
        clr.mulScalar(decay);
        [r1, g1, b1] = clr;
      }


      r1 = ~~(r1*255);
      g1 = ~~(g1*255);
      b1 = ~~(b1*255);

      g.strokeStyle = `rgba(${r1},${g1},${b1},${colorAlpha})`;

      g.lineWidth = lwid*Math.pow(lineDecay, p.depth);
      g.beginPath();
      g.moveTo(p.oldco[0], p.oldco[1]);
      g.lineTo(p.co[0], p.co[1]);
      g.stroke();
      g.stroke();
    }

    /* Spawn children */
    const plen = ps.length;
    for (let i = 0; i < plen; i++) {
      let p = ps[i];

      if (p.dead) {
        continue;
      }

      let spawnRate2 = ~~(spawnRate*Math.pow(spawnDecay, p.depth));
      spawnRate2 = Math.max(spawnRate2, minRate);

      const age = ~~(p.age + this.rand.random()*spawnRand*spawnRate2);
      if ((age + 1)%spawnRate2 === 0) {
        let n = spawnCount;
        let thrange = Math.PI*angleRange;
        let dth = thrange/(n - 1);
        let th = -thrange*0.5;

        if (n === 1) {
          th = Math.PI*0.5*Math.sign(this.rand.random() - 0.5);
        }

        for (let k = 0; k < n; k++, th += dth) {
          th += (this.rand.random() - 0.5)*dth*angleRand;
          p.spawn(this, th);
        }

        p.noDieTimer = 0;

        if (p.totchildren >= dieAfterSpawn) {
          p.dead = true;
        }
      }
    }

    //this.points = this.points.filter(p => !p.dead);
  }

  draw(canvas, g) {
    g.save();
    let canvas2 = this.canvas;
    let canvas3 = applyImageFilter(canvas2, "blur(5px)", true);

    g.globalCompositeOperation = "screen";

    g.globalAlpha = 1.0;
    g.drawImage(canvas2, 0, 0);

    g.globalAlpha = 1.0;
    g.drawImage(canvas3, 0, 0);
    g.drawImage(canvas3, 0, 0);

    g.globalCompositeOperation = "normal";

    g.restore();
  }
}

Pattern.register(GrowPattern);
