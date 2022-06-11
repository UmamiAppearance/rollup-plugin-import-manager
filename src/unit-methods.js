import { DebuggingError } from "./errors.js";

export default class ImportManagerUnitMethods {
    constructor(unit) {
        this.unit = unit;
    }

    hello() {
        console.log("hello");
    }

    remove() {
        if (this.unit.type !== "es6") {
            throw new Error("ES6 only!");
        }

        this.unit.code.remove(this.unit.start, this.unit.end);
    }

    /**
     * Debugging method to stop the building process
     * and list a specific unit selected by its id.
     * @param {number} id - Unit id.
     */
    // TODO: move this to unit debug method
    log() {
        const unit = {...this.unit};
        unit.methods = {};
        throw new DebuggingError(JSON.stringify(unit, null, 4));
    }
}
