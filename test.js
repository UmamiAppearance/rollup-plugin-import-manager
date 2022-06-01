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
"/*"
do("http://www.ed.de");
/* bub */ code /*

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

const removeStrings = (line) => {
    const matchStrings = line.match(/(["'`])(?:(?=(\\?))\2.)*?\1/g);
    if (matchStrings) {
        matchStrings.forEach(str => line=line.replace(str, "-".repeat(str.length)));
    }
    return line;
}

let mlc = false;
manager.codeArray.forEach((line, i) => {
    
    // build a copy of the line without any string
    // to prevent false positives eg. "http://..."
    const nsLine = removeStrings(line);
    
    // match single line comments
    const slcMatch = nsLine.match(/\/\//);
    if (slcMatch) {
        const contentBefore = nsLine.slice(0, slcMatch.index);

        // if the comment is the start of the line,
        // there is nothing to worry about
        if (!contentBefore.trim()) {
            manager.comments[i] = { ignore: true };
        }

        else {
            
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
        const mlcStart = nsLine.match(/\/\*/);
        
        if (mlcStart) {
            
            // also test here if there is code before the
            // comment to worry about
            if (!line.slice(0, line.index).trim()) {
                manager.comments[i] = { ignore: true };
            }

            // test for a false positive otherwise
            else  {
                
                start = 0;
                end = mlcStart.index;

                manager.comments[i] = {
                    ignore: false,
                    start,
                    end
                };
            }
            
            // test if the comment is actually across
            // multiple lines, in other words test if
            // it /* ends */ directly

            const matchEnd = line.match(/\*\//);
            mlc = !(matchEnd);

            // stop processing if there is any other 
            // comment following
            if (matchEnd) {
                testFollowUpComment(line, i, start, end);
            }
        }
    }

    else if (mlc) {
        const mlcEnd = line.match(/\*\//);

        if (mlcEnd) {
            mlc = false;

            let start = mlcEnd.index+2;
            end = -1

            // test if there is code after the comment to worry about
            if (!line.slice(start).trim()) {
                manager.comments[i] = { ignore: true };
            }
            
            else {            
                manager.comments[i] = {
                    ignore: false,
                    start,
                    end
                };
            }

            testFollowUpComment(line, i, start, end);
        }

        else {
            manager.comments[i] = { ignore: true };
        }
    }
});

console.log(manager);

