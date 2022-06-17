import { createFilter } from "@rollup/pluginutils";
import ImportManager from "./core.js";
import picomatch from "picomatch"; 

// helper to allow string and array
const ensureArray = (arr) => Array.isArray(arr) ? arr : [arr];

// makes the life of the user a little bit easier
// by accepting multiple versions of boolean vars 
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
            
            if (options.units) {
                
                let allowNull = true;
                let useId = false;

                for (const unitSection of ensureArray(options.units)) { 

                    if ("file" in unitSection) {
                        console.log(unitSection.file, "obj.file");

                        //const isMatch = picomatch(obj.file);
                        const isMatch = (id) => (id.indexOf(unitSection.file) > -1);
                        // FIXME: proper implementation
                        
                        if (!isMatch(id)) {
                            console.log(id, "NO!");
                            return;
                        }

                        if ("debug" in unitSection) {
                            if (unitSection.debug === "objects") {
                                importManager.logUnitObjects();
                            } else {
                                importManager.logUnits();
                            }       
                        }

                        allowNull = false;
                        useId = "id" in unitSection;
                    }

                    let unit;
                    if (useId) {
                        unit = importManager.selectModById(unitSection.id, allowNull);
                    } else if ("hash" in unitSection) {
                        unit = importManager.selectModByHash(unitSection.hash, allowNull);
                    } else if ("module" in unitSection) {
                        unit = importManager.selectModByName(unitSection.module, unitSection.type, allowNull);
                    }
                    
                    console.log(unit);
                    console.log(importManager.imports);

                    if ("actions" in unitSection) {

                        for (const action of ensureArray(unitSection.actions)) {
                            
                            if (typeof action === "object" && "select" in action) {
                                if (action.select === "module") {
                                    if ("rename" in action) {
                                        const modType = ("modType" in action) ? action.modType : unit.module.type;
                                        unit.methods.renameModule(action.rename, modType);
                                    }
                                }

                                else if (action.select === "member" || action.select === "defaultMember" ) {
                                    const memberType = action.select;
                                    
                                    if ("rename" in action) {
                                        const keepAlias = "keepAlias" in action ? bool(action.keepAlias) : false;
                                        unit.methods.renameMember(memberType, action.name, action.rename, keepAlias);
                                    }

                                    else if ("remove" in action) {
                                        unit.methods.removeMember(memberType, action.name);
                                    }
                                }

                                else if (action.select === "members") {
                                    if ("add" in action) {
                                        unit.methods.addMember(ensureArray(action.add));
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
