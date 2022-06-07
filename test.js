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

/* jdwjd
oh boy */ import "module-name";

// goodbye

code 1
code 2
/* NO */ // ciao
code 3
/*
NO
*/ code4
code 5
const bumm = import(\`\${stuff} yegd\`);

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

import { stuff } from "../path/test-module";

const imp = import (
    "bullshit"
);

const y = "bdwi";

import("modulePath")
  .then(obj => <module object>)
  .catch(err => <loading error, e.g. if no such module>)
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
        this.blackenedCode = {
            noComments: null,
            ncNoStrings: null
        }

        this.prepareSource();
        if (autoSearch) {
            this.getAllImports();
        }
    }

    #blacken(str, start, len) {
        str = str.slice(0, start)
            + "-".repeat(len)
            + str.slice(start+len);
        return str; 
    }


    #replaceStrings(line) {
        const strCollection = line.matchAll(/(["'`])(?:(?=(\\?))\2.)*?\1/g);
        let next = strCollection.next();
        while (!next.done) {
            const match = next.value; 
            line = this.#blacken(line, match.index, match[0].length);
            next = strCollection.next();
        }
        return line;
    }

    #handleSLC(purgedLine, ncLine) {
        const match = purgedLine.match(/\/\/.*/);
        if (match) {
            purgedLine = this.#blacken(purgedLine, match.index, match[0].length);
            ncLine = this.#blacken(ncLine, match.index, match[0].length);
        
        }
        return [ purgedLine, ncLine ];
    }

    // recursive multiline match
    #handleMLC(purgedLine, ncLine, mlc) {

        const search = (pl, ncl, mlc) => {
            let plSub = "";
            let nclSub = "";

            if (!mlc) {
                const match = pl.match(/\/\*/);
                if (match) {
                    const l = match.index;
                    [ plSub, nclSub, mlc ] = search(pl.slice(l), ncl.slice(l), true);
                    pl = pl.slice(0, l);
                    ncl = ncl.slice(0, l);
                }
            }
            
            else {
                const match = pl.match(/\*\//);
                let l = pl.length;
                if (match) {
                    l = match.index+2;
                    [ plSub, nclSub, mlc ] = search(pl.slice(l), ncl.slice(l), false);
                }
                pl = "-".repeat(l);
                ncl = "-".repeat(l);
            }

            pl += plSub;
            ncl += nclSub;

            return [pl, ncl, mlc];
        }

        let pl = purgedLine.toString();
        let ncl = ncLine.toString();
        let len = pl.length;

        if (len) {
            [ pl, ncl, mlc ] = search(pl, ncl, mlc);
            purgedLine = pl;
            ncLine = ncl;
        }
        
        return [ purgedLine, ncLine, mlc ];
    }

    #makeImport(type, match, id) {
        const start = match.index;
        const end = start + match[0].length;
        const code = this.code.slice(start, end);
        const module = {};
        module.start = match[1].length;
        module.end = module.start + match[2].length;
        if (code.charAt(module.start).match(/["'`]/)) {
            module.type = "str";
            module.name = code.slice(module.start+1, module.end-1).split("/").at(-1);  
        } else {
            module.type = "lit";
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

    getDynamicImports() {
        this.imports.dynamic.count = 0;
        let id = 3000;

        const dynamicImportCollection = this.blackenedCode.ncNoStrings.matchAll(/(import\s*\(\s*)(\S+)(\s*\);?)/g);
        let next = dynamicImportCollection.next();

        while (!next.done) {
            this.imports.dynamic.count ++;
            this.#makeImport("dynamic", next.value, id++);
            next = dynamicImportCollection.next();
        }

        this.imports.dynamic.searched = true;
    }

    getES6Imports() {
        this.imports.es6.count = 0;
        let id = 2000;

        //const es6ImportCollectionO = this.blackenedCode.noComments.matchAll(/import(?:["'\s]*([\w*{}\n, ]+)from\s*)?["'`\s]*([\.@\w/_-]+)["'`\s]*;?/g);
        const es6ImportCollection = this.blackenedCode.ncNoStrings.matchAll(/import(?:["'\s]*([\w*{}\n, ]+)from\s*)?(\S+);?/g);
        
        let next = es6ImportCollection.next();
        while (!next.done) {
            this.imports.es6.count ++;

            const match = next.value;
            const start = match.index;
            const end = start + match[0].length;
            const code = this.code.slice(start, end);

            const members = [];
            const defaultMembers = [];
            const memberStr = match[1] ? match[1].trim() : null;
            
            if (memberStr) {
                // find position of all members
                const memberStrStart = code.indexOf(memberStr);

                const nonDefaultMatch = memberStr.match(/{[\s\S]*}/);
                
                let defaultStr = null;

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
            module.start = match[0].lastIndexOf(match[2]);
            module.end = module.start + match[2].length;

            if (code.charAt(module.start).match(/["'`]/)) {
                module.type = "str";
                module.name = code.slice(module.start+1, module.end-2).split("/").at(-1);  
            } else {
                module.type = "lit";
                module.name = code.slice(module.start, module.end);
            }

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

    getCJSImports() {
        this.imports.cjs.count = 0;
        let id = 1000;

        const cjsImportCollection = this.blackenedCode.ncNoStrings.matchAll(/(require\s*\(\s*)(\S+)(\s*\);?)/g);
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

    prepareSource() {
        let mlc = false;
        let cleanedArray = [];
        let purgedArray = [];
        
        source.split("\n").forEach((line, i) => {

            // copy original line
            let ncLine = line;
            // with all strings purged 
            let purgedLine = this.#replaceStrings(line);

            // remove single line comments
            [ purgedLine, ncLine ] = this.#handleSLC(purgedLine, ncLine);
            
            // remove multi line comments
            [ purgedLine, ncLine, mlc ] = this.#handleMLC(purgedLine, ncLine, mlc);

            cleanedArray.push(ncLine);
            purgedArray.push(purgedLine);
        });

        this.blackenedCode.noComments = cleanedArray.join("\n");
        this.blackenedCode.ncNoStrings = purgedArray.join("\n");
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
        const units = this.imports.es6.units.filter(n => n.id == id);

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

const node = importManager.selectModById(2010);
//const node = importManager.selectModByName("\"fs\"", "cjs");
// TODO: solve string matching, quotes no quotes? - Still Buggy
console.log(node);

node.code.remove(node.members[1].start, node.members[1].next);
node.code.overwrite(node.members[2].start, node.members[2].end, "funny");
node.code.appendRight(node.members.at(-1).absEnd, node.sepMem + "stuff");
node.code.appendRight(node.members.at(-1).absEnd, node.sepMem + "more_stuff");
node.code.overwrite(node.module.start, node.module.end, "\"bang!\"");

importManager.code.overwrite(node.start, node.end, node.code.toString());

console.log(importManager.code.toString());
