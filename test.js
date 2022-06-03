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
/* NO */ code 6 /* NO */ code + // nope
code 7
code 8 /*
NO */code 9
/* sdjiw */const x = import("./module-path");
// woaannsjfnfknjkews


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


const manager = {
    code: new MagicString(source),
    cjsImports: [],
    es6Imports: [],
    dynamicImport: [],

}


const replaceStrings = line => {
    const strCollection = line.toString().matchAll(/(["'`])(?:(?=(\\?))\2.)*?\1/g);
    for (;;) {
        const next = strCollection.next();
        if (next.done) {
            break;
        }
        const match = next.value; 
        line.overwrite(match.index, match.index+match[0].length, "-".repeat(match[0].length));
    }
}

const handleSLC = (purgedLine, ncLine) => {
    const line = purgedLine.toString();
    const match = line.match(/\/\/.*/);
    if (match) {
        const len = match[0].length;
        purgedLine.overwrite(match.index, match.index+len, "-".repeat(len));
        ncLine.overwrite(match.index, match.index+len, "-".repeat(len));
    }
}

// recursive multiline match
const handleMLC = (purgedLine, ncLine, mlc) => {

    const inner = (pl, ncl, mlc) => {
        let plSub = "";
        let nclSub = "";

        if (!mlc) {
            const match = pl.match(/\/\*/);
            if (match) {
                const l = match.index;
                [ plSub, nclSub, mlc ] = inner(pl.slice(l), ncl.slice(l), true);
                pl = pl.slice(0, l);
                ncl = ncl.slice(0, l);
                //console.log("sliceA", pl);
            }
        }
        
        else {
            const match = pl.match(/\*\//);
            let l = pl.length;
            if (match) {
                l = match.index+2;
                [ plSub, nclSub, mlc ] = inner(pl.slice(l), ncl.slice(l), false);
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
        [ pl, ncl, mlc ] = inner(pl, ncl, mlc);
        purgedLine.overwrite(0, len, pl);
        ncLine.overwrite(0, len, ncl)
    }
    
    return mlc;
}

let mlc = false;
let cleanedArray = [];
let purgedArray = [];
source.split("\n").forEach((line, i) => {

    // no comments, no strings
    let purgedLine = new MagicString(line);

    // no comments line
    let ncLine  = new MagicString(line);
    
    // remove all strings 
    replaceStrings(purgedLine);

    // remove single line comments
    handleSLC(purgedLine, ncLine);
    
    // remove multi line comments
    mlc = handleMLC(purgedLine, ncLine, mlc);
    
    //console.log("line", i+1, "hasMLC", hasMLC)
    console.log(i+1, ":", purgedLine.toString());
    
    cleanedArray.push(ncLine.toString());
    purgedArray.push(purgedLine.toString());
});

const es6ImportCollection = cleanedArray.join("\n").matchAll(/import(?:["'\s]*([\w*{}\n, ]+)from\s*)?["'\s]*([@\w/_-]+)["'\s]*;?/g);
for (;;) {
    const next = es6ImportCollection.next();
    if (next.done) {
        break;
    }
    const match = next.value;
    const start = match.index;
    const end = start + match[0].length;

    manager.es6Imports.push(
        {
            code: match[0],
            name: match[1],
            moduleName: match[2],
            start,
            end
        }
    )

    //console.log(match);
}

const dynamicImportCollection = purgedArray.join("\n").matchAll(/(import\s*\(\s*)(\-+)(\s*\);?)/g);
for (;;) {
    const next = dynamicImportCollection.next();
    if (next.done) {
        break;
    }
    const match = next.value;
    const start = match.index;
    const end = start + match[0].length;
    const code = manager.code.slice(start, end);
    const modStart = start + match[1].length + 1;
    const modEnd = modStart + match[2].length - 2;
    const moduleName = manager.code.slice(modStart, modEnd);
    console.log(match);
    manager.dynamicImport.push(
        {
            code,
            moduleName,
            start,
            end,
            modStart,
            modEnd,
        }
    )
}
manager.code.overwrite(manager.dynamicImport[1].modStart, manager.dynamicImport[1].modEnd, "./pa");
manager.code.overwrite(manager.dynamicImport[2].modStart, manager.dynamicImport[2].modEnd, "test");
console.log(manager.code.toString());
    
//console.log(manager.es6Imports);

