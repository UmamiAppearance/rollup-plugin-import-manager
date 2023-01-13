import helloWorld, {
    hello as hi,
    hallo
} from "./lib/hello.js";

import dummy from "./lib/dummy.js";

const englishGreeting = () => hi();
const nonEnglishGreeting = () => hallo();
const nerdGreeting = () => helloWorld();

export default englishGreeting;
export { dummy, nonEnglishGreeting, nerdGreeting };
