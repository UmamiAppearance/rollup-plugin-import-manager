import Diff from "diff";
import { blue, bold, red, green, gray } from "colorette";


/**
 * Adds an angle bracket to each line.
 * @param {string} angBr - '>' or '<'
 * @param {string} txt - The text section.
 * @returns {string} - The given text section with an angle bracket and a space in front of each line. 
 */
const addAngleBracket = (angBr, txt) => {
    const txtArr = txt.split("\n");
    let lastChar = "";
    if (txt.at(-1) === "\n") {
        lastChar = "\n";
        txtArr.pop();
    }
    let output = txtArr.map(line => `${angBr} ${line}`).join("\n");
    output += lastChar;
    return output;
}

/**
 * Prints an output in the mould of GNU diff when
 * called no parameters other than the files. But
 * with colors.
 * @param {string} source - The original code.
 * @param {string} code - The modified code.
 * @param {*} [diffOption] - As passed by the user. If the value is 'all' also unchanged code is printed.  
 */
const showDiff = (filename, source, code, diffOption) => {
    const showUnchanged = diffOption == "file"

    console.log(blue(`diff for file '${filename}':`));
    const diff = Diff.diffLines(source, code);

    let origLine = 0;
    let modLine = 0;

    console.log(gray("BEGIN >>>"));

    diff.forEach((part, i) => {
        
        const last = diff.at(i-1) || {};
        const next = diff.at(i+1) || {};

        let msg;
        let lineInfo = "";
        let printDashes = false;

        if (part.added) {
            msg = green(addAngleBracket(">", part.value));
            if (!last.removed) {
                lineInfo += origLine + "a" + modLine;
                if (part.count > 1) {
                    lineInfo += "," + (modLine + part.count-1);
                } 
            }
            modLine += part.count;
        }
        
        else if (part.removed) {
            msg = red(addAngleBracket("<", part.value));
            lineInfo += origLine
            
            if (part.count > 1) {
                lineInfo += (part.count-1);
            }

            if (next.added) {
                lineInfo += "c" + modLine;
                if (next.count > 1) {
                    lineInfo += "," + (modLine - part.count + next.count);
                }
                printDashes = true;
            }
            
            else {
                if (part.count === 1) {
                    lineInfo += "r" + (modLine-part.count);
                } else {
                    lineInfo += "r" + modLine + "," + (modLine - part.count + next.count);
                }
            }
            modLine -= part.count;
        }
        
        else {
            origLine += part.count;
            modLine += part.count;
            msg = "";
            if (showUnchanged) {
                msg = part.value;
            }
        }


        // print

        if (showUnchanged) {
            process.stdout.write(msg);    
        } else {
            if (lineInfo) {
                console.log(bold(lineInfo));
            }
            
            process.stdout.write(msg);
            
            if (printDashes) {
                console.log("---");
            }
        } 
    });
    
    console.log(gray("\n<<< END\n"));
}

export default showDiff;
