import { createFilter } from "@rollup/pluginutils";
import ImportManager from "./core.js";
import picomatch from "picomatch"; 

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
                const selection = Array.isArray(options.select) ? options.select : [options.select];
                let allowNull = true;
                for (const obj of selection) {
                    if ("file" in obj) {
                        console.log(obj.file, "obj.file");
                        const isMatch = picomatch(obj.file);
                        // FIXME: proper implementation
                        if (!isMatch(id)) {
                            console.log(id, "NO!");
                            return;
                        }
                        allowNull = false;
                    }
                    const unit = importManager.selectModByName(obj["module"], null, allowNull);
                    console.log(unit);
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
