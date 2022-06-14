import { DebuggingError, MatchError } from "./errors.js";

export default class ImportManagerUnitMethods {
    constructor(unit, es6StrToObj) {
        this.unit = unit;
        this.updateUnit = () => {

            if (this.unit.membersFromScratch) {
                const end = this.unit.defaultMembers.entities.at(-1).absEnd;
                this.unit.code.appendRight(end, " }");
                this.unit.membersFromScratch = false;
            }

            let memberPart = "";
            const memberPartStart = this.unit.defaultMembers.start || this.unit.members.start || false;
            if (memberPartStart) {
                const memberPartEnd = this.unit.members.end || this.unit.defaultMembers.end;
                memberPart = this.unit.code.slice(memberPartStart, memberPartEnd);
            }

            const unit = es6StrToObj(
                this.unit.code.toString(),
                this.unit.start,
                this.unit.end,
                this.unit.code.toString(),
                memberPart,
                this.unit.code.slice(this.unit.module)
            );

            // ignore the getter
            delete unit.codeString;
            
            // copy all other updated properties
            Object.assign(this.unit, unit);

        }
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
        this.updateUnit();
    }

// member methods

    createMembers() {
        if (this.unit.defaultMembers.count > 0) {
            let start = this.unit.defaultMembers.entities.at(-1).absEnd;
            let sep;
            
            if (!this.unit.membersFromScratch) {
                this.unit.membersFromScratch = true;
                sep = this.unit.defaultMembers.separator + "{ ";
            } else {
                sep = this.unit.members.separator;
            }
            
            return [start, sep];
        } else {
            throw new Error("Not implemented!");
            // TODO: implement this?
        }
    }

    addMember(name) {
        this.#ES6only();

        if (this.unit.members.entities.length > 0) {
            const start = this.unit.members.entities.at(-1).absEnd;
            if (this.unit.members.count > 0) {
                name = this.unit.members.separator + name;
            }
            this.unit.code.appendRight(start, name);
        } else {
            console.log("create members");
            let start, sep;
            [ start, sep ] = this.createMembers();
            console.log(start, sep);
            this.unit.code.appendRight(start, sep + name);
        }

        this.updateUnit();
    }

    #findMember(memberType, name) {
        if (!name) {
            throw new Error(`${memberType} name must be set.`);
        }
        const filtered = this.unit[memberType+"s"].entities.filter(m => m.name === name);
        if (filtered.length !== 1) {
            throw new MatchError(`Unable to locate ${memberType} with name '${name}'`);
        }
        return filtered[0];
    }


    removeMember(memberType, name) {
        this.#ES6only();

        const member = this.#findMember(memberType, name);
        
        let start;
        let end;
        
        if (member.next) {
            start = member.start;
            end = member.next;
        } else if (member.last) {
            start = member.last;
            end = member.absEnd;
        } else {
            start = member.start;
            end = member.absEnd;
        }
        this.unit.code.remove(start, end);
        this.updateUnit();
    }

    renameMember(memberType, name, newName, keepAlias) {
        this.#ES6only();

        const member = this.#findMember(memberType, name);
        let end;

        if (keepAlias) {
            end = member.end;
        } else {
            end = member.absEnd;
        }
        this.unit.code.overwrite(member.start, end, newName);
        this.updateUnit();
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
