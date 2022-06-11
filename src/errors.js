/**
 * Custom error to tell the user, that it is
 * not possible to select a specific unit.
 */
class MatchError extends Error {
    constructor(message) {
        super(message);
        this.name = "MatchError";
    }
}

/**
 * Custom error to abort the building process
 * for retrieving information.
 */
 class DebuggingError extends Error {
    constructor(message) {
        super(message);
        this.name = "DebuggingError";
        console.warn("Intentional Debugging Error was thrown !");
    }
}

export { DebuggingError, MatchError };
