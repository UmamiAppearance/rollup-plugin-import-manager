const imports = `import name from "module-name";
import * as name from "module-name";
import { member } from "module-name";
import { member as alias } from "module-name";
import { member1 , member2 } from "module-name";
import { member1 , member2 as alias2 , [...] } from "module-name";
import defaultMember, { member [ , [...] ] } from "module-name";
import defaultMember, * as alias from "module-name";
import defaultMember from "module-name";
import "module-name";
const x = import(module-path);


// bluh
 code

      // bla

code
code

/* bub */ code

hfe

code /* 
jwdjijdw
*/
`


const manager = {
    codeArray: imports.split("\n"),
    comments: {},
    importsLines: {}
}



// test if another comment starts and stop
// processing in that case
const testFollowUpComment = (line, lIndex, start, end) => {
    if (line.slice(start, end).match(/(\/\/|\/\*)/)) {
        throw new Error(`File cannot be processed. Unclear comment structure at line '${lIndex+1}'`);
    }
}

// prevent false positives inside of strings
const isStringContent = (line, cIndex) => {
    const strMatches = line.matchAll(/(["'`])(?:(?=(\\?))\2.)*?\1/g);
    let isString = false;
    
    for (;;) {
        const next = strMatches.next();
        if (next.done) {
            break;
        }
        const match = next.value;
        const start = match.index;
        if (cIndex >= start) {
            const end = start + match[0].length;
            if (cIndex < end) {
                isString = true;
            }
        }
    }

    return isString;
}


let mlc = false;
manager.codeArray.forEach((line, i) => {
    const slcMatch = line.match(/\/\//);
    if (slcMatch) {
        const contentBefore = line.slice(0, slcMatch.index);

        // if the comment is the start of the line,
        // there is nothing to worry about
        if (!contentBefore.trim()) {
            manager.comments[i] = { ignore: true };
        }

        // test otherwise if the match is inside of
        // a string and therefore a false positive
        else if (!isStringContent(line, slcMatch.index)) {
            
        // if it is an actual comment with content before
            // store the start position to allow the analysis
            // of the code before the comment

            manager.comments[i] = {
                ignore: false,
                start: 0,
                end: slcMatch.index
            }

        }
    }
    
    else if (!mlc) {
        const mlcStart = line.match(/\/\*/);
        
        if (mlcStart) {
            
            // also test here if there is code before the
            // comment to worry about
            if (!line.slice(0, line.index).trim()) {
                manager.comments[i] = { ignore: true };
            }

            // test for a false positive otherwise
            else if (!isStringContent("/*", line, 0, mlcStart)) {
                
                start = 0;
                end = mlcStart.index;

                manager.limitations[i] = { start, end };
            }
            
            // test if the comment is actually across
            // multiple line, in other words test if it
            // ends directly

            const matchEnd = line.match(/\*\//);
            mlc = !(matchEnd);

            if (matchEnd) {
                testFollowUpComment(line, i, start, end);
            }
        }
    }

    else if (mlc) {
        const mlcEnd = line.match(/\*\//);

        if (mlcEnd) {

            let start, end;

            // test if there is code after the comment to worry about
            if (line.slice(line.index+2).trim()) {
                manager.comments[i] = true;

                start = mlcEnd.index+2;
                end = -1;
                
                manager.limitations[i] = { start, end };
            }

            mlc = false;

            testFollowUpComment(line, i, start, end);
        }

        else {
            manager.comments[i] = true;
        }
    }
});

console.log(manager);

