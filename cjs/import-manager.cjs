'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var pluginutils = require('@rollup/pluginutils');
var MagicString = require('magic-string');
require('picomatch');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var MagicString__default = /*#__PURE__*/_interopDefaultLegacy(MagicString);

/**
 * Custom error to tell the user, that it is
 * not possible to select a specific unit.
 */
class MatchError extends Error {
    constructor(message) {
        super(message);
        this.name = "MatchError";
    }
}

/**
 * Custom error to abort the building process
 * for retrieving information.
 */
 class DebuggingError extends Error {
    constructor(message) {
        super(message);
        this.name = "DebuggingError";
        console.warn("Intentional Debugging Error was thrown !");
    }
}

class ImportManagerUnitMethods {
    constructor(unit) {
        this.unit = unit;
    }

    #ES6only() {
        if (this.unit.type !== "es6") {
            throw new Error("This method is only available for ES6 imports.");
        }
    }

// module methods

    renameModule(name, modType) {
        if (this.unit.type !== "es6") {
            if (modType === "string") {
                const q = this.unit.module.quotes;
                name = q + name + q;
            } else if (modType !== "literal") {
                throw new TypeError(`Unknown modType '${modType}'. Valid types are 'string' and 'literal'.`);
            }
        } else if (modType !== "string") {
            throw new TypeError("modType cannot be changed for es6 imports.");
        }
        
        this.unit.code.overwrite(this.unit.module.start, this.unit.module.end, name);
        console.log(this.unit.code.toString());
    }

// member methods

    createMembers() {
        if (this.unit.defaultMembers.count > 0) {
            let start = this.unit.defaultMembers.entities.at(-1).absEnd;
            let sep;
            
            if (!this.unit.membersFromScratch) {
                this.unit.membersFromScratch = true;
                sep = this.unit.sepDef + "{ ";
            } else {
                sep = this.unit.sepMem;            }
            
            return [start, sep];
        } else {
            throw new Error("Not implemented!");
            // TODO: implement this?
        }
    }

    addMember(name) {
        this.#ES6only();

        if (this.unit.members.count > 0) {
            const start = this.unit.members.entities.at(-1).absEnd;
            this.unit.code.appendRight(start, this.unit.sepMem + name);
        } else {
            console.log("create members");
            let start, sep;
            [ start, sep ] = this.createMembers();
            console.log(start, sep);
            this.unit.code.appendRight(start, sep + name);
        }
    }

    #findMember(memberType, name) {
        this.#ES6only();

        if (!name) {
            throw new Error(`${memberType} name must be set.`);
        }
        const filtered = this.unit[memberType+"s"].entities.filter(m => m.name === name);
        if (filtered.length !== 1) {
            throw new MatchError(`Unable to locate ${memberType} with name '${name}'`);
        }
        return filtered[0];
    }


    removeMember(memberType, name) {
        const member = this.#findMember(memberType, name);

        const end = member.next ? member.next : member.absEnd;
        this.unit.code.remove(member.start, end);
        this.unit[memberType+"s"].entities.splice(member.index, 1, null);
        this.unit[memberType+"s"].count --;
    }

    renameMember(memberType, name, newName, keepAlias) {
        const member = this.#findMember(memberType, name);
        
        let end;
        if (keepAlias) {
            end = member.end;
        } else {
            end = member.absEnd;
        }
        this.unit.code.overwrite(member.start, end, newName);
    }

    /**
     * Debugging method to stop the building process
     * and list a specific unit selected by its id.
     * @param {number} id - Unit id.
     */
    // TODO: move this to unit debug method
    log() {
        const unit = {...this.unit};
        unit.methods = {};
        throw new DebuggingError(JSON.stringify(unit, null, 4));
    }
}

class ImportManager {

    constructor(source, filename, autoSearch=true) {

        this.scopeMulti = 1000;

        this.imports = {
            es6: {
                count: 0,
                idScope: 1 * this.scopeMulti,
                searched: false,
                units: []
            },
            dynamic: {
                count: 0,
                idScope: 2 * this.scopeMulti,
                searched: false,
                units: []
            },
            cjs: {
                count: 0,
                idScope: 3 * this.scopeMulti,
                searched: false,
                units: []
            }

        };

        // id scope lookup table with the associated type
        this.idTypes = Object.fromEntries(Object.entries(this.imports).map(([k, v]) => [v.idScope, k]));

        this.code = new MagicString__default["default"](source);
        this.blackenedCode = this.prepareSource();
        this.hashList = {};
        this.filename = filename;

        if (autoSearch) {
            this.getDynamicImports();
            this.getES6Imports();
            this.getCJSImports();
        }
    }

    /**
     * Helper function for finding matches in the source
     * for a given regex and replace those with consecutive
     * dashes.
     * @param {Object} src - Source a a MagicString. 
     * @param {Object} regex - RegExp Object.  
     * @param {boolean} [nl=false] - True if matches should be able to go across multiple lines. 
     */
    #matchAndStrike(src, regex, nl=false) {
        
        // replacement function
        let genBlackenedStr = "";
        if (nl) {
            genBlackenedStr = str => str.split("")
                                        .map(c => c === "\n" ? "\n" : "-")
                                        .join("");
        } else {
            genBlackenedStr = str => ("-").repeat(str.length);
        }

        const collection = src.toString().matchAll(regex);
        let next = collection.next();
        
