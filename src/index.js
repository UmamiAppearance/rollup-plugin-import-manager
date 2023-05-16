/**
 * [rollup-plugin-import-manager]{@link https://github.com/UmamiAppearance/rollup-plugin-import-manager}
 *
 * @version 0.6.2
 * @author UmamiAppearance [mail@umamiappearance.eu]
 * @license MIT
 */


import { createFilter } from "@rollup/pluginutils";
import { ImportManager } from "import-manager";
import showDiff from "./diff.js";

// test if input is an object
const isObject = input => typeof input === "object" && !Array.isArray(input) && input !== null;

// helper to allow string and array
const ensureArray = (arr) => Array.isArray(arr) ? arr : [arr];

// helper to allow string and object
const ensureObj = (input) => {

    if (typeof input === "string") {
        const output = {};
        output[input] = null;
        return output;
    }
    
    else if (isObject(input)) {
        return input;
    }
    
    throw new TypeError("Only strings and objects are allowed for actions.");
    
};

// makes the life of the user a little bit easier
// by accepting multiple versions of boolean vars 
const bool = (b) => !(Boolean(b) === false || (/^(?:false|no?|0)$/i).test(String(b)));

// allow some variations to enable object mode 
// for debugging
const showObjects = (v) => (/^(?:objects?|imports?|verbose)$/).test(String(v));


