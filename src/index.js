import { createFilter } from "@rollup/pluginutils";
import ImportManager from "./core.js";
import MagicString from "magic-string"; // TODO: remove from here, use in from code directly

const manager = (options={}) => {
      
    const filter = createFilter(options.include, options.exclude);
  
    return {
        name: 'ImportManager',
    
        transform (source, id) {
            if (!filter(id)) return;

            const importManager = new ImportManager(source);
            importManager.code.appendLeft(0, "//modified\n");
            importManager.logAllImportObjects();

            const code = importManager.code.toString();
            let map;

            if (options.sourceMap !== false && options.sourcemap !== false) {
                const magicString = new MagicString(code)
                map = magicString.generateMap({ hires: true })
            }

            return { code, map }
        }
    };
};
  
export { manager };
