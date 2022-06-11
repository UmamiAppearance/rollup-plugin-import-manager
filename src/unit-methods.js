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
}
