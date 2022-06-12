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

    hello() {
        console.log("hello");
    }

    remove() {
        if (this.unit.type !== "es6") {
            throw new Error("ES6 only!");
        }

        this.unit.code.remove(this.unit.start, this.unit.end);
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
                idScope: 1 * this.scopeMulti,
                searched: false,
                units: []
            },
            dynamic: {
                idScope: 2 * this.scopeMulti,
                searched: false,
                units: []
            },
            cjs: {
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
                getProps(unit.members);
            }

            if (unit.defaultMembers) {
                getProps(unit.defaultMembers);
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
        this.imports.es6.count = 0;
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
            const members = [];
            const defaultMembers = [];
            const memberStr = match[1] ? match[1].trim() : null;
            
            if (memberStr) {
                // find position of all members
                const memberStrStart = code.indexOf(memberStr);

                // initialize default string
                let defaultStr = null;

                // but begin with non default members, those
                // are addressed by looking for everything between
                // the curly braces (if present)
                const nonDefaultMatch = memberStr.match(/{[\s\S]*?}/);
                
                if (nonDefaultMatch) {
                    const nonDefaultStart = nonDefaultMatch.index;
                    let nonDefaultStr = nonDefaultMatch[0];

                    if (nonDefaultStart > 0) {
                        defaultStr = memberStr.slice(0, nonDefaultMatch.index);
                    }

                    // split the individual members
                    const m = memberStr.slice(nonDefaultStart+1, nonDefaultStart+nonDefaultStr.length-2)
                                       .split(",")
                                       .map(m => m.trim())
                                       .filter(m => m);
                    
                    // get the position of each of each member 
                    let searchIndex = 0;
                    m.forEach((member, index) => {
                        const memberPos = nonDefaultStr.indexOf(member, searchIndex);
                        
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
                                start: memberStrStart + nonDefaultStart + memberPos + aliasStart,
                                end: memberStrStart + nonDefaultStart + memberPos + member.length
                            };
                        } else {
                            newMember.name = name;
                            len = member.length;
                        }
                        newMember.start = memberStrStart + nonDefaultStart + memberPos;
                        newMember.end = newMember.start + len;
                        newMember.absEnd = newMember.start + member.length;
                        newMember.index = index;

                        // store the current member start as
                        // a property of the last and the last
                        // member end as a property of the 
                        // current
                        if (index > 0) {
                            newMember.last = members[index-1].absEnd;
                            members[index-1].next = newMember.start;
                        }

                        members.push(newMember);

                        // raise the search index by the length
                        // of the member to ignore the current
                        // member in the next round
                        searchIndex = memberPos + member.length;
                    });
                }
                
                // if no non default members were found
                // the default member string is the whole
                // member string 
                else {
                    defaultStr = memberStr;
                }

                // if a default str is present process
                // it similarly to the non default members
                if (defaultStr) {
                    const dm = defaultStr.split(",")
                                          .map(m => m.trim())
                                          .filter(m => m);
                    
                    let searchIndex = 0;
                    dm.forEach((defaultMember, index) => {
                        const defaultMemberPos = defaultStr.indexOf(defaultMember, searchIndex);
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
                                start: memberStrStart + defaultMemberPos + aliasStart,
                                end: memberStrStart + defaultMemberPos + defaultMember.length
                            };
                        } else {
                            newDefMember.name = name;
                            len = defaultMember.length;
                        }

                        newDefMember.start = memberStrStart + defaultMemberPos;
                        newDefMember.end = newDefMember.start + len;
                        newDefMember.absEnd = newDefMember.start + defaultMember.length;
                        newDefMember.index = index;

                        if (index > 0) {
                            newDefMember.last = defaultMembers[index-1].absEnd;
                            defaultMembers[index-1].next = newDefMember.start;
                        }

                        defaultMembers.push(newDefMember);
                        searchIndex = defaultMemberPos + len + 1;
                    });
                }
            }

            // create a fresh object for the current unit
            const module = {};

            // find the position of the module string
            module.start = match[0].indexOf(match[2]) + 1;
            module.end = module.start + match[2].length - 2;
            module.name = code.slice(module.start, module.end).split("/").at(-1);

            // store the first separator of the non default
            // and default members for a consistent style
            // if one wants to add members
            const sepDef = (defaultMembers.length > 1) ? code.slice(defaultMembers[0].absEnd, defaultMembers[0].next) : ", ";
            const sepMem = (members.length > 1) ? code.slice(members[0].absEnd, members[0].next) : ", ";

            // make a new unit
            const unit = {
                id: id++,
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
     #makeImport(type, match, id) {
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
        this.imports.dynamic.count = 0;
        let id = this.imports.dynamic.idScope;

        const dynamicImportCollection = this.blackenedCode.matchAll(/(import\s*?\(\s*?)(\S+)(?:\s*?\);?)/g);
        let next = dynamicImportCollection.next();

        while (!next.done) {
            this.imports.dynamic.count ++;
            this.#makeImport("dynamic", next.value, id++);
            next = dynamicImportCollection.next();
        }

        this.imports.dynamic.searched = true;
    }


    /**
     * Find all common js import statements in the 
     * (prepared) source code.
     */
    getCJSImports() {
        this.imports.cjs.count = 0;
        let id = this.imports.cjs.idScope;

        const cjsImportCollection = this.blackenedCode.matchAll(/(require\s*?\(\s*?)(\S+)(?:\s*?\);?)/g);
        let next = cjsImportCollection.next();

        while (!next.done) {
            this.imports.cjs.count ++;
            while (!next.done) {
                this.imports.dynamic.count ++;
                this.#makeImport("cjs", next.value, id++);
                next = cjsImportCollection.next();
            }
        } 

        this.imports.cjs.searched = true;
    }


    write() {
        
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
            unitList.push(...this.imports[t].units);
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

const manager = (options={}) => {
    console.log("options", options);

    const filter = pluginutils.createFilter(options.include, options.exclude);
  
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

exports.manager = manager;
