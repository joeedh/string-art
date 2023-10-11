import {Pattern} from './pattern.js';
import {nstructjs, util, math} from '../path.ux/pathux.js';

export class GrowPattern extends Pattern {
  static patternDef = {
    typeName  : "grow",
    uiName    : "Grow",
    properties: {
      dimen: {type: "int", value: 500, min: 5, max: 4096, slideSpeed: 2, displayUnit: "none", baseUnit: "none"},
    }
  }
  static STRUCT = nstructjs.inherit(GrowPattern, Pattern) + `
  }`;
}
Pattern.register(GrowPattern);
