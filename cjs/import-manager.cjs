'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var pluginutils = require('@rollup/pluginutils');
var acorn = require('acorn');
var acornWalk = require('acorn-walk');
var MagicString = require('magic-string');
var colorette = require('colorette');
var diff = require('diff');

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
    constructor(message, key="imports") {
        super("You can find information above ^");
        this.name = "DebuggingError";
        console.log(key, message);
    }
}

/**
 * Creates methods for unit manipulation to
 * be attached to a requested unit.
 */
class ImportManagerUnitMethods {

    /**
     * Stores the handed over unit and creates
     * an update method.
     * @param {Object} unit - The unit a user requests 
     * @param {*} es6StrToObj - Method to analyze a 
     */
    constructor(unit, es6StrToObj) {
        this.unit = unit;

        // After a change in the code of a es6 unit is made
        // it gets analyzed again, which is very verbose,
        // but prevents errors. The "MagicString" does not
        // contain multiple changes at a time. The analysis
        // function is the same as for the initial file
        // analyses and gets handed over by the main class.

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
                this.unit.code.slice(this.unit.module.start, this.unit.module.end)
            );

            Object.assign(this.unit, unit);

        };
    }


    /**
     * Makes sure, that the processed unit is of type 'es6'. 
     */
    #ES6only() {
        if (this.unit.type !== "es6") {
            throw new Error("This method is only available for ES6 imports.");
        }
    }


    /**
     * Changes the module part of a import statement.
     * @param {string} name - The new module part/path.
     * @param {*} modType - Module type (sting|literal).
     */
    renameModule(name, modType) {
        if (modType === "string") {
            const q = this.unit.module.quotes;
            name = q + name + q;
        } else if (modType !== "literal") {
            throw new TypeError(`Unknown modType '${modType}'. Valid types are 'string' and 'literal'.`);
        }
        
        this.unit.code.overwrite(this.unit.module.start, this.unit.module.end, name);

        if (this.unit.type === "es6") {
            this.updateUnit();
        }
    }


    /**
     * Adds default members to the import statement.
     * @param {string[]} names - A list of default members to add.
     */
    addDefaultMembers(names) {
        this.#ES6only();

        let start; 
        let defStr;
        let memberPart = null;

        // handle the case if default members already exist
        if (this.unit.defaultMembers.count > 0) {
            start = this.unit.defaultMembers.entities.at(-1).absEnd;
            defStr = this.unit.defaultMembers.separator 
                   + names.join(this.unit.defaultMembers.separator);
            this.unit.code.appendRight(start, defStr);
        }

        // handle the case if default members do not exist, 
        // and also no non default members (the addition
        // needs to be appended left, otherwise is
        // interferes with the module part)
        else if (this.unit.members.count === 0) {
            start = this.unit.module.start;
            defStr = names.join(this.unit.members.separator);
            memberPart = defStr;
            defStr += " from ";
            this.unit.code.appendLeft(start, defStr);
        }

        // handle the case if default members do not exist, 
        // but non default members
        else {
            start = this.unit.members.start;
            defStr = names.join(this.unit.defaultMembers.separator)
                   + this.unit.members.separator;
            this.unit.code.appendRight(start, defStr);
        }
        
        this.updateUnit(memberPart);
    }


    /**
     * Adds non default members to the import statement.
     * @param {string[]} names - A list of members to add. 
     */
    addMembers(names) {
        this.#ES6only();

        let start; 
        let memStr;
        let memberPart = null;
        
        // handle the case if members already exist
        if (this.unit.members.count > 0) {
            start = this.unit.members.entities.at(-1).absEnd;
            memStr = this.unit.members.separator 
                   + names.join(this.unit.members.separator);
            this.unit.code.appendRight(start, memStr);
        }

        // handle the case if members do not exist, 
        // and also no default members (the addition
        // needs to be appended left, otherwise is
        // interferes with the module part)
        else if (this.unit.defaultMembers.count === 0) {
            start = this.unit.module.start;
            memStr = "{ "
                   + names.join(this.unit.members.separator)
                   + " }";
            memberPart = memStr;
            memStr += " from ";
            this.unit.code.appendLeft(start, memStr);
        }

        // handle the case if members do not exist, 
        // but default members
        else {
            start = this.unit.defaultMembers.end;
            memStr = this.unit.defaultMembers.separator
                   + "{ "
                   + names.join(this.unit.members.separator)
                   + " }";
            this.unit.code.appendRight(start, memStr);
        }

        this.updateUnit(memberPart);
    }


    /**
     * Internal helper method to get the member type.
     * The user input distinguishes between member/defaultMember
     * and the plural versions of them. To prevent confusion in the
     * process of selecting the different styles in the unit, this
     * methods adds an "s" to the given string if missing and selects
     * the requested type.
     * @param {*} memberType 
     * @returns 
     */
    #getType(memberType) {
        if (memberType.at(-1) !== "s") {
            memberType += "s";
        }
        return this.unit[memberType];
    }


    /**
     * Internal helper method to find a specific member
     * or default member.
     * @param {string} memberType - member/defaultMember. 
     * @param {string} name - (default) member name. 
     * @returns {Object} - (default) member object.
     */
    #findMember(memberType, name) {
        if (!name) {
            throw new Error(`${memberType} name must be set.`);
        }
        const filtered = this.#getType(memberType).entities.filter(m => m.name === name);
        if (filtered.length !== 1) {
            throw new MatchError(`Unable to locate ${memberType} with name '${name}'`);
        }
        return filtered[0];
    }


    /**
     * Removes a (default) member.
     * @param {string} memberType - member|defaultMember
     * @param {string} name - Name of the (default) member 
     */
    removeMember(memberType, name) {
        this.#ES6only();

        const member = this.#findMember(memberType, name);

        if (this.#getType(memberType).count === 1) {
            this.removeMembers(memberType);
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


    /**
     * Removes an entire group of members or default members.
     * @param {string} membersType - member(s)|defaultMember(s) 
     */
    removeMembers(membersType) {
        this.#ES6only();

        const isDefault = membersType.indexOf("default") > -1;

        const members = this.#getType(membersType);
        const others = this.#getType(isDefault ? "members" : "defaultMembers");

        let memberPart = null;
        if (others.count > 0) {
            
            const start = !isDefault 
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


    /**
     * Renames a single (default) member. The alias
     * can be kept or overwritten. 
     * @param {string} memberType - member|defaultMember 
     * @param {string} name - The (default) member to rename.
     * @param {string} newName - The new name of the (default) member.
     * @param {boolean} keepAlias - True if the alias shall be untouched. 
     */
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


    /**
     * Changes the alias. Changing can be renaming
     * setting it initially or removing. 
     * @param {string} memberType - member|defaultMember
     * @param {string} name - (default) member name
     * @param {string} [set] - A new name or nothing for removal
     */
    setAlias(memberType, name, set) {
        const aliasStr = set ? `${name} as ${set}` : name;
        this.renameMember(memberType, name, aliasStr, false);
        this.updateUnit();
    }


    /**
     * Method to call after a unit was completely removed
     * or replaced, to prevent matching it again afterwards.
     */
    makeUntraceable() {
        this.unit.id = `(deleted) ${this.unit.id}`;
        this.unit.hash = `(deleted) ${this.unit.hash}`;
        this.unit.module.name = `(deleted) ${this.unit.module.name}`;
    }


    /**
     * Debugging method to stop the building process
     * and list this unit properties.
     */
    log() {
        const unit = { ...this.unit };
        delete unit.methods;
        unit.code = [ unit.code.toString() ];
        throw new DebuggingError(JSON.stringify(unit, null, 4), "unit");
    }
}

/**
 * The plugins core class. It handles the 
 * code analysis, creates units from import
 * statements, attaches methods to the units
 * and more.
 */
class ImportManager {

    /**
     * The constructor creates a class import
     * object and kicks of the code analysis.
     * @param {string} source - The unmodified source code-
     * @param {string} filename - The filename of the input file.  
     * @param {object} warnSpamProtection - A Set which contains all previously printed warning hashes. 
     * @param {boolean} [autoSearch=true] - Automatic code analysis can be disabled by passing "false". 
     */
    constructor(source, filename, warnSpamProtection, autoSearch=true) {

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
        this.parsedCode = acorn.parse(source, {
            ecmaVersion: "latest",
            sourceType: "module"
        });
        this.blackenedCode = this.prepareSource();
        this.hashList = {};
        this.filename = filename;
        this.warnSpamProtection = warnSpamProtection;

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
            /(["'])(?:\\\1|.)*?\1/g
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
     * @returns {string} - a hash as a string 
     */
    #makeHash(unit) {

        const makeInput = (unit) => {
            
            const getProps = list => {
                list.forEach(member => {
                    input += member.name;
                    if (member.alias) {
                        input += member.alias.name;
                    }
                });
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

        // handle duplicates (which should not exist in reality)
        if (hash in this.hashList) {
            this.warning(`It seems like there are multiple imports of module '${unit.module.name}'. You should examine that.`);
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
     * Method to generate a unit object from a
     * ES6 Import Statement.
     * @param {string} code - The complete import statement. 
     * @param {number} start - Start index of the source code file.
     * @param {number} end - End index of the source code file. 
     * @param {string} statement - The complete statement from the regex match in the prepared source code.  
     * @param {string} memberPart - The member part (default and non default).
     * @param {string} module - The module part. 
     * @returns {Object} - Unit Object.
     */
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
            end
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
        const otherImports = this.parsedCode.body.filter(b => b.type === "ImportDeclaration");
        console.log(JSON.stringify(otherImports, null, 4));
        const es6ImportCollection = this.blackenedCode.matchAll(/import\s+(?:([\w*{},\s]+)from\s+)?(-+);?/g);
        const b = [];
        acornWalk.simple(this.parsedCode, {
            ImportSpecifier(node) {
                b.push(node);
            }
        });

        console.log("bbbbb", b);

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

        // if the type is not specified use all types (cjs|dynamic|es6)
        if (!type) {
            type = Object.keys(this.imports);
        } else if (!Array.isArray(type)) {
            type = [type];
        }

        // if an empty array was passed, also use all types
        if (!type.length) {
            type = Object.keys(this.imports);
        }

        // test types for validity
        for (const t of type) {
            if (!(t in this.imports)) {
                throw new TypeError(`Invalid type: '${t}' - Should be one or more of: 'cjs', 'dynamic', 'es6'.`);
            }

            // push all available imports in one list
            if (this.imports[t].count > 0) {
                unitList.push(...this.imports[t].units);
            }
        }

        // filter for unit name
        const units = unitList.filter(unit => {
            const match = unit.module.name.indexOf(name) > -1;

            // ignore deleted units
            if (match && unit.module.name.match(/^\(deleted\)/)) {
                return false;
            }

            return match;
        });

        // throw errors if the match is not one
        // (if no filename was set a null match
        // is also valid)
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

        // finally add methods for manipulation to the unit
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
        
        // get the type by the id scope
        const type = this.idTypes[ Math.floor(id / this.scopeMulti) * this.scopeMulti ];

        // if it is not possible to extract a type by the scope,
        // the id is invalid 
        if (!type) {
            // generate an ascending list of valid ids
            const ascIds = Object.keys(this.idTypes).sort();
            throw new TypeError(`Id '${id}' is invalid. Ids range from ${ascIds.at(0)} to ${ascIds.at(-1)}+`);
        }

        // filter the units of the given type for the id
        const units = this.imports[type].units.filter(n => n.id == id);

        // if null matches are allowed return null 
        // if no match was found, otherwise raise
        // a match error
        if (units.length === 0) {
            if (allowNull) {
                return null;
            }
            let msg = this.#listUnits(this.imports[type].units);
            msg += `___\nUnable to locate import statement with id: '${id}'`;
            throw new MatchError(msg);
        }

        // add unit methods
        const unit = units[0];
        unit.methods = new ImportManagerUnitMethods(unit, this.es6StrToObj);

        return unit;
    }

    /**
     * Selects a unit by its hash. The hash will change
     * if the unit changes its properties in the source
     * code (like members, alias, etc.)
     * All hashes for one file are stored in a list, with
     * the corresponding id. The id-match method can there-
     * fore be used, to find the unit.
     * @param {string} hash - The hash string of the unit. 
     * @returns {object} - An explicit unit.
     */
    selectModByHash(hash, allowNull) {
        if (!(hash in this.hashList)) {
            if (allowNull) {
                return null;
            }
            let msg = this.#listAllUnits(); 
            msg += `___\nUnable to locate import statement with hash '${hash}'`;
            throw new MatchError(msg);
        }

        return this.selectModById(this.hashList[hash]);
    }

    //         ___________________________________________        //
    //         methods for unit creation, replacement, etc.       //

    /**
     * Makes sure, that the processed unit is of type 'es6'.
     * @param {Object} unit - Unit Object. 
     */
    #ES6only(unit) {
        if (unit.type !== "es6") {
            throw new Error("This method is only available for ES6 imports.");
        }
    }

    
    /**
     * All manipulation via unit method is made on the
     * code slice of the unit. This methods writes it
     * to the code instance. 
     * @param {Object} unit - Unit Object. 
     */
    commitChanges(unit) {
        this.code.overwrite(unit.start, unit.end, unit.code.toString());
    }


    /**
     * Removes a unit from the code instance.
     * The action must not be committed. 
     * @param {Object} unit - Unit Object.
     */
    remove(unit) {
        this.#ES6only(unit);

        const charAfter = this.code.slice(unit.end, unit.end+1);
        const end = (charAfter === "\n") ? unit.end + 1 : unit.end;
        this.code.remove(unit.start, end);
        unit.methods.makeUntraceable();
        this.imports[unit.type].count --;
    }


    /**
     * Generates an ES6 Import Statement.
     * @param {string} module - Module (path).
     * @param {string[]} defaultMembers - Default Member Part.
     * @param {string[]} members - Member Part.
     * @returns {string} - ES6 Import Statement.
     */
    makeES6Statement(module, defaultMembers, members) {
        const memberStrArray = [];
        
        if (defaultMembers.length) {
            memberStrArray.push(
                defaultMembers.join(", ")
            );
        }

        if (members.length) {
            memberStrArray.push(
                "{ " + members.join(", ") + " }"
            );
        }

        let memberPart = memberStrArray.join(", ");
        if (memberPart) {
            memberPart += " from ";
        }

        return `import ${memberPart}'${module}';\n`;
    }


    /**
     * Inserts an ES6 Import Statement to the top
     * of the file or after the last found import
     * statement.
     * @param {string} statement - ES6 Import Statement.
     * @param {number} pos - 'top' or 'bottom'
     */
    insertStatement(statement, pos) {

        let index = 0;

        if (pos !== "top" && this.imports.es6.count > 0) {
            index = this.imports.es6.units.at(-1).end;
            if (this.code.slice(index, index+1) === "\n") {
                index ++;
            }
        } else {
            // find description part if present and
            // move the index
            const description = this.code.toString().match(/^\s*?\/\*[\s\S]*?\*\/\s?/);
            if (description) {
                index += description[0].length;
            }
        }
        
        this.code.appendRight(index, statement);
    }


    /**
     * Inserts an ES6 Import Statement before or after
     * a given unit. Also an existing statement can be
     * replaced.
     * @param {Object} unit - Unit Object 
     * @param {string} mode - 'append'|'prepend'|'replace' 
     * @param {string} statement - ES6 Import Statement. 
     */
    insertAtUnit(unit, mode, statement) {
        this.#ES6only(unit);
        
        let index;
        if (mode === "append") {
            index = unit.end;
            if (this.code.slice(index, index+1) === "\n") {
                index ++;
            }
            this.code.appendRight(index, statement);
        }
        
        else if (mode === "prepend") {
            index = unit.start;
            this.code.prependLeft(index, statement);
        }

        else if (mode === "replace") {
            // remove new line from statement
            statement = statement.slice(0, -1);
            
            this.code.overwrite(unit.start, unit.end, statement);
            unit.methods.makeUntraceable();
            this.imports[unit.type].count --;
        }
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
     * and list the complete import object.
     */
    logUnitObjects() {
        const imports = {...this.imports};
        for (const key in imports) {
            imports[key].units.forEach(unit => {
                unit.code = [ unit.code.toString() ];
            });
        }
        throw new DebuggingError(JSON.stringify(imports, null, 4));
    }


    /**
     * Bold, yellow warning messages in the mould
     * of rollup warnings. With spam protection.
     * @param {string} msg - Warning Message. 
     */
    warning(msg) {
        const hash = simpleHash(msg);

        if (this.warnSpamProtection.has(hash)) {
            return;
        }

        this.warnSpamProtection.add(hash);

        console.warn(
            colorette.bold(colorette.yellow(`(!) (plugin ImportManager) ${msg}`))
        );
    }
}


/**
 * A (simple as it gets) hash from string function.
 * @see https://gist.github.com/iperelivskiy/4110988?permalink_comment_id=2697447#gistcomment-2697447
 * @see https://gist.github.com/badboy/6267743#knuths-multiplicative-method
 * @param {string} input 
 * @returns {number} - Hash number.
 */
const simpleHash = (input) => {
    let h = 0xdeadbeef;
    for (let i=0; i<input.length; i++) {
        h = Math.imul(h ^ input.charCodeAt(i), 2654435761);
    }
    return (h ^ h >>> 16) >>> 0;
};

/**
 * Adds an angle bracket to each line of a
 * text section.
 * @param {string} angle - '>' or '<'
 * @param {string} txt - The text section.
 * @returns {string} - The given text section with an angle bracket and a space in front of each line. 
 */
const addAngles = (angle, txt) => {
    const txtArr = txt.split("\n");
    let lastChar = "";
    if (txt.at(-1) === "\n") {
        lastChar = "\n";
        txtArr.pop();
    }
    let output = txtArr.map(line => `${angle} ${line}`).join("\n");
    output += lastChar;
    return output;
};


/**
 * Prints an output in the mould of GNU diff when
 * called with no parameters other than the files.
 * But more picturesque, thanks to red and green
 * colors...
 * Also possible is a "file" mode. This variant
 * shows the whole file with added and removed
 * lines.
 * @param {string} source - The original code.
 * @param {string} code - The modified code.
 * @param {string} [diffOption] - As passed by the user. If the value is 'file' also unchanged code is printed.  
 */
const showDiff = (filename, source, code, diffOption) => {
    const fileMode = diffOption == "file";
    console.log(code);

    console.log(colorette.bold(colorette.blue(
        `(plugin ImportManager) diff for file '${filename}':`
    )));
    
    console.log(colorette.gray("BEGIN >>>"));

    if (fileMode) {
        const diff$1 = diff.diffLines(source, code);
        
        diff$1.forEach((part) => {
            let msg;
            if (part.added) {
                msg = colorette.green(addAngles(">", part.value));
            } else if (part.removed) {
                msg = colorette.red(addAngles("<", part.value));
            } else {
                msg = part.value;
            }
            process.stdout.write(msg);
        });
        process.stdout.write("\n");
    
    }
        
    else {
        const diff$1 = diff.structuredPatch("", "", source, code, "", "", {
            context: 0
        });
        
        for (const part of diff$1.hunks) {

            // add
            if (part.oldLines === 0) {
                let info = `${part.oldStart}a${part.newStart}`;
                if (part.newLines > 1) {
                    info += `,${part.newStart+part.newLines-1}`;
                }
                console.log(colorette.bold(info));
                part.lines.forEach(line => console.log(colorette.green(`> ${line.slice(1)}`)));
            }
            
            // delete
            else if (part.newLines === 0) {
                let info = String(part.oldStart);
                if (part.oldLines > 1) {
                    info += `,${part.oldStart+part.oldLines-1}`;
                }
                info += `d${part.newLines}`;
                console.log(colorette.bold(info));
                part.lines.forEach(line => console.log(colorette.red(`< ${line.slice(1)}`)));
            }
            
            // change
            else {
                let info = String(part.oldStart);
                if (part.oldLines > 1) {
                    info += `,${part.oldStart+part.oldLines-1}`;
                }
                info += `c${part.newStart}`;
                if (part.newLines > 1) {
                    info += `,${part.newStart+part.newLines-1}`;
                }
                console.log(colorette.bold(info));
                
                let plus = false;
                part.lines.forEach((line, i) => {
                    if (plus) {
                        console.log(colorette.green(`> ${line.slice(1)}`));
                    } else {
                        console.log(colorette.red(`< ${line.slice(1)}`));
                        if (part.lines[i+1].at(0) === "+") {
                            console.log("---");
                            plus = true;
                        }
                    }
                });
            }
        }
    }
     
    console.log(colorette.gray("<<< END\n"));
};

/**
 * [rollup-plugin-import-manager]{@link https://github.com/UmamiAppearance/rollup-plugin-import-manager}
 *
 * @version 0.1.0
 * @author UmamiAppearance [mail@umamiappearance.eu]
 * @license MIT
 */

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
};

// makes the life of the user a little bit easier
// by accepting multiple versions of boolean vars 
const bool = (b) => !(Boolean(b) === false || String(b).match(/^(?:false|no?|0)$/, "i"));

// allow some variations to enable object mode 
// for debugging
const showObjects = (v) => Boolean(String(v).match(/^(?:objects?|imports?|verbose)$/));


// main
const importManager = (options={}) => {

    const filter = pluginutils.createFilter(options.include, options.exclude);

    // Initialize a new set to be passed to every 
    // ImportManager instance. It keeps track of
    // warnings, that were shown already.
    const warnSpamProtection = new Set();
  
    return {
        name: "ImportManager",
    
        transform (source, id) {
            if (!filter(id)) return;

            const manager = new ImportManager(source, id, warnSpamProtection);       

            if (!("units" in options) || "debug" in options) {
                if (showObjects(options.debug)) {
                    manager.logUnitObjects();
                } else {
                    manager.logUnits();
                }
            }
            
            else {

                for (const unitSection of ensureArray(options.units)) {

                    let allowId = false; 
                    let allowNull = true;

                    if ("file" in unitSection) {
                        const isMatch = pluginutils.createFilter(unitSection.file);

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
                        }
                    
                        return unit;
                    };

                    
                    // creating units from scratch
                    if ("createModule" in unitSection) {

                        if (allowNull) {
                            manager.warning("No file specified for import statement creation! If the build fails, this could be the reason.");
                        }

                        const module = unitSection.createModule;
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
                            }
                        }

                        const statement = manager.makeES6Statement(module, mem.defaultMembers, mem.members);
                        
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
                                manager.insertAtUnit(target, mode, statement);
                            }
                        }

                        else {
                            manager.insertStatement(statement, unitSection.insert);
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

exports.importManager = importManager;
//# sourceMappingURL=import-manager.cjs.map
