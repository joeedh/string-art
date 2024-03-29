import {getImageData} from '../path.ux/scripts/path-controller/util/image.js';
import {Vector2, Vector3, Vector4, nstructjs, Matrix4, util, math} from '../path.ux/pathux.js';
import {getColorValue} from '../core/util.js';
import {Pattern} from './pattern.js';
import {applyImageFilter, resizeImage, sharpenImage} from '../core/imagefilter.js';
import {ImageHistogram} from '../util/color.js';
import {CircleWindingPresets} from '../presets/circle_winding_presets.js';

const LX1 = 0, LY1 = 1, LX2 = 2, LY2 = 3, LTOT = 4;
const GVAL = 0, GGOAL = 1, GTEST = 3, GTOT = 4;

export const CACHED_IMAGE_KEY = "_startup_file_lart_image";
const TEST_INVERT = true;

let project_rets = util.cachering.fromConstructor(Vector2, 512);
let unproject_rets = util.cachering.fromConstructor(Vector2, 512);
let rasterLineTemps = util.cachering.fromConstructor(Vector2, 512);
let thickLineTemps = util.cachering.fromConstructor(Vector2, 512);
let rasterTemps = util.cachering.fromConstructor(Vector2, 256);
let rasterTemps3 = util.cachering.fromConstructor(Vector3, 256);
let rasterTemps4 = util.cachering.fromConstructor(Vector4, 256);
let sampleImage2 = util.cachering.fromConstructor(Vector2, 256);
let sampleImage4 = util.cachering.fromConstructor(Vector4, 256);
let dvTemps2 = util.cachering.fromConstructor(Vector2, 256);
let dvTemps4 = util.cachering.fromConstructor(Vector4, 256);

let rand_seed = 0;

export class LinePool {
  constructor() {
    this.freelist = [];
  }

  alloc(v1, v2) {
    if (this.freelist.length > 0) {
      return this.freelist.pop().load(v1, v2);
    } else {
      return new Line(v1, v2);
    }
  }

  release(line) {
    /*
    if (this.freelist.indexOf(line) >= 0) {
      console.warn(line.stack);
      debugger;
    }

    try {
      throw new Error();
    } catch (error) {
      line.stack = error.stack;
    } //*/

    this.freelist.push(line);
  }
}

export class Line extends Array {
  color = 0;
  error = 0;

  constructor(v1 = new Vector2(), v2 = new Vector2()) {
    super();

    this.push(v1);
    this.push(v2);
  }

  load(v1, v2) {
    if (v1) {
      this[0].load(v1);
    }
    if (v2) {
      this[1].load(v2);
    }

    return this;
  }

  copy() {
    let l = new Line(this[0].copy(), this[1].copy());
    l.error = this.error;
    l.color = this.color;
    return l;
  }
}

export class LineArt extends Pattern {
  static patternDef = {
    version   : 0.0,
    typeName  : "string_winding",
    uiName    : "String Winding",
    presets   : CircleWindingPresets,
    properties: {
      primary: {
        type            : "panel",
        dimen           : {
          type: "int", value: 256, min: 4, max: 1024, slideSpeed: 15,
        },
        linesGoal       : {type: "int", value: 4000, min: 1, max: 100000,},
        steps           : {type: "int", value: 72, min: 1, max: 1024, slideSpeed: 15},
        substeps        : {type: "int", value: 32, min: 1, max: 1024, slideSpeed: 2},
        arcSteps        : {
          type: "int", value: 256, min: 2, max: 8024, slideSpeed: 15
        },
        inverted        : {type: "bool", value: false},
        linesFromImageDv: {type: "bool", value: false},
      },
      image  : {
        type            : "panel",
        drawImage       : {type: "bool", value: true},
        drawMask        : {type: "bool", value: true},
        drawValue       : {type: "bool", value: false},
        drawTest        : {type: "bool", value: false},
        maskAlpha       : {type: "float", value: 0.2, min: 0, max: 1.0},
        sourceBrightness: {type: "float", value: 1.0, min: 0.0, max: 4.0},
        sourceContrast  : {type: "float", value: 1.0, min: 0.0, max: 4.0},
        blur            : {
          type: "float", slider: true, value: 0.0, slideSpeed: 10, min: 0.0, max: 25.0
        },
        sharpen         : {
          type: "float", slider: true, value: 0.1, min: 0.001, max: 1.0
        },
      },
      line   : {
        type          : "panel",
        drawLines     : {type: "bool", value: true},
        lineWidth     : {type: "float", value: 0.5, min: 0.01, max: 500.0},
        maskLineWidth : {type: "float", value: 4.0, min: 0.01, max: 500.0},
        advancedRaster: {type: "bool", value: false},
      },
      solver : {
        type     : "panel",
        lineAlpha: {type: "float", value: 0.2, min: 0, max: 1.0},
        expDecay : {type: "float", value: 1, min: 0.0001, max: 100.0},

        delCount  : {type: "int", value: 2, min: 1, max: 1000, slideSpeed: 7},
        doVariance: {type: "bool", value: true},
        contrast  : {type: "int", value: 2, min: 0, max: 10},
        brightness: {type: "float", value: 1.0, min: 0.001, max: 4.0},
      },
      color  : {
        type    : "panel",
        useColor: {type: "bool", value: false},
        calcBG  : {type: "bool", value: true},
        colors  : {type: "int", value: 1, min: 1, max: 128},
      },
    }
  };

