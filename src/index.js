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

            const importManager = new ImportManager(source, id);
            
            if (options.select) {
                const selection = Array.isArray(options.select) ? options.select : [options.select];
                
                let allowNull = true;
                let useId = false;

                for (const obj of selection) { 

                    if ("file" in obj) {
                        console.log(obj.file, "obj.file");

                        //const isMatch = picomatch(obj.file);
                        const isMatch = (id) => (id.indexOf(obj.file) > -1);
                        // FIXME: proper implementation
                        
                        if (!isMatch(id)) {
                            console.log(id, "NO!");
                            return;
                        }

                        if ("debug" in obj) {
                            if (obj.debug === "objects") {
                                importManager.logUnitObjects();
                            } else {
                                importManager.logUnits();
                            }       
                        }

                        allowNull = false;
                        useId = "id" in obj;
                    }

                    let unit;
                    if (useId) {
                        unit = importManager.selectModById(obj.id, allowNull);
                    } else if ("hash" in obj) {
                        unit = importManager.selectModByHash(obj.hash, allowNull);
                    } else if ("module" in obj) {
                        unit = importManager.selectModByName(obj.module, obj.type, allowNull);
                    }
                    
                    console.log(unit);
                    console.log(importManager.imports);

                    if ("actions" in obj) {
                        console.log("actions in obj");
                        const actions = Array.isArray(obj.actions) ? obj.actions : [obj.actions];
                        console.log(actions);
                        for (const action of actions) {
                            
                            if (typeof action === "object" && "select" in action) {
                                if (action.select === "module") {
                                    if ("rename" in action) {
                                        const modType = ("modType" in action) ? action.modType : unit.module.type;
                                        unit.methods.renameModule(action.rename, modType);
                                    }
                                }

                                else if (action.select === "members") {
                                    if ("add" in action) {
                                        unit.methods.addMember(action.add);
                                    }
                                }

                                else if (action.select === "member") {
                                    if ("rename" in action) {
                                        //
                                    }
                                }
                            }
                            
                            else if (action === "remove") {
                                importManager.remove(unit);
                                continue;
                            }

                            importManager.commitChanges(unit);
                        }
                    }


                }
            }

            const code = importManager.code.toString();
            console.log("CODE >>>>");
            console.log(code);
            console.log("<<< CODE");
            let map;

            if (options.sourceMap !== false && options.sourcemap !== false) {
                map = importManager.code.generateMap({ hires: true });
            }

            return { code, map };
        }
    };
};
  
export { manager };