        while (!next.done) {
            const match = next.value;
            const start = match.index;
            const end = start + match[0].length;
            src.overwrite(start, end, genBlackenedStr(match[0]));
            next = collection.next();
        }
    }


    /**
     * Prepares the source by replacing problematic
     * content.
     * @returns {string} - The blackened source.
     */
    prepareSource() {

        // clone the original code
        const src = this.code.clone();

        // blacken double and single quoted strings
        this.#matchAndStrike(
            src,
            /([\"'])(?:\\\1|.)*?\1/g
        );
        
        // blacken template string literals
        this.#matchAndStrike(
            src,
            /`(?:\\`|\s|\S)*?`/g,
            true);

        // blacken multi line comments
        this.#matchAndStrike(
            src,
            /\/\*[\s\S]*?\*\//g,
            true
        );

        // blacken single line comments
        this.#matchAndStrike(
            src,
            /\/\/.*/g
        );
        
        return src.toString();
    }

    /**
     * Helper method to generate a very simple hash
     * from the unit properties.
     * @param {Object} unit - Unit to generate a hash from. 
     * @returns 
     */
    #makeHash(unit) {

        // cf. https://gist.github.com/iperelivskiy/4110988?permalink_comment_id=2697447#gistcomment-2697447
        const simpleHash = (str) => {
            let h = 0xdeadbeef;
            for(let i=0; i<str.length; i++)
                h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
            return (h ^ h >>> 16) >>> 0;
        };

        const makeInput = (unit) => {
            
            const getProps = list => {
                list.forEach(member => {
                    input += member.name;
                    if (member.alias) {
                        input += member.alias.name;
                    }                });
            }; 

            let input = unit.module.name;
            
            if (unit.members) {
                getProps(unit.members.entities);
            }

            if (unit.defaultMembers) {
                getProps(unit.defaultMembers.entities);
            }

            return input + this.filename;
        };

        const input = makeInput(unit);
        console.log("INPUT", input);
        let hash = String(simpleHash(input));

        if (hash in this.hashList) {
            console.warn(`It seems like there are multiple imports of module '${unit.module.name}'. You should examine that.`);
            let nr = 2;
            for (;;) {
                const nHash = `${hash}#${nr}`;
                if (!(nHash in this.hashList)) {
                    hash = nHash;
                    break;
                }
                nr ++;
            }
        }
        
        this.hashList[hash] = unit.id;

        return hash;
    }


    /**
     * Collect all es6 imports from a source code.
     * Destructure the string, and store the findings
     * in an object which gets stored in the class
     * instance.
     */
    getES6Imports() {
        let id = this.imports.es6.idScope;

        const es6ImportCollection = this.blackenedCode.matchAll(/import\s+(?:([\w*{},\s]+)from\s+)?(\-+);?/g);
        // match[0]: the complete import statement
        // match[1]: the member part of the statement (may be empty)
        // match[2]: the module part
        
        let next = es6ImportCollection.next();
        while (!next.done) {
            this.imports.es6.count ++;

            const match = next.value;
            const start = match.index;
            const end = start + match[0].length;

            // get the equivalent string from the 
            // original code
            const code = this.code.slice(start, end);

            // separating members
            const members = {
                count: 0,
                entities: []
            };

            const defaultMembers = {
                count: 0,
                entities: []
            };

            const allMembersStr = match[1] ? match[1].trim() : null;
            
            if (allMembersStr) {
                // find position of all members
                const relAllMembersStart = code.indexOf(allMembersStr);

                // initialize default string
                let defaultStr = null;

                // but begin with non default members, those
                // are addressed by looking for everything between
                // the curly braces (if present)
                const nonDefaultMatch = allMembersStr.match(/{[\s\S]*?}/);
                
                if (nonDefaultMatch) {
                    const relNonDefaultStart = nonDefaultMatch.index;
                    let nonDefaultStr = nonDefaultMatch[0];

                    members.start = relAllMembersStart + relNonDefaultStart;
                    members.end = members.start + nonDefaultStr.length;

                    if (relNonDefaultStart > 0) {
                        defaultStr = allMembersStr.slice(0, nonDefaultMatch.index);
                    }

                    // split the individual members
                    const m = allMembersStr.slice(relNonDefaultStart+1, relNonDefaultStart+nonDefaultStr.length-2)
                                       .split(",")
                                       .map(m => m.trim())
                                       .filter(m => m);
                    
                    // get the position of each of each member 
                    let searchIndex = 0;
                    m.forEach((member, index) => {
                        members.count ++;
                        const relMemberPos = nonDefaultStr.indexOf(member, searchIndex);
                        
                        let name = member;
                        let len;

                        // isolate aliases
                        const aliasMatch = member.match(/(\s+as\s+)/);
                        const newMember = {};
                        if (aliasMatch) {
                            len = aliasMatch.index;
                            name = member.slice(0, len);
                            newMember.name = name;
                            const aliasStart = aliasMatch.index + aliasMatch[0].length;
                            newMember.alias = {
                                name: member.slice(aliasStart),
                                start: relAllMembersStart + relNonDefaultStart + relMemberPos + aliasStart,
                                end: relAllMembersStart + relNonDefaultStart + relMemberPos + member.length
                            };
                        } else {
                            newMember.name = name;
                            len = member.length;
                        }
                        newMember.start = relAllMembersStart + relNonDefaultStart + relMemberPos;
                        newMember.end = newMember.start + len;
                        newMember.absEnd = newMember.start + member.length;
                        newMember.index = index;

                        // store the current member start as
                        // a property of the last and the last
                        // member end as a property of the 
                        // current
                        if (index > 0) {
                            newMember.last = members.entities[index-1].absEnd;
                            members.entities[index-1].next = newMember.start;
                        }

                        members.entities.push(newMember);

                        // raise the search index by the length
                        // of the member to ignore the current
                        // member in the next round
                        searchIndex = relMemberPos + member.length;
                    });
                }
                
                // if no non default members were found
                // the default member string is the whole
                // member string 
                else {
                    defaultStr = allMembersStr;
                }

                // if a default str is present process
                // it similarly to the non default members
                if (defaultStr) {
                    defaultMembers.start = relAllMembersStart;
                    defaultMembers.end = defaultMembers.start + defaultStr.length;

                    const dm = defaultStr.split(",")
                                          .map(m => m.trim())
                                          .filter(m => m);
                    
                    let searchIndex = 0;
                    dm.forEach((defaultMember, index) => {
                        const relDefaultMemberPos = defaultStr.indexOf(defaultMember, searchIndex);
                        let name = defaultMember;
                        let len;
                        const newDefMember = {};
                        const aliasMatch = defaultMember.match(/(\s+as\s+)/);
                        
                        if (aliasMatch) {
                            len = aliasMatch.index;
                            name = defaultMember.slice(0, len);
                            newDefMember.name = name;
                            const aliasStart = aliasMatch.index + aliasMatch[0].length;
                            newDefMember.alias = {
                                name: defaultMember.slice(aliasStart),
                                start: relAllMembersStart + relDefaultMemberPos + aliasStart,
                                end: relAllMembersStart + relDefaultMemberPos + defaultMember.length
                            };
                        } else {
                            newDefMember.name = name;
                            len = defaultMember.length;
                        }

                        newDefMember.start = relAllMembersStart + relDefaultMemberPos;
                        newDefMember.end = newDefMember.start + len;
                        newDefMember.absEnd = newDefMember.start + defaultMember.length;
                        newDefMember.index = index;

                        if (index > 0) {
                            newDefMember.last = defaultMembers.entities[index-1].absEnd;
                            defaultMembers.entities[index-1].next = newDefMember.start;
                        }

                        defaultMembers.entities.push(newDefMember);
                        searchIndex = relDefaultMemberPos + len + 1;
                    });

                    // if there are default and non default members
                    // add the start position of the non default
                    // members as the next value for the last default
                    // member
                    if (members.count > 1 && defaultMembers.count > 1) {
                        defaultMembers.entities.at(-1).next = members.start;
                    }
                }
            }

            // create a fresh object for the current unit
            const module = {};

            // find the position of the module string
            module.start = match[0].indexOf(match[2]) + 1;
            module.end = module.start + match[2].length - 2;
            module.name = code.slice(module.start, module.end).split("/").at(-1);
            module.type = "string";

            // store the first separator of the non default
            // and default members for a consistent style
            // if one wants to add members
            const sepDef = (defaultMembers.entities.length > 1) ? code.slice(defaultMembers.entities[0].absEnd, defaultMembers.entities[0].next) : ", ";
            const sepMem = (members.entities.length > 1) ? code.slice(members.entities[0].absEnd, members.entities[0].next) : ", ";

            // make a new unit
            const unit = {
                id: id++,
                index: this.imports.es6.count-1,
                code: new MagicString__default["default"](code),
                defaultMembers,
                members,
                module,
                start,
                end,
                sepDef,
                sepMem,
                type: "es6",
                get codeString() {
                    return [ this.code.toString() ];
                }
            };

            // generate a hash
            unit.hash = this.#makeHash(unit);

            // push the fresh unit to es6 unit array
            this.imports.es6.units.push(unit);
            
            next = es6ImportCollection.next();
            this.imports.es6.searched = true;
        }
    }


    /**
     * Generic method to find dynamic and common js
     * import properties.
     * Both methods matches have the following children:
     *  - match[0] - the complete import statement
     *  - match[1] - index 0 until the beginning of the module
     *               (the length is the start index of the module string)
     *  - match[2] - the module string (or more unlikely var/fn)
     * 
     * @param {string} type - "cjs" or "dynamic" 
     * @param {Object} match - A match object returned by a regex match fn. 
     * @param {number} id 
     */
     #makeImport(type, match, id, index) {
        const start = match.index;
        const end = start + match[0].length;
        const code = this.code.slice(start, end);
        
        const module = {};
        module.start = match[1].length;
        module.end = module.start + match[2].length;
        const char0 = code.charAt(module.start);

        // as dynamic and cjs imports allow variables
        // (or even functions) to provide the module
        // string this type has to be figured out and
        // stored

        if (char0.match(/["'`]/)) {
            module.type = "string";
            module.quotes = char0;
            module.name = code.slice(module.start+1, module.end-1).split("/").at(-1);
        } else {
            module.type = "literal";
            module.name = code.slice(module.start, module.end);
        }
        
        // make a fresh unit
        const unit = {
            id,
            index,
            code: new MagicString__default["default"](code),
            module,
            start,
            end,
            type,
            get codeString() {
                return [ this.code.toString() ];
            }
        };

        // add hash
        unit.hash = this.#makeHash(unit);

        this.imports[type].units.push(unit);
    }


    /**
     * Find all dynamic import statements in the 
     * (prepared) source code.
     */
    getDynamicImports() {
        let id = this.imports.dynamic.idScope;

        const dynamicImportCollection = this.blackenedCode.matchAll(/(import\s*?\(\s*?)(\S+)(?:\s*?\);?)/g);
        let next = dynamicImportCollection.next();

        while (!next.done) {
            this.imports.dynamic.count ++;
            this.#makeImport("dynamic", next.value, id++, this.imports.dynamic.count-1);
            next = dynamicImportCollection.next();
        }

        this.imports.dynamic.searched = true;
    }


    /**
     * Find all common js import statements in the 
     * (prepared) source code.
     */
    getCJSImports() {
        let id = this.imports.cjs.idScope;

        const cjsImportCollection = this.blackenedCode.matchAll(/(require\s*?\(\s*?)(\S+)(?:\s*?\);?)/g);
        let next = cjsImportCollection.next();

        while (!next.done) {
            while (!next.done) {
                this.imports.cjs.count ++;
                this.#makeImport("cjs", next.value, id++, this.imports.cjs.count-1);
                next = cjsImportCollection.next();
            }
        } 

        this.imports.cjs.searched = true;
    }

    remove(unit) {
        if (unit.type !== "es6") {
            throw new Error("Removing units is only available for es6 imports.");
        }
        this.code.remove(unit.start, unit.end);
        this.imports[unit.type].units.splice([unit.index], 1, null);
        this.imports[unit.type].count --;
    }

    commitChanges(unit) {
        if (unit.membersFromScratch) {
            const end = unit.defaultMembers.entities.at(-1).absEnd;
            unit.code.appendRight(end, " }");
        }
        this.code.overwrite(unit.start, unit.end, unit.code.toString());
    }


//              ___________________              //
//              select unit methods              //

    /**
     * Helper method to list available units
     * in case of a MatchError.
     * @param {Object[]} units - Array of unit objects to list.
     * @returns {string} - Message for logging.
     */
    #listUnits(units) {
        const msgArray = [""];
        
        units.forEach(unit => {
            msgArray.push(
                "___",
                `ID:   ${unit.id}`,
                `HASH: ${unit.hash}`, 
                `NAME: ${unit.module.name}`,
                `STATEMENT:\n${unit.code.toString()}\n`
            );
        });
        return msgArray.join("\n") + "\n";
    }


    /**
     * Helper method to list all available units.
     * @returns {string} - Message string.
     */
    #listAllUnits() {
        let msg = "";
        for (const type in this.imports) {
            msg += this.#listUnits(this.imports[type].units);
        }
        return msg;
    }

    
    /**
     * Selects a unit by its module name.
     * @param {string} name - Module Name. 
     * @param {string|string[]} [type] - "cjs", "dynamic", "es6" one as a string or multiple as array of strings
     * @returns {Object} - An explicit unit.
     */
    selectModByName(name, type, allowNull) {
        if (!name) {
            throw new TypeError("The name must be provided");
        }

        let unitList = [];

        if (!type) {
            type = Object.keys(this.imports);
        } else if (typeof type === "string") {
            type = [type];
        }

        if (type.length === 0) {
            type = Object.keys(this.imports);
        }

        for (const t of type) {
            if (!(t in this.imports)) {
                throw new TypeError(`Invalid type: '${t}' - Should be one or more of: 'cjs', 'dynamic', 'es6'.`);
            }
            if (this.imports[t].count > 0) {
                unitList.push(...this.imports[t].units);
            }
        }

        const units = unitList.filter(unit => unit.module.name === name);

        if (units.length === 0) {
            if (allowNull) {
                return null;
            }
            let msg = this.#listUnits(unitList);
            let typeStr;

            if (type.length === 1) {
                typeStr = type + "-imports";
            } else if (type.length < Object.keys(this.imports).length) { 
                typeStr = type.join("-imports or ") + "-imports";
            } else {
                typeStr = "any group";
            }

            msg += `___\nUnable to locate import statement with name: '${name}' in ${typeStr}`;
            throw new MatchError(msg);
        }
        
        else if (units.length > 1) {
            let msg = this.#listUnits(units);
            msg += `___\nFound multiple matches for '${name}'. If no other solution is available you may select via hash.`;
            throw new MatchError(msg);
        }

        const unit = units[0];
        unit.methods = new ImportManagerUnitMethods(unit);

        return unit;
    }


    /**
     * Selects a unit by its id. Should only be used
     * for test purposes.
     * @param {number} id - Unit id. 
     * @returns {Object} - An explicit unit.
     */
    selectModById(id, allowNull) {
        if (!id) {
            throw new TypeError("The id must be provided");
        }
        
        const type = this.idTypes[ Math.floor(id / this.scopeMulti) * this.scopeMulti ];
        if (!type) {
            const ascIds = Object.keys(this.idTypes).sort();
            throw new TypeError(`Id '${id}' is invalid. Ids range from ${ascIds.at(0)} to ${ascIds.at(-1)}+`);
        }
        const units = this.imports[type].units.filter(n => n.id == id);

        if (units.length === 0) {
            if (allowNull) {
                return null;
            }
            let msg = this.#listUnits(this.imports[type].units);
            msg += `___\nUnable to locate import statement with id: '${id}'`;
            throw new MatchError(msg);
        }

        const unit = units[0];
        unit.methods = new ImportManagerUnitMethods(unit);

        return unit;
    }

    /**
     * Selects a unit by its hash. The hash will change
     * if the unit changes its properties like members,
     * alias, etc.
     * @param {string} hash - The hash string of the unit. 
     * @returns {object} - An explicit unit.
     */
    selectModByHash(hash, allowNull) {
        if (!(hash in this.hashList)) {
            if (allowNull) {
                return null;
            }
            let msg = this.#listAllUnits(); 
            msg += `___\nHash '${hash}' was not found`;
            throw new MatchError(msg);
        }

        return this.selectModById(this.hashList[hash]);
    }


//                ________________________              //
//                global debugging methods              //


    /**
     * Debugging method to stop the building process
     * and list all import units with its id, hash and
     * import statement.
     */
     logUnits() {
        throw new DebuggingError(this.#listAllUnits());
    }


    /**
     * Debugging method to stop the building process
     * and list a specific unit selected by its id.
     * @param {number} id - Unit id.
     */
    // TODO: move this to unit debug method
    logImportObject(unit) {
        throw new DebuggingError(JSON.stringify(unit, null, 4));
    }


    /**
     * Debugging method to stop the building process
     * and list the complete import object.
     */
     logUnitObjects() {
        throw new DebuggingError(JSON.stringify(this.imports, null, 4));
    }
}

// helper to allow string and array
const ensureArray = (arr) => Array.isArray(arr) ? arr : [arr];

// makes the life of the user a little bit easier
// by accepting multiple versions of boolean vars 
const bool = (b) => !(Boolean(b) === false || String(b).match(/(?:false|no|0)/, "i"));