// main
const importManager = (options={}) => {

    const filter = createFilter(options.include, options.exclude);

    // Initialize a new set to be passed to every 
    // ImportManager instance. It keeps track of
    // warnings, that were shown already.
    const warnSpamProtection = new Set();
  
    return {
        name: "ImportManager",
    
        transform (source, id) {
            if (!filter(id)) return;

            const warnings = typeof options.warnings === "undefined" ? true : bool(options.warnings);

            const manager = new ImportManager(source, id, warnSpamProtection, warnings, this);       

            if (!("units" in options) || "debug" in options) {
                if (showObjects(options.debug)) {
                    manager.logUnitObjects();
                } else {
                    manager.logUnits();
                }
            }
            
            else {

                const unitArray = ensureArray(options.units);

                for (const unitSection of unitArray) {

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


                    // a little helper function to select a unit
                    const selectUnit = (section) => {
                        if (!isObject(section)) {
                            throw new TypeError("Input must be an object.");
                        }

                        let unit = null;
                    
                        if ("id" in section) {
                            if (allowId) {
                                manager.warning("Selecting modules via Id should only be used for testing.");
                                unit = manager.selectModById(section.id, allowNull);
                            } else {
                                throw new Error("Filename must be specified for selecting via Id.");
                            }
                        } else if ("hash" in section) {
                            unit = manager.selectModByHash(section.hash, allowNull);
                        } else if ("module" in section) {
                            unit = manager.selectModByName(section.module, section.type, allowNull);
                        } else if ("rawModule" in section) {
                            unit = manager.selectModByName(section.rawModule, section.type, allowNull, true);
                        }
                    
                        return unit;
                    };

                    
                    // creating units from scratch
                    if ("createModule" in unitSection || "addCode" in unitSection) {

                        let codeSnippet;
                        let debug = false;

                        if ("createModule" in unitSection) {

                            if (allowNull) {
                                manager.warning("No file specified for import statement creation! If the build fails, this could be the reason.");
                            }

                            const module = unitSection.createModule;
                            let type = unitSection.type;

                            const mem = {
                                defaultMembers: [],
                                members: []
                            };

                            if ("actions" in unitSection) {
                                for (let action of ensureArray(unitSection.actions)) {
                                    action = ensureObj(action);
                                    if ((action.select === "members" || action.select === "defaultMembers") && "add" in action) {
                                        mem[action.select] = ensureArray(action.add); 
                                    }
                                    if ("debug" in action) {
                                        debug = true;
                                    }
                                }
                            }

                            if (mem.defaultMembers.length || mem.members.length) {
                                type = "es6";
                            }

                            
                            if (!type) {
                                throw new TypeError("If no (default) members are specified, the type cannot be determined and must be specified by passing 'type: \"cjs\"|\"dynamic\"|\"es6\"'");
                            } else if (type === "es6") {
                                codeSnippet = manager.makeES6Statement(module, mem.defaultMembers, mem.members);
                            } else {
                                const declarators = /^(?:const|let|var|global)$/;
                                const [ declarator, varname ] = Object.entries(unitSection).filter(e => declarators.test(e[0])).at(0) || [ null, null ];

                                if (!declarator || !varname) {
                                    throw new TypeError("dynamic and cjs imports require a valid declarator key (const|let|var|global) and a value for the variable name.");
                                }

                                if (type === "cjs") {
                                    codeSnippet = manager.makeCJSStatement(module, declarator, varname);
                                } else if (type === "dynamic") {
                                    codeSnippet = manager.makeDynamicStatement(module, declarator, varname);
                                }
                            }
                        }
                        
                        else {
                            codeSnippet = unitSection.addCode;
                            if (!(codeSnippet && typeof codeSnippet === "string")) {
                                throw new TypeError("'addCode' must be a non empty string.");
                            }

                            if ("actions" in unitSection) {
                                for (let action of ensureArray(unitSection.actions)) {
                                    action = ensureObj(action);
                                    if ("debug" in action) {
                                        debug = true;
                                    }
                                }
                            }
                        }
                        
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
                            const target = selectUnit(unitSection[mode]);

                            if (debug) {
                                manager.logCreations(codeSnippet, target, null, mode);
                            }
                            
                            // insert if match is found
                            // (which can be undefined if no file specified)
                            if (target) {
                                manager.insertAtUnit(target, mode, codeSnippet);
                            }
                        }

                        else {
                            // default is es6
                            let type = "es6";

                            // overwrite this if set by the config
                            if (unitSection.type) {
                                type = unitSection.type;
                            } 
                            
                            // if type is dynamic change to es6 if is6 imports
                            // are found (as dynamic imports can be wildly spread)
                            
                            if (type === "dynamic" && manager.imports.es6.length) {
                                type = "es6";
                            }

                            if (debug) {
                                manager.logCreations(codeSnippet, null, type, unitSection.insert || "bottom");
                            }

                            manager.insertStatement(codeSnippet, unitSection.insert, type);
                        }

                        continue;
                    }
                    

                    // select existing units
                    const unit = selectUnit(unitSection);
                    if (!unit) {
                        continue;
                    }
                    
                    
                    if ("actions" in unitSection) {

                        for (let action of ensureArray(unitSection.actions)) {
                            
                            action = ensureObj(action);
                            
                            if ("debug" in action) {
                                unit.methods.log();       
                            }

                            // cut and paste a unit
                            else if ("cut" in action) {
                                const newSection = {...unitSection};
                                delete newSection.actions;
                                newSection.addCode = manager.remove(unit);
                                unitArray.push(newSection);

                                continue;
                            }
                            
                            else if ("select" in action) {

                                // module
                                if (action.select === "module" && "rename" in action) {
                                    const modType = ("modType" in action) ? action.modType : unit.module.type;
                                    unit.methods.renameModule(action.rename, modType);
                                }

                                // single (default) member
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

                                // entire group of (default) members
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

                            // remove the entire unit
                            else if ("remove" in action) {
                                manager.remove(unit);
                                continue;
                            }

                            // apply the changes to the code
                            manager.commitChanges(unit);
                        }
                    }
                }
            }

            const code = manager.code.toString();
            
            if ("showDiff" in options && manager.code.hasChanged()) {
                showDiff(id, source, code, options.showDiff);
            }
            
            let map;

            if (options.sourceMap !== false && options.sourcemap !== false) {
                map = manager.code.generateMap({ hires: true });
            }

            return { code, map };
        }
    };
};
  
export { importManager };
