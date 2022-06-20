/**
 * Text
 * 
 * @ 
 */

import { resolve, sep } from 'path';
import picomatch from "picomatch";

function ensureArray(thing) {
    if (Array.isArray(thing))
        return thing;
    if (thing == undefined)
        return [];
    return [thing];
}

function getMatcherString(id, resolutionBase) {
    if (resolutionBase === false) {
        return id;
    }
    return resolve(...(typeof resolutionBase === 'string' ? [resolutionBase, id] : [id]));
}



const includeMatchers = (include, resolutionBase) => {
    
    console.log("include", "resolutionBase");
    console.log(include, resolutionBase);

    const getMatcher = (id) => {
        return id instanceof RegExp
            ? id
            : {
                test: picomatch(getMatcherString(id, resolutionBase)
                    .split(sep)
                    .join('/'), { dot: true })
            };
    };
    
    return ensureArray(include).map(getMatcher);
}

export { ensureArray, includeMatchers }
