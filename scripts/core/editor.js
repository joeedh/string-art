import {
  simple, nstructjs, util, math, Vector2, UIBase, Icons, KeyMap, haveModal, ToolOp, ToolClasses, HotKey, createMenu,
  startMenu, saveUIData
} from '../path.ux/pathux.js';
import {loadImageFile} from '../path.ux/scripts/path-controller/util/image.js';
import {CACHED_IMAGE_KEY} from '../patterns/circle_winding.js';
import {Pattern} from '../patterns/pattern.js';

export class LoadDefaultsOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Load Defaults",
      toolpath: "app.load_defaults",
      inputs  : {},
      outputs : {}
    }
  }

  exec(ctx) {
    ctx.state.createNewFile(true);
    window.redraw_all();
  }
}

ToolOp.register(LoadDefaultsOp);

export class Workspace extends simple.Editor {
  constructor() {
    super();

    this.presets_tab_uidata = {};

    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");

    this.mpos = new Vector2();

    this.shadow.appendChild(this.canvas);

    this.keymap = new KeyMap();

    this.keymap.add(new HotKey("R", [], () => {
      this.ctx.state.reset();
      window.redraw_all();
    }));
    this.keymap.add(new HotKey("D", [], () => {
      this.ctx.pattern.step();
    }));
    this.keymap.add(new HotKey("E", [], () => {
      this.ctx.state.toggleTimer();
    }));

    this.keymap.add(new HotKey("Space", [], () => {
      let menu = [];

      for (let cls of ToolClasses) {
        let def = cls.tooldef();

        menu.push(def.toolpath);
      }

      menu = createMenu(this.ctx, "Find Tool", menu);

      let mpos = this.ctx.screen.mpos;
      startMenu(menu, mpos[0], mpos[1], true);

      console.log(menu);
    }));

    let eventBad = (e) => {
      if (haveModal()) {
        return true;
      }

      let elem = this.ctx.screen.pickElement(e.x, e.y);
      return elem && elem !== this && elem !== this.canvas;
    }

    this.addEventListener("pointerover", (e) => {
      let mpos = this.getLocalMouse(e.x, e.y);
      this.mpos.load(mpos);
    });

    this.addEventListener("pointerdown", (e) => {
      let mpos = this.getLocalMouse(e.x, e.y);
      this.mpos.load(mpos);

      if (eventBad(e)) {
        return;
      }
    });

    this.addEventListener("pointermove", (e) => {
      let mpos = this.getLocalMouse(e.x, e.y);
      this.mpos.load(mpos);

      if (eventBad(e)) {
        return;
      }

      if (0) {
        let lineart = this.ctx.lineart;

        if (!lineart.image) {
          return;
        }

        let p = lineart.localMouse(mpos);
        p = lineart.localImagePos(p);

        console.log(p[0], p[1]);
        p.floor();

        if (p[0] < lineart.image.width && p[1] < lineart.image.height) {
          let idx = (p[1]*lineart.image.width + p[0])*4;
          let idata = lineart.image.data;

          idata[idx] = 1;
          idata[idx + 1] = 1;
          idata[idx + 2] = 0;
          idata[idx + 3] = 255;

          lineart.reRenderImage();
          window.redraw_all();
          console.log(p, idx);
        }
      }
    });

    this.addEventListener("pointerup", (e) => {
      let mpos = this.getLocalMouse(e.x, e.y);
      this.mpos.load(mpos);

      if (eventBad(e)) {
        return;
      }
    });
  }

  static defineAPI(api, st) {

  }

  static define() {
    return {
      tagname : "workspace-editor-x",
      areaname: "workspace-editor-x",
      uiname  : "Workspace",
    }
  }

  getGlobalMouse(x, y) {
    let mpos = new Vector2();
    let r = this.canvas.getBoundingClientRect();

    let dpi = UIBase.getDPI();

    mpos[0] = x/dpi + r.x;
    mpos[1] = y/dpi + r.y;

    return mpos;
  }

  getLocalMouse(x, y) {
    let mpos = new Vector2();
    let r = this.canvas.getBoundingClientRect();

    let dpi = UIBase.getDPI();

    mpos[0] = (x - r.x)*dpi;
    mpos[1] = (y - r.y)*dpi;

    return mpos;
  }