  static STRUCT = nstructjs.inherit(LineArt, Pattern) + `
  }
  `;

  origImage = undefined; /* Image before scaling. */
  image = undefined;
  mask = undefined;
  value = undefined;
  test = undefined;
  grid = undefined;
  lines = [];
  test_lines = [];

  image_canvas = undefined;
  mask_canvas = undefined;
  value_canvas = undefined;
  test_canvas = undefined;

  scale = 100.0; //pixel size
  offset = new Vector2([5, 5]); //pixel space
  maskAlpha = 1.0;
  lineAlpha = 0.2;
  addOrDelSign = 1;
  #signI = 0;
  expDecay = 0.0;

  imageWidth = 0;
  imageHeight = 0;
  advancedRaster = false;

  step() {
    this.lineAlpha = this.properties.lineAlpha;

    if (!this.image) {
      console.log("Image hasn't loaded yet.");
      return;
    }

    this.expDecay = Math.exp(-this.#signI*this.properties.expDecay*0.0001);
    this.expDecay = (1.0 - this.expDecay)*0.5 + 0.5;

    //console.log("Step!", this.expDecay.toFixed(3));

    for (let i = 0; i < this.properties.steps; i++) {
      this.step_intern();
    }

    this.renderMask();
    window.redraw_all();
  }

  step_intern() {
    let delCount = this.properties.delCount;
    /* Help the solver get started by having line deletion
     * happen less often if we have less than N lines.
     *
     * But note that a delCount of 1 is always delete
     * mode. */
    if (delCount > 1 && this.lines.length < 5000) {
      delCount = Math.max(delCount, 3);
    }

    let linesGoal = this.properties.linesGoal;
    if (this.lines.length > linesGoal && Math.random() > 0.01) {
      delCount = 1;
    }

    this.addOrDelSign = (this.#signI++)%delCount !== 0 ? 1 : -1;
    if (delCount === 1) {
      this.addOrDelSign = -1;
    }
    if (this.lines.length === 0) {
      this.addOrDelSign = 1;
    }

    for (let i = 0; i < this.properties.substeps; i++) {
      this.step_intern2();
    }

    if (this.test_lines.length > 0) {
      let line;

      for (let l of this.test_lines) {
        if (!line || l.error < line.error) {
          line = l;
        }
      }

      let grid = this.grid;

      if (this.addOrDelSign === -1) {
        let ri = this.lines.indexOf(line);
        let del = this.lines[ri];

        /* Remove from this.lines. */
        this.lines[ri] = this.lines[this.lines.length - 1];
        this.lines.length--;

        this.linepool.release(line);

        this.rasterLine(del, (p, gi, alpha) => {
          grid[gi + GVAL] = grid[gi + GVAL] + alpha;
          //grid[gi + GTEST] = Math.abs(err);
        });
      } else {
        this.rasterLine(line, (p, gi, alpha) => {
          grid[gi + GVAL] = grid[gi + GVAL] - alpha;
          //grid[gi + GTEST] = Math.abs(err);
        });

        for (let l of this.test_lines) {
          if (l !== line) {
            this.linepool.release(l);
          }
        }

        this.lines.push(line);
      }

      this.test_lines.length = 0;
    }
  }

  step_intern2() {
    let th1 = Math.random();
    let th2 = Math.random();

    this.advancedRaster = this.properties.advancedRaster;

    const doVariance = this.properties.doVariance;
    const contrast = this.properties.contrast;
    const brightness = this.properties.brightness;

    let steps = this.properties.arcSteps;

    th1 = Math.floor(th1*steps)/steps;
    th2 = Math.floor(th2*steps)/steps;


    util.seed(this.randSeed + th1*steps);
    th1 += (util.random() - 0.5)/steps;

    util.seed(this.randSeed + th2*steps);
    th2 += (util.random() - 0.5)/steps;

    th1 *= Math.PI*2.0;
    th2 *= Math.PI*2.0;

    let p1 = new Vector2();
    let p2 = new Vector2();

    p1[0] = Math.sin(th1)*0.5 + 0.5;
    p1[1] = Math.cos(th1)*0.5 + 0.5;
    p2[0] = Math.sin(th2)*0.5 + 0.5;
    p2[1] = Math.cos(th2)*0.5 + 0.5;

    let line = [p1, p2];

    let err1 = 0.0, err2 = 0.0;
    let var1 = 0.0, var2 = 0.0;
    let grid = this.grid;
    let p = new Vector2();
    let count = 0.0;

    if (this.addOrDelSign === 1) {
      line = this.findLine();
    } else {
      let ri = ~~(Math.random()*0.99999*this.lines.length);
      line = this.lines[ri];
    }

    function clamp(f) {
      return Math.min(Math.max(f, 0.0), 1.0);
    }

    const addOrDelSign = this.addOrDelSign;
    let iw = this.image.width, ih = this.image.height;
    this.rasterLine(line, (p, gi, alpha) => {
      p = this.localImagePos(p);

      if (p[0] < 0 || p[1] < 0 || p[0] >= iw || p[1] >= ih) {
        return;
      }

      alpha *= addOrDelSign;

      let oldf = clamp(grid[gi + GVAL]);
      let newf = clamp(oldf - alpha);

      //oldf = oldf**3;
      //newf = newf**3;
      //oldf = oldf*0.5 + 0.5;
      //newf = newf*0.5 + 0.5;

      for (let k = 0; k < contrast; k++) {
        oldf = oldf*oldf*(3.0 - 2.0*oldf);
        newf = newf*newf*(3.0 - 2.0*newf);
      }

      oldf *= brightness;
      newf *= brightness;

      let delta1 = oldf - grid[gi + GGOAL];
      let delta2 = newf - grid[gi + GGOAL];

      grid[gi + GTEST] = newf;

      //delta1 = delta1**2;
      //delta2 = delta2**2;
      delta1 = Math.abs(delta1)**2;
      delta2 = Math.abs(delta2)**2;

      err1 += delta1;
      err2 += delta2;

      count++;

      let mean1 = err1/count;
      let mean2 = err2/count;

      /* Approximate variance using current mean. */
      var1 += Math.abs(mean1 - delta1)**2.0;
      var2 += Math.abs(mean2 - delta2)**2.0;
    });

    if (!count) {
      if (this.addOrDelSign === 1) {
        this.linepool.release(line);
      }
      return;
    }

    if (1) {
      err1 /= count;
      err2 /= count;
      var1 /= count;
      var2 /= count;

      if (doVariance) {
        err1 *= 1.0 + var1*10.0;
        err2 *= 1.0 + var2*10.0;
      }
    }

    /* Simulated annealing. */
    let prob = this.expDecay;
    err2 *= 1.0 + 2.0*(Math.random() - 0.5)*(1.0 - prob);

    if (err2 < err1 || Math.random() > prob) {
      line.error = err2 - err1;
      this.test_lines.push(line);
    } else {
      if (this.addOrDelSign === 1) {
        this.linepool.release(line);
      }
    }
  }

  findLine() {
    if (this.properties.linesFromImageDv) {
      return this.findLineFromImage();
    } else {
      return this.findLineRandom();
    }
  }

  findLineRandom() {
    let line = this.linepool.alloc();

    let th1 = Math.random()*Math.PI*2.0;
    let th2 = Math.random()*Math.PI*2.0;
    let steps = this.properties.arcSteps;

    th1 = Math.floor(th1*steps)/steps;
    th2 = Math.floor(th2*steps)/steps;
    let l1 = line[0], l2 = line[1];

    l1[0] = Math.cos(th1)*0.5 + 0.5;
    l1[1] = Math.sin(th1)*0.5 + 0.5;
    l2[0] = Math.cos(th2)*0.5 + 0.5;
    l2[1] = Math.sin(th2)*0.5 + 0.5;

    return line;
  }

  findLineFromImage(tries = 100) {
    let x = Math.random(), y = Math.random();
    let p = [x, y];

    let dv = this.dvImage(p);

    if (dv.dot(dv) < 0.001) {
      if (tries > 0) {
        return this.findLineFromImage(tries - 1);
      } else {
        return this.findLineRandom();
      }
    }

    let t = dv[0];
    dv[0] = dv[1];
    dv[1] = -t;

    let th = Math.atan2(dv[1], dv[0]);
    /*
    on factor;

    lx := x + dx*t;
    ly := y + dy*t;

    f1 := (lx - cx)**2 + (ly - cy)**2 - r**2;
    ff := solve(f1, t);

    on fort;
    part(ff, 1, 2);
    part(ff, 2, 2);
    off fort;

    */

    const r = 0.5;
    const cx = 0.5, cy = 0.5;
    const dx = dv[0], dy = dv[1];
    let t1, t2;

    t1 = (-(dx*x + dy*y - cy*dy - cx*dx) - Math.sqrt(-(2*(dx*y - dy*x - cy*dx) + cx*dy)
      *cx*dy + (2*(dx*y - dy*x) - cy*dx)*cy*dx + ((r + y)*(r - y)*dx + 2*dy*x*y)*
      dx + (r + x)*(r - x)*dy**2))/(dx**2 + dy**2);

    t2 = (-(dx*x + dy*y - cy*dy - cx*dx) + Math.sqrt(-(2*(dx*y - dy*x - cy*dx) + cx*dy)
      *cx*dy + (2*(dx*y - dy*x) - cy*dx)*cy*dx + ((r + y)*(r - y)*dx + 2*dy*x*y)*
      dx + (r + x)*(r - x)*dy**2))/(dx**2 + dy**2);

    let l1 = new Vector2();
    let l2 = new Vector2();

    l1.loadXY(x, y).addFac(dv, t1);
    l2.loadXY(x, y).addFac(dv, t2);

    if (0) {
      let tan = new Vector2(l2).sub(l1);
      let thb = Math.atan2(tan[1], tan[0]);

      if (Math.abs(thb - th) > 0.0001) {
        console.log(th, thb);
        debugger;
      }
    }

    let th1 = Math.atan2(l1[1] - cy, l1[0] - cx)/Math.PI/2.0;
    let th2 = Math.atan2(l2[1] - cy, l2[0] - cx)/Math.PI/2.0;
    let steps = this.properties.arcSteps;

    th1 += (Math.random() - 0.5)*0.5*Math.PI*(1.0 - this.expDecay);
    th2 += (Math.random() - 0.5)*0.5*Math.PI*(1.0 - this.expDecay);

    th1 = Math.PI*2.0*Math.floor(th1*steps + 0.5)/steps;
    th2 = Math.PI*2.0*Math.floor(th2*steps + 0.5)/steps;

    //console.log(l1);

    l1[0] = Math.cos(th1)*0.5 + 0.5;
    l1[1] = Math.sin(th1)*0.5 + 0.5;

    l2[0] = Math.cos(th2)*0.5 + 0.5;
    l2[1] = Math.sin(th2)*0.5 + 0.5;
    //console.log(l1);

    return this.linepool.alloc(l1, l2);
  }

  rasterTri(v1, v2, v3, cb) {
    const dimen = this.dimen;
    const invdimen = 1.0/dimen;

    v1 = rasterTemps.next().load(v1).mulScalar(dimen);
    v2 = rasterTemps.next().load(v2).mulScalar(dimen);
    v3 = rasterTemps.next().load(v3).mulScalar(dimen);

    let v1orig = v1, v2orig = v2, v3orig = v3;

    let e1 = rasterTemps.next().load(v2).sub(v1);
    let e2 = rasterTemps.next().load(v3).sub(v2);
    let e3 = rasterTemps.next().load(v1).sub(v3);

    let sumx = Math.abs(e1[0]) + Math.abs(e2[0]) + Math.abs(e3[0]);
    let sumy = Math.abs(e1[1]) + Math.abs(e2[1]) + Math.abs(e3[1]);
    const axis = sumy > sumx ? 1 : 0;
    const axis2 = axis ^ 1;

    if (v1[axis] > v2[axis]) {
      let t = v1;
      v1 = v2;
      v2 = t;
      t = e1;
      e1 = e2;
      e2 = t;
    }
    if (v2[axis] > v3[axis]) {
      let t = v2;
      v2 = v3;
      v3 = t;
      t = e2;
      e2 = e3;
      e3 = t;
    }
    if (v1[axis] > v2[axis]) {
      let t = v1;
      v1 = v2;
      v2 = t;
      t = e1;
      e1 = e2;
      e2 = t;
    }
    if (v2[axis] > v3[axis]) {
      let t = v2;
      v2 = v3;
      v3 = t;
      t = e2;
      e2 = e3;
      e3 = t;
    }
    if (v1[axis] > v2[axis]) {
      let t = v1;
      v1 = v2;
      v2 = t;
      t = e1;
      e1 = e2;
      e2 = t;
    }

    const lineAlpha = this.lineAlpha;

    let steps = Math.ceil(v3[axis] - v1[axis]);
    let t1 = rasterTemps.next().load(v3).sub(v1).normalize();
    let t2 = rasterTemps.next().load(v2).sub(v1).normalize();
    let t3 = rasterTemps.next().load(v3).sub(v2).normalize();
    let pt = rasterTemps.next();

    const feps = 0.00001;
    if (Math.abs(t1[axis] < feps || Math.abs(t2[axis]) < feps)
      || Math.abs(t3[axis] < feps)) {
      //console.error("BAD", t1, t2);
      return;
    }

    let p1 = rasterTemps.next().load(v1);
    let p2 = rasterTemps.next().load(v1);

    let p = rasterTemps.next();
    let normp = rasterTemps.next();
    let swapped = false;

    if (p1[axis2] > p2[axis2]) {
      let t = p1;
      p1 = p2;
      p2 = t;

      t = t1;
      t1 = t2;
      t2 = t;
      swapped = true;
    }

    t1.mulScalar(1.0/t1[axis]);
    t2.mulScalar(1.0/t2[axis]);
    t3.mulScalar(1.0/t3[axis]);

    let t1x = Math.abs(Math.floor(1.0/t1[axis2]) + 1);
    let t2x = Math.abs(Math.floor(1.0/t2[axis2]) + 1);
    let t3x = Math.abs(Math.floor(1.0/t3[axis2]) + 1);

    let t1s = Math.sign(t1[axis2]);
    let t2s = Math.sign(t2[axis2]);
    let t3s = Math.sign(t3[axis2]);

    t1[axis] = t2[axis] = t3[axis] = 1.0;
    //console.log("steps", steps, t1x, 1.0/t1[axis2]);

    let count1 = 0;
    let count2 = 0;
    let phase2 = false;
    for (let i = 0; i < steps; i++) {
      let a = p1[axis2];
      let b = p2[axis2];

      let swapped2 = false;
      if (a > b) {
        let t = a;
        a = b;
        b = t;
        swapped2 = true;
        p.load(p2);
      } else {
        p.load(p1);
      }

      if (!phase2 && p[axis] > v2[axis]) {
        phase2 = true;
        if (swapped) {
          t1 = t3;
          t1x = t3x;
          t1s = t3s;
          count1 = 0;
        } else {
          t2 = t3;
          t2x = t3x;
          t2s = t3s;
          count2 = 0;
        }
      }

      /* Really stupid rasterizer, pad out
       * extra pixels, the UV test will filter
       * them.
       **/
      a = Math.floor(a) - 4;
      b = Math.floor(b) + 4;
      p[axis2] = a;

      let off = Math.fract(p[axis2])*invdimen;
      //p[axis2] = Math.floor(p[axis2]);
      let da = Math.sign(b - a);

      do {
        let ix = ~~p[0];
        let iy = ~~p[1];
        let gi = (iy*dimen + ix)*GTOT;

        normp[0] = p[0]*invdimen;
        normp[1] = p[1]*invdimen;
        //normp[0] = ix*invdimen;
        //normp[1] = iy*invdimen;

        if (normp[0] >= 0.0 && normp[1] >= 0.0 && normp[0] < 1.0 && normp[1] < 1.0) {
          pt.load(p).floor().addScalar(0.5);

          let uv = math.barycentric_v2(pt, v1orig, v2orig, v3orig);
          const eps = 0.00001;
          if (uv[0] >= -eps && uv[1] >= -eps && uv[0] + uv[1] <= 1.0 + eps) {
            cb(normp, gi, uv);
          }
        }

        p[axis2] += 1;
        a += 1;
      } while (a <= b);

      let o = 1.0001;
      p1.addFac(t1, o);
      p2.addFac(t2, o);

    }

    //console.log(t1, t2);
  }

  rasterQuad(a, b, c, d, cb) {
    let side;

    const lineAlpha = this.lineAlpha;

    function cb2(p, gi, uv) {
      let alpha;

      if (!side) {
        alpha = uv[0]*1 + uv[1]*1 + (1.0 - uv[0] - uv[1])*0;
      } else {
        alpha = uv[0]*1 + uv[1]*0 + (1.0 - uv[0] - uv[1])*0;
      }

      alpha = alpha*alpha*(3.0 - 2.0*alpha);
      cb(p, gi, alpha *= lineAlpha);
    }

    side = 0;
    this.rasterTri(a, b, c, cb2);
    side = 1;
    this.rasterTri(a, c, d, cb2);
  }

  rasterLine(l, cb) {
    if (!this.advancedRaster) {
      this.rasterLineSimple(l, cb);
      return;
    }
    //return; //XXX

    let tan = thickLineTemps.next().load(l[1]).sub(l[0]).normalize();
    let w = this.properties.maskLineWidth*0.5/this.dimen;

    /* Get perpendicular vector. */
    let t = tan[0];
    tan[0] = tan[1];
    tan[1] = -t;

    for (let i = 0; i < 2; i++) {
      let a = thickLineTemps.next().load(l[0]).addFac(tan, 0);
      let b = thickLineTemps.next().load(l[1]).addFac(tan, 0);
      let c = thickLineTemps.next().load(l[1]).addFac(tan, w);
      let d = thickLineTemps.next().load(l[0]).addFac(tan, w);

      this.rasterQuad(a, b, c, d, cb);
      w *= -1;
    }

    return;
    let wid = 1;

    for (let dir = 0; dir < 2; dir++) {
      l = [l[0], l[1]];
      l[0] = thickLineTemps.next().load(l[0]);
      l[1] = thickLineTemps.next().load(l[1]);
      let n = thickLineTemps.next().load(l[1]).sub(l[0]).normalize();

      let t = n[0];
      n[0] = n[1];
      n[1] = -t;
      n.mulScalar(0.5/this.dimen);

      if (dir) {
        n.negate();
      }

      for (let i = 0; i < wid; i++) {
        this.rasterLineSimple(l, cb);

        l[0].add(n);
        l[1].add(n);
      }
    }
  }

  rasterLineSimple(l, cb) {
    const dimen = this.dimen;
    const grid = this.grid;

    let l1 = rasterLineTemps.next().load(l[0]).mulScalar(this.dimen);
    let l2 = rasterLineTemps.next().load(l[1]).mulScalar(this.dimen);

    let n = new Vector2();

    n.load(l2).sub(l1);
    n.normalize();

    let mdata = this.mask.data;

    let axis = Math.abs(n[1]) > Math.abs(n[0]) ? 1 : 0;
    n.mulScalar(1.0/n[axis]);

    let [dx, dy] = n;

    let a, b, x, y;
    if (l1[axis] < l2[axis]) {
      a = Math.floor(l1[axis]);
      b = Math.ceil(l2[axis]);

      //x = Math.floor(l1[0]);
      //y = Math.floor(l1[1]);
      [x, y] = l1;
    } else {
      a = Math.floor(l2[axis]);
      b = Math.ceil(l1[axis]);

      [x, y] = l2;
      //x = Math.floor(l2[0]);
      //y = Math.floor(l2[1]);
      //dx = -dx;
      //dy = -dy;
    }

    x = ~~(x + 0.5);
    y = ~~(y + 0.5);

    let lineAlpha = this.lineAlpha;
    const p = rasterLineTemps.next();
    const ip = rasterLineTemps.next();
    let idimen = 1.0/this.dimen;

    //lineAlpha *= (this.#signI % 5) + 1;

    let dd = n[axis ^ 1];
    dd = dd ? Math.floor(1.0/dd) : 0.0;

    let sign1 = Math.sign(n[axis]);
    let sign2 = Math.sign(n[axis ^ 1]);

    ip.loadXY(x, y);
    for (let i = a; i < b; i++) {
      let ix = ~~(ip[0]);
      let iy = ~~(ip[1]);

      let gi = (iy*dimen + ix)*GTOT;

      p[0] = ip[0]*idimen;
      p[1] = ip[1]*idimen;

      cb(p, gi, lineAlpha);


      //ip[axis] += sign1;
      //if (i % dd === 0) {
      //  ip[axis^1] += sign2;
      //}
      ip[0] += dx;
      ip[1] += dy;
    }
  }

  constructor(props) {
    super();

    this.linepool = new LinePool();

    if (props !== undefined) {
      this.properties = props;
    }

    this.reset();
  }

  reset(image = undefined) {
    const props = this.properties;

    this.#signI = 0;
    this.dimen = props.dimen;
    this.lines = [];
    this.test_lines = [];
    this.grid = undefined;

    this.image_canvas = this.mask_canvas = this.value_canvas = undefined;
    this.image = this.mask = this.value = undefined;
    this.maskAlpha = props.maskAlpha;
    this.lineAlpha = props.lineAlpha;

    this.randSeed = rand_seed++;

    if (!image && (CACHED_IMAGE_KEY in localStorage)) {
      let durl = localStorage[CACHED_IMAGE_KEY];

      getImageData(durl).then(image => {
        if (this.image === undefined) {
          console.log("Loaded cached image");
          this.loadImage(image);
        }
      });
    } else if (image) {
      this.loadImage(image);
    }

    window.redraw_all();
  }

  loadImage(image) {
    this.lines = [];
    this.test_lines = [];

    if (this.properties.sharpen) {
      image = sharpenImage(image, this.properties.sharpen);
    }
    if (this.properties.blur) {
      let px = this.properties.blur;
      image = applyImageFilter(image, `blur(${px}px)`);
    }

    let bt = ~~(this.properties.sourceBrightness*100.0);
    let ct = ~~(this.properties.sourceContrast*100.0);
    image = applyImageFilter(image, `brightness(${bt}%) contrast(${ct}%)`);

    this.origImage = image;

    /* Scale image to have same resolution as the line mask. */
    let ratio = this.dimen/Math.max(image.width, image.height);
    let w = Math.max(Math.ceil(image.width*ratio), 4);
    let h = Math.max(Math.ceil(image.height*ratio), 4);
    image = resizeImage(image, w, h);
    this.image = image;

    /* Profiling revealed that accessing image.width is slightly non-trivial
     * inside of localImagePos. */
    this.imageWidth = this.image.width;
    this.imageHeight = this.image.height;

    let idata = image.data;

    this.image_canvas = document.createElement("canvas");
    this.image_canvas.g = this.image_canvas.getContext("2d");
    this.image_canvas.width = image.width;
    this.image_canvas.height = image.height;
    this.image_canvas.g.putImageData(image, 0, 0);

    if (this.properties.useColor) {
      this.initColor();
    }

    this.mask_canvas = document.createElement("canvas");
    this.mask_canvas.g = this.mask_canvas.getContext("2d");
    this.mask_canvas.width = this.mask_canvas.height = this.dimen;

    this.value_canvas = document.createElement("canvas");
    this.value_canvas.g = this.value_canvas.getContext("2d");
    this.value_canvas.width = this.value_canvas.height = this.dimen;

    this.test_canvas = document.createElement("canvas");
    this.test_canvas.g = this.test_canvas.getContext("2d");
    this.test_canvas.width = this.test_canvas.height = this.dimen;

    this.createMask();
    this.renderMask();

    window.redraw_all();
  }

  initColor() {
    let hist = new ImageHistogram(512);
    hist.calc(this.image, true);
    console.log(hist);
    console.log(hist.getMedianColor());

    this.bgColor = hist.getMedianColor();
  }

  draw(canvas, g) {
    const props = this.properties;

    const inverted = props.inverted;

    if (this.bgColor && props.useColor) {
      let r1 = ~~(this.bgColor[0]*255);
      let g1 = ~~(this.bgColor[1]*255);
      let b1 = ~~(this.bgColor[2]*255);
      g.fillStyle = `rgb(${r1},${g1},${b1})`;
      g.beginPath();
      g.rect(0, 0, 2000, 2000);
      g.fill();
    } else if (inverted) {
      g.fillStyle = "black";
      g.beginPath();
      g.rect(0, 0, 2000, 2000);
      g.fill();
    }

    this.maskAlpha = props.maskAlpha;
    let sz = this.scale = canvas.width*0.65;
    let [offx, offy] = this.offset;

    if (this.image) {
      let imagescale = sz/this.image.width;
      let w = this.image.width*imagescale;
      let h = this.image.height*imagescale;
      let asp = w/h;

      let imgx = offx, imgy = offy;
      if (asp > 1.0) {
        imgy += (sz - h)*0.5;
      }

      if (props.drawImage) {
        g.drawImage(this.image_canvas, imgx, imgy, w, h);
      }

      if (props.drawMask) {
        g.drawImage(this.mask_canvas, offx, offy, sz, sz);
      }

      if (props.drawValue) {
        g.drawImage(this.value_canvas, offx, offy, sz, sz);
      }

      if (props.drawTest) {
        g.drawImage(this.test_canvas, offx, offy, sz, sz);
      }
    }

    g.save();

    g.translate(offx, offy);

    g.scale(sz, sz);

    let dpi = devicePixelRatio;

    g.lineWidth /= 300.0;

    g.strokeStyle = "black";
    g.beginPath();
    g.arc(0.5, 0.5, 0.5, -Math.PI, Math.PI);
    g.closePath();
    g.stroke();

    if (inverted) {
      g.strokeStyle = "white";
    }

    if (props.drawLines) {
      g.lineWidth *= props.lineWidth;

      for (let l of this.lines) {
        //g.strokeStyle = `rgba(0,0,0,${this.lineAlpha**0.5})`;
        g.beginPath();
        g.moveTo(l[0][0], l[0][1]);
        g.lineTo(l[1][0], l[1][1]);
        g.stroke();
      }
    }

    g.restore();

    let bg = this.bgColor;
    if (bg) {
      let r1 = (1.0 - bg[0])*255;
      let g1 = (1.0 - bg[1])*255;
      let b1 = (1.0 - bg[2])*255;
      g.fillStyle = `rgb(${~~r1},${~~g1},${~~b1})`;
    } else if (inverted) {
      g.fillStyle = "white";
    } else {
      g.fillStyle = "black";
    }

    g.font = "24px solid sans";
    g.beginPath()
    g.fillText("lines: " + this.lines.length, 20, 40);
    g.fillText("expDecay: " + this.expDecay.toFixed(4), 20, 80);
  }

  localMouse(p) {
    p = project_rets.next().load(p);
    p.sub(this.offset).mulScalar(1.0/this.scale);
    return p;
  }

  unLocalMouse(p) {
    p = project_rets.next().load(p);
    p = p.mulScalar(this.scale).add(this.offset);
    return p;
  }

  /* P should already be in normalized local (0-1) space.*/
  localImagePos(p) {
    p = project_rets.next().load(p);

    let scale = this.scale;
    let imagescale = scale/this.imageWidth;

    let w = this.imageWidth;
    let h = this.imageHeight;
    let asp = w/h;

    p[0] *= this.imageWidth;
    p[1] *= this.imageWidth;

    h = this.imageHeight*imagescale;

    if (asp > 1.0) {
      p[1] += -(scale - h)*0.5/imagescale;
    }

    return p;
  }

  reRenderImage() {
    this.image_canvas.g.putImageData(this.image, 0, 0);
    return this;
  }


  createMask() {
    if (!this.image) {
      return;
    }

    let dimen = this.dimen;
    const grid = this.grid = new Float64Array(dimen*dimen*GTOT);

    for (let i = 0; i < grid.length; i += GTOT) {
      grid[i + GGOAL] = 1.0;
      grid[i + GVAL] = 1.0;
    }

    this.mask = new ImageData(dimen, dimen);
    this.mask_canvas.width = this.mask_canvas.height = this.dimen;

    let p = new Vector2();
    const idata = this.image.data;

    let iw = this.image.width, ih = this.image.height;
    let inv255 = 1.0/255.0;
    let midata = this.mask.data;
    let inum = dimen*dimen;

    let value = this.value = new ImageData(dimen, dimen);
    let test = this.test = new ImageData(dimen, dimen);
    let vdata = value.data;

    const inverted = this.properties.inverted;

    for (let i = 0; i < inum; i++) {
      let ix = i%dimen;
      let iy = ~~(i/dimen);
      let x = ix/dimen;
      let y = iy/dimen;

      let gi = i*GTOT;

      p.loadXY(x, y);
      p = this.localImagePos(p).floor();

      let mi = (iy*dimen + ix)*4;
      midata[mi + 3] = 15;

      if (p[0] < 0 || p[1] < 0 || p[0] >= iw || p[1] >= ih) {
        continue;
      }

      let idx = (p[1]*iw + p[0])*4;
      let r = idata[idx]*inv255;
      let g = idata[idx + 1]*inv255;
      let b = idata[idx + 2]*inv255;
      let a = idata[idx + 3]*inv255;

      let f = getColorValue(r, g, b);

      //f = f*f*(3.0 - 2.0*f)*1.5;
      for (let k = 0; k < 2; k++) {
        f = f*f*(3.0 - 2.0*f);
      }

      if (inverted) {
        f = 1.0 - f;
      }

      //f = f > 0.5;
      grid[gi + GGOAL] = f;

      vdata[mi] = vdata[mi + 1] = vdata[mi + 2] = grid[gi + GGOAL]*255;
      vdata[mi + 3] = 255;
      //midata[mi] = midata[mi + 1] = midata[mi + 2] = f*255;
    }

    this.value_canvas.g.putImageData(value, 0, 0);
    return this;
  }

  renderMask() {
    if (!this.grid) {
      this.createMask();
    }

    const grid = this.grid;
    const dimen = this.dimen;

    let p = new Vector2();
    let iw = this.image.width, ih = this.image.height;
    let inv255 = 1.0/255.0;
    let midata = this.mask.data;
    let inum = dimen*dimen;
    const maskAlpha = this.maskAlpha*255;

    const vdata = this.value.data;
    const tdata = this.test.data;

    for (let i = 0; i < inum; i++) {
      let ix = i%dimen;
      let iy = ~~(i/dimen);
      let x = ix/dimen;
      let y = iy/dimen;

      let gi = i*GTOT;

      p.loadXY(x, y);
      p = this.localImagePos(p).floor();

      let f1 = grid[gi + GVAL];
      let f2 = grid[gi + GGOAL];

      let mi = (iy*dimen + ix)*4;
      midata[mi] = f1*255;
      midata[mi + 1] = f1*255; //f2*255;
      midata[mi + 2] = f1*255;
      midata[mi + 3] = maskAlpha;

      if (0) {
        let dv = this.dvImage([x, y]);

        //dv.normalize();
        midata[mi] = (dv[0]*0.5 + 0.5)*255;
        midata[mi + 1] = (dv[1]*0.5 + 0.5)*255;
      }
      vdata[mi] = vdata[mi + 1] = vdata[mi + 2] = grid[gi + GGOAL]*255;
      tdata[mi] = tdata[mi + 1] = tdata[mi + 2] = grid[gi + GTEST]*255;
      tdata[mi + 3] = 255;
    }

    this.mask_canvas.g.putImageData(this.mask, 0, 0);
    this.value_canvas.g.putImageData(this.value, 0, 0);
    this.test_canvas.g.putImageData(this.test, 0, 0);
    return this;
  }

  dvImage(p, filterWid = 2) {
    let a = this.sampleImage(p, filterWid);
    let ret = dvTemps2.next();

    if (a[3] < 0.1) {
      ret.zero();
      return ret;
    }

    let p2 = dvTemps2.next();
    let dv = 2.0/this.dimen;

    p2.loadXY(p[0] + dv, p[1]);
    let b = this.sampleImage(p2, filterWid);

    p2.loadXY(p[0], p[1] + dv);
    let c = this.sampleImage(p2, filterWid);

    a = getColorValue(a[0], a[1], a[2]);
    b = getColorValue(b[0], b[1], b[2]);
    c = getColorValue(c[0], c[1], c[2]);

    ret[0] = (b - a)/dv;
    ret[1] = (c - a)/dv;

    return ret;
  }

  /*p is normalize mask coordinates*/
  sampleImage(p, filterWid = 2) {
    let offs = getSearchOff(filterWid);

    p = this.localImagePos(p);
    let sumc = sampleImage4.next().zero();
    let sumw = 0.0;

    let idata = this.image.data;
    let width = this.image.width, height = this.image.height;
    for (let off of offs) {
      let ix = ~~(off[0] + p[0]);
      let iy = ~~(off[1] + p[1]);

      let w = off[2];
      w = w*w*(3.0 - 2.0*w);

      if (ix < 0 || iy < 0 || ix >= width || iy >= height) {
        continue;
      }

      let idx = (iy*width + ix)*4;

      let r = idata[idx]/255.0;
      let g = idata[idx + 1]/255.0;
      let b = idata[idx + 2]/255.0;
      let a = idata[idx + 3]/255.0;

      sumc[0] += r*w;
      sumc[1] += g*w;
      sumc[2] += b*w;
      sumc[3] += a*w;

      sumw += w;
    }

    if (sumw !== 0.0) {
      sumc.mulScalar(1.0/sumw);
    }

    return sumc;
  }
}

Pattern.register(LineArt);
