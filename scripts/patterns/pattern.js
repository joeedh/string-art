import {PropertiesBag} from '../core/property_templ.js';
import {EnumProperty, nstructjs} from '../path.ux/scripts/pathux.js';

export const PatternClasses = [];

export function makePatternProp() {
  let enumdef = {};
  let names = {};

  let i = 0;
  for (let cls of PatternClasses) {
    let def = cls.patternDef;

    enumdef[def.typeName] = i++;
    names[def.typeName] = def.uiName;
  }

  return new EnumProperty(0, enumdef).addUINames(names);
}

export class Pattern {
  static patternDef = {
    uiName    : "",
    typeName  : "",
    properties: {},
  }

  static register(cls) {
    PatternClasses.push(cls);
    nstructjs.register(cls);
  }

  constructor() {
    let def = this.constructor.patternDef;
    this.properties = new PropertiesBag(def.properties);
  }

  loadSTRUCT(reader) {
    reader(this);

    this.properties.patchTemplate(this.constructor.patternDef.properties);
  }

  step() {
  }

  reset() {
  }

  draw(canvas, g, props) {
  }
}

Pattern.STRUCT = `
Pattern {
  properties : PropertiesBag;
}
`;
nstructjs.register(Pattern);