const manager = (options={}) => {
    console.log("options", options);

    const filter = pluginutils.createFilter(options.include, options.exclude);
  
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

exports.manager = manager;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1wb3J0LW1hbmFnZXIuY2pzIiwic291cmNlcyI6WyIuLi9zcmMvZXJyb3JzLmpzIiwiLi4vc3JjL3VuaXQtbWV0aG9kcy5qcyIsIi4uL3NyYy9jb3JlLmpzIiwiLi4vc3JjL2luZGV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQ3VzdG9tIGVycm9yIHRvIHRlbGwgdGhlIHVzZXIsIHRoYXQgaXQgaXNcbiAqIG5vdCBwb3NzaWJsZSB0byBzZWxlY3QgYSBzcGVjaWZpYyB1bml0LlxuICovXG5jbGFzcyBNYXRjaEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIGNvbnN0cnVjdG9yKG1lc3NhZ2UpIHtcbiAgICAgICAgc3VwZXIobWVzc2FnZSk7XG4gICAgICAgIHRoaXMubmFtZSA9IFwiTWF0Y2hFcnJvclwiO1xuICAgIH1cbn1cblxuLyoqXG4gKiBDdXN0b20gZXJyb3IgdG8gYWJvcnQgdGhlIGJ1aWxkaW5nIHByb2Nlc3NcbiAqIGZvciByZXRyaWV2aW5nIGluZm9ybWF0aW9uLlxuICovXG4gY2xhc3MgRGVidWdnaW5nRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gICAgY29uc3RydWN0b3IobWVzc2FnZSkge1xuICAgICAgICBzdXBlcihtZXNzYWdlKTtcbiAgICAgICAgdGhpcy5uYW1lID0gXCJEZWJ1Z2dpbmdFcnJvclwiO1xuICAgICAgICBjb25zb2xlLndhcm4oXCJJbnRlbnRpb25hbCBEZWJ1Z2dpbmcgRXJyb3Igd2FzIHRocm93biAhXCIpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgRGVidWdnaW5nRXJyb3IsIE1hdGNoRXJyb3IgfTtcbiIsImltcG9ydCB7IERlYnVnZ2luZ0Vycm9yLCBNYXRjaEVycm9yIH0gZnJvbSBcIi4vZXJyb3JzLmpzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEltcG9ydE1hbmFnZXJVbml0TWV0aG9kcyB7XG4gICAgY29uc3RydWN0b3IodW5pdCkge1xuICAgICAgICB0aGlzLnVuaXQgPSB1bml0O1xuICAgIH1cblxuICAgICNFUzZvbmx5KCkge1xuICAgICAgICBpZiAodGhpcy51bml0LnR5cGUgIT09IFwiZXM2XCIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoaXMgbWV0aG9kIGlzIG9ubHkgYXZhaWxhYmxlIGZvciBFUzYgaW1wb3J0cy5cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbi8vIG1vZHVsZSBtZXRob2RzXG5cbiAgICByZW5hbWVNb2R1bGUobmFtZSwgbW9kVHlwZSkge1xuICAgICAgICBpZiAodGhpcy51bml0LnR5cGUgIT09IFwiZXM2XCIpIHtcbiAgICAgICAgICAgIGlmIChtb2RUeXBlID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcSA9IHRoaXMudW5pdC5tb2R1bGUucXVvdGVzO1xuICAgICAgICAgICAgICAgIG5hbWUgPSBxICsgbmFtZSArIHE7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1vZFR5cGUgIT09IFwibGl0ZXJhbFwiKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgVW5rbm93biBtb2RUeXBlICcke21vZFR5cGV9Jy4gVmFsaWQgdHlwZXMgYXJlICdzdHJpbmcnIGFuZCAnbGl0ZXJhbCcuYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAobW9kVHlwZSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIm1vZFR5cGUgY2Fubm90IGJlIGNoYW5nZWQgZm9yIGVzNiBpbXBvcnRzLlwiKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy51bml0LmNvZGUub3ZlcndyaXRlKHRoaXMudW5pdC5tb2R1bGUuc3RhcnQsIHRoaXMudW5pdC5tb2R1bGUuZW5kLCBuYW1lKTtcbiAgICAgICAgY29uc29sZS5sb2codGhpcy51bml0LmNvZGUudG9TdHJpbmcoKSk7XG4gICAgfVxuXG4vLyBtZW1iZXIgbWV0aG9kc1xuXG4gICAgY3JlYXRlTWVtYmVycygpIHtcbiAgICAgICAgaWYgKHRoaXMudW5pdC5kZWZhdWx0TWVtYmVycy5jb3VudCA+IDApIHtcbiAgICAgICAgICAgIGxldCBzdGFydCA9IHRoaXMudW5pdC5kZWZhdWx0TWVtYmVycy5lbnRpdGllcy5hdCgtMSkuYWJzRW5kO1xuICAgICAgICAgICAgbGV0IHNlcDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKCF0aGlzLnVuaXQubWVtYmVyc0Zyb21TY3JhdGNoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy51bml0Lm1lbWJlcnNGcm9tU2NyYXRjaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgc2VwID0gdGhpcy51bml0LnNlcERlZiArIFwieyBcIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VwID0gdGhpcy51bml0LnNlcE1lbTs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBbc3RhcnQsIHNlcF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQhXCIpO1xuICAgICAgICAgICAgLy8gVE9ETzogaW1wbGVtZW50IHRoaXM/XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhZGRNZW1iZXIobmFtZSkge1xuICAgICAgICB0aGlzLiNFUzZvbmx5KCk7XG5cbiAgICAgICAgaWYgKHRoaXMudW5pdC5tZW1iZXJzLmNvdW50ID4gMCkge1xuICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSB0aGlzLnVuaXQubWVtYmVycy5lbnRpdGllcy5hdCgtMSkuYWJzRW5kO1xuICAgICAgICAgICAgdGhpcy51bml0LmNvZGUuYXBwZW5kUmlnaHQoc3RhcnQsIHRoaXMudW5pdC5zZXBNZW0gKyBuYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiY3JlYXRlIG1lbWJlcnNcIik7XG4gICAgICAgICAgICBsZXQgc3RhcnQsIHNlcDtcbiAgICAgICAgICAgIFsgc3RhcnQsIHNlcCBdID0gdGhpcy5jcmVhdGVNZW1iZXJzKCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhzdGFydCwgc2VwKTtcbiAgICAgICAgICAgIHRoaXMudW5pdC5jb2RlLmFwcGVuZFJpZ2h0KHN0YXJ0LCBzZXAgKyBuYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICNmaW5kTWVtYmVyKG1lbWJlclR5cGUsIG5hbWUpIHtcbiAgICAgICAgdGhpcy4jRVM2b25seSgpO1xuXG4gICAgICAgIGlmICghbmFtZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke21lbWJlclR5cGV9IG5hbWUgbXVzdCBiZSBzZXQuYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmlsdGVyZWQgPSB0aGlzLnVuaXRbbWVtYmVyVHlwZStcInNcIl0uZW50aXRpZXMuZmlsdGVyKG0gPT4gbS5uYW1lID09PSBuYW1lKTtcbiAgICAgICAgaWYgKGZpbHRlcmVkLmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IE1hdGNoRXJyb3IoYFVuYWJsZSB0byBsb2NhdGUgJHttZW1iZXJUeXBlfSB3aXRoIG5hbWUgJyR7bmFtZX0nYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkWzBdO1xuICAgIH1cblxuXG4gICAgcmVtb3ZlTWVtYmVyKG1lbWJlclR5cGUsIG5hbWUpIHtcbiAgICAgICAgY29uc3QgbWVtYmVyID0gdGhpcy4jZmluZE1lbWJlcihtZW1iZXJUeXBlLCBuYW1lKTtcblxuICAgICAgICBjb25zdCBlbmQgPSBtZW1iZXIubmV4dCA/IG1lbWJlci5uZXh0IDogbWVtYmVyLmFic0VuZDtcbiAgICAgICAgdGhpcy51bml0LmNvZGUucmVtb3ZlKG1lbWJlci5zdGFydCwgZW5kKTtcbiAgICAgICAgdGhpcy51bml0W21lbWJlclR5cGUrXCJzXCJdLmVudGl0aWVzLnNwbGljZShtZW1iZXIuaW5kZXgsIDEsIG51bGwpO1xuICAgICAgICB0aGlzLnVuaXRbbWVtYmVyVHlwZStcInNcIl0uY291bnQgLS07XG4gICAgfVxuXG4gICAgcmVuYW1lTWVtYmVyKG1lbWJlclR5cGUsIG5hbWUsIG5ld05hbWUsIGtlZXBBbGlhcykge1xuICAgICAgICBjb25zdCBtZW1iZXIgPSB0aGlzLiNmaW5kTWVtYmVyKG1lbWJlclR5cGUsIG5hbWUpO1xuICAgICAgICBcbiAgICAgICAgbGV0IGVuZDtcbiAgICAgICAgaWYgKGtlZXBBbGlhcykge1xuICAgICAgICAgICAgZW5kID0gbWVtYmVyLmVuZDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVuZCA9IG1lbWJlci5hYnNFbmQ7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51bml0LmNvZGUub3ZlcndyaXRlKG1lbWJlci5zdGFydCwgZW5kLCBuZXdOYW1lKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZWJ1Z2dpbmcgbWV0aG9kIHRvIHN0b3AgdGhlIGJ1aWxkaW5nIHByb2Nlc3NcbiAgICAgKiBhbmQgbGlzdCBhIHNwZWNpZmljIHVuaXQgc2VsZWN0ZWQgYnkgaXRzIGlkLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpZCAtIFVuaXQgaWQuXG4gICAgICovXG4gICAgLy8gVE9ETzogbW92ZSB0aGlzIHRvIHVuaXQgZGVidWcgbWV0aG9kXG4gICAgbG9nKCkge1xuICAgICAgICBjb25zdCB1bml0ID0gey4uLnRoaXMudW5pdH07XG4gICAgICAgIHVuaXQubWV0aG9kcyA9IHt9O1xuICAgICAgICB0aHJvdyBuZXcgRGVidWdnaW5nRXJyb3IoSlNPTi5zdHJpbmdpZnkodW5pdCwgbnVsbCwgNCkpO1xuICAgIH1cbn1cbiIsImltcG9ydCBJbXBvcnRNYW5hZ2VyVW5pdE1ldGhvZHMgZnJvbSBcIi4vdW5pdC1tZXRob2RzLmpzXCI7XG5pbXBvcnQgeyBEZWJ1Z2dpbmdFcnJvciwgTWF0Y2hFcnJvciB9IGZyb20gXCIuL2Vycm9ycy5qc1wiO1xuaW1wb3J0IE1hZ2ljU3RyaW5nIGZyb20gXCJtYWdpYy1zdHJpbmdcIjtcblxuY2xhc3MgSW1wb3J0TWFuYWdlciB7XG5cbiAgICBjb25zdHJ1Y3Rvcihzb3VyY2UsIGZpbGVuYW1lLCBhdXRvU2VhcmNoPXRydWUpIHtcblxuICAgICAgICB0aGlzLnNjb3BlTXVsdGkgPSAxMDAwO1xuXG4gICAgICAgIHRoaXMuaW1wb3J0cyA9IHtcbiAgICAgICAgICAgIGVzNjoge1xuICAgICAgICAgICAgICAgIGNvdW50OiAwLFxuICAgICAgICAgICAgICAgIGlkU2NvcGU6IDEgKiB0aGlzLnNjb3BlTXVsdGksXG4gICAgICAgICAgICAgICAgc2VhcmNoZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHVuaXRzOiBbXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGR5bmFtaWM6IHtcbiAgICAgICAgICAgICAgICBjb3VudDogMCxcbiAgICAgICAgICAgICAgICBpZFNjb3BlOiAyICogdGhpcy5zY29wZU11bHRpLFxuICAgICAgICAgICAgICAgIHNlYXJjaGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB1bml0czogW11cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjanM6IHtcbiAgICAgICAgICAgICAgICBjb3VudDogMCxcbiAgICAgICAgICAgICAgICBpZFNjb3BlOiAzICogdGhpcy5zY29wZU11bHRpLFxuICAgICAgICAgICAgICAgIHNlYXJjaGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB1bml0czogW11cbiAgICAgICAgICAgIH1cblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWQgc2NvcGUgbG9va3VwIHRhYmxlIHdpdGggdGhlIGFzc29jaWF0ZWQgdHlwZVxuICAgICAgICB0aGlzLmlkVHlwZXMgPSBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXModGhpcy5pbXBvcnRzKS5tYXAoKFtrLCB2XSkgPT4gW3YuaWRTY29wZSwga10pKTtcblxuICAgICAgICB0aGlzLmNvZGUgPSBuZXcgTWFnaWNTdHJpbmcoc291cmNlKTtcbiAgICAgICAgdGhpcy5ibGFja2VuZWRDb2RlID0gdGhpcy5wcmVwYXJlU291cmNlKCk7XG4gICAgICAgIHRoaXMuaGFzaExpc3QgPSB7fTtcbiAgICAgICAgdGhpcy5maWxlbmFtZSA9IGZpbGVuYW1lO1xuXG4gICAgICAgIGlmIChhdXRvU2VhcmNoKSB7XG4gICAgICAgICAgICB0aGlzLmdldER5bmFtaWNJbXBvcnRzKCk7XG4gICAgICAgICAgICB0aGlzLmdldEVTNkltcG9ydHMoKTtcbiAgICAgICAgICAgIHRoaXMuZ2V0Q0pTSW1wb3J0cygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGVscGVyIGZ1bmN0aW9uIGZvciBmaW5kaW5nIG1hdGNoZXMgaW4gdGhlIHNvdXJjZVxuICAgICAqIGZvciBhIGdpdmVuIHJlZ2V4IGFuZCByZXBsYWNlIHRob3NlIHdpdGggY29uc2VjdXRpdmVcbiAgICAgKiBkYXNoZXMuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHNyYyAtIFNvdXJjZSBhIGEgTWFnaWNTdHJpbmcuIFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSByZWdleCAtIFJlZ0V4cCBPYmplY3QuICBcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtubD1mYWxzZV0gLSBUcnVlIGlmIG1hdGNoZXMgc2hvdWxkIGJlIGFibGUgdG8gZ28gYWNyb3NzIG11bHRpcGxlIGxpbmVzLiBcbiAgICAgKi9cbiAgICAjbWF0Y2hBbmRTdHJpa2Uoc3JjLCByZWdleCwgbmw9ZmFsc2UpIHtcbiAgICAgICAgXG4gICAgICAgIC8vIHJlcGxhY2VtZW50IGZ1bmN0aW9uXG4gICAgICAgIGxldCBnZW5CbGFja2VuZWRTdHIgPSBcIlwiO1xuICAgICAgICBpZiAobmwpIHtcbiAgICAgICAgICAgIGdlbkJsYWNrZW5lZFN0ciA9IHN0ciA9PiBzdHIuc3BsaXQoXCJcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAubWFwKGMgPT4gYyA9PT0gXCJcXG5cIiA/IFwiXFxuXCIgOiBcIi1cIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuam9pbihcIlwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGdlbkJsYWNrZW5lZFN0ciA9IHN0ciA9PiAoXCItXCIpLnJlcGVhdChzdHIubGVuZ3RoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbGxlY3Rpb24gPSBzcmMudG9TdHJpbmcoKS5tYXRjaEFsbChyZWdleCk7XG4gICAgICAgIGxldCBuZXh0ID0gY29sbGVjdGlvbi5uZXh0KCk7XG4gICAgICAgIFxuICAgICAgICB3aGlsZSAoIW5leHQuZG9uZSkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBuZXh0LnZhbHVlO1xuICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBtYXRjaC5pbmRleDtcbiAgICAgICAgICAgIGNvbnN0IGVuZCA9IHN0YXJ0ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgc3JjLm92ZXJ3cml0ZShzdGFydCwgZW5kLCBnZW5CbGFja2VuZWRTdHIobWF0Y2hbMF0pKTtcbiAgICAgICAgICAgIG5leHQgPSBjb2xsZWN0aW9uLm5leHQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogUHJlcGFyZXMgdGhlIHNvdXJjZSBieSByZXBsYWNpbmcgcHJvYmxlbWF0aWNcbiAgICAgKiBjb250ZW50LlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9IC0gVGhlIGJsYWNrZW5lZCBzb3VyY2UuXG4gICAgICovXG4gICAgcHJlcGFyZVNvdXJjZSgpIHtcblxuICAgICAgICAvLyBjbG9uZSB0aGUgb3JpZ2luYWwgY29kZVxuICAgICAgICBjb25zdCBzcmMgPSB0aGlzLmNvZGUuY2xvbmUoKTtcblxuICAgICAgICAvLyBibGFja2VuIGRvdWJsZSBhbmQgc2luZ2xlIHF1b3RlZCBzdHJpbmdzXG4gICAgICAgIHRoaXMuI21hdGNoQW5kU3RyaWtlKFxuICAgICAgICAgICAgc3JjLFxuICAgICAgICAgICAgLyhbXFxcIiddKSg/OlxcXFxcXDF8LikqP1xcMS9nXG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICAvLyBibGFja2VuIHRlbXBsYXRlIHN0cmluZyBsaXRlcmFsc1xuICAgICAgICB0aGlzLiNtYXRjaEFuZFN0cmlrZShcbiAgICAgICAgICAgIHNyYyxcbiAgICAgICAgICAgIC9gKD86XFxcXGB8XFxzfFxcUykqP2AvZyxcbiAgICAgICAgICAgIHRydWUpO1xuXG4gICAgICAgIC8vIGJsYWNrZW4gbXVsdGkgbGluZSBjb21tZW50c1xuICAgICAgICB0aGlzLiNtYXRjaEFuZFN0cmlrZShcbiAgICAgICAgICAgIHNyYyxcbiAgICAgICAgICAgIC9cXC9cXCpbXFxzXFxTXSo/XFwqXFwvL2csXG4gICAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gYmxhY2tlbiBzaW5nbGUgbGluZSBjb21tZW50c1xuICAgICAgICB0aGlzLiNtYXRjaEFuZFN0cmlrZShcbiAgICAgICAgICAgIHNyYyxcbiAgICAgICAgICAgIC9cXC9cXC8uKi9nXG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gc3JjLnRvU3RyaW5nKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGVscGVyIG1ldGhvZCB0byBnZW5lcmF0ZSBhIHZlcnkgc2ltcGxlIGhhc2hcbiAgICAgKiBmcm9tIHRoZSB1bml0IHByb3BlcnRpZXMuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHVuaXQgLSBVbml0IHRvIGdlbmVyYXRlIGEgaGFzaCBmcm9tLiBcbiAgICAgKiBAcmV0dXJucyBcbiAgICAgKi9cbiAgICAjbWFrZUhhc2godW5pdCkge1xuXG4gICAgICAgIC8vIGNmLiBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9pcGVyZWxpdnNraXkvNDExMDk4OD9wZXJtYWxpbmtfY29tbWVudF9pZD0yNjk3NDQ3I2dpc3Rjb21tZW50LTI2OTc0NDdcbiAgICAgICAgY29uc3Qgc2ltcGxlSGFzaCA9IChzdHIpID0+IHtcbiAgICAgICAgICAgIGxldCBoID0gMHhkZWFkYmVlZjtcbiAgICAgICAgICAgIGZvcihsZXQgaT0wOyBpPHN0ci5sZW5ndGg7IGkrKylcbiAgICAgICAgICAgICAgICBoID0gTWF0aC5pbXVsKGggXiBzdHIuY2hhckNvZGVBdChpKSwgMjY1NDQzNTc2MSk7XG4gICAgICAgICAgICByZXR1cm4gKGggXiBoID4+PiAxNikgPj4+IDA7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgbWFrZUlucHV0ID0gKHVuaXQpID0+IHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgZ2V0UHJvcHMgPSBsaXN0ID0+IHtcbiAgICAgICAgICAgICAgICBsaXN0LmZvckVhY2gobWVtYmVyID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaW5wdXQgKz0gbWVtYmVyLm5hbWU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtZW1iZXIuYWxpYXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0ICs9IG1lbWJlci5hbGlhcy5uYW1lO1xuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTsgXG5cbiAgICAgICAgICAgIGxldCBpbnB1dCA9IHVuaXQubW9kdWxlLm5hbWU7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmICh1bml0Lm1lbWJlcnMpIHtcbiAgICAgICAgICAgICAgICBnZXRQcm9wcyh1bml0Lm1lbWJlcnMuZW50aXRpZXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodW5pdC5kZWZhdWx0TWVtYmVycykge1xuICAgICAgICAgICAgICAgIGdldFByb3BzKHVuaXQuZGVmYXVsdE1lbWJlcnMuZW50aXRpZXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaW5wdXQgKyB0aGlzLmZpbGVuYW1lO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGlucHV0ID0gbWFrZUlucHV0KHVuaXQpO1xuICAgICAgICBjb25zb2xlLmxvZyhcIklOUFVUXCIsIGlucHV0KTtcbiAgICAgICAgbGV0IGhhc2ggPSBTdHJpbmcoc2ltcGxlSGFzaChpbnB1dCkpO1xuXG4gICAgICAgIGlmIChoYXNoIGluIHRoaXMuaGFzaExpc3QpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgSXQgc2VlbXMgbGlrZSB0aGVyZSBhcmUgbXVsdGlwbGUgaW1wb3J0cyBvZiBtb2R1bGUgJyR7dW5pdC5tb2R1bGUubmFtZX0nLiBZb3Ugc2hvdWxkIGV4YW1pbmUgdGhhdC5gKTtcbiAgICAgICAgICAgIGxldCBuciA9IDI7XG4gICAgICAgICAgICBmb3IgKDs7KSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgbkhhc2ggPSBgJHtoYXNofSMke25yfWA7XG4gICAgICAgICAgICAgICAgaWYgKCEobkhhc2ggaW4gdGhpcy5oYXNoTGlzdCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFzaCA9IG5IYXNoO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbnIgKys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMuaGFzaExpc3RbaGFzaF0gPSB1bml0LmlkO1xuXG4gICAgICAgIHJldHVybiBoYXNoO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogQ29sbGVjdCBhbGwgZXM2IGltcG9ydHMgZnJvbSBhIHNvdXJjZSBjb2RlLlxuICAgICAqIERlc3RydWN0dXJlIHRoZSBzdHJpbmcsIGFuZCBzdG9yZSB0aGUgZmluZGluZ3NcbiAgICAgKiBpbiBhbiBvYmplY3Qgd2hpY2ggZ2V0cyBzdG9yZWQgaW4gdGhlIGNsYXNzXG4gICAgICogaW5zdGFuY2UuXG4gICAgICovXG4gICAgZ2V0RVM2SW1wb3J0cygpIHtcbiAgICAgICAgbGV0IGlkID0gdGhpcy5pbXBvcnRzLmVzNi5pZFNjb3BlO1xuXG4gICAgICAgIGNvbnN0IGVzNkltcG9ydENvbGxlY3Rpb24gPSB0aGlzLmJsYWNrZW5lZENvZGUubWF0Y2hBbGwoL2ltcG9ydFxccysoPzooW1xcdyp7fSxcXHNdKylmcm9tXFxzKyk/KFxcLSspOz8vZyk7XG4gICAgICAgIC8vIG1hdGNoWzBdOiB0aGUgY29tcGxldGUgaW1wb3J0IHN0YXRlbWVudFxuICAgICAgICAvLyBtYXRjaFsxXTogdGhlIG1lbWJlciBwYXJ0IG9mIHRoZSBzdGF0ZW1lbnQgKG1heSBiZSBlbXB0eSlcbiAgICAgICAgLy8gbWF0Y2hbMl06IHRoZSBtb2R1bGUgcGFydFxuICAgICAgICBcbiAgICAgICAgbGV0IG5leHQgPSBlczZJbXBvcnRDb2xsZWN0aW9uLm5leHQoKTtcbiAgICAgICAgd2hpbGUgKCFuZXh0LmRvbmUpIHtcbiAgICAgICAgICAgIHRoaXMuaW1wb3J0cy5lczYuY291bnQgKys7XG5cbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gbmV4dC52YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gbWF0Y2guaW5kZXg7XG4gICAgICAgICAgICBjb25zdCBlbmQgPSBzdGFydCArIG1hdGNoWzBdLmxlbmd0aDtcblxuICAgICAgICAgICAgLy8gZ2V0IHRoZSBlcXVpdmFsZW50IHN0cmluZyBmcm9tIHRoZSBcbiAgICAgICAgICAgIC8vIG9yaWdpbmFsIGNvZGVcbiAgICAgICAgICAgIGNvbnN0IGNvZGUgPSB0aGlzLmNvZGUuc2xpY2Uoc3RhcnQsIGVuZCk7XG5cbiAgICAgICAgICAgIC8vIHNlcGFyYXRpbmcgbWVtYmVyc1xuICAgICAgICAgICAgY29uc3QgbWVtYmVycyA9IHtcbiAgICAgICAgICAgICAgICBjb3VudDogMCxcbiAgICAgICAgICAgICAgICBlbnRpdGllczogW11cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGRlZmF1bHRNZW1iZXJzID0ge1xuICAgICAgICAgICAgICAgIGNvdW50OiAwLFxuICAgICAgICAgICAgICAgIGVudGl0aWVzOiBbXVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBhbGxNZW1iZXJzU3RyID0gbWF0Y2hbMV0gPyBtYXRjaFsxXS50cmltKCkgOiBudWxsO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoYWxsTWVtYmVyc1N0cikge1xuICAgICAgICAgICAgICAgIC8vIGZpbmQgcG9zaXRpb24gb2YgYWxsIG1lbWJlcnNcbiAgICAgICAgICAgICAgICBjb25zdCByZWxBbGxNZW1iZXJzU3RhcnQgPSBjb2RlLmluZGV4T2YoYWxsTWVtYmVyc1N0cik7XG5cbiAgICAgICAgICAgICAgICAvLyBpbml0aWFsaXplIGRlZmF1bHQgc3RyaW5nXG4gICAgICAgICAgICAgICAgbGV0IGRlZmF1bHRTdHIgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgLy8gYnV0IGJlZ2luIHdpdGggbm9uIGRlZmF1bHQgbWVtYmVycywgdGhvc2VcbiAgICAgICAgICAgICAgICAvLyBhcmUgYWRkcmVzc2VkIGJ5IGxvb2tpbmcgZm9yIGV2ZXJ5dGhpbmcgYmV0d2VlblxuICAgICAgICAgICAgICAgIC8vIHRoZSBjdXJseSBicmFjZXMgKGlmIHByZXNlbnQpXG4gICAgICAgICAgICAgICAgY29uc3Qgbm9uRGVmYXVsdE1hdGNoID0gYWxsTWVtYmVyc1N0ci5tYXRjaCgve1tcXHNcXFNdKj99Lyk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG5vbkRlZmF1bHRNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZWxOb25EZWZhdWx0U3RhcnQgPSBub25EZWZhdWx0TWF0Y2guaW5kZXg7XG4gICAgICAgICAgICAgICAgICAgIGxldCBub25EZWZhdWx0U3RyID0gbm9uRGVmYXVsdE1hdGNoWzBdO1xuXG4gICAgICAgICAgICAgICAgICAgIG1lbWJlcnMuc3RhcnQgPSByZWxBbGxNZW1iZXJzU3RhcnQgKyByZWxOb25EZWZhdWx0U3RhcnQ7XG4gICAgICAgICAgICAgICAgICAgIG1lbWJlcnMuZW5kID0gbWVtYmVycy5zdGFydCArIG5vbkRlZmF1bHRTdHIubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWxOb25EZWZhdWx0U3RhcnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0U3RyID0gYWxsTWVtYmVyc1N0ci5zbGljZSgwLCBub25EZWZhdWx0TWF0Y2guaW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gc3BsaXQgdGhlIGluZGl2aWR1YWwgbWVtYmVyc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtID0gYWxsTWVtYmVyc1N0ci5zbGljZShyZWxOb25EZWZhdWx0U3RhcnQrMSwgcmVsTm9uRGVmYXVsdFN0YXJ0K25vbkRlZmF1bHRTdHIubGVuZ3RoLTIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuc3BsaXQoXCIsXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAubWFwKG0gPT4gbS50cmltKCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKG0gPT4gbSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBnZXQgdGhlIHBvc2l0aW9uIG9mIGVhY2ggb2YgZWFjaCBtZW1iZXIgXG4gICAgICAgICAgICAgICAgICAgIGxldCBzZWFyY2hJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIG0uZm9yRWFjaCgobWVtYmVyLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVtYmVycy5jb3VudCArKztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbE1lbWJlclBvcyA9IG5vbkRlZmF1bHRTdHIuaW5kZXhPZihtZW1iZXIsIHNlYXJjaEluZGV4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5hbWUgPSBtZW1iZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgbGVuO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpc29sYXRlIGFsaWFzZXNcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFsaWFzTWF0Y2ggPSBtZW1iZXIubWF0Y2goLyhcXHMrYXNcXHMrKS8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3TWVtYmVyID0ge307XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxpYXNNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxlbiA9IGFsaWFzTWF0Y2guaW5kZXg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSA9IG1lbWJlci5zbGljZSgwLCBsZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld01lbWJlci5uYW1lID0gbmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhbGlhc1N0YXJ0ID0gYWxpYXNNYXRjaC5pbmRleCArIGFsaWFzTWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld01lbWJlci5hbGlhcyA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbWVtYmVyLnNsaWNlKGFsaWFzU3RhcnQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFydDogcmVsQWxsTWVtYmVyc1N0YXJ0ICsgcmVsTm9uRGVmYXVsdFN0YXJ0ICsgcmVsTWVtYmVyUG9zICsgYWxpYXNTdGFydCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kOiByZWxBbGxNZW1iZXJzU3RhcnQgKyByZWxOb25EZWZhdWx0U3RhcnQgKyByZWxNZW1iZXJQb3MgKyBtZW1iZXIubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXdNZW1iZXIubmFtZSA9IG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGVuID0gbWVtYmVyLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld01lbWJlci5zdGFydCA9IHJlbEFsbE1lbWJlcnNTdGFydCArIHJlbE5vbkRlZmF1bHRTdGFydCArIHJlbE1lbWJlclBvcztcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld01lbWJlci5lbmQgPSBuZXdNZW1iZXIuc3RhcnQgKyBsZW47XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdNZW1iZXIuYWJzRW5kID0gbmV3TWVtYmVyLnN0YXJ0ICsgbWVtYmVyLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld01lbWJlci5pbmRleCA9IGluZGV4O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzdG9yZSB0aGUgY3VycmVudCBtZW1iZXIgc3RhcnQgYXNcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGEgcHJvcGVydHkgb2YgdGhlIGxhc3QgYW5kIHRoZSBsYXN0XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBtZW1iZXIgZW5kIGFzIGEgcHJvcGVydHkgb2YgdGhlIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY3VycmVudFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld01lbWJlci5sYXN0ID0gbWVtYmVycy5lbnRpdGllc1tpbmRleC0xXS5hYnNFbmQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVtYmVycy5lbnRpdGllc1tpbmRleC0xXS5uZXh0ID0gbmV3TWVtYmVyLnN0YXJ0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBtZW1iZXJzLmVudGl0aWVzLnB1c2gobmV3TWVtYmVyKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmFpc2UgdGhlIHNlYXJjaCBpbmRleCBieSB0aGUgbGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvZiB0aGUgbWVtYmVyIHRvIGlnbm9yZSB0aGUgY3VycmVudFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbWVtYmVyIGluIHRoZSBuZXh0IHJvdW5kXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWFyY2hJbmRleCA9IHJlbE1lbWJlclBvcyArIG1lbWJlci5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBpZiBubyBub24gZGVmYXVsdCBtZW1iZXJzIHdlcmUgZm91bmRcbiAgICAgICAgICAgICAgICAvLyB0aGUgZGVmYXVsdCBtZW1iZXIgc3RyaW5nIGlzIHRoZSB3aG9sZVxuICAgICAgICAgICAgICAgIC8vIG1lbWJlciBzdHJpbmcgXG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHRTdHIgPSBhbGxNZW1iZXJzU3RyO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGlmIGEgZGVmYXVsdCBzdHIgaXMgcHJlc2VudCBwcm9jZXNzXG4gICAgICAgICAgICAgICAgLy8gaXQgc2ltaWxhcmx5IHRvIHRoZSBub24gZGVmYXVsdCBtZW1iZXJzXG4gICAgICAgICAgICAgICAgaWYgKGRlZmF1bHRTdHIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdE1lbWJlcnMuc3RhcnQgPSByZWxBbGxNZW1iZXJzU3RhcnQ7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHRNZW1iZXJzLmVuZCA9IGRlZmF1bHRNZW1iZXJzLnN0YXJ0ICsgZGVmYXVsdFN0ci5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZG0gPSBkZWZhdWx0U3RyLnNwbGl0KFwiLFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChtID0+IG0udHJpbSgpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihtID0+IG0pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNlYXJjaEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgZG0uZm9yRWFjaCgoZGVmYXVsdE1lbWJlciwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbERlZmF1bHRNZW1iZXJQb3MgPSBkZWZhdWx0U3RyLmluZGV4T2YoZGVmYXVsdE1lbWJlciwgc2VhcmNoSW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5hbWUgPSBkZWZhdWx0TWVtYmVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGxlbjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0RlZk1lbWJlciA9IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYWxpYXNNYXRjaCA9IGRlZmF1bHRNZW1iZXIubWF0Y2goLyhcXHMrYXNcXHMrKS8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxpYXNNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxlbiA9IGFsaWFzTWF0Y2guaW5kZXg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSA9IGRlZmF1bHRNZW1iZXIuc2xpY2UoMCwgbGVuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXdEZWZNZW1iZXIubmFtZSA9IG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYWxpYXNTdGFydCA9IGFsaWFzTWF0Y2guaW5kZXggKyBhbGlhc01hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXdEZWZNZW1iZXIuYWxpYXMgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IGRlZmF1bHRNZW1iZXIuc2xpY2UoYWxpYXNTdGFydCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0OiByZWxBbGxNZW1iZXJzU3RhcnQgKyByZWxEZWZhdWx0TWVtYmVyUG9zICsgYWxpYXNTdGFydCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kOiByZWxBbGxNZW1iZXJzU3RhcnQgKyByZWxEZWZhdWx0TWVtYmVyUG9zICsgZGVmYXVsdE1lbWJlci5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0RlZk1lbWJlci5uYW1lID0gbmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZW4gPSBkZWZhdWx0TWVtYmVyLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgbmV3RGVmTWVtYmVyLnN0YXJ0ID0gcmVsQWxsTWVtYmVyc1N0YXJ0ICsgcmVsRGVmYXVsdE1lbWJlclBvcztcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld0RlZk1lbWJlci5lbmQgPSBuZXdEZWZNZW1iZXIuc3RhcnQgKyBsZW47XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdEZWZNZW1iZXIuYWJzRW5kID0gbmV3RGVmTWVtYmVyLnN0YXJ0ICsgZGVmYXVsdE1lbWJlci5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdEZWZNZW1iZXIuaW5kZXggPSBpbmRleDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0RlZk1lbWJlci5sYXN0ID0gZGVmYXVsdE1lbWJlcnMuZW50aXRpZXNbaW5kZXgtMV0uYWJzRW5kO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRNZW1iZXJzLmVudGl0aWVzW2luZGV4LTFdLm5leHQgPSBuZXdEZWZNZW1iZXIuc3RhcnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRNZW1iZXJzLmVudGl0aWVzLnB1c2gobmV3RGVmTWVtYmVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlYXJjaEluZGV4ID0gcmVsRGVmYXVsdE1lbWJlclBvcyArIGxlbiArIDE7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZXJlIGFyZSBkZWZhdWx0IGFuZCBub24gZGVmYXVsdCBtZW1iZXJzXG4gICAgICAgICAgICAgICAgICAgIC8vIGFkZCB0aGUgc3RhcnQgcG9zaXRpb24gb2YgdGhlIG5vbiBkZWZhdWx0XG4gICAgICAgICAgICAgICAgICAgIC8vIG1lbWJlcnMgYXMgdGhlIG5leHQgdmFsdWUgZm9yIHRoZSBsYXN0IGRlZmF1bHRcbiAgICAgICAgICAgICAgICAgICAgLy8gbWVtYmVyXG4gICAgICAgICAgICAgICAgICAgIGlmIChtZW1iZXJzLmNvdW50ID4gMSAmJiBkZWZhdWx0TWVtYmVycy5jb3VudCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRNZW1iZXJzLmVudGl0aWVzLmF0KC0xKS5uZXh0ID0gbWVtYmVycy5zdGFydDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY3JlYXRlIGEgZnJlc2ggb2JqZWN0IGZvciB0aGUgY3VycmVudCB1bml0XG4gICAgICAgICAgICBjb25zdCBtb2R1bGUgPSB7fVxuXG4gICAgICAgICAgICAvLyBmaW5kIHRoZSBwb3NpdGlvbiBvZiB0aGUgbW9kdWxlIHN0cmluZ1xuICAgICAgICAgICAgbW9kdWxlLnN0YXJ0ID0gbWF0Y2hbMF0uaW5kZXhPZihtYXRjaFsyXSkgKyAxO1xuICAgICAgICAgICAgbW9kdWxlLmVuZCA9IG1vZHVsZS5zdGFydCArIG1hdGNoWzJdLmxlbmd0aCAtIDI7XG4gICAgICAgICAgICBtb2R1bGUubmFtZSA9IGNvZGUuc2xpY2UobW9kdWxlLnN0YXJ0LCBtb2R1bGUuZW5kKS5zcGxpdChcIi9cIikuYXQoLTEpO1xuICAgICAgICAgICAgbW9kdWxlLnR5cGUgPSBcInN0cmluZ1wiO1xuXG4gICAgICAgICAgICAvLyBzdG9yZSB0aGUgZmlyc3Qgc2VwYXJhdG9yIG9mIHRoZSBub24gZGVmYXVsdFxuICAgICAgICAgICAgLy8gYW5kIGRlZmF1bHQgbWVtYmVycyBmb3IgYSBjb25zaXN0ZW50IHN0eWxlXG4gICAgICAgICAgICAvLyBpZiBvbmUgd2FudHMgdG8gYWRkIG1lbWJlcnNcbiAgICAgICAgICAgIGNvbnN0IHNlcERlZiA9IChkZWZhdWx0TWVtYmVycy5lbnRpdGllcy5sZW5ndGggPiAxKSA/IGNvZGUuc2xpY2UoZGVmYXVsdE1lbWJlcnMuZW50aXRpZXNbMF0uYWJzRW5kLCBkZWZhdWx0TWVtYmVycy5lbnRpdGllc1swXS5uZXh0KSA6IFwiLCBcIjtcbiAgICAgICAgICAgIGNvbnN0IHNlcE1lbSA9IChtZW1iZXJzLmVudGl0aWVzLmxlbmd0aCA+IDEpID8gY29kZS5zbGljZShtZW1iZXJzLmVudGl0aWVzWzBdLmFic0VuZCwgbWVtYmVycy5lbnRpdGllc1swXS5uZXh0KSA6IFwiLCBcIjtcblxuICAgICAgICAgICAgLy8gbWFrZSBhIG5ldyB1bml0XG4gICAgICAgICAgICBjb25zdCB1bml0ID0ge1xuICAgICAgICAgICAgICAgIGlkOiBpZCsrLFxuICAgICAgICAgICAgICAgIGluZGV4OiB0aGlzLmltcG9ydHMuZXM2LmNvdW50LTEsXG4gICAgICAgICAgICAgICAgY29kZTogbmV3IE1hZ2ljU3RyaW5nKGNvZGUpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHRNZW1iZXJzLFxuICAgICAgICAgICAgICAgIG1lbWJlcnMsXG4gICAgICAgICAgICAgICAgbW9kdWxlLFxuICAgICAgICAgICAgICAgIHN0YXJ0LFxuICAgICAgICAgICAgICAgIGVuZCxcbiAgICAgICAgICAgICAgICBzZXBEZWYsXG4gICAgICAgICAgICAgICAgc2VwTWVtLFxuICAgICAgICAgICAgICAgIHR5cGU6IFwiZXM2XCIsXG4gICAgICAgICAgICAgICAgZ2V0IGNvZGVTdHJpbmcoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbIHRoaXMuY29kZS50b1N0cmluZygpIF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gZ2VuZXJhdGUgYSBoYXNoXG4gICAgICAgICAgICB1bml0Lmhhc2ggPSB0aGlzLiNtYWtlSGFzaCh1bml0KTtcblxuICAgICAgICAgICAgLy8gcHVzaCB0aGUgZnJlc2ggdW5pdCB0byBlczYgdW5pdCBhcnJheVxuICAgICAgICAgICAgdGhpcy5pbXBvcnRzLmVzNi51bml0cy5wdXNoKHVuaXQpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIG5leHQgPSBlczZJbXBvcnRDb2xsZWN0aW9uLm5leHQoKTtcbiAgICAgICAgICAgIHRoaXMuaW1wb3J0cy5lczYuc2VhcmNoZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmljIG1ldGhvZCB0byBmaW5kIGR5bmFtaWMgYW5kIGNvbW1vbiBqc1xuICAgICAqIGltcG9ydCBwcm9wZXJ0aWVzLlxuICAgICAqIEJvdGggbWV0aG9kcyBtYXRjaGVzIGhhdmUgdGhlIGZvbGxvd2luZyBjaGlsZHJlbjpcbiAgICAgKiAgLSBtYXRjaFswXSAtIHRoZSBjb21wbGV0ZSBpbXBvcnQgc3RhdGVtZW50XG4gICAgICogIC0gbWF0Y2hbMV0gLSBpbmRleCAwIHVudGlsIHRoZSBiZWdpbm5pbmcgb2YgdGhlIG1vZHVsZVxuICAgICAqICAgICAgICAgICAgICAgKHRoZSBsZW5ndGggaXMgdGhlIHN0YXJ0IGluZGV4IG9mIHRoZSBtb2R1bGUgc3RyaW5nKVxuICAgICAqICAtIG1hdGNoWzJdIC0gdGhlIG1vZHVsZSBzdHJpbmcgKG9yIG1vcmUgdW5saWtlbHkgdmFyL2ZuKVxuICAgICAqIFxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gXCJjanNcIiBvciBcImR5bmFtaWNcIiBcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gbWF0Y2ggLSBBIG1hdGNoIG9iamVjdCByZXR1cm5lZCBieSBhIHJlZ2V4IG1hdGNoIGZuLiBcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaWQgXG4gICAgICovXG4gICAgICNtYWtlSW1wb3J0KHR5cGUsIG1hdGNoLCBpZCwgaW5kZXgpIHtcbiAgICAgICAgY29uc3Qgc3RhcnQgPSBtYXRjaC5pbmRleDtcbiAgICAgICAgY29uc3QgZW5kID0gc3RhcnQgKyBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGNvZGUgPSB0aGlzLmNvZGUuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtb2R1bGUgPSB7fTtcbiAgICAgICAgbW9kdWxlLnN0YXJ0ID0gbWF0Y2hbMV0ubGVuZ3RoO1xuICAgICAgICBtb2R1bGUuZW5kID0gbW9kdWxlLnN0YXJ0ICsgbWF0Y2hbMl0ubGVuZ3RoO1xuICAgICAgICBjb25zdCBjaGFyMCA9IGNvZGUuY2hhckF0KG1vZHVsZS5zdGFydCk7XG5cbiAgICAgICAgLy8gYXMgZHluYW1pYyBhbmQgY2pzIGltcG9ydHMgYWxsb3cgdmFyaWFibGVzXG4gICAgICAgIC8vIChvciBldmVuIGZ1bmN0aW9ucykgdG8gcHJvdmlkZSB0aGUgbW9kdWxlXG4gICAgICAgIC8vIHN0cmluZyB0aGlzIHR5cGUgaGFzIHRvIGJlIGZpZ3VyZWQgb3V0IGFuZFxuICAgICAgICAvLyBzdG9yZWRcblxuICAgICAgICBpZiAoY2hhcjAubWF0Y2goL1tcIidgXS8pKSB7XG4gICAgICAgICAgICBtb2R1bGUudHlwZSA9IFwic3RyaW5nXCI7XG4gICAgICAgICAgICBtb2R1bGUucXVvdGVzID0gY2hhcjA7XG4gICAgICAgICAgICBtb2R1bGUubmFtZSA9IGNvZGUuc2xpY2UobW9kdWxlLnN0YXJ0KzEsIG1vZHVsZS5lbmQtMSkuc3BsaXQoXCIvXCIpLmF0KC0xKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG1vZHVsZS50eXBlID0gXCJsaXRlcmFsXCI7XG4gICAgICAgICAgICBtb2R1bGUubmFtZSA9IGNvZGUuc2xpY2UobW9kdWxlLnN0YXJ0LCBtb2R1bGUuZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gbWFrZSBhIGZyZXNoIHVuaXRcbiAgICAgICAgY29uc3QgdW5pdCA9IHtcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgaW5kZXgsXG4gICAgICAgICAgICBjb2RlOiBuZXcgTWFnaWNTdHJpbmcoY29kZSksXG4gICAgICAgICAgICBtb2R1bGUsXG4gICAgICAgICAgICBzdGFydCxcbiAgICAgICAgICAgIGVuZCxcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICBnZXQgY29kZVN0cmluZygpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gWyB0aGlzLmNvZGUudG9TdHJpbmcoKSBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIGFkZCBoYXNoXG4gICAgICAgIHVuaXQuaGFzaCA9IHRoaXMuI21ha2VIYXNoKHVuaXQpO1xuXG4gICAgICAgIHRoaXMuaW1wb3J0c1t0eXBlXS51bml0cy5wdXNoKHVuaXQpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogRmluZCBhbGwgZHluYW1pYyBpbXBvcnQgc3RhdGVtZW50cyBpbiB0aGUgXG4gICAgICogKHByZXBhcmVkKSBzb3VyY2UgY29kZS5cbiAgICAgKi9cbiAgICBnZXREeW5hbWljSW1wb3J0cygpIHtcbiAgICAgICAgbGV0IGlkID0gdGhpcy5pbXBvcnRzLmR5bmFtaWMuaWRTY29wZTtcblxuICAgICAgICBjb25zdCBkeW5hbWljSW1wb3J0Q29sbGVjdGlvbiA9IHRoaXMuYmxhY2tlbmVkQ29kZS5tYXRjaEFsbCgvKGltcG9ydFxccyo/XFwoXFxzKj8pKFxcUyspKD86XFxzKj9cXCk7PykvZyk7XG4gICAgICAgIGxldCBuZXh0ID0gZHluYW1pY0ltcG9ydENvbGxlY3Rpb24ubmV4dCgpO1xuXG4gICAgICAgIHdoaWxlICghbmV4dC5kb25lKSB7XG4gICAgICAgICAgICB0aGlzLmltcG9ydHMuZHluYW1pYy5jb3VudCArKztcbiAgICAgICAgICAgIHRoaXMuI21ha2VJbXBvcnQoXCJkeW5hbWljXCIsIG5leHQudmFsdWUsIGlkKyssIHRoaXMuaW1wb3J0cy5keW5hbWljLmNvdW50LTEpO1xuICAgICAgICAgICAgbmV4dCA9IGR5bmFtaWNJbXBvcnRDb2xsZWN0aW9uLm5leHQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuaW1wb3J0cy5keW5hbWljLnNlYXJjaGVkID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIEZpbmQgYWxsIGNvbW1vbiBqcyBpbXBvcnQgc3RhdGVtZW50cyBpbiB0aGUgXG4gICAgICogKHByZXBhcmVkKSBzb3VyY2UgY29kZS5cbiAgICAgKi9cbiAgICBnZXRDSlNJbXBvcnRzKCkge1xuICAgICAgICBsZXQgaWQgPSB0aGlzLmltcG9ydHMuY2pzLmlkU2NvcGU7XG5cbiAgICAgICAgY29uc3QgY2pzSW1wb3J0Q29sbGVjdGlvbiA9IHRoaXMuYmxhY2tlbmVkQ29kZS5tYXRjaEFsbCgvKHJlcXVpcmVcXHMqP1xcKFxccyo/KShcXFMrKSg/Olxccyo/XFwpOz8pL2cpO1xuICAgICAgICBsZXQgbmV4dCA9IGNqc0ltcG9ydENvbGxlY3Rpb24ubmV4dCgpO1xuXG4gICAgICAgIHdoaWxlICghbmV4dC5kb25lKSB7XG4gICAgICAgICAgICB3aGlsZSAoIW5leHQuZG9uZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuaW1wb3J0cy5janMuY291bnQgKys7XG4gICAgICAgICAgICAgICAgdGhpcy4jbWFrZUltcG9ydChcImNqc1wiLCBuZXh0LnZhbHVlLCBpZCsrLCB0aGlzLmltcG9ydHMuY2pzLmNvdW50LTEpO1xuICAgICAgICAgICAgICAgIG5leHQgPSBjanNJbXBvcnRDb2xsZWN0aW9uLm5leHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBcblxuICAgICAgICB0aGlzLmltcG9ydHMuY2pzLnNlYXJjaGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICByZW1vdmUodW5pdCkge1xuICAgICAgICBpZiAodW5pdC50eXBlICE9PSBcImVzNlwiKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSZW1vdmluZyB1bml0cyBpcyBvbmx5IGF2YWlsYWJsZSBmb3IgZXM2IGltcG9ydHMuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY29kZS5yZW1vdmUodW5pdC5zdGFydCwgdW5pdC5lbmQpO1xuICAgICAgICB0aGlzLmltcG9ydHNbdW5pdC50eXBlXS51bml0cy5zcGxpY2UoW3VuaXQuaW5kZXhdLCAxLCBudWxsKTtcbiAgICAgICAgdGhpcy5pbXBvcnRzW3VuaXQudHlwZV0uY291bnQgLS07XG4gICAgfVxuXG4gICAgY29tbWl0Q2hhbmdlcyh1bml0KSB7XG4gICAgICAgIGlmICh1bml0Lm1lbWJlcnNGcm9tU2NyYXRjaCkge1xuICAgICAgICAgICAgY29uc3QgZW5kID0gdW5pdC5kZWZhdWx0TWVtYmVycy5lbnRpdGllcy5hdCgtMSkuYWJzRW5kO1xuICAgICAgICAgICAgdW5pdC5jb2RlLmFwcGVuZFJpZ2h0KGVuZCwgXCIgfVwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvZGUub3ZlcndyaXRlKHVuaXQuc3RhcnQsIHVuaXQuZW5kLCB1bml0LmNvZGUudG9TdHJpbmcoKSk7XG4gICAgfVxuXG5cbi8vICAgICAgICAgICAgICBfX19fX19fX19fX19fX19fX19fICAgICAgICAgICAgICAvL1xuLy8gICAgICAgICAgICAgIHNlbGVjdCB1bml0IG1ldGhvZHMgICAgICAgICAgICAgIC8vXG5cbiAgICAvKipcbiAgICAgKiBIZWxwZXIgbWV0aG9kIHRvIGxpc3QgYXZhaWxhYmxlIHVuaXRzXG4gICAgICogaW4gY2FzZSBvZiBhIE1hdGNoRXJyb3IuXG4gICAgICogQHBhcmFtIHtPYmplY3RbXX0gdW5pdHMgLSBBcnJheSBvZiB1bml0IG9iamVjdHMgdG8gbGlzdC5cbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSAtIE1lc3NhZ2UgZm9yIGxvZ2dpbmcuXG4gICAgICovXG4gICAgI2xpc3RVbml0cyh1bml0cykge1xuICAgICAgICBjb25zdCBtc2dBcnJheSA9IFtcIlwiXTtcbiAgICAgICAgXG4gICAgICAgIHVuaXRzLmZvckVhY2godW5pdCA9PiB7XG4gICAgICAgICAgICBtc2dBcnJheS5wdXNoKFxuICAgICAgICAgICAgICAgIFwiX19fXCIsXG4gICAgICAgICAgICAgICAgYElEOiAgICR7dW5pdC5pZH1gLFxuICAgICAgICAgICAgICAgIGBIQVNIOiAke3VuaXQuaGFzaH1gLCBcbiAgICAgICAgICAgICAgICBgTkFNRTogJHt1bml0Lm1vZHVsZS5uYW1lfWAsXG4gICAgICAgICAgICAgICAgYFNUQVRFTUVOVDpcXG4ke3VuaXQuY29kZS50b1N0cmluZygpfVxcbmBcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gbXNnQXJyYXkuam9pbihcIlxcblwiKSArIFwiXFxuXCI7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBIZWxwZXIgbWV0aG9kIHRvIGxpc3QgYWxsIGF2YWlsYWJsZSB1bml0cy5cbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSAtIE1lc3NhZ2Ugc3RyaW5nLlxuICAgICAqL1xuICAgICNsaXN0QWxsVW5pdHMoKSB7XG4gICAgICAgIGxldCBtc2cgPSBcIlwiO1xuICAgICAgICBmb3IgKGNvbnN0IHR5cGUgaW4gdGhpcy5pbXBvcnRzKSB7XG4gICAgICAgICAgICBtc2cgKz0gdGhpcy4jbGlzdFVuaXRzKHRoaXMuaW1wb3J0c1t0eXBlXS51bml0cyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1zZztcbiAgICB9XG5cbiAgICBcbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIGEgdW5pdCBieSBpdHMgbW9kdWxlIG5hbWUuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBNb2R1bGUgTmFtZS4gXG4gICAgICogQHBhcmFtIHtzdHJpbmd8c3RyaW5nW119IFt0eXBlXSAtIFwiY2pzXCIsIFwiZHluYW1pY1wiLCBcImVzNlwiIG9uZSBhcyBhIHN0cmluZyBvciBtdWx0aXBsZSBhcyBhcnJheSBvZiBzdHJpbmdzXG4gICAgICogQHJldHVybnMge09iamVjdH0gLSBBbiBleHBsaWNpdCB1bml0LlxuICAgICAqL1xuICAgIHNlbGVjdE1vZEJ5TmFtZShuYW1lLCB0eXBlLCBhbGxvd051bGwpIHtcbiAgICAgICAgaWYgKCFuYW1lKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiVGhlIG5hbWUgbXVzdCBiZSBwcm92aWRlZFwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB1bml0TGlzdCA9IFtdO1xuXG4gICAgICAgIGlmICghdHlwZSkge1xuICAgICAgICAgICAgdHlwZSA9IE9iamVjdC5rZXlzKHRoaXMuaW1wb3J0cyk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHR5cGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHR5cGUgPSBbdHlwZV07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHR5cGUgPSBPYmplY3Qua2V5cyh0aGlzLmltcG9ydHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCB0IG9mIHR5cGUpIHtcbiAgICAgICAgICAgIGlmICghKHQgaW4gdGhpcy5pbXBvcnRzKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYEludmFsaWQgdHlwZTogJyR7dH0nIC0gU2hvdWxkIGJlIG9uZSBvciBtb3JlIG9mOiAnY2pzJywgJ2R5bmFtaWMnLCAnZXM2Jy5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmltcG9ydHNbdF0uY291bnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgdW5pdExpc3QucHVzaCguLi50aGlzLmltcG9ydHNbdF0udW5pdHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdW5pdHMgPSB1bml0TGlzdC5maWx0ZXIodW5pdCA9PiB1bml0Lm1vZHVsZS5uYW1lID09PSBuYW1lKTtcblxuICAgICAgICBpZiAodW5pdHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBpZiAoYWxsb3dOdWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgbXNnID0gdGhpcy4jbGlzdFVuaXRzKHVuaXRMaXN0KTtcbiAgICAgICAgICAgIGxldCB0eXBlU3RyO1xuXG4gICAgICAgICAgICBpZiAodHlwZS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICB0eXBlU3RyID0gdHlwZSArIFwiLWltcG9ydHNcIjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZS5sZW5ndGggPCBPYmplY3Qua2V5cyh0aGlzLmltcG9ydHMpLmxlbmd0aCkgeyBcbiAgICAgICAgICAgICAgICB0eXBlU3RyID0gdHlwZS5qb2luKFwiLWltcG9ydHMgb3IgXCIpICsgXCItaW1wb3J0c1wiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlU3RyID0gXCJhbnkgZ3JvdXBcIjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbXNnICs9IGBfX19cXG5VbmFibGUgdG8gbG9jYXRlIGltcG9ydCBzdGF0ZW1lbnQgd2l0aCBuYW1lOiAnJHtuYW1lfScgaW4gJHt0eXBlU3RyfWA7XG4gICAgICAgICAgICB0aHJvdyBuZXcgTWF0Y2hFcnJvcihtc2cpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBlbHNlIGlmICh1bml0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICBsZXQgbXNnID0gdGhpcy4jbGlzdFVuaXRzKHVuaXRzKTtcbiAgICAgICAgICAgIG1zZyArPSBgX19fXFxuRm91bmQgbXVsdGlwbGUgbWF0Y2hlcyBmb3IgJyR7bmFtZX0nLiBJZiBubyBvdGhlciBzb2x1dGlvbiBpcyBhdmFpbGFibGUgeW91IG1heSBzZWxlY3QgdmlhIGhhc2guYDtcbiAgICAgICAgICAgIHRocm93IG5ldyBNYXRjaEVycm9yKG1zZyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB1bml0ID0gdW5pdHNbMF07XG4gICAgICAgIHVuaXQubWV0aG9kcyA9IG5ldyBJbXBvcnRNYW5hZ2VyVW5pdE1ldGhvZHModW5pdCk7XG5cbiAgICAgICAgcmV0dXJuIHVuaXQ7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIGEgdW5pdCBieSBpdHMgaWQuIFNob3VsZCBvbmx5IGJlIHVzZWRcbiAgICAgKiBmb3IgdGVzdCBwdXJwb3Nlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaWQgLSBVbml0IGlkLiBcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSAtIEFuIGV4cGxpY2l0IHVuaXQuXG4gICAgICovXG4gICAgc2VsZWN0TW9kQnlJZChpZCwgYWxsb3dOdWxsKSB7XG4gICAgICAgIGlmICghaWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJUaGUgaWQgbXVzdCBiZSBwcm92aWRlZFwiKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc3QgdHlwZSA9IHRoaXMuaWRUeXBlc1sgTWF0aC5mbG9vcihpZCAvIHRoaXMuc2NvcGVNdWx0aSkgKiB0aGlzLnNjb3BlTXVsdGkgXTtcbiAgICAgICAgaWYgKCF0eXBlKSB7XG4gICAgICAgICAgICBjb25zdCBhc2NJZHMgPSBPYmplY3Qua2V5cyh0aGlzLmlkVHlwZXMpLnNvcnQoKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYElkICcke2lkfScgaXMgaW52YWxpZC4gSWRzIHJhbmdlIGZyb20gJHthc2NJZHMuYXQoMCl9IHRvICR7YXNjSWRzLmF0KC0xKX0rYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdW5pdHMgPSB0aGlzLmltcG9ydHNbdHlwZV0udW5pdHMuZmlsdGVyKG4gPT4gbi5pZCA9PSBpZCk7XG5cbiAgICAgICAgaWYgKHVuaXRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgaWYgKGFsbG93TnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IG1zZyA9IHRoaXMuI2xpc3RVbml0cyh0aGlzLmltcG9ydHNbdHlwZV0udW5pdHMpO1xuICAgICAgICAgICAgbXNnICs9IGBfX19cXG5VbmFibGUgdG8gbG9jYXRlIGltcG9ydCBzdGF0ZW1lbnQgd2l0aCBpZDogJyR7aWR9J2A7XG4gICAgICAgICAgICB0aHJvdyBuZXcgTWF0Y2hFcnJvcihtc2cpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdW5pdCA9IHVuaXRzWzBdO1xuICAgICAgICB1bml0Lm1ldGhvZHMgPSBuZXcgSW1wb3J0TWFuYWdlclVuaXRNZXRob2RzKHVuaXQpO1xuXG4gICAgICAgIHJldHVybiB1bml0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgYSB1bml0IGJ5IGl0cyBoYXNoLiBUaGUgaGFzaCB3aWxsIGNoYW5nZVxuICAgICAqIGlmIHRoZSB1bml0IGNoYW5nZXMgaXRzIHByb3BlcnRpZXMgbGlrZSBtZW1iZXJzLFxuICAgICAqIGFsaWFzLCBldGMuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGhhc2ggLSBUaGUgaGFzaCBzdHJpbmcgb2YgdGhlIHVuaXQuIFxuICAgICAqIEByZXR1cm5zIHtvYmplY3R9IC0gQW4gZXhwbGljaXQgdW5pdC5cbiAgICAgKi9cbiAgICBzZWxlY3RNb2RCeUhhc2goaGFzaCwgYWxsb3dOdWxsKSB7XG4gICAgICAgIGlmICghKGhhc2ggaW4gdGhpcy5oYXNoTGlzdCkpIHtcbiAgICAgICAgICAgIGlmIChhbGxvd051bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCBtc2cgPSB0aGlzLiNsaXN0QWxsVW5pdHMoKTsgXG4gICAgICAgICAgICBtc2cgKz0gYF9fX1xcbkhhc2ggJyR7aGFzaH0nIHdhcyBub3QgZm91bmRgO1xuICAgICAgICAgICAgdGhyb3cgbmV3IE1hdGNoRXJyb3IobXNnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdE1vZEJ5SWQodGhpcy5oYXNoTGlzdFtoYXNoXSk7XG4gICAgfVxuXG5cbi8vICAgICAgICAgICAgICAgIF9fX19fX19fX19fX19fX19fX19fX19fXyAgICAgICAgICAgICAgLy9cbi8vICAgICAgICAgICAgICAgIGdsb2JhbCBkZWJ1Z2dpbmcgbWV0aG9kcyAgICAgICAgICAgICAgLy9cblxuXG4gICAgLyoqXG4gICAgICogRGVidWdnaW5nIG1ldGhvZCB0byBzdG9wIHRoZSBidWlsZGluZyBwcm9jZXNzXG4gICAgICogYW5kIGxpc3QgYWxsIGltcG9ydCB1bml0cyB3aXRoIGl0cyBpZCwgaGFzaCBhbmRcbiAgICAgKiBpbXBvcnQgc3RhdGVtZW50LlxuICAgICAqL1xuICAgICBsb2dVbml0cygpIHtcbiAgICAgICAgdGhyb3cgbmV3IERlYnVnZ2luZ0Vycm9yKHRoaXMuI2xpc3RBbGxVbml0cygpKTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIERlYnVnZ2luZyBtZXRob2QgdG8gc3RvcCB0aGUgYnVpbGRpbmcgcHJvY2Vzc1xuICAgICAqIGFuZCBsaXN0IGEgc3BlY2lmaWMgdW5pdCBzZWxlY3RlZCBieSBpdHMgaWQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGlkIC0gVW5pdCBpZC5cbiAgICAgKi9cbiAgICAvLyBUT0RPOiBtb3ZlIHRoaXMgdG8gdW5pdCBkZWJ1ZyBtZXRob2RcbiAgICBsb2dJbXBvcnRPYmplY3QodW5pdCkge1xuICAgICAgICB0aHJvdyBuZXcgRGVidWdnaW5nRXJyb3IoSlNPTi5zdHJpbmdpZnkodW5pdCwgbnVsbCwgNCkpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogRGVidWdnaW5nIG1ldGhvZCB0byBzdG9wIHRoZSBidWlsZGluZyBwcm9jZXNzXG4gICAgICogYW5kIGxpc3QgdGhlIGNvbXBsZXRlIGltcG9ydCBvYmplY3QuXG4gICAgICovXG4gICAgIGxvZ1VuaXRPYmplY3RzKCkge1xuICAgICAgICB0aHJvdyBuZXcgRGVidWdnaW5nRXJyb3IoSlNPTi5zdHJpbmdpZnkodGhpcy5pbXBvcnRzLCBudWxsLCA0KSk7XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBJbXBvcnRNYW5hZ2VyO1xuIiwiaW1wb3J0IHsgY3JlYXRlRmlsdGVyIH0gZnJvbSBcIkByb2xsdXAvcGx1Z2ludXRpbHNcIjtcbmltcG9ydCBJbXBvcnRNYW5hZ2VyIGZyb20gXCIuL2NvcmUuanNcIjtcbmltcG9ydCBwaWNvbWF0Y2ggZnJvbSBcInBpY29tYXRjaFwiOyBcblxuLy8gaGVscGVyIHRvIGFsbG93IHN0cmluZyBhbmQgYXJyYXlcbmNvbnN0IGVuc3VyZUFycmF5ID0gKGFycikgPT4gQXJyYXkuaXNBcnJheShhcnIpID8gYXJyIDogW2Fycl07XG5cbi8vIG1ha2VzIHRoZSBsaWZlIG9mIHRoZSB1c2VyIGEgbGl0dGxlIGJpdCBlYXNpZXJcbi8vIGJ5IGFjY2VwdGluZyBtdWx0aXBsZSB2ZXJzaW9ucyBvZiBib29sZWFuIHZhcnMgXG5jb25zdCBib29sID0gKGIpID0+ICEoQm9vbGVhbihiKSA9PT0gZmFsc2UgfHwgU3RyaW5nKGIpLm1hdGNoKC8oPzpmYWxzZXxub3wwKS8sIFwiaVwiKSk7XG5cbmNvbnN0IG1hbmFnZXIgPSAob3B0aW9ucz17fSkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFwib3B0aW9uc1wiLCBvcHRpb25zKTtcblxuICAgIGNvbnN0IGZpbHRlciA9IGNyZWF0ZUZpbHRlcihvcHRpb25zLmluY2x1ZGUsIG9wdGlvbnMuZXhjbHVkZSk7XG4gIFxuICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6ICdJbXBvcnRNYW5hZ2VyJyxcbiAgICBcbiAgICAgICAgdHJhbnNmb3JtIChzb3VyY2UsIGlkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImlkXCIsIGlkKTtcbiAgICAgICAgICAgIGlmICghZmlsdGVyKGlkKSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCBpbXBvcnRNYW5hZ2VyID0gbmV3IEltcG9ydE1hbmFnZXIoc291cmNlLCBpZCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnVuaXRzKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgbGV0IGFsbG93TnVsbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgbGV0IHVzZUlkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVuaXRTZWN0aW9uIG9mIGVuc3VyZUFycmF5KG9wdGlvbnMudW5pdHMpKSB7IFxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChcImZpbGVcIiBpbiB1bml0U2VjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2codW5pdFNlY3Rpb24uZmlsZSwgXCJvYmouZmlsZVwiKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy9jb25zdCBpc01hdGNoID0gcGljb21hdGNoKG9iai5maWxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2ggPSAoaWQpID0+IChpZC5pbmRleE9mKHVuaXRTZWN0aW9uLmZpbGUpID4gLTEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRklYTUU6IHByb3BlciBpbXBsZW1lbnRhdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWlzTWF0Y2goaWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coaWQsIFwiTk8hXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFwiZGVidWdcIiBpbiB1bml0U2VjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh1bml0U2VjdGlvbi5kZWJ1ZyA9PT0gXCJvYmplY3RzXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW1wb3J0TWFuYWdlci5sb2dVbml0T2JqZWN0cygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltcG9ydE1hbmFnZXIubG9nVW5pdHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBhbGxvd051bGwgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVzZUlkID0gXCJpZFwiIGluIHVuaXRTZWN0aW9uO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgbGV0IHVuaXQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2VJZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5pdCA9IGltcG9ydE1hbmFnZXIuc2VsZWN0TW9kQnlJZCh1bml0U2VjdGlvbi5pZCwgYWxsb3dOdWxsKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChcImhhc2hcIiBpbiB1bml0U2VjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5pdCA9IGltcG9ydE1hbmFnZXIuc2VsZWN0TW9kQnlIYXNoKHVuaXRTZWN0aW9uLmhhc2gsIGFsbG93TnVsbCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoXCJtb2R1bGVcIiBpbiB1bml0U2VjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5pdCA9IGltcG9ydE1hbmFnZXIuc2VsZWN0TW9kQnlOYW1lKHVuaXRTZWN0aW9uLm1vZHVsZSwgdW5pdFNlY3Rpb24udHlwZSwgYWxsb3dOdWxsKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2codW5pdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGltcG9ydE1hbmFnZXIuaW1wb3J0cyk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKFwiYWN0aW9uc1wiIGluIHVuaXRTZWN0aW9uKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIGVuc3VyZUFycmF5KHVuaXRTZWN0aW9uLmFjdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBhY3Rpb24gPT09IFwib2JqZWN0XCIgJiYgXCJzZWxlY3RcIiBpbiBhY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFjdGlvbi5zZWxlY3QgPT09IFwibW9kdWxlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChcInJlbmFtZVwiIGluIGFjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1vZFR5cGUgPSAoXCJtb2RUeXBlXCIgaW4gYWN0aW9uKSA/IGFjdGlvbi5tb2RUeXBlIDogdW5pdC5tb2R1bGUudHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bml0Lm1ldGhvZHMucmVuYW1lTW9kdWxlKGFjdGlvbi5yZW5hbWUsIG1vZFR5cGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoYWN0aW9uLnNlbGVjdCA9PT0gXCJtZW1iZXJcIiB8fCBhY3Rpb24uc2VsZWN0ID09PSBcImRlZmF1bHRNZW1iZXJcIiApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1lbWJlclR5cGUgPSBhY3Rpb24uc2VsZWN0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoXCJyZW5hbWVcIiBpbiBhY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBrZWVwQWxpYXMgPSBcImtlZXBBbGlhc1wiIGluIGFjdGlvbiA/IGJvb2woYWN0aW9uLmtlZXBBbGlhcykgOiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bml0Lm1ldGhvZHMucmVuYW1lTWVtYmVyKG1lbWJlclR5cGUsIGFjdGlvbi5uYW1lLCBhY3Rpb24ucmVuYW1lLCBrZWVwQWxpYXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChcInJlbW92ZVwiIGluIGFjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXQubWV0aG9kcy5yZW1vdmVNZW1iZXIobWVtYmVyVHlwZSwgYWN0aW9uLm5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoYWN0aW9uLnNlbGVjdCA9PT0gXCJtZW1iZXJzXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChcImFkZFwiIGluIGFjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYWRkaXRpb24gb2YgZW5zdXJlQXJyYXkoYWN0aW9uLmFkZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5pdC5tZXRob2RzLmFkZE1lbWJlcihhZGRpdGlvbik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGFjdGlvbiA9PT0gXCJyZW1vdmVcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbXBvcnRNYW5hZ2VyLnJlbW92ZSh1bml0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW1wb3J0TWFuYWdlci5jb21taXRDaGFuZ2VzKHVuaXQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29kZSA9IGltcG9ydE1hbmFnZXIuY29kZS50b1N0cmluZygpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJDT0RFID4+Pj5cIik7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhjb2RlKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiPDw8IENPREVcIik7XG4gICAgICAgICAgICBsZXQgbWFwO1xuXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5zb3VyY2VNYXAgIT09IGZhbHNlICYmIG9wdGlvbnMuc291cmNlbWFwICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIG1hcCA9IGltcG9ydE1hbmFnZXIuY29kZS5nZW5lcmF0ZU1hcCh7IGhpcmVzOiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4geyBjb2RlLCBtYXAgfTtcbiAgICAgICAgfVxuICAgIH07XG59O1xuICBcbmV4cG9ydCB7IG1hbmFnZXIgfTtcbiJdLCJuYW1lcyI6WyJNYWdpY1N0cmluZyIsImNyZWF0ZUZpbHRlciJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNLFVBQVUsU0FBUyxLQUFLLENBQUM7QUFDL0IsSUFBSSxXQUFXLENBQUMsT0FBTyxFQUFFO0FBQ3pCLFFBQVEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ3ZCLFFBQVEsSUFBSSxDQUFDLElB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QUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUssV0FBVyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRTtBQUN6QyxRQUFRLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7QUFDbEMsUUFBUSxNQUFNLEdBQUcsR0FBRyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUM1QyxRQUFRLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztBQUNqRDtBQUNBLFFBQVEsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDO0FBQzFCLFFBQVEsTUFBTSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ3ZDLFFBQVEsTUFBTSxDQUFDLEdBQUcsR0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDcEQsUUFBUSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNoRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRTtBQUNsQyxZQUFZLE1BQU0sQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDO0FBQ25DLFlBQVksTUFBTSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7QUFDbEMsWUFBWSxNQUFNLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMs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
