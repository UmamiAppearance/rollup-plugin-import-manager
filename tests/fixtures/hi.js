import helloWorld, {
    hello as hi,
    hallo
} from "./lib/hello.js";

const englishGreeting = () => hi();
const germanGreeting = () => hallo();
const nerdGreeting = () => helloWorld();

export default englishGreeting;
export { germanGreeting, nerdGreeting };
