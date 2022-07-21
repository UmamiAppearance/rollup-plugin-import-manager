import helloWorld, {
    hello as hi,
    hallo
} from "./lib/hello.js";

const englishGreeting = () => hi();
const nonEnglishGreeting = () => hallo();
const nerdGreeting = () => helloWorld();

export default englishGreeting;
export { nonEnglishGreeting, nerdGreeting };
