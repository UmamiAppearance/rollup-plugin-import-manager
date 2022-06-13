import { createFilter } from "@rollup/pluginutils";
import ImportManager from "./core.js";
import picomatch from "picomatch"; 

// helper to allow string and array
const ensureArray = (arr) => Array.isArray(arr) ? arr : [arr];
const bool = (b) => !(Boolean(b) === false || String(b).match(/(?:false|no|0)/, "i"));

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
                
                let allowNull = true;
                let useId = false;

                for (const obj of ensureArray(options.select)) { 

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

                        for (const action of ensureArray(obj.actions)) {
                            
                            if (typeof action === "object" && "select" in action) {
                                if (action.select === "module") {
                                    if ("rename" in action) {
                                        const modType = ("modType" in action) ? action.modType : unit.module.type;
                                        unit.methods.renameModule(action.rename, modType);
                                    }
                                }

                                else if (action.select === "member" || action.select === "defaultMember" ) {
                                    const memberType = action.select;
                                    if (!"name" in action) {
                                        throw new Error(`${memberType} name must be set.`);
                                    }

                                    if ("rename" in action) {
                                        const keepAlias = "keepAlias" in action ? bool(action.keepAlias) : false;
                                        unit.methods.renameMember(memberType, action.name, action.rename, keepAlias);
                                    }
                                }

                                else if (action.select === "members") {
                                    if ("add" in action) {
                                        for (const addition of ensureArray(action.add)) {
                                            unit.methods.addMember(addition);
                                        }
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
