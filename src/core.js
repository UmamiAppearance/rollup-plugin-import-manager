import ImportManagerUnitMethods from "./unit-methods.js";
import { DebuggingError, MatchError } from "./errors.js";
import { parse } from "acorn";
import { full as fullWalk } from "acorn-walk"; 
import MagicString from "magic-string";
import { bold, yellow } from "colorette";


/**
 * The plugins core class. It handles the 
 * code analysis, creates units from import
 * statements, attaches methods to the units
 * and more.
 */
export default class ImportManager {

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

        this.candidates = {
            "cjs": [],
            "dynamic": [],
            "es6": []
        };
        this.code = new MagicString(source);
        this.parsedCode = parse(source, {
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

        // new way

        this.candidates.es6 = this.parsedCode.body.filter(b => b.type === "ImportDeclaration");
        
        const others = this.parsedCode.body.filter(b =>
            b.type === "VariableDeclaration" ||
            b.type === "ExpressionStatement"
        );

        const searchCJS = !this.candidates.es6.length;
        
        for (const node of others) {
            fullWalk(node, n => {
                console.log(n.name);
                if (n.type === "ImportExpression") {
                    this.candidates.dynamic.push(node);
                } else if (searchCJS && n.name === "require") {
                    this.candidates.cjs.push(node);
                }
            });
        }

        console.log("ES6 >>> ", this.candidates.es6);
        console.log("DYNAMIC >>> ", this.candidates.dynamic);
        console.log("CJS >>> ", this.candidates.cjs);

        // new end


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
            code: new MagicString(code),
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
        const es6ImportCollection = this.blackenedCode.matchAll(/import\s+(?:([\w*{},\s]+)from\s+)?(-+);?/g);

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
            code: new MagicString(code),
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
            bold(yellow(`(!) (plugin ImportManager) ${msg}`))
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

