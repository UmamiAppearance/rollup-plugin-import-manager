import { createFilter } from "@rollup/pluginutils";
import ImportManager from "./core.js";
import picomatch from "picomatch"; 

// helper to allow string and array
const ensureArray = (arr) => Array.isArray(arr) ? arr : [arr];

// makes the life of the user a little bit easier
// by accepting multiple versions of boolean vars 
const bool = (b) => !(Boolean(b) === false || String(b).match(/^(?:false|no?|0)$/, "i"));

// allow some variations to enable object mode 
// for debugging
const showObjects = (v) => Boolean(String(v).match(/^(?:objects?|imports?)$/));

const manager = (options={}) => {
    console.log("options", options);

    const filter = createFilter(options.include, options.exclude);
  
    return {
        name: 'ImportManager',
    
        transform (source, id) {
            console.log("id", id);
            if (!filter(id)) return;

            const importManager = new ImportManager(source, id);       

            if (!("units" in options) || "debug" in options) {
                if (showObjects(options.debug)) {
                    importManager.logUnitObjects();
                } else {
                    importManager.logUnits();
                };
            } else if (options.units) {
                
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
                    
                    if ("debug" in unitSection) {
                        unit.methods.log();       
                    }
                    
                    else if ("actions" in unitSection) {

                        for (const action of ensureArray(unitSection.actions)) {
                            
                            if (typeof action === "object" && "select" in action) {
                                if (action.select === "module" && "rename" in action) {
                                    const modType = ("modType" in action) ? action.modType : unit.module.type;
                                    unit.methods.renameModule(action.rename, modType);
                                }

                                else if (action.select === "member" || action.select === "defaultMember" ) {
                                    const memberType = action.select;
                                    
                                    if ("alias" in action) {
                                        const alias = "remove" in action ? null : action.alias;
                                        unit.methods.setAlias(memberType, action.name, alias);
                                    }
                                    
                                    else if ("rename" in action) {
                                        const keepAlias = "keepAlias" in action ? bool(action.keepAlias) : false;
                                        unit.methods.renameMember(memberType, action.name, action.rename, keepAlias);
                                    }

                                    else if ("remove" in action) {
                                        unit.methods.removeMember(memberType, action.name);
                                    }

                                }

                                else if (action.select === "members" || action.select === "defaultMembers") {
                                    if ("remove" in action) {
                                        unit.methods.removeMembers(action.select);
                                    }

                                    if ("add" in action) {
                                        if (action.select === "members") {
                                            unit.methods.addMember(ensureArray(action.add));
                                        } else if ("add" in action) {
                                            unit.methods.addDefaultMember(ensureArray(action.add));
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
