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

        this.code = new MagicString(source);

        this.hashList = {};
        this.filename = filename;
        this.warnSpamProtection = warnSpamProtection;
        
        this.parsedCode = parse(source, {
            ecmaVersion: "latest",
            sourceType: "module"
        });
        
        this.analyze();
    }


    /**
     * Analyzes the source and stores all import
     * statements as unit objects in the class 
     * variable "imports".
     */
    analyze() {
  
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
                fullWalk(node, part => {

                    if (part.type === "ImportExpression") {
                        const unit = this.dynamicNodeToUnit(node, part);
                        unit.id = dynamicId ++;
                        unit.index = dynamicIndex ++;
                        unit.hash = this.#makeHash(unit);
                        this.imports.dynamic.units.push(unit);
                        this.imports.dynamic.count ++;
                    }
                    
                    else if (part.type === "Identifier" && part.name === "require") {
                        const unit = this.cjsNodeToUnit(node);
                        unit.id = cjsId ++;
                        unit.index = cjsIndex ++;
                        unit.hash = this.#makeHash(unit);
                        this.imports.cjs.units.push(unit);
                        this.imports.cjs.count ++;
                    }

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
            
            const joinProps = list => {
                list.forEach(member => {
                    inputStr += member.name;
                    if (member.alias) {
                        inputStr += member.alias.name;
                    }
                });
            }; 

            let inputStr = unit.module.name
                         + unit.type
                         + this.filename;
            
            if (unit.members) {
                joinProps(unit.members.entities);
            }

            if (unit.defaultMembers) {
                joinProps(unit.defaultMembers.entities);
            }

            return inputStr;
        };

        const input = makeInput(unit);
        let hash = String(simpleHash(input));

        // handle duplicates
        if (hash in this.hashList) {
            
            if (unit.module.name !== "N/A") {
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
            node = parse(node, {
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
            type: "literal",
            quotes: node.source.raw.at(0)
        };

        
        const unit = {
            code: new MagicString(code),
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
            module.type = "raw";
        }

        const unit = {
            code: new MagicString(code),
            module,
            start: node.start,
            end: node.end,
            type: "dynamic",
        };

        return unit;
    }

    cjsNodeToUnit(node) {

        const code = this.code.slice(node.start, node.end);

        const modulePart = node.declarations.at(0).init.arguments.at(0); // TODO: test if this is robust
        const module = {
            name: modulePart.value || "N/A",
            start: modulePart.start - node.start,
            end: modulePart.end - node.start
        };

        if (modulePart.type === "Literal") {
            module.type = "string";
            module.quotes = modulePart.raw.at(0);
        } else {
            module.type = "raw";
        }

        const unit = {
            code: new MagicString(code),
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

