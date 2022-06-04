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


    #replaceStrings(line) {
        const strCollection = line.matchAll(/(["'`])(?:(?=(\\?))\2.)*?\1/g);
        let next = strCollection.next();
        while (!next.done) {
            const match = next.value; 
            const matchLen = match[0].length;
            line = line.slice(0, match.index) 
                 + "-".repeat(matchLen)
                 + line.slice(match.index+matchLen);
            next = strCollection.next();
        }
        return line;
    }

    #handleSLC(purgedLine, ncLine) {
        const match = purgedLine.match(/\/\/.*/);
        if (match) {
            const matchLen = match[0].length;
            
            purgedLine = purgedLine.slice(0, match.index)
                       + "-".repeat(matchLen)
                       + purgedLine.slice(match.index + matchLen);

            ncLine = ncLine.slice(0, match.index)
                   + "-".repeat(matchLen);
                   + ncLine.slice(match.index + matchLen)
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
            console.log(match[0]);
            console.log(match.at(1));
            
            if (memberStr) {
                const nonDefaultMatch = memberStr.match(/{[\s\S]*}/);
                console.log(nonDefaultMatch);
                
                let defaultMatch = false;

                if (nonDefaultMatch) {
                    const mStart = nonDefaultMatch.index;
                    let nonDefaultStr = nonDefaultMatch[0];

                    if (mStart > 0) {
                        defaultMatch = memberStr.slice(0, nonDefaultMatch.index-1);
                    }
                    const m = memberStr.slice(mStart+1, mStart+nonDefaultStr.length-2)
                                       .split(",")
                                       .map(m => m.trim())
                                       .filter(m => m);
                    
                    members = {};
                    m.forEach(member => {
                        members[member] = {};
                        const pos = nonDefaultStr.search(member);
                        const len = member.length;
                        members[member].start = start + mStart + pos;
                        members[member].end = members[member].start + len;

                        // erase already found members to 
                        // prevent eventually substr matches
                        nonDefaultStr = nonDefaultStr.slice(0, pos)
                                      + ("-").repeat(len)
                                      + nonDefaultStr.slice(pos+len);
                        console.log(nonDefaultStr);
                    })
                }
                
                else {
                    defaultMatch = memberStr;
                }

                if (defaultMatch) {
                    defaultMembers = defaultMatch.split(",")
                                                 .map(m => m.trim())
                                                 .filter(m => m);;
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
            console.log(match);
            
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
            //console.log(match);
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

