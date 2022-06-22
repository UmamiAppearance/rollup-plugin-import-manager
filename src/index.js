/**
 * [rollup-plugin-import-manager]{@link https://github.com/UmamiAppearance/rollup-plugin-import-manager}
 *
 * @version 0.1.0
 * @author UmamiAppearance [mail@umamiappearance.eu]
 * @license MIT
 */


import { createFilter } from "@rollup/pluginutils";
import ImportManager from "./core.js";
import Diff from "diff";
import { blue, bold, red, green, gray } from "colorette";

// test if input is an object
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

    const filter = createFilter(options.include, options.exclude);

    // Initialize a new set to be passed to every 
    // ImportManager instance. It keeps track of
    // warnings, that were shown already.
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


                    // a little helper function to select a unit
                    const selectUnit = (section) => {
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

                    
                    // creating units from scratch
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

                            const target = selectUnit(targetUnitSection);
                            
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
                    

                    // select exiting units
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
                            
                            else if ("select" in action) {

                                // module
                                if (action.select === "module" && "rename" in action) {
                                    const modType = ("modType" in action) ? action.modType : unit.module.type;
                                    unit.methods.renameModule(action.rename, modType);
                                }

                                // single (default) members
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
                                importManager.remove(unit);
                                continue;
                            }

                            // apply the changes to the code
                            importManager.commitChanges(unit);
                        }
                    }
                }
            }

            const code = importManager.code.toString();
            
            if ("showDiff" in options && importManager.code.hasChanged()) {
                
                const showUnchanged = options.showCode == "file"
        
                console.log(blue(`diff for file '${id}':`));

                const addArrow = (a, txt) => {
                    const txtArr = txt.split("\n");
                    let output = txtArr.slice(0, -1).map(l => `${a} ${l}`).join("\n");
                    if (txtArr.at(-1)) {
                        output += `${a} ${txtArr.at(-1)}\n`
                    } else {
                        output += "\n";
                    }
                    return output;
                }
                const diff = Diff.diffLines(source, code+"\n// test", false, false);

                console.log(diff);
                
                console.log(gray("BEGIN >>>"));
                let origLine = 0;
                let modLine = 0;
                let lastRemoved = false;
                diff.forEach((part, i) => {
                    
                    const last = diff.at(i-1) || { removed: false, added: false };
                    const next = diff.at(i+1) || { removed: false, added: false };

                    let msg;
                    let lineInfo = "";
                    let change = false;

                    if (part.added) {
                        modLine += part.count;
                        msg = green(addArrow(">", part.value));
                        if (!last.removed) {
                            lineInfo += origLine + "a" + modLine;
                            if (part.count > 1) {
                                lineInfo += "," + (modLine + part.count-1);
                            } 
                        }
                    } else if (part.removed) {
                        modLine -= part.count;
                        msg = red(addArrow("<", part.value));
                        lineInfo += origLine
                        if (part.count > 1) {
                            lineInfo += (part.count-1);
                        }
                        if (next.added) {
                            lineInfo += "c";
                            change = true;
                        }
                    } else {
                        origLine += part.count;
                        modLine += part.count;
                        msg = "";
                        if (showUnchanged) {
                            msg = part.value;
                        }
                    }

                    if (lineInfo) {
                        console.log(bold(lineInfo));
                    }
                    process.stdout.write(msg);
                    if (change) {
                        console.log("---");
                    }
                });
                console.log(gray("\n<<< END\n"));
            }
            
            let map;

            if (options.sourceMap !== false && options.sourcemap !== false) {
                map = importManager.code.generateMap({ hires: true });
            }

            return { code, map };
        }
    };
};
  
export { manager };
