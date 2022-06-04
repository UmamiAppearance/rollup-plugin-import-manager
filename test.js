const source = `import name from "module-name";
import * as name from "module-name";import { member } from "module-name";
import { member as alias } from "module-name";
import { member1 , member2 } from "module-name";
import { member1, member2 as alias2, member3 as alias3 } from "module-name";
import defaultMember, { member, member2 } from "module-name";
import defaultMember, * as alias from "module-name"
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
    }
from "module-name";

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

    getDynamicImports() {
        this.imports.dynamic.count = 0;

        const dynamicImportCollection = this.blackenedCode.ncNoStrings.matchAll(/(import\s*\(\s*)(\S+)(\s*\);?)/g);
        let next = dynamicImportCollection.next();

        while (!next.done) {
            this.imports.dynamic.count ++;
            const match = next.value;
            const start = match.index;
            const end = start + match[0].length;
            const code = this.code.slice(start, end);
            const modStart = start + match[1].length ;
            const modEnd = modStart + match[2].length;
            const moduleName = this.code.slice(modStart, modEnd);
            //console.log(match);
            this.imports.dynamic.units.push(
                {
                    code,
                    moduleName,
                    start,
                    end,
                    modStart,
                    modEnd,
                }
            )

            next = dynamicImportCollection.next();
        }
        //this.code.overwrite(this.imports.dynamic[1].modStart, this.imports.dynamic[1].modEnd, "'./path/to/something/great'");
        //this.code.overwrite(this.imports.dynamic[3].modStart, this.imports.dynamic[3].modEnd, "'test'");
        //console.log(this.imports.code.toString());
        
        this.imports.dynamic.searched = true;
    }

    getES6Imports() {
        this.imports.es6.count = 0;

        const es6ImportCollection = this.blackenedCode.noComments.matchAll(/import(?:["'\s]*([\w*{}\n, ]+)from\s*)?["'\s]*([@\w/_-]+)["'\s]*;?/g);
        
        let next = es6ImportCollection.next();
        while (!next.done) {
            this.imports.es6.count ++;

            const match = next.value;
            const start = match.index;
            const end = start + match[0].length;

            let members = null;
            let defaultMembers = null;
            const memberStr = match[1] ? match[1].trim() : null;
            
            if (memberStr) {
                // find position of all members
                const memberStrStart = match[0].indexOf(memberStr);

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
                    
                    members = {};
                    m.forEach(member => {
                        
                        const memberPos = nonDefaultStr.indexOf(member);
                        
                        let name = member;
                        let len;

                        const aliasMatch = member.match(/(\s+as\s+)/);
                        if (aliasMatch) {
                            // TODO: Find Errors
                            len = aliasMatch.index;
                            name = member.slice(0, len);
                            members[name] = {};
                            const aliasStart = aliasMatch.index + aliasMatch[0].length;
                            members[name].alias = {
                                name: member.slice(aliasStart),
                                start: start + memberStrStart + nonDefaultStart + memberPos + aliasStart,
                                end: start + memberStrStart + nonDefaultStart + memberPos + member.length
                            }
                        } else {
                            members[name] = {};
                            len = member.length;
                        }
                        members[name].start = start + memberStrStart + nonDefaultStart + memberPos;
                        members[name].end = members[name].start + len;

                        // erase already found members to 
                        // prevent potential substr matches
                        nonDefaultStr = this.#blacken(nonDefaultStr, memberPos, len);
                    });
                }
                
                else {
                    defaultStr = memberStr;
                }

                if (defaultStr) {

                    const dm = defaultStr.split(",")
                                           .map(m => m.trim())
                                           .filter(m => m);
                    
                    defaultMembers = {};
                    dm.forEach(defaultMember => {
                        defaultMembers[defaultMember] = {};
                        const pos = defaultStr.indexOf(defaultMember);
                        const len = defaultMember.length;
                        defaultMembers[defaultMember].start = start + memberStrStart + pos;
                        defaultMembers[defaultMember].end = defaultMembers[defaultMember].start + len;

                        defaultStr = this.#blacken(defaultStr, pos, len);
                    });
                }
            }

            this.imports.es6.units.push(
                {
                    code: match[0],
                    defaultMembers,
                    members,
                    moduleName: match[2],
                    start,
                    end
                }
            )
            
            next = es6ImportCollection.next();
            
            this.imports.es6.searched = true;
        }
    }

    getCJSImports() {
        this.imports.cjs.count = 0;

        const cjsImportCollection = this.blackenedCode.ncNoStrings.matchAll(/(require\s*\(\s*)(\S+)(\s*\);?)/g);
        let next = cjsImportCollection.next();

        while (!next.done) {
            this.imports.cjs.count ++;

            const match = next.value;
            const start = match.index;
            const end = start + match[0].length;
            const code = this.code.slice(start, end);
            const modStart = start + match[1].length ;
            const modEnd = modStart + match[2].length;
            const moduleName = this.code.slice(modStart, modEnd);

            this.imports.cjs.units.push(
                {
                    code,
                    moduleName,
                    start,
                    end,
                    modStart,
                    modEnd,
                }
            )

            next = next = cjsImportCollection.next();
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
            
            //console.log(i+1, ":", purgedLine);

            cleanedArray.push(ncLine);
            purgedArray.push(purgedLine);
        });

        this.blackenedCode.noComments = cleanedArray.join("\n");
        this.blackenedCode.ncNoStrings = purgedArray.join("\n");
    }

    getAllImports() {
        //this.getDynamicImports()
        this.getES6Imports();
        //this.getCJSImports();
    }
}

const importManager = new ImportManager();
console.log(JSON.stringify(importManager.imports, null, 4));

console.log(source.slice(125, 130));