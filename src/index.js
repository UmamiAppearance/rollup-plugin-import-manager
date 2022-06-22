import { createFilter } from "@rollup/pluginutils";
import ImportManager from "./core.js";

const isObject = input => typeof input === "object" && !Array.isArray(input) && input !== null;

// helper to allow string and array
const ensureArray = (arr) => Array.isArray(arr) ? arr : [arr];

// helper to allow string and object
const ensureObj = (input) => {
    let output;

    if (typeof input === "string") {
        output = {};
        output[input] = null;
    }
    
    else if (isObject(input)) {
        output = input;
    }
    else {
        throw new TypeError("Only strings and objects are allowed for actions.");
    }
    
    return output;
}

// makes the life of the user a little bit easier
// by accepting multiple versions of boolean vars 
const bool = (b) => !(Boolean(b) === false || String(b).match(/^(?:false|no?|0)$/, "i"));

// allow some variations to enable object mode 
// for debugging
const showObjects = (v) => Boolean(String(v).match(/^(?:objects?|imports?)$/));


// main
const manager = (options={}) => {
    console.log("options", options);

    const filter = createFilter(options.include, options.exclude);
    const warnSpamProtection = new Set();
  
    return {
        name: 'ImportManager',
    
        transform (source, id) {
            if (!filter(id)) return;

            const importManager = new ImportManager(source, id, warnSpamProtection);       

            if (!("units" in options) || "debug" in options) {
                if (showObjects(options.debug)) {
                    importManager.logUnitObjects();
                } else {
                    importManager.logUnits();
                };
            }
            
            else {

                for (const unitSection of ensureArray(options.units)) {

                    let allowId = false; 
                    let allowNull = true;

                    if ("file" in unitSection) {
                        const isMatch = createFilter(unitSection.file);

                        if (!isMatch(id)) {
                            continue;
                        }

                        allowId = true;
                        allowNull = false;
                    }

                    const selectModule = (section) => {
                        if (!isObject(section)) {
                            throw new TypeError("Input must be an object.");
                        }

                        let unit = null;
                    
                        if ("id" in section) {
                            if (allowId) {
                                importManager.warning("Selecting modules via Id should only be used for testing.")
                                unit = importManager.selectModById(section.id, allowNull);
                            } else {
                                throw new Error("Filename must be specified for selecting via Id.");
                            }
                        } else if ("hash" in section) {
                            unit = importManager.selectModByHash(section.hash, allowNull);
                        } else if ("module" in section) {
                            unit = importManager.selectModByName(section.module, section.type, allowNull);
                        }
                    
                        return unit;
                    }
                    
                    if ("createModule" in unitSection) {

                        if (allowNull) {
                            importManager.warning("No file specified for import statement creation! If the build fails, this could be the reason.");
                        }

                        const module = unitSection.createModule;
                        let defaultMembers = [];
                        let members = [];
                        
                        if ("defaultMembers" in unitSection) {
                            defaultMembers = ensureArray(unitSection.defaultMembers);
                        }

                        if ("members" in unitSection) {
                            members = ensureArray(unitSection.members);
                        }

                        const statement = importManager.makeES6Statement(module, defaultMembers, members);
                        
                        let mode;
                        for (const key in unitSection) {
                            const targetMatch = key.match(/^(?:(?:ap|pre)pend|replace)$/);
                            if (targetMatch) {
                                mode = targetMatch.at(0);
                                break;
                            }
                        }
                        
                        if (mode) {
                            // look for the target with the values at key 'append|prepend|replace'
                            const targetUnitSection = unitSection[mode];
                            targetUnitSection.type = "es6";

                            const target = selectModule(targetUnitSection);
                            
                            // insert if match is found
                            // (which can be undefined if no file specified)
                            if (target) {
                                importManager.insertAtUnit(target, mode, statement);
                            }
                        }

                        else {
                            importManager.insertStatement(statement, unitSection.insert);
                        }

                        continue;
                    }
                    
                    const unit = selectModule(unitSection);
                    if (!unit) {
                        continue;
                    }
                    
                    
                    if ("actions" in unitSection) {

                        for (let action of ensureArray(unitSection.actions)) {
                            
                            action = ensureObj(action);
                            
                            if ("debug" in action) {
                                unit.methods.log();       
                            }
                            
                            else if ("select" in action) {
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
                                            unit.methods.addMembers(ensureArray(action.add));
                                        } else {
                                            unit.methods.addDefaultMembers(ensureArray(action.add));
                                        }
                                    } 
                                }
                            }
                            
                            else if ("remove" in action) {
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
