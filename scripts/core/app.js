import {
  simple, util, Vector2, Vector3, Matrix4, math,
  ToolOp, PropTypes, NumberConstraints, TextBoxBase,
  nstructjs
} from '../path.ux/pathux.js';

import './editor.js';
import {Workspace} from './editor.js';
import {FileArgs} from '../path.ux/scripts/simple/file.js';
import {PropertiesBag} from './property_templ.js';
import {Context} from './context.js';
import {LineArt} from '../patterns/circle_winding.js';
import {makePatternProp, PatternClasses} from '../patterns/pattern.js';
import '../patterns/all.js';

export const STARTUP_FILE_KEY = "_startup_file_lart2";

window.addEventListener("contextmenu", (e) => {
  console.log(e);

  if (window._appstate && _appstate.screen) {
    let elem = _appstate.screen.pickElement(e.x, e.y);

    if (elem instanceof TextBoxBase || elem.tagName === "INPUT") {
      return;
    }
  }
  e.preventDefault();
});

export class PatternList {
  constructor(patterns) {
    this.patterns = patterns;
  }

  static STRUCT = `
PatternList {
  patterns : array(abstract(Pattern));
}
  `;
}

nstructjs.register(PatternList);

export class App extends simple.AppState {
  constructor() {
    super(Context);

    this.createNewFile(true);
    this.saveFilesInJSON = true;

    this.pattern = undefined;
    this.patterns = [];
    this.patternIndex = 0;

    this.timer = undefined;
    this.constructor.defineAPI(this.api);
  }

  static defineAPI(api) {
    let st = api.mapStruct(this);
    st.enum("patternIndex", "patternIndex", makePatternProp());
    return st;
  }

  get patternIndex() {
    return PatternClasses.indexOf(this.pattern.constructor);
  }

  set patternIndex(i) {
    let cls = PatternClasses[i];

    for (let pat of this.patterns) {
      if (pat instanceof cls) {
        this.pattern = pat;
        return;
      }
    }

    this.pattern = new PatternClasses[i];
    this.patterns.push(this.pattern);
  }

  reset() {
    this.pattern.reset();
    window.redraw_all();
  }

  createNewFile(noReset = false) {
    if (!noReset) {
      this.reset();
      this.makeScreen();
    }
  }

  saveStartupFile() {
    this.saveFile().then((json) => {
      json = JSON.stringify(json);

      localStorage[STARTUP_FILE_KEY] = json;
      console.log("Saved startup file", (json.length/1024.0).toFixed(2) + "kb");
    });
  }

  loadStartupFile() {
    if (!(STARTUP_FILE_KEY in localStorage)) {
      return;
    }

    try {
      let json = JSON.parse(localStorage[STARTUP_FILE_KEY]);
      this.loadFile(json);
    } catch (error) {
      util.print_stack(error);
      console.warn("Failed to load startup file");
      this.createNewFile();
    }
  }

  saveFileSync(objects, args = {}) {
    if (args.useJSON === undefined) {
      args.useJSON = true;
    }

    /* Save active pattern as first item. */
    if (this.patterns.indexOf(this.pattern) !== 0) {
      this.patterns.remove(this.pattern);
      this.patterns = [this.pattern].concat(this.patterns);
    }

    return super.saveFileSync([
      new PatternList(this.patterns)
    ], args);
  }

  saveFile(args = {}) {
    /* Save active pattern as first item. */
    if (this.patterns.indexOf(this.pattern) !== 0) {
      this.patterns.remove(this.pattern);
      this.patterns = [this.pattern].concat(this.patterns);
    }

    return new Promise((accept, reject) => {
      accept(this.saveFileSync([new PatternList(this.patterns)], args));
    });
  }

  loadFileSync(data, args = {}) {
    if (args.useJSON === undefined) {
      args.useJSON = true;
    }

    let file = super.loadFileSync(data, args);

    this.patterns = file.objects[0].patterns;
    this.pattern = this.patterns[0];

    window.redraw_all();

    return file;
  }

  loadFile(data, args = {}) {
    return new Promise((accept, reject) => {
      accept(this.loadFileSync(data, args));
    });
  }

  toggleTimer() {
    if (this.timer !== undefined) {
      console.log("Stopping timer.");
      window.clearInterval(this.timer);
      this.timer = undefined;
      return;
    }

    console.log("Starting timer.");

    let draw_nr = window.redraw_all_nr;
    window.redraw_all();

    this.timer = window.setInterval(() => {
      if (window.redraw_all_nr !== draw_nr) {
        this.step();
        draw_nr = window.redraw_all_nr;
        window.redraw_all();
      }
    }, 2);
  }

  step() {
    this.pattern.step();
  }

  draw() {
    for (let sarea of this.screen.sareas) {
      if (sarea.area && sarea.area.draw) {
        sarea.area.draw();
      }
    }
  }

  start() {
    super.start({
      DEBUG: {
        modalEvents: true
      }
    });

    this.loadStartupFile();
  }
}

export function start() {
  console.log("start!");

  let animreq = undefined;

  window.redraw_all_nr = 0;

  function drawfunc() {
    animreq = undefined;
    window.redraw_all_nr++;

    _appstate.draw();
  }

  let ignore_lvl = 0;
  window.draw_ignore_push = function () {
    ignore_lvl++;
  }
  window.draw_ignore_pop = function () {
    ignore_lvl = Math.max(ignore_lvl - 1, 0);
  }

  window.redraw_all = function () {
    if (animreq || ignore_lvl) {
      return;
    }

    console.warn("redraw_all");
    animreq = requestAnimationFrame(drawfunc);
  }

  window._appstate = new App();
  _appstate.start();

  window.setInterval(() => {
    console.log("Saving startup file");
    _appstate.saveStartupFile();
  }, 2000);

  window.redraw_all();
}