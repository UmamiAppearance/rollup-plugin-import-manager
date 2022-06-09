const source = `import name from "module-name";
import * as name from "module-name";import { member } from "module-name";
import { member as alias } from "module-name";
import { member1 , member2 } from "module-name";
import { member1, member2 as alias2, member3 as alias3 } from "module-name";
import defaultMember, { member, member2 } from "module-name";
import defaultMember,
       * as alias 
from "module-name"
import defaultMember from "module-name";

/* jdwjd\s*
oh boy */ import "module-name";

// goodbye

import
    { Base1 }
from
    "./src/base-ex.js";
const zzz = \`
import("NO");
\`
code 1
code 2
/* NO */ // ciao
code 3
/*
NO
*/ code4
code 5
const bumm = import(
    \`\${stuff} yegd\`
);

/* NO */ code 6 /* NO */ code + // nope
code 7
code 8 /*
NO */code 9
/* sdjiw */const x = import("./module-path");
// woaannsjfnfknjkews

require("fs");

import 
    defaultMember,
    {
        member1,
        member2,
        member3
    }
from "module-name";

import { stuff } from "../path/test-module.js";

const imp = import (
    "bullshit"
);

const y = "bdwi";

import("modulePath")
  .then(obj => <module object>)
  .catch(err => <loading error, e.g. if no such module>)

test = \`  'not me!' \`;

/*  // test */ boing
`

const MagicString = require("magic-string");

class ImportManager {

    constructor(autoSearch=true) {
        this.imports = {
            cjs: {
                searched: false,
                units: []
            },
            es6: {
                searched: false,
                units: []
            },
            dynamic: {
                searched: false,
                units: []
            }

        }

        this.code = new MagicString(source);
        this.blackenedCode = this.prepareSource();

        if (autoSearch) {
            this.getAllImports();
        }
    }

    #matchAndStrike(src, regex, nl=false) {
        
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
     * Collect all es6 imports from a source code.
     * Destructure the string, and store the findings
     * in an object which gets stored in the class
     * instance.
     */
    getES6Imports() {
        this.imports.es6.count = 0;
        let id = 1000;

        const es6ImportCollection = this.blackenedCode.matchAll(/import\s+(?:([\w*{},\s]+)from\s+)?(\-+);?/g);
        // match[0]: the complete import statement
        // match[1]: the member part of the statement (can be empty)
        // match[2]: the module part
        // found some inspiration here:
        // https://gist.githubusercontent.com/manekinekko/7e58a17bc62a9be47172/raw/6abd080c9d2b937a509ce85a72309b1eb2e5ddf1/regex-es6-imports.js
        
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
                    const m = memberStr.slice(nonDefaultStart+1, nonDefaultStart+nonDefaultStr.length-2)
                                       .split(",")
                                       .map(m => m.trim())
                                       .filter(m => m);
                    
                    let searchIndex = 0;
                    m.forEach((member, index) => {
                        const memberPos = nonDefaultStr.indexOf(member, searchIndex);
                        
                        let name = member;
                        let len;

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
                            }
                        } else {
                            newMember.name = name;
                            len = member.length;
                        }
                        newMember.start = memberStrStart + nonDefaultStart + memberPos;
                        newMember.end = newMember.start + len;
                        newMember.absEnd = newMember.start + member.length;
                        newMember.index = index;

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
                
                else {
                    defaultStr = memberStr;
                }

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
                            }
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

            const module = {}
            module.start = match[0].indexOf(match[2]) + 1;
            module.end = module.start + match[2].length - 2;
            module.name = code.slice(module.start, module.end).split("/").at(-1);

            const sepDef = (defaultMembers.length > 1) ? code.slice(defaultMembers[0].absEnd, defaultMembers[0].next) : ", ";
            const sepMem = (members.length > 1) ? code.slice(members[0].absEnd, members[0].next) : ", ";

            this.imports.es6.units.push(
                {
                    id: id++,
                    code: new MagicString(code),
                    c: code, // TODO: remove me
                    defaultMembers,
                    members,
                    module,
                    start,
                    end,
                    sepDef,
                    sepMem
                }
            )
            
            next = es6ImportCollection.next();
            
