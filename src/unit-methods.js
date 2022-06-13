import { DebuggingError, MatchError } from "./errors.js";

export default class ImportManagerUnitMethods {
    constructor(unit) {
        this.unit = unit;
    }

    #ES6only() {
        if (this.unit.type !== "es6") {
            throw new Error("This method is only available for ES6 imports.");
        }
    }

// module methods

    renameModule(name, modType) {
        if (this.unit.type !== "es6") {
            if (modType === "string") {
                const q = this.unit.module.quotes;
                name = q + name + q;
            } else if (modType !== "literal") {
                throw new TypeError(`Unknown modType '${modType}'. Valid types are 'string' and 'literal'.`);
            }
        } else if (modType !== "string") {
            throw new TypeError("modType cannot be changed for es6 imports.");
        }
        
        this.unit.code.overwrite(this.unit.module.start, this.unit.module.end, name);
        console.log(this.unit.code.toString());
    }

// member methods

    createMembers() {
        if (this.unit.defaultMembers.length > 0) {
            let start = this.unit.defaultMembers.at(-1).absEnd;
            let sep;
            
            if (!this.unit.membersFromScratch) {
                this.unit.membersFromScratch = true;
                sep = this.unit.sepDef + "{ ";
            } else {
                sep = this.unit.sepMem;;
            }
            
            return [start, sep];
        } else {
            throw new Error("Not implemented!");
            // TODO: implement this
        }
    }

    addMember(name) {
        this.#ES6only();

        if (this.unit.members.length > 0) {
            const start = this.unit.members.at(-1).absEnd;
            this.unit.code.appendRight(start, this.unit.sepMem + name);
        } else {
            console.log("create members");
            let start, sep;
            [ start, sep ] = this.createMembers();
            console.log(start, sep);
            this.unit.code.appendRight(start, sep + name);
        }
    }

    #findMember(memberType, name) {
        const filtered = this.unit[memberType+"s"].filter(m => m.name === name);
        if (filtered.length !== 1) {
            throw new MatchError(`Unable to locate ${memberType} with name '${name}'`);
        }
        return filtered[0];
    }

    renameMember(memberType, name, newName, keepAlias) {
        console.log(memberType, name, newName, keepAlias);
        const member = this.#findMember(memberType, name);
        
        let end;
        if (keepAlias) {
            end = member.end;
        } else {
            end = member.absEnd;
        }
        this.unit.code.overwrite(member.start, end, newName);
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
