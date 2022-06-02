const imports = `import name from "module-name";
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
/* NO */ code 6 /* NO */ code +
code 7
code 8 /*
NO */code 9
/* sdjiw */const x = import("./module-path");
// woaannsjfnfknjkews
`

const MagicString = require("magic-string")


const manager = {
    codeArray: imports.split("\n"),
    imports: []
}



// test if another comment starts and stop
// processing in that case
const testFollowUpComment = (line, lIndex, start, end) => {
    if (line.slice(start, end).match(/(\/\/|\/\*)/)) {
        throw new Error(`File cannot be processed. Unclear comment structure at line '${lIndex+1}'`);
    }
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

handleSLC = (purgedLine, ncLine) => {
    const line = purgedLine.toString();
    const match = line.match(/\/\/.*/);
    if (match) {
        purgedLine.overwrite(match.index, match.index+match[0].length, "-".repeat(match[0].length));
        ncLine.overwrite(match.index, match.index+match[0].length, "-".repeat(match[0].length));
    }
}

// recursive multiline match
const getMLC = (line, mlc, modified=false) => {
    let subLine = "";

    if (!mlc) {
        const match = line.match(/\/\*/);
        if (match) {
            modified = true;
            [ subLine, mlc ] = getMLC(line.slice(match.index+2), true);
            line = line.slice(0, match.index);
        }
    }
    
    else {
        const match = line.match(/\*\//);
        if (match) {
            modified = true;
            [ subLine, mlc ] = getMLC(line.slice(match.index+2), false);
        }
        line = "";
    }

    line += subLine;

    return [line, mlc, modified];
}

let mlc = false;
manager.codeArray.forEach((line, i) => {

    // no comments, no strings
    let purgedLine = new MagicString(line);

    // no comments line
    let ncLine  = new MagicString(line);
    
    // remove all strings 
    replaceStrings(purgedLine);

    // remove single line comments
    handleSLC(purgedLine, ncLine);
    console.log(i+1, ":", purgedLine.toString());
    
    // remove multi line comments
    let hasMLC;
    [ purgedLine, mlc, hasMLC ] = getMLC(purgedLine.toString(), mlc);
    
    //console.log("line", i+1, "hasMLC", hasMLC)
    //console.log(i+1, ":", cleanedLine);

    if (purgedLine.match(/(import)/)) {
        // cf. 
        const importCollection = line.matchAll(/import(?:["'\s]*([\w*{}\n, ]+)from\s*)?["'\s]*([@\w/_-]+)["'\s]*;?/g);
        for (;;) {
            const next = importCollection.next();
            if (next.done) {
                break;
            }
            const match = next.value;
            //console.log(match);
        }

        const imp = {
            index: i,
            line: new MagicString(line),
        }
        manager.imports.push(imp);
        //console.log(imp.line.toString());
    }
});

//console.log(manager.imports);

