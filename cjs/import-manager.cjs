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
     * @param {*} es6NodeToUnit - Method to analyze a 
     */
    constructor(unit, es6NodeToUnit) {
        this.unit = unit;

        // After a change in the code of a es6 unit is made
        // it gets analyzed again, which is very verbose,
        // but prevents errors. The "MagicString" does not
        // contain multiple changes at a time. The analysis
        // function is the same as for the initial file
        // analyses and gets handed over by the main class.

        this.updateUnit = () => {

            const unit = es6NodeToUnit(
                this.unit.code.toString(),
                this.unit.start,
                this.unit.end
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
    constructor(source, filename, warnSpamProtection) {

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

        this.hashList = {};
        this.filename = filename;
        this.warnSpamProtection = warnSpamProtection;
        this.parsedCode = acorn.parse(source, {
            ecmaVersion: "latest",
            sourceType: "module"
        });
        this.blackenedCode = this.prepareSource();
    }


    /**
     * TODO: -
     */
    prepareSource() {
  
        let cjsId = this.imports.cjs.idScope;
        let cjsIndex = 0;

        let dynamicId = this.imports.dynamic.idScope;
        let dynamicIndex = 0;

        let es6Id = this.imports.es6.idScope;
        let es6Index = 0;

        this.parsedCode.body.forEach(node => {

            if (node.type === "ImportDeclaration") {
                const unit = this.es6NodeToUnit(node);
                unit.id = es6Id ++;
                unit.index = es6Index ++;
                unit.hash = this.#makeHash(unit);
                this.imports.es6.units.push(unit);
                this.imports.es6.count ++;
            }
        
            else if (node.type === "VariableDeclaration" ||
                     node.type === "ExpressionStatement")
            {
                let prevPart;

                acornWalk.full(node, part => {
                    if (part.type === "ImportExpression") {
                        const unit = this.dynamicNodeToUnit(node, part);
                        unit.id = dynamicId ++;
                        unit.index = dynamicIndex ++;
                        unit.hash = this.#makeHash(unit);
                        this.imports.dynamic.units.push(unit);
                        this.imports.dynamic.count ++;
                    }
                    
                    else if (part.type === "Identifier" && part.name === "require") {
                        const unit = this.cjsNodeToUnit(node, prevPart);
                        unit.id = cjsId ++;
                        unit.index = cjsIndex ++;
                        unit.hash = this.#makeHash(unit);
                        this.imports.cjs.units.push(unit);
                        this.imports.cjs.count ++;
                    }

                    prevPart = part;
                });
            }
        });
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
                    inputStr += member.name;
                    if (member.alias) {
                        inputStr += member.alias.name;
                    }
                });
            }; 

            let inputStr = unit.module.name + unit.type;
            
            if (unit.members) {
                getProps(unit.members.entities);
            }

            if (unit.defaultMembers) {
                getProps(unit.defaultMembers.entities);
            }

            return inputStr + this.filename;
        };

        const input = makeInput(unit);
        let hash = String(simpleHash(input));

        // handle duplicates (which should not exist in reality)
        if (hash in this.hashList) {
            
            if (hash.slice(0, 3) !== "N/A") {
                this.warning(`It seems like there are multiple imports of module '${unit.module.name}'. You should examine that.`);
            }
            
            for (let nr=2;; nr++) {
                const nHash = `${hash}#${nr}`;
                if (!(nHash in this.hashList)) {
                    hash = nHash;
                    break;
                }
            }
        }
        
        this.hashList[hash] = unit.id;

        return hash;
    }


    /**
     * Method to generate a unit object from an acorn
     * node, originated from an ES6 Import Statement. 
     * @param {Object|string} node - acorn node or es6 import statement string. 
     * @param {number} [oStart] - For updating units the original start index has to be passed. 
     * @param {number} [oEnd] - For updating units the original end index has to be passed.
     * @returns 
     */
    es6NodeToUnit(node, oStart, oEnd) {

        let code;
        if (typeof node === "string") {
            code = node;
            node = acorn.parse(node, {
                ecmaVersion: "latest",
                sourceType: "module"
            }).body.at(0);
        } else {
            code = this.code.slice(node.start, node.end);
        }
        
        const mem = {
            defaultMembers: {
                count: 0,
                entities: []
            },
            members: {
                count: 0,
                entities: []
            }
        };

        if (node.specifiers) {
            for (const spec of node.specifiers) {
                
                const memType = spec.type === "ImportSpecifier" ? "members" : "defaultMembers";
                const index = mem[memType].count;
                const hasAlias = spec.local.start !== spec.start;

                const start = spec.start - node.start;
                let end;
                if (!hasAlias) {
                    end = spec.end - node.start;
                } else {
                    end = (memType === "members") ? spec.imported.end-node.start : start+1;
                }
                const name = code.slice(start, end);
                

                const member = {
                    index,
                    name,
                    start,
                    end,
                    absEnd: spec.end - node.start
                };

                if (hasAlias) {
                    member.alias = {
                        name: spec.local.name,
                        start: spec.local.start - node.start,
                        end: spec.local.end - node.start
                    };
                }

                if (index > 0) {
                    member.last = mem[memType].entities[index-1].absEnd;
                    mem[memType].entities[index-1].next = member.start;
                }
                
                mem[memType].entities.push(member);
                mem[memType].count ++;

            }
        }

        if (mem.members.count > 0) {
            const nonDefaultMatch = code.match(/{[\s\S]*?}/);
            mem.members.start = nonDefaultMatch.index;
            mem.members.end = mem.members.start + nonDefaultMatch.at(0).length;    
        }

        if (mem.defaultMembers.count > 0) {
            mem.defaultMembers.start = mem.defaultMembers.entities.at(0).start;
            mem.defaultMembers.end = (mem.members.count > 0)
                ? mem.members.start
                : mem.defaultMembers.entities.at(-1).absEnd;  
        }

        // store the first separator of the non default
        // and default members for a consistent style
        // if one wants to add members
        mem.defaultMembers.separator = (mem.defaultMembers.count > 1) ? code.slice(mem.defaultMembers.entities[0].absEnd, mem.defaultMembers.entities[0].next) : ", ";
        mem.members.separator = (mem.members.count > 1) ? code.slice(mem.members.entities[0].absEnd, mem.members.entities[0].next) : ", ";


        const module = {
            name: node.source.value.split("/").at(-1),
            start: node.source.start - node.start,
            end: node.source.end - node.start,
            quotes: node.source.raw.at(0),
            type: "string"
        };

        
        const unit = {
            code: new MagicString__default["default"](code),
            defaultMembers: mem.defaultMembers,
            members: mem.members,
            module,
            start: oStart || node.start,
            end: oEnd || node.end,
            type: "es6"
        };

        return unit;
    }


    dynamicNodeToUnit(node, importObject) {

        const code = this.code.slice(node.start, node.end);

        const module = {
            name: importObject.source.value || "N/A",
            start: importObject.source.start - node.start,
            end: importObject.source.end - node.start
        };

        if (importObject.source.type === "Literal") {
            module.type = "string";
            module.quotes = importObject.source.raw.at(0);
        } else {
            module.type = "literal";
        }

        const unit = {
            code: new MagicString__default["default"](code),
            module,
            start: node.start,
            end: node.end,
            type: "dynamic",
        };

        console.log("DYN_UNIT: ", unit);
        return unit;
    }


    cjsNodeToUnit(node, modulePart) {

        const code = this.code.slice(node.start, node.end);

        const module = {
            name: modulePart.name,
            start: modulePart.start - node.start,
            end: modulePart.end - node.start
        };

        const unit = {
            code: new MagicString__default["default"](code),
            module,
            start: node.start,
            end: node.end,
            type: "cjs",
        };

        return unit;
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
        unit.methods = new ImportManagerUnitMethods(unit, this.es6NodeToUnit);

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
        unit.methods = new ImportManagerUnitMethods(unit, this.es6NodeToUnit);

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
        const charAfter = this.code.slice(unit.end, unit.end+1);
        const end = (charAfter === "\n") ? unit.end + 1 : unit.end;
        this.code.remove(unit.start, end);
        unit.methods.makeUntraceable();
        this.imports[unit.type].count --;
    }

    /**
     * Helper method to declare a variable.
     * @param {string} declarator - const|let|var|global 
     * @param {string} varname - Variable Name. 
     * @returns {string} - Declarator + Varname + Equal Sign.
     */
    #genDeclaration(declarator, varname) {
        let declaration;
        if (declarator === "global") {
            declaration = varname;
        } else {
            declaration = `${declarator} ${varname}`;
        }
        return declaration;
    }

    /**
     * Generates a CJS Import Statement.
     * @param {string} module - Module (path).
     * @returns {string} - CJS Import Statement.
     */
    makeCJSStatement(module, declarator, varname) {
        const declaration = this.#genDeclaration(declarator, varname);
        return `${declaration} = require("${module}");\n`;
    }

    /**
     * Generates a Dynamic Import Statement.
     * @param {string} module - Module (path).
     * @returns {string} - CJS Import Statement.
     */
    makeDynamicStatement(module, declarator, varname) {
        const declaration = this.#genDeclaration(declarator, varname);
        return `${declaration} = await import("${module}");\n`;
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

            // move the index if the following char is a newline
            // (if the line was removed in an earlier operation
            // this will throw an error, don't do any change in
            // this case

            let nextChar;
            try {
                nextChar = this.code.slice(index, index+1);
            } catch {
                nextChar = null;
            }

            if (nextChar === "\n") {
                index ++;
            }
        }
        
        else {
            // find the first meaningful (not a comment)
            // code and use the start as insertion point
            
            index = this.parsedCode.body.at(0).start;
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
                    if ("createModule" in unitSection || "addCode" in unitSection) {

                        let codeSnippet;

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
                                    throw new TypeError("dynamic and cjs imports require a valid declarator key (const|let|var|global) and a valid value for the variable name.");
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
                            
                            // insert if match is found
                            // (which can be undefined if no file specified)
                            if (target) {
                                manager.insertAtUnit(target, mode, codeSnippet);
                            }
                        }

                        else {
                            manager.insertStatement(codeSnippet, unitSection.insert);
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