            this.imports.es6.searched = true;
        }
    }

    /**
     * Generic method to find dynamic and common js
     * import properties.
     * @param {string} type - "cjs" or "dynamic" 
     * @param {Object} match - A match object returned by a regex match fn. 
     * @param {*} id 
     */
     #makeImport(type, match, id) {
        const start = match.index;
        const end = start + match[0].length;
        const code = this.code.slice(start, end);
        const module = {};
        module.start = match[1].length;
        module.end = module.start + match[2].length;
        const char0 = code.charAt(module.start);
        if (char0.match(/["'`]/)) {
            module.type = "string";
            module.quotes = char0;
            module.name = code.slice(module.start+1, module.end-1).split("/").at(-1);
        } else {
            module.type = "literal";
            module.name = code.slice(module.start, module.end);
        }
        

        this.imports[type].units.push(
            {
                id,
                code: new MagicString(code),
                c: code, // TODO: remove me
                module,
                start,
                end,
            }
        )
    }


    /**
     * Find all dynamic import statements in the 
     * (prepared) source code
     */
    getDynamicImports() {
        this.imports.dynamic.count = 0;
        let id = 2000;

        const dynamicImportCollection = this.blackenedCode.matchAll(/(import\s*?\(\s*?)(\S+)(\s*?\);?)/g);
        let next = dynamicImportCollection.next();

        while (!next.done) {
            this.imports.dynamic.count ++;
            this.#makeImport("dynamic", next.value, id++);
            next = dynamicImportCollection.next();
        }

        this.imports.dynamic.searched = true;
    }


    getCJSImports() {
        this.imports.cjs.count = 0;
        let id = 3000;

        const cjsImportCollection = this.blackenedCode.matchAll(/(require\s*?\(\s*?)(\S+)(\s*?\);?)/g);
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

    getAllImports() {
        this.getDynamicImports()
        this.getES6Imports();
        this.getCJSImports();
    }

    #testType(type) {
        if (!["cjs", "dynamic", "es6"].includes(type)) {
            throw new TypeError("Invalid. Type must be 'cjs', 'dynamic', or 'es6'.");
        }
    }

    #listUnits(units) {
        let msg = "";
        units.forEach(unit => {
            msg += `\nID: ${unit.id}\nNAME: ${unit.module.name}\nSTATEMENT: ${unit.code.toString()}\n`;
        });
        return msg;
    }

    selectModByName(name, type="es6") {
        if (!name) {
            throw new Error("The name must be provided");
        }

        this.#testType(type);        
        const units = this.imports[type].units.filter(unit => unit.module.name === name);
        
        if (units.length === 0) {
            let msg = this.#listUnits(this.imports[type].units);
            msg += `___\nUnable to locate import statement with name: '${name}'`;
            throw new Error(msg);
        }
        
        else if (units.length > 1) {
            let msg = this.#listUnits(units);
            msg += `___\nFound multiple matches for '${name}'. If no other solution is available you can select by id.`;
            throw new Error(msg);
        }

        return units[0];
    }

    selectModById(id, type="es6") {
        if (!id) {
            throw new Error("The id must be provided");
        }

        this.#testType(type);
        const units = this.imports[type].units.filter(n => n.id == id);

        if (units.length === 0) {
            let msg = this.#listUnits(this.imports[type].units);
            msg += `___\nUnable to locate import statement with id: '${id}'`;
            throw new Error(msg);
        }

        return units[0];
    }

}


const importManager = new ImportManager();
console.log(JSON.stringify(importManager.imports, null, 4));
console.log(source.length, importManager.code.toString().length);
//const node = importManager.selectModById(3001, "dynamic");
const node = importManager.selectModByName("${stuff} yegd", "dynamic");
//console.log(node);
node.code.overwrite(node.module.start, node.module.end, "\"bang!\"");
importManager.code.overwrite(node.start, node.end, node.code.toString());
//console.log(node);
console.log(importManager.blackenedCode.toString());

/*
node.code.remove(node.members[1].start, node.members[1].next);
node.code.overwrite(node.members[2].start, node.members[2].end, "funny");
node.code.appendRight(node.members.at(-1).absEnd, node.sepMem + "stuff");
node.code.appendRight(node.members.at(-1).absEnd, node.sepMem + "more_stuff");
node.code.overwrite(node.module.start, node.module.end, "\"bang!\"");

importManager.code.overwrite(node.start, node.end, node.code.toString());

console.log(importManager.code.toString());
*/

//const collection = source.matchAll(/(["'])(?:(?=(\\?))\2.)*?\1/g);

/* --> *\/ <-- */
