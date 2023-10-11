import config from '../config/config.js';

/* Set default undo handlers; they just saves and reload the file
*  minus the screen layout.*/

import {simple, ToolOp} from '../path.ux/scripts/pathux.js';
import {Workspace} from './editor.js';
import {makePatternProp} from '../patterns/pattern.js';

ToolOp.prototype.undoPre = function (ctx) {
  this._undo = ctx.state.saveFileSync({
    doScreen: false
  });
}

ToolOp.prototype.undo = function (ctx) {
  ctx.state.loadFileSync(this._undo, {
    resetToolStack: false,
    resetContext  : false,
    doScreen      : false,
    resetOnLoad   : false
  });
}

export class Context {
  constructor(state) {
    this.state = state;
  }

  get lineart() {
    return this.state.lineart;
  }

  get pattern() {
    return this.state.pattern;
  }

  get workspace() {
    return simple.Editor.findEditor(Workspace);
  }

  get selMask() {
    return config.SELECTMASK;
  }

  get properties() {
    return this.state.pattern.properties;
  }

  static defineAPI(api, st) {
    st.dynamicStruct("properties", "properties", "Properties");
    st.dynamicStruct("state", "state", "State");
  }
}
