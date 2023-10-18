import {PropertiesBag} from '../core/property_templ.js';
import {EnumProperty, nstructjs, ToolProperty} from '../path.ux/scripts/pathux.js';

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
    presets   : [],
  }

  static getClass(patType) {
    for (let cls of PatternClasses) {
      if (cls.patternDef.typeName === patType) {
        return cls;
      }
    }
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

  savePresetText(name = "Pattern") {
    let json = {};

    let badkeys = new Set([
      "sourceTemplate", "_id", "_props", "_struct", "_updateGen"
    ]);

    for (let k in this.properties) {
      if (badkeys.has(k)) {
        continue;
      }
      json[k] = this.properties[k];
    }

    json.version = this.constructor.patternDef.version;
    json.presetName = name;

    return JSON.stringify(json);
  }
}

Pattern.STRUCT = `
Pattern {
  properties : PropertiesBag;
}
`;
nstructjs.register(Pattern);

class PatternList extends Array {
  active = undefined;

  constructor(list) {
    super();

    for (let item of list) {
      this.push(item);
    }
  }
}

export class PatternPresets {
  constructor() {
    this.presets = {};

    for (let cls of PatternClasses) {
      this.presets[cls.typeName] = cls.patternDef.presets;
    }
  }

  defineAPI(api) {
    let st = api.mapStruct(this);
    let structs = {};

    class PresetCls {
    }

    let preset_st = api.mapStruct(PresetCls);
    preset_st.string("name", "name", "Name");

    for (let k in this.presets) {
      st.list(k, k, {
        getStruct(api, list, key) {
          return preset_st;
        },
        get(api, list, key) {
          return list[key];
        },
        getKey(api, list, obj) {
          return list.indexOf(obj);
        },
        getActive(api, list) {
          return list.active;
        },
        setActive(api, list, val) {
          list.active = val;
        },
        getIter(api, list) {
          return list[Symbol.iterator]();
        }
      });

    }

  }
}
