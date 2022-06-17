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
    constructor(unit, es6StrToObj) {
        this.unit = unit;
        this.updateUnit = (memberPart=null) => {

            if (memberPart === null) {
                const memberPartStart = this.unit.defaultMembers.start || this.unit.members.start;
                const memberPartEnd = this.unit.members.end || this.unit.defaultMembers.end;
                memberPart = this.unit.code.slice(memberPartStart, memberPartEnd);
            }

            const unit = es6StrToObj(
                this.unit.code.toString(),
                this.unit.start,
                this.unit.end,
                this.unit.code.toString(),
                memberPart,
                this.unit.code.slice(this.unit.module.start)
            );

            // ignore the getter
            delete unit.codeString;
            
            // copy all other updated properties
            Object.assign(this.unit, unit);
        };
    }


    #ES6only() {
        if (this.unit.type !== "es6") {
            throw new Error("This method is only available for ES6 imports.");
        }
    }

// module methods

    renameModule(name, modType) {
        if (modType === "string") {
            const q = this.unit.module.quotes;
            name = q + name + q;
        } else if (modType !== "literal") {
            throw new TypeError(`Unknown modType '${modType}'. Valid types are 'string' and 'literal'.`);
        }
        
        this.unit.code.overwrite(this.unit.module.start, this.unit.module.end, name);
        this.updateUnit();
    }

