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

import( );

import {
    member1,
    member2,
} from "module-name";

const imp = import (
    "bullshit"
);

const y = "bdwi";

import("modulePath")
  .then(obj => <module object>)
  .catch(err => <loading error, e.g. if no such module>)
`

const MagicString = require("magic-string")

class ImportManager {

    constructor() {
        this.manager = {
            code: new MagicString(source),
            cjsImports: [],
            es6Imports: [],
            dynamicImport: [],

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

    #getES6Imports(cleanedArray) {
        
        const es6ImportCollection = cleanedArray.join("\n").matchAll(/import(?:["'\s]*([\w*{}\n, ]+)from\s*)?["'\s]*([@\w/_-]+)["'\s]*;?/g);
        
        let next = es6ImportCollection.next();
        while (!next.done) {
            const match = next.value;
            const start = match.index;
            const end = start + match[0].length;

            this.manager.es6Imports.push(
                {
                    code: match[0],
                    name: match[1],
                    moduleName: match[2],
                    start,
                    end
                }
            )
            
            next = es6ImportCollection.next();
            //console.log(match);
        }
    }

    #getDynamicImports(purgedArray) {
        const dynamicImportCollection = purgedArray.join("\n").matchAll(/(import\s*\(\s*)([^\s]+)(\s*\);?)/g);
        let next = dynamicImportCollection.next();
        while (!next.done) {
            const match = next.value;
            const start = match.index;
            const end = start + match[0].length;
            const code = this.manager.code.slice(start, end);
            const modStart = start + match[1].length ;
            const modEnd = modStart + match[2].length;
            const moduleName = this.manager.code.slice(modStart, modEnd);
            //console.log(match);
            this.manager.dynamicImport.push(
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
        this.manager.code.overwrite(this.manager.dynamicImport[1].modStart, this.manager.dynamicImport[1].modEnd, "'./path/to/something/great'");
        this.manager.code.overwrite(this.manager.dynamicImport[3].modStart, this.manager.dynamicImport[3].modEnd, "'test'");
        //console.log(this.manager.code.toString());
            
        console.log(this.manager);
    }


    collectImports() {

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

        this.#getES6Imports(cleanedArray);
        this.#getDynamicImports(purgedArray);
    }
}

const importManager = new ImportManager();
importManager.collectImports();