  getKeyMaps() {
    return [this.keymap];
  }

  init() {
    super.init();

    let sidebar = this.makeSideBar();

    let header = this.header;
    let row;

    row = header.row();
    row.iconbutton(Icons.UNDO, "Undo", () => {
      this.ctx.toolstack.undo();
    });
    row.iconbutton(Icons.REDO, "Redo", () => {
      this.ctx.toolstack.redo();
    });

    row.button("Reset", () => {
      _appstate.reset();
      window.redraw_all();
    })

    row.tool("app.load_defaults()");

    row.button("Load Image", () => {
      loadImageFile().then(img => {
        console.log("Got image", img);
        localStorage[CACHED_IMAGE_KEY] = img.dataurl;
        this.ctx.pattern.loadImage(img);
      });
    });

    let but = row.button("Run", () => {
      this.ctx.state.toggleTimer();
    }).update.after(() => {
      if (this.ctx.state.timer !== undefined) {
        but.name = "Stop";
      } else {
        but.name = "Run";
      }
    });

    let tab;
    tab = sidebar.tab("Options");

    tab.label("Current Pattern");
    tab.prop("state.patternIndex");

    let props = UIBase.createElement("props-bag-editor-x");
    props.setAttribute("datapath", "properties");

    tab.add(props);

    this.makePresetTab(sidebar);
  }

  _save_tab_uidata() {
    let ret = [];
    for (let k in this.presets_tab_uidata) {
      ret.push(k);
      ret.push(this.presets_tab_uidata[k]);
    }

    return ret;
  }

  makePresetTab(sidebar) {
    let tab = sidebar.tab("Presets");
    let listbox = tab.listbox();

    let rebuild = true;
    let last_pattern;
    let exists = new Set();

    listbox.update.after(() => {
      if (!this.ctx.pattern) {
        return;
      }

      let patType = this.ctx.pattern.constructor.patternDef.typeName;

      let ok = !rebuild;
      ok = ok && last_pattern === patType;

      if (ok) {
        return;
      }

      console.log("Rebuild presets tab");

      if (last_pattern && exists.has(last_pattern)) {
        this.presets_tab_uidata[patType] = saveUIData(this, "presets");
      }

      let presets = this.ctx.pattern.constructor.patternDef.presets || [];

      let make_onclick = (i) => {
        return () => {
          this.loadPreset(patType, i);
        };
      }

      let i = 0;
      for (let p of presets) {
        let item = listbox.addItem(p.presetName, i);
        item.onclick = make_onclick(i);
        i++;
      }

      exists.add(patType);
      last_pattern = patType;
      rebuild = false;

    });
  }

  loadPreset(patType, i) {
    let preset = Pattern.getClass(patType).patternDef.presets[i];
    let pattern = this.ctx.pattern;
    let props = pattern.properties;

    for (let k in preset) {
      if (k in props) {
        props[k] = preset[k];
      }
    }

    pattern.reset();
    window.redraw_all();
  }

  draw() {
    if (!this.ctx) {
      return;
    }

    let canvas = this.canvas;

    let dpi = UIBase.getDPI();
    let w = ~~(this.size[0]*dpi);
    let h = ~~(this.size[1]*dpi) - 50*dpi;

    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = w;
      canvas.height = h;

      canvas.style["width"] = "" + (w/dpi) + "px";
      canvas.style["height"] = "" + (h/dpi) + "px";
    }

    this.g.clearRect(0, 0, canvas.width, canvas.height);
    //console.log("draw!");

    this.ctx.pattern.draw(canvas, this.g);
  }

  loadSTRUCT(reader) {
    reader(this);

    let lst = this.presets_tab_uidata;
    if (lst instanceof Array) {
      this.presets_tab_uidata = {};

      for (let i = 0; i < lst.length; i += 2) {
        this.presets_tab_uidata[lst[i]] = lst[i + 1];
      }
    }
  }

  setCSS() {
    this.canvas.style["position"] = "absolute";
  }
}

Workspace.STRUCT = nstructjs.inherit(Workspace, simple.Editor, "Workspace") + `
  presets_tab_uidata : array(string) | this._save_tab_uidata();
}`;
simple.Editor.register(Workspace);