// member methods

    addMember(names) {
        this.#ES6only();

        let start; 
        let memStr;
        let memberPart = null;

        if (this.unit.members.count > 0) {
            start = this.unit.members.entities.at(-1).absEnd;
            memStr = this.unit.members.separator 
                   + names.join(this.unit.members.separator);
        }

        else if (this.unit.defaultMembers.count === 0) {
            start = this.unit.module.start;
            memStr = "{ "
                   + names.join(this.unit.members.separator)
                   + " }";
            memberPart = memStr;
            memStr += " from ";
        }

        else {
            start = this.unit.defaultMembers.end;
            memStr = this.unit.defaultMembers.separator
                   + "{ "
                   + names.join(this.unit.members.separator)
                   + " }";
        }

        this.unit.code.appendRight(start, memStr);
        this.updateUnit(memberPart);
    }

    addDefaultMember(names) {
        this.#ES6only();

        let start; 
        let defStr;

        if (this.unit.defaultMembers.count > 0) {
            start = this.unit.defaultMembers.entities.at(-1).absEnd;
            defStr = this.unit.defaultMembers.separator 
                   + names.join(this.unit.defaultMembers.separator);
        }

        else if (this.unit.members.count === 0) {
            start = this.unit.module.start;
            defStr = names.join(this.unit.members.separator);
            defStr += " from ";
        }

        else {
            start = this.unit.members.start;
            defStr = names.join(this.unit.defaultMembers.separator)
                   + this.unit.members.separator;
        }
        
        this.unit.code.appendRight(start, defStr);
        this.updateUnit();
    }

    #findMember(memberType, name) {
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
        this.#ES6only();

        const member = this.#findMember(memberType, name);

        if (this.unit[memberType+"s"].count === 1) {
            this.removeMembers(memberType+"s");
        } 

        else {
            let start;
            let end;
            
            if (member.next) {
                start = member.start;
                end = member.next;
            } else if (member.last) {
                start = member.last;
                end = member.absEnd;
            } else {
                start = member.start;
                end = member.absEnd;
            }

            this.unit.code.remove(start, end);   
            this.updateUnit();

        }
    }

    removeMembers(membersType) {
        this.#ES6only();

        const members = this.unit[membersType];
        const others = this.unit[membersType === "members" ? "defaultMembers" : "members"];

        let memberPart = null;
        if (others.count > 0) {
            
            const start = (membersType === "members") 
                        ? this.unit.defaultMembers.entities.at(-1).end
                        : members.start;

            this.unit.code.remove(start, members.end);
        }

        else {
            this.unit.code.remove(members.start, this.unit.module.start);
            memberPart = "";
        }

        this.updateUnit(memberPart);
    }

    renameMember(memberType, name, newName, keepAlias) {
        this.#ES6only();

        const member = this.#findMember(memberType, name);
        let end;

        if (keepAlias) {
            end = member.end;
        } else {
            end = member.absEnd;
        }
        this.unit.code.overwrite(member.start, end, newName);
        this.updateUnit();
    }

    setAlias(memberType, name, set) {
        const aliasStr = set ? `${name} as ${set}` : name;
        this.renameMember(memberType, name, aliasStr, false);
        this.updateUnit();
    }

    /**
     * Debugging method to stop the building process
     * and list a specific unit selected by its id.
     * @param {number} id - Unit id.
     */
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
            true
        );

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


    es6StrToObj(code, start, end, statement, memberPart, module) {
        // separating members
        const members = {
            count: 0,
            entities: []
        };

        const defaultMembers = {
            count: 0,
            entities: []
        };

        const allMembersStr = memberPart ? memberPart.trim() : null;
        
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

                // split the individual members (ignore curly braces left and right)
                const m = allMembersStr.slice(relNonDefaultStart+1, relNonDefaultStart+nonDefaultStr.length-1)
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
                    // current index
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
                    defaultMembers.count ++;
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
        const moduleStr = {};

        // find the position of the module string
        moduleStr.start = statement.indexOf(module);
        moduleStr.end = moduleStr.start + module.length;
        moduleStr.name = code.slice(moduleStr.start+1, moduleStr.end-1).split("/").at(-1);
        moduleStr.quotes = code.charAt(moduleStr.start);
        moduleStr.type = "string";

        // store the first separator of the non default
        // and default members for a consistent style
        // if one wants to add members
        defaultMembers.separator = (defaultMembers.entities.length > 1) ? code.slice(defaultMembers.entities[0].absEnd, defaultMembers.entities[0].next) : ", ";
        members.separator = (members.entities.length > 1) ? code.slice(members.entities[0].absEnd, members.entities[0].next) : ", ";

        // make a new unit
        const unit = {
            code: new MagicString__default["default"](code),
            defaultMembers,
            members,
            module: moduleStr,
            start,
            end,
            get codeString() {
                return [ this.code.toString() ];
            }
        };

        return unit;
    }

    /**
     * Collect all es6 imports from a source code.
     * Destructure the string, and store the findings
     * in an object which gets stored in the class
     * instance.
     */
    getES6Imports() {
        
        const es6ImportCollection = this.blackenedCode.matchAll(/import\s+(?:([\w*{},\s]+)from\s+)?(\-+);?/g);
        // match[0]: the complete import statement
        // match[1]: the member part of the statement (may be empty)
        // match[2]: the module part
        
        let id = this.imports.es6.idScope;
        let next = es6ImportCollection.next();
        let index = 0;
        
        while (!next.done) {
            this.imports.es6.count ++;

            const match = next.value;

            const start = match.index;
            const end = start + match[0].length;

            // get the equivalent string from the 
            // original code
            const code = this.code.slice(start, end);

            const unit = this.es6StrToObj(code, start, end, ...match);
            
            unit.type = "es6";
            unit.id = id++;
            unit.index = index ++;
            unit.hash = this.#makeHash(unit);

            // push the fresh unit to es6 unit array
            this.imports.es6.units.push(unit);
            
            next = es6ImportCollection.next();
        }
        this.imports.es6.searched = true;
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
        unit.methods = new ImportManagerUnitMethods(unit, this.es6StrToObj);

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
            

            if (!("units" in options) || "debug" in options) {
                if (options.debug === "import") {
                    importManager.logImportObject();
                } else {
                    importManager.logUnits();
                }            } else if (options.units) {
                
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
                    
                    if ("actions" in unitSection) {

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

exports.manager = manager;
//# sourceMappingURL=import-manager.cjs.map
