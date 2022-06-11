import { createFilter } from "@rollup/pluginutils";
import ImportManager from "./core.js";


const manager = (options={}) => {
    console.log("options", options);

    const filter = createFilter(options.include, options.exclude);
  
    return {
        name: 'ImportManager',
    
        transform (source, id) {
            console.log("id", id);
            if (!filter(id)) return;

            const importManager = new ImportManager(source);
            
            if (options.debug) {
                if (options.debug === "units") {
                    importManager.logUnits();
                } else if (options.debug === "objects") {
                    importManager.logUnitObjects();
                }
            } else if (options.select) {
                const obj = options.select;
                for (const modName in options.select) {
                    console.log("MOD_NAME", modName);
                    const unit = importManager.selectModByName("appendix.js");
                    
                    if (obj[modName] === "debug") {
                        unit.methods.log();
                    }
                }
            }

            const code = importManager.code.toString();
            let map;

            if (options.sourceMap !== false && options.sourcemap !== false) {
                map = importManager.code.generateMap({ hires: true });
            }

            return { code, map };
        }
    };
};
  
export { manager };
